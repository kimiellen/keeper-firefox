/**
 * 证书固定模块 - TOFU (Trust On First Use)
 *
 * 通过 Firefox webRequest API 拦截与 Keeper API 的 HTTPS 连接，
 * 提取证书 SHA-256 指纹并执行 TOFU 策略：
 * - 首次连接：存储指纹
 * - 后续连接：验证指纹一致性
 * - 指纹不匹配：阻断请求，通知用户
 *
 * 指纹使用 User Key 加密后存储于 browser.storage.local
 */

import { encrypt, decrypt } from '../crypto/encryption';
import { keyManager } from '../crypto/keyManager';
import type { Browser } from 'wxt/browser';

const KEEPER_API_URL_PATTERN = 'https://127.0.0.1:8443/*';
const STORAGE_KEY_PREFIX = 'cert_pin_';
const STORAGE_KEY_FINGERPRINT = `${STORAGE_KEY_PREFIX}fingerprint`;
const STORAGE_KEY_UPDATE_LOG = `${STORAGE_KEY_PREFIX}update_log`;
const MAX_UPDATE_LOG_ENTRIES = 50;

interface PinnedFingerprint {
  /** 加密后的 SHA-256 指纹（User Key 加密，或 plaintext: 前缀的明文降级） */
  encryptedFingerprint: string;
  pinnedAt: string;
  lastVerifiedAt: string;
}

interface DecryptedFingerprint {
  /** 冒号分隔的大写十六进制，如 "EE:F0:34:AB:..." */
  fingerprint: string;
  pinnedAt: string;
  lastVerifiedAt: string;
}

interface FingerprintUpdateLogEntry {
  encryptedOldFingerprint: string;
  encryptedNewFingerprint: string;
  updatedAt: string;
  reason: 'user_confirmed' | 'initial_pin';
}

export type CertVerifyResult =
  | { status: 'ok' }
  | { status: 'first_use'; fingerprint: string }
  | { status: 'mismatch'; expected: string; actual: string }
  | { status: 'error'; message: string };

export interface CertPinEventListener {
  onMismatch: (expected: string, actual: string, requestId: string) => void;
  onFirstUse: (fingerprint: string) => void;
  onError: (message: string) => void;
}

export class CertPinManager {
  private cachedFingerprint: DecryptedFingerprint | null = null;
  private eventListener: CertPinEventListener | null = null;
  private isListening = false;
  private boundHandleRequest: ((
    details: Browser.webRequest.OnHeadersReceivedDetails,
  ) => Browser.webRequest.BlockingResponse | undefined) | null = null;

  setEventListener(listener: CertPinEventListener): void {
    this.eventListener = listener;
  }

  start(): void {
    if (this.isListening) {
      return;
    }

    this.boundHandleRequest = (details) => this.handleRequest(details);

    browser.webRequest.onHeadersReceived.addListener(
      this.boundHandleRequest,
      { urls: [KEEPER_API_URL_PATTERN] },
      ['blocking', 'responseHeaders'],
    );

    this.isListening = true;
    console.log('[CertPin] 证书固定监听已启动');
  }

  stop(): void {
    if (!this.isListening || !this.boundHandleRequest) {
      return;
    }

    browser.webRequest.onHeadersReceived.removeListener(this.boundHandleRequest);

    this.boundHandleRequest = null;
    this.isListening = false;
    this.cachedFingerprint = null;
    console.log('[CertPin] 证书固定监听已停止');
  }

  /**
   * Firefox blocking listener 支持返回 Promise<BlockingResponse>，
   * 但 TypeScript 类型签名要求同步返回，因此需要类型断言
   */
  private handleRequest(
    details: Browser.webRequest.OnHeadersReceivedDetails,
  ): Browser.webRequest.BlockingResponse | undefined {
    return this.verifyAndRespond(details) as unknown as Browser.webRequest.BlockingResponse;
  }

  private async verifyAndRespond(
    details: Browser.webRequest.OnHeadersReceivedDetails,
  ): Promise<Browser.webRequest.BlockingResponse> {
    try {
      const fingerprint = this.extractFingerprint(details);

      if (!fingerprint) {
        console.warn('[CertPin] 无法获取证书安全信息');
        this.eventListener?.onError('无法获取证书安全信息');
        return { cancel: true };
      }

      const result = await this.verifyFingerprint(fingerprint);

      switch (result.status) {
        case 'ok':
          return {};

        case 'first_use':
          await this.pinFingerprint(fingerprint);
          this.eventListener?.onFirstUse(fingerprint);
          console.log('[CertPin] 首次连接，已存储证书指纹');
          return {};

        case 'mismatch':
          console.error(
            `[CertPin] 证书指纹不匹配！期望: ${result.expected}, 实际: ${result.actual}`,
          );
          this.eventListener?.onMismatch(result.expected, result.actual, details.requestId);
          return { cancel: true };

        case 'error':
          console.error(`[CertPin] 验证错误: ${result.message}`);
          this.eventListener?.onError(result.message);
          return { cancel: true };
      }
    } catch (error) {
      console.error('[CertPin] 请求处理异常:', error);
      this.eventListener?.onError(error instanceof Error ? error.message : '未知错误');
      return { cancel: true };
    }
  }

  private extractFingerprint(details: Browser.webRequest.OnHeadersReceivedDetails): string | null {
    try {
      const securityInfo = details.securityInfo;

      if (
        !securityInfo ||
        !securityInfo.certificates ||
        securityInfo.certificates.length === 0
      ) {
        return null;
      }

      return securityInfo.certificates[0].fingerprint.sha256;
    } catch {
      return null;
    }
  }

  async verifyFingerprint(currentFingerprint: string): Promise<CertVerifyResult> {
    try {
      if (this.cachedFingerprint) {
        if (this.cachedFingerprint.fingerprint === currentFingerprint) {
          void this.updateLastVerifiedAt();
          return { status: 'ok' };
        }
        return {
          status: 'mismatch',
          expected: this.cachedFingerprint.fingerprint,
          actual: currentFingerprint,
        };
      }

      const stored = await this.loadPinnedFingerprint();

      if (!stored) {
        return { status: 'first_use', fingerprint: currentFingerprint };
      }

      this.cachedFingerprint = stored;

      if (stored.fingerprint === currentFingerprint) {
        void this.updateLastVerifiedAt();
        return { status: 'ok' };
      }

      return {
        status: 'mismatch',
        expected: stored.fingerprint,
        actual: currentFingerprint,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : '指纹验证失败',
      };
    }
  }

  private async pinFingerprint(fingerprint: string): Promise<void> {
    const now = new Date().toISOString();

    const encryptedFingerprint = await this.encryptFingerprint(fingerprint);

    const pinnedData: PinnedFingerprint = {
      encryptedFingerprint,
      pinnedAt: now,
      lastVerifiedAt: now,
    };

    await browser.storage.local.set({
      [STORAGE_KEY_FINGERPRINT]: pinnedData,
    });

    await this.appendUpdateLog({
      encryptedOldFingerprint: '',
      encryptedNewFingerprint: encryptedFingerprint,
      updatedAt: now,
      reason: 'initial_pin',
    });

    this.cachedFingerprint = {
      fingerprint,
      pinnedAt: now,
      lastVerifiedAt: now,
    };
  }

  /**
   * 用户确认信任新证书（证书到期换证时使用）
   */
  async trustNewFingerprint(newFingerprint: string): Promise<void> {
    const now = new Date().toISOString();

    const oldStored = await browser.storage.local.get(STORAGE_KEY_FINGERPRINT);
    const oldData = oldStored[STORAGE_KEY_FINGERPRINT] as PinnedFingerprint | undefined;

    const encryptedFingerprint = await this.encryptFingerprint(newFingerprint);

    const pinnedData: PinnedFingerprint = {
      encryptedFingerprint,
      pinnedAt: now,
      lastVerifiedAt: now,
    };

    await browser.storage.local.set({
      [STORAGE_KEY_FINGERPRINT]: pinnedData,
    });

    await this.appendUpdateLog({
      encryptedOldFingerprint: oldData?.encryptedFingerprint ?? '',
      encryptedNewFingerprint: encryptedFingerprint,
      updatedAt: now,
      reason: 'user_confirmed',
    });

    this.cachedFingerprint = {
      fingerprint: newFingerprint,
      pinnedAt: now,
      lastVerifiedAt: now,
    };

    console.log('[CertPin] 用户已确认信任新证书指纹');
  }

  async getUpdateLog(): Promise<FingerprintUpdateLogEntry[]> {
    const stored = await browser.storage.local.get(STORAGE_KEY_UPDATE_LOG);
    return (stored[STORAGE_KEY_UPDATE_LOG] as FingerprintUpdateLogEntry[]) ?? [];
  }

  async getPinnedInfo(): Promise<DecryptedFingerprint | null> {
    if (this.cachedFingerprint) {
      return this.cachedFingerprint;
    }
    return this.loadPinnedFingerprint();
  }

  async clearPinnedData(): Promise<void> {
    await browser.storage.local.remove([STORAGE_KEY_FINGERPRINT, STORAGE_KEY_UPDATE_LOG]);
    this.cachedFingerprint = null;
    console.log('[CertPin] 已清除所有证书固定数据');
  }

  private async loadPinnedFingerprint(): Promise<DecryptedFingerprint | null> {
    const stored = await browser.storage.local.get(STORAGE_KEY_FINGERPRINT);
    const pinnedData = stored[STORAGE_KEY_FINGERPRINT] as PinnedFingerprint | undefined;

    if (!pinnedData) {
      return null;
    }

    const fingerprint = await this.decryptFingerprint(pinnedData.encryptedFingerprint);

    return {
      fingerprint,
      pinnedAt: pinnedData.pinnedAt,
      lastVerifiedAt: pinnedData.lastVerifiedAt,
    };
  }

  private async updateLastVerifiedAt(): Promise<void> {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEY_FINGERPRINT);
      const pinnedData = stored[STORAGE_KEY_FINGERPRINT] as PinnedFingerprint | undefined;

      if (pinnedData) {
        pinnedData.lastVerifiedAt = new Date().toISOString();
        await browser.storage.local.set({
          [STORAGE_KEY_FINGERPRINT]: pinnedData,
        });

        if (this.cachedFingerprint) {
          this.cachedFingerprint.lastVerifiedAt = pinnedData.lastVerifiedAt;
        }
      }
    } catch {
    }
  }

  private async appendUpdateLog(entry: FingerprintUpdateLogEntry): Promise<void> {
    const log = await this.getUpdateLog();
    log.push(entry);
    const trimmed = log.slice(-MAX_UPDATE_LOG_ENTRIES);

    await browser.storage.local.set({
      [STORAGE_KEY_UPDATE_LOG]: trimmed,
    });
  }

  /**
   * KeyManager 未解锁时降级为 plaintext: 前缀存储（仅在用户未登录时发生）
   */
  private async encryptFingerprint(fingerprint: string): Promise<string> {
    if (keyManager.isUnlocked()) {
      const userKey = keyManager.getUserKey();
      return encrypt(fingerprint, userKey);
    }

    console.warn('[CertPin] KeyManager 未解锁，指纹将以明文存储');
    return `plaintext:${fingerprint}`;
  }

  private async decryptFingerprint(encryptedFingerprint: string): Promise<string> {
    if (encryptedFingerprint.startsWith('plaintext:')) {
      return encryptedFingerprint.slice('plaintext:'.length);
    }

    if (keyManager.isUnlocked()) {
      const userKey = keyManager.getUserKey();
      return decrypt(encryptedFingerprint, userKey);
    }

    throw new Error('KeyManager 未解锁，无法解密证书指纹');
  }
}

export const certPinManager = new CertPinManager();
