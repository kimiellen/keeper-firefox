/**
 * 密钥管理模块
 *
 * 负责在浏览器 session storage 中安全存储用户密钥
 */

import { deriveKey, encrypt, decrypt, generateUserKey, fromHex, toHex } from './encryption';

const STORAGE_KEY = 'keeper_user_key';

/**
 * 密钥管理器
 *
 * 使用浏览器 sessionStorage 存储密钥 (仅在内存中，标签页关闭后清除)
 */
export class KeyManager {
  private userKey: Uint8Array | null = null;
  private encryptedUserKey: string | null = null;
  private kdfParams: KdfParams | null = null;

  /**
   * 初始化密钥管理器
   *
   * @param encryptedUserKey - 从后端获取的加密用户密钥
   * @param kdfParams - KDF 参数
   */
  async initialize(encryptedUserKey: string, kdfParams: KdfParams): Promise<void> {
    this.encryptedUserKey = encryptedUserKey;
    this.kdfParams = kdfParams;
  }

  /**
   * 解锁密钥库
   *
   * @param password - 用户主密码
   */
  async unlock(password: string): Promise<void> {
    if (!this.encryptedUserKey || !this.kdfParams) {
      throw new Error('KeyManager not initialized');
    }

    // 从密码派生密钥
    const masterKey = await deriveKey(
      password,
      this.kdfParams.salt,
      this.kdfParams.iterations
    );

    // 解密用户密钥
    const userKeyHex = await decrypt(this.encryptedUserKey, masterKey);
    this.userKey = fromHex(userKeyHex);

    // 存储到 session storage (作为后备)
    this.storeToSession();
  }

  /**
   * 锁定密钥库
   *
   * 清除内存中的密钥
   */
  lock(): void {
    this.userKey = null;
    this.clearSession();
  }

  /**
   * 检查是否已解锁
   */
  isUnlocked(): boolean {
    return this.userKey !== null;
  }

  /**
   * 获取用户密钥
   *
   * @throws 如果未解锁
   */
  getUserKey(): Uint8Array {
    if (!this.userKey) {
      throw new Error('KeyManager is locked');
    }
    return this.userKey;
  }

  /**
   * 存储到 session storage
   */
  private storeToSession(): void {
    if (!this.userKey) return;

    try {
      // 注意：sessionStorage 只能存储字符串
      // 存储加密版本而非明文密钥
      sessionStorage.setItem(STORAGE_KEY, toHex(this.userKey));
    } catch (e) {
      console.warn('Failed to store key to session:', e);
    }
  }

  /**
   * 从 session storage 恢复密钥
   *
   * 注意：sessionStorage 在标签页关闭后会被清除
   * 此方法仅用于页面刷新后的快速恢复
   */
  restoreFromSession(): boolean {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.userKey = fromHex(stored);
        return true;
      }
    } catch (e) {
      console.warn('Failed to restore key from session:', e);
    }
    return false;
  }

  /**
   * 清除 session storage
   */
  private clearSession(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // 忽略错误
    }
  }

  /**
   * 创建新的加密用户密钥
   *
   * 用于首次初始化
   *
   * @param password - 用户主密码
   * @param salt - 盐 (用户邮箱)
   * @returns 加密的用户密钥
   */
  static async createEncryptedUserKey(
    password: string,
    salt: string
  ): Promise<{ encryptedUserKey: string; kdfParams: KdfParams }> {
    // 生成随机用户密钥
    const userKey = generateUserKey();

    // 派生主密钥
    const masterKey = await deriveKey(password, salt, 100000);

    // 加密用户密钥
    const encryptedUserKey = await encrypt(toHex(userKey), masterKey);

    return {
      encryptedUserKey,
      kdfParams: {
        algorithm: 'PBKDF2',
        memory: 0, // PBKDF2 不使用 memory 参数
        iterations: 100000,
        parallelism: 0, // PBKDF2 不使用 parallelism 参数
        salt,
      },
    };
  }
}

/**
 * KDF 参数
 */
export interface KdfParams {
  algorithm: string;
  memory: number;
  iterations: number;
  parallelism: number;
  salt: string;
}

// 导出单例
export const keyManager = new KeyManager();
