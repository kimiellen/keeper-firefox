import { keeperClient } from '../api/client';
import type { Bookmark, BookmarkCreate } from '../api/types';

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
  | { type: 'GET_DECRYPTED_PASSWORD'; payload: { bookmarkId: string; accountId: number } }
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
  | { type: 'LOCK_AND_HIDE' }
  | { type: 'FOCUS_INPUT' }
  | { type: 'SAVE_PENDING_CREDENTIAL'; payload: { url: string; hostname: string; username: string; password: string } }
  | { type: 'GET_PENDING_CREDENTIAL' }
  | { type: 'CLEAR_PENDING_CREDENTIAL' };

interface PasswordOptions {
  length: number;
  includeLowercase: boolean;
  includeUppercase: boolean;
  includeNumbers: boolean;
  includeSpecial: boolean;
}

const CONTEXT_MENU_ID = 'keeper-generate-password';
let sidebarOpen = false;
const SETTINGS_STORAGE_KEY = 'keeper_settings';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';

const SPECIAL = '!@#$%^&*()-_=+[]{};:,.<>?/|';

// ============ 待保存凭据状态管理 ============

/** 待处理的凭据 */
interface PendingCredential {
  url: string;
  hostname: string;
  username: string;
  password: string;
  capturedAt: number;
  sourceTabId: number;
}

const PENDING_TIMEOUT = 5 * 60 * 1000; // 5分钟超时

// 内存中存储待处理凭据 (background script 是持久化的)
let pendingCredential: PendingCredential | null = null;

/**
 * 保存待处理凭据到内存
 */
function savePendingCredential(
  credential: Omit<PendingCredential, 'capturedAt'>,
  sendResponse: (response: { success?: boolean }) => void,
): void {
  try {
    pendingCredential = {
      ...credential,
      capturedAt: Date.now(),
    };
    console.log('[Keeper:bg] Pending credential saved for', credential.hostname);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Keeper:bg] Failed to save pending credential:', error);
    sendResponse({ success: false });
  }
}

/**
 * 获取待处理凭据
 */
function getPendingCredential(
  sendResponse: (response: { credential?: PendingCredential | null }) => void,
): void {
  // 检查是否过期
  if (pendingCredential && Date.now() - pendingCredential.capturedAt > PENDING_TIMEOUT) {
    pendingCredential = null;
    sendResponse({ credential: null });
    return;
  }

  sendResponse({ credential: pendingCredential });
}

/**
 * 清除待处理凭据
 */
function clearPendingCredential(
  sendResponse: (response: { success?: boolean }) => void,
): void {
  pendingCredential = null;
  sendResponse({ success: true });
}

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
async function handleGetAuthStatus(): Promise<{ locked?: boolean; error?: string }> {
  console.log('[Keeper:bg] handleGetAuthStatus called');
  // 重新加载 token，确保获取最新值（侧边栏可能在后台启动后解锁）
  await keeperClient.loadToken();
  const token = keeperClient.getToken();
  console.log('[Keeper:bg] token loaded:', token ? 'exists (' + token.substring(0, 10) + '...)' : 'null');
  
  try {
    const status = await keeperClient.getStatus();
    console.log('[Keeper:bg] getStatus returned:', status);
    return { locked: status.locked };
  } catch (error) {
    console.error('[Keeper:bg] getStatus error:', error);
    return { error: getErrorMessage(error) };
  }
}

/**
 * 获取与当前页面主机名匹配的书签列表。
 */
async function handleGetMatchingBookmarks(
  payload: { url: string },
  sender?: browser.runtime.MessageSender,
): Promise<{ bookmarks?: MatchingBookmark[]; error?: string; locked?: boolean }> {
  // 重新加载 token，确保获取最新值（侧边栏可能在后台启动后解锁）
  await keeperClient.loadToken();

  // 先检查登录状态
  try {
    const status = await keeperClient.getStatus();
    if (status.locked) {
      return { error: 'Unauthorized', locked: true };
    }
  } catch {
    return { error: 'Unauthorized', locked: true };
  }

  try {
    const pageUrl = sender?.tab?.url ?? payload.url;
    console.log('[Keeper:bg] handleGetMatchingBookmarks called for URL:', pageUrl);
    const bookmarksResult = await keeperClient.getBookmarks({ limit: 100 });
    console.log('[Keeper:bg] got bookmarks:', bookmarksResult.data.length);
    const matched = bookmarksResult.data.filter((bookmark) =>
      isBookmarkMatchingHostname(bookmark, pageUrl),
    );
    console.log('[Keeper:bg] matched bookmarks:', matched.length);

    // 不返回密码（密码是加密格式），只返回账号标识
    // 密码在使用时通过 GET_DECRYPTED_PASSWORD 按需解密
    const bookmarks: MatchingBookmark[] = matched.map((bookmark) => ({
      bookmarkId: bookmark.id,
      name: bookmark.name,
      accounts: bookmark.accounts.map((account) => ({
        id: account.id,
        username: account.username,
        // password 不返回，按需解密
      })),
    }));

    return { bookmarks };
  } catch (error) {
    console.error('[Keeper:bg] handleGetMatchingBookmarks error:', error);
    return { error: getErrorMessage(error) };
  }
}

/**
 * 获取指定账号的解密后的密码。
 * 按需解密，确保密码只在需要时才解密。
 */
async function handleGetDecryptedPassword(
  payload: { bookmarkId: string; accountId: number },
): Promise<{ password?: string; error?: string; locked?: boolean }> {
  // 重新加载 token，确保获取最新值
  await keeperClient.loadToken();

  // 先检查登录状态
  try {
    const status = await keeperClient.getStatus();
    if (status.locked) {
      return { error: 'Unauthorized', locked: true };
    }
  } catch {
    return { error: 'Unauthorized', locked: true };
  }

  try {
    console.log('[Keeper:bg] handleGetDecryptedPassword called for bookmark:', payload.bookmarkId, 'account:', payload.accountId);
    // 调用单条书签 API，传入 decrypt=true 获取明文密码
    const bookmark = await keeperClient.getBookmark(payload.bookmarkId, true);
    const account = bookmark.accounts.find(a => a.id === payload.accountId);
    
    if (!account) {
      return { error: 'Account not found' };
    }
    
    console.log('[Keeper:bg] decrypted password for account:', account.username);
    return { password: account.password };
  } catch (error) {
    console.error('[Keeper:bg] handleGetDecryptedPassword error:', error);
    return { error: getErrorMessage(error) };
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
  async main() {
    // 启动时从 storage 加载 token
    await keeperClient.loadToken();
    console.log('[Keeper:bg] Token loaded, token exists:', keeperClient.getToken() !== null);
    
    setupContextMenu();

    browser.commands.onCommand.addListener(async (command) => {
      if (command === 'toggle_sidebar') {
        if (sidebarOpen) {
          browser.sidebarAction.close();
          sidebarOpen = false;
          // 根据设置决定是否锁定
          const result = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
          const settings = result[SETTINGS_STORAGE_KEY];
          const lockOnHide = settings ? settings.lockOnHide : true;
          if (lockOnHide) {
            keeperClient.lock().catch(() => {});
          }
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
        if (!tab?.id) {
          return;
        }

        await browser.tabs.sendMessage(tab.id, { type: 'FILL_FROM_SHORTCUT' });
      } catch {
        // 忽略发送失败
      }
    });

    browser.runtime.onMessage.addListener((message: KeeperMessage, sender, sendResponse) => {
      switch (message.type) {
        case 'GET_AUTH_STATUS': {
          return handleGetAuthStatus();
        }

        case 'GET_MATCHING_BOOKMARKS': {
          return handleGetMatchingBookmarks(message.payload, sender);
        }

        case 'GET_DECRYPTED_PASSWORD': {
          return handleGetDecryptedPassword(message.payload);
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

        case 'SAVE_PENDING_CREDENTIAL': {
          savePendingCredential(
            { ...message.payload, sourceTabId: sender.tab?.id || 0 },
            sendResponse,
          );
          return true;
        }

        case 'GET_PENDING_CREDENTIAL': {
          getPendingCredential(sendResponse);
          return true;
        }

        case 'CLEAR_PENDING_CREDENTIAL': {
          clearPendingCredential(sendResponse);
          return true;
        }

        default:
          sendResponse({ error: 'Unsupported message type' });
          return false;
      }
    });

    // 监听标签页更新，处理页面跳转后恢复通知栏
    browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status !== 'complete' || !tab.url) {
        return;
      }

      // 检查是否有待处理凭据
      if (!pendingCredential) return;

      // 检查是否过期
      if (Date.now() - pendingCredential.capturedAt > PENDING_TIMEOUT) {
        pendingCredential = null;
        return;
      }

      // 检查URL是否匹配 (同一域名)
      try {
        const pendingHostname = new URL(pendingCredential.url).hostname;
        const currentHostname = new URL(tab.url).hostname;

        if (pendingHostname === currentHostname) {
          console.log('[Keeper:bg] Restoring notification bar for', currentHostname);
          // 发送消息到新页面的 content script 显示通知
          try {
            await browser.tabs.sendMessage(tabId, {
              type: 'SHOW_PENDING_CREDENTIAL',
              payload: {
                username: pendingCredential.username,
                password: pendingCredential.password,
                originalUrl: pendingCredential.url,
              },
            });
            // 发送后清除，避免重复显示
            pendingCredential = null;
          } catch {
            // 页面可能不支持 content script，忽略错误
          }
        }
      } catch {
        // URL解析错误，忽略
      }
    });
  },
});
