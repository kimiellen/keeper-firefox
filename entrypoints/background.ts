import { keeperClient } from '../api/client';
import type { Bookmark, BookmarkCreate } from '../api/types';
import { certPinManager } from '../utils/security/certPinning';
import type { CertVerifyResult } from '../utils/security/certPinning';

interface MatchingBookmark {
  bookmarkId: string;
  name: string;
  accounts: Array<{
    id: number;
    username: string;
    password?: string;
  }>;
}

type KeeperMessage =
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'GET_MATCHING_BOOKMARKS'; payload: { url: string } }
  | { type: 'SAVE_CREDENTIALS'; payload: { url: string; username: string; password: string } }
  | {
      type: 'GENERATE_PASSWORD';
      payload: {
        length: number;
        includeLowercase: boolean;
        includeUppercase: boolean;
        includeNumbers: boolean;
        includeSpecial: boolean;
      };
    }
  | { type: 'MARK_AS_USED'; payload: { bookmarkId: string; url?: string; accountId?: number } }
  | { type: 'TRUST_NEW_CERT'; payload: { fingerprint: string } }
  | { type: 'GET_CERT_PIN_STATUS' }
  | { type: 'CLEAR_CERT_PIN' }
  | { type: 'LOCK_AND_HIDE' };

interface PasswordOptions {
  length: number;
  includeLowercase: boolean;
  includeUppercase: boolean;
  includeNumbers: boolean;
  includeSpecial: boolean;
}

const CONTEXT_MENU_ID = 'keeper-generate-password';
let sidebarOpen = false;
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SPECIAL = '!@#$%^&*()-_=+[]{};:,.<>?/|';

/**
 * 解析 URL 并提取主机名。
 */
function getHostname(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

/**
 * 判断书签是否与页面 URL 的主机名匹配。
 */
function isBookmarkMatchingHostname(bookmark: Bookmark, pageUrl: string): boolean {
  const pageHostname = getHostname(pageUrl);

  return bookmark.urls.some((urlItem) => {
    try {
      return getHostname(urlItem.url) === pageHostname;
    } catch {
      return false;
    }
  });
}

/**
 * 使用拒绝采样生成无偏随机索引。
 */
function getRandomInt(max: number): number {
  if (max <= 0) {
    throw new Error('max must be greater than 0');
  }

  const uint32Max = 0x100000000;
  const limit = Math.floor(uint32Max / max) * max;
  const buffer = new Uint32Array(1);

  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);

  return buffer[0] % max;
}

/**
 * 原地打乱字符数组。
 */
function shuffleInPlace(chars: string[]): void {
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const randomIndex = getRandomInt(index + 1);
    [chars[index], chars[randomIndex]] = [chars[randomIndex], chars[index]];
  }
}

/**
 * 根据配置生成密码，并保证每个启用字符集至少出现一次。
 */
function generatePassword(options: PasswordOptions): string {
  const groups: string[] = [];

  if (options.includeLowercase) groups.push(LOWERCASE);
  if (options.includeUppercase) groups.push(UPPERCASE);
  if (options.includeNumbers) groups.push(NUMBERS);
  if (options.includeSpecial) groups.push(SPECIAL);

  if (groups.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  if (options.length < groups.length) {
    throw new Error('Password length is too short for selected character sets');
  }

  const allChars = groups.join('');
  const result: string[] = [];

  for (const group of groups) {
    result.push(group[getRandomInt(group.length)]);
  }

  while (result.length < options.length) {
    result.push(allChars[getRandomInt(allChars.length)]);
  }

  shuffleInPlace(result);
  return result.join('');
}

/**
 * 统一提取错误信息。
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

/**
 * 返回当前登录锁定状态。
 */
async function handleGetAuthStatus(sendResponse: (response: { locked?: boolean; error?: string }) => void): Promise<void> {
  try {
    const status = await keeperClient.getStatus();
    sendResponse({ locked: status.locked });
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

/**
 * 获取与当前页面主机名匹配的书签列表。
 */
async function handleGetMatchingBookmarks(
  payload: { url: string },
  sendResponse: (response: { bookmarks?: MatchingBookmark[]; error?: string }) => void,
): Promise<void> {
  try {
    const bookmarksResult = await keeperClient.getBookmarks({ limit: 100 });
    const matched = bookmarksResult.data.filter((bookmark) =>
      isBookmarkMatchingHostname(bookmark, payload.url),
    );

    const bookmarks: MatchingBookmark[] = matched.map((bookmark) => ({
      bookmarkId: bookmark.id,
      name: bookmark.name,
      accounts: bookmark.accounts.map((account) => ({
        id: account.id,
        username: account.username,
        password: account.password,
      })),
    }));

    sendResponse({ bookmarks });
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

/**
 * 保存新的站点账号凭据。
 * 如果已有书签匹配当前 hostname，则追加账号或更新已有账号的密码；
 * 否则新建书签。
 */
async function handleSaveCredentials(
  payload: { url: string; username: string; password: string },
  sendResponse: (response: { success?: boolean; error?: string }) => void,
): Promise<void> {
  try {
    const pageHostname = getHostname(payload.url);

    const bookmarksResult = await keeperClient.getBookmarks({ limit: 100 });
    const existingBookmark = bookmarksResult.data.find((bookmark) =>
      isBookmarkMatchingHostname(bookmark, payload.url),
    );

    if (existingBookmark) {
      const normalizedUsername = payload.username.toLowerCase();
      const existingAccount = existingBookmark.accounts.find(
        (account) => account.username.toLowerCase() === normalizedUsername,
      );

      if (existingAccount) {
        const updatedAccounts = existingBookmark.accounts.map((account) =>
          account.username.toLowerCase() === normalizedUsername
            ? { username: account.username, password: payload.password, relatedIds: account.relatedIds }
            : { username: account.username, password: account.password, relatedIds: account.relatedIds },
        );
        await keeperClient.patchBookmark(existingBookmark.id, { accounts: updatedAccounts });
      } else {
        const allAccounts = existingBookmark.accounts.map((account) => ({
          username: account.username,
          password: account.password,
          relatedIds: account.relatedIds,
        }));
        allAccounts.push({ username: payload.username, password: payload.password, relatedIds: [] });
        await keeperClient.patchBookmark(existingBookmark.id, { accounts: allAccounts });
      }
    } else {
      const bookmarkData: BookmarkCreate = {
        name: pageHostname,
        urls: [{ url: payload.url }],
        accounts: [{ username: payload.username, password: payload.password }],
      };
      await keeperClient.createBookmark(bookmarkData);
    }

    sendResponse({ success: true });

    console.log('[Keeper:bg] SAVE_CREDENTIALS done, notifying via storage');
    browser.storage.local.set({ bookmarkChangedAt: Date.now() }).catch(() => {});
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

/**
 * 按配置生成密码并返回。
 */
async function handleGeneratePassword(
  payload: PasswordOptions,
  sendResponse: (response: { password?: string; error?: string }) => void,
): Promise<void> {
  try {
    const password = generatePassword(payload);
    sendResponse({ password });
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

/**
 * 标记书签或账号已使用。
 */
async function handleMarkAsUsed(
  payload: { bookmarkId: string; url?: string; accountId?: number },
  sendResponse: (response: { success?: boolean; error?: string }) => void,
): Promise<void> {
  try {
    await keeperClient.useBookmark(payload.bookmarkId, {
      url: payload.url,
      accountId: payload.accountId,
    });

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

/**
 * 用户确认信任新证书指纹（证书到期换证时使用）。
 */
async function handleTrustNewCert(
  payload: { fingerprint: string },
  sendResponse: (response: { success?: boolean; error?: string }) => void,
): Promise<void> {
  try {
    await certPinManager.trustNewFingerprint(payload.fingerprint);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

/**
 * 获取当前证书固定状态（已固定指纹 + 更新日志）。
 */
async function handleGetCertPinStatus(
  sendResponse: (response: {
    pinned?: { fingerprint: string; pinnedAt: string; lastVerifiedAt: string } | null;
    updateLog?: Array<{ updatedAt: string; reason: string }>;
    error?: string;
  }) => void,
): Promise<void> {
  try {
    const pinned = await certPinManager.getPinnedInfo();
    const updateLog = await certPinManager.getUpdateLog();

    sendResponse({
      pinned: pinned ?? null,
      updateLog: updateLog.map((entry) => ({
        updatedAt: entry.updatedAt,
        reason: entry.reason,
      })),
    });
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

/**
 * 清除所有证书固定数据。
 */
async function handleClearCertPin(
  sendResponse: (response: { success?: boolean; error?: string }) => void,
): Promise<void> {
  try {
    await certPinManager.clearPinnedData();
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ error: getErrorMessage(error) });
  }
}

/**
 * 创建右键菜单并监听点击事件，向内容脚本发送生成密码消息。
 */
function setupContextMenu(): void {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Keeper: 生成密码',
      contexts: ['editable'],
    });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
      return;
    }

    const password = generatePassword({
      length: 16,
      includeLowercase: true,
      includeUppercase: true,
      includeNumbers: true,
      includeSpecial: false,
    });

    await browser.tabs.sendMessage(tab.id, {
      type: 'FILL_GENERATED_PASSWORD',
      password,
    });
  });
}

export default defineBackground({
  persistent: true,
  main() {
    setupContextMenu();

    certPinManager.setEventListener({
      onMismatch(expected, actual, requestId) {
        console.error(
          `[CertPin] 证书指纹不匹配 (request ${requestId}): 期望 ${expected}, 实际 ${actual}`,
        );
        void browser.runtime.sendMessage({
          type: 'CERT_PIN_MISMATCH',
          payload: { expected, actual },
        });
      },
      onFirstUse(fingerprint) {
        console.log(`[CertPin] 首次使用证书: ${fingerprint}`);
      },
      onError(message) {
        console.error(`[CertPin] 错误: ${message}`);
      },
    });

    // cert pinning 仅在 HTTPS 模式下启用
    // 开发环境使用 HTTP，URL pattern 不匹配所以不会拦截
    certPinManager.start();

    browser.commands.onCommand.addListener(async (command) => {
      if (command === 'toggle_sidebar') {
        if (sidebarOpen) {
          browser.sidebarAction.close();
          sidebarOpen = false;
          keeperClient.lock().catch(() => {});
        } else {
          browser.sidebarAction.open();
          sidebarOpen = true;
        }
        return;
      }

      if (command !== 'fill_credentials') {
        return;
      }

      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        console.log('[Keeper:bg] active tab:', tab?.id, tab?.url);
        if (!tab?.id) {
          return;
        }

        await browser.tabs.sendMessage(tab.id, { type: 'FILL_FROM_SHORTCUT' });
        console.log('[Keeper:bg] FILL_FROM_SHORTCUT sent to tab', tab.id);
      } catch (err) {
        console.error('[Keeper:bg] sendMessage failed:', err);
      }
    });

    browser.runtime.onMessage.addListener((message: KeeperMessage, _sender, sendResponse) => {
      switch (message.type) {
        case 'GET_AUTH_STATUS': {
          void handleGetAuthStatus(sendResponse);
          return true;
        }

        case 'GET_MATCHING_BOOKMARKS': {
          void handleGetMatchingBookmarks(message.payload, sendResponse);
          return true;
        }

        case 'SAVE_CREDENTIALS': {
          void handleSaveCredentials(message.payload, sendResponse);
          return true;
        }

        case 'GENERATE_PASSWORD': {
          void handleGeneratePassword(message.payload, sendResponse);
          return true;
        }

        case 'MARK_AS_USED': {
          void handleMarkAsUsed(message.payload, sendResponse);
          return true;
        }

        case 'TRUST_NEW_CERT': {
          void handleTrustNewCert(message.payload, sendResponse);
          return true;
        }

        case 'GET_CERT_PIN_STATUS': {
          void handleGetCertPinStatus(sendResponse);
          return true;
        }

        case 'CLEAR_CERT_PIN': {
          void handleClearCertPin(sendResponse);
          return true;
        }

        default:
          sendResponse({ error: 'Unsupported message type' });
          return false;
      }
    });
  },
});
