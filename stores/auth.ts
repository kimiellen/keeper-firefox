/**
 * 认证 Store
 *
 * 管理用户解锁/锁定状态，与 KeyManager 和 API 客户端集成
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { keeperClient, KeeperApiError, type UnlockResponse, type KdfParams } from '../api';
import { keyManager, KeyManager, type KdfParams as CryptoKdfParams } from '../utils/crypto';

export const useAuthStore = defineStore('auth', () => {
  // === State ===
  const locked = ref(true);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const sessionExpiresAt = ref<string | null>(null);
  const isInitialized = ref(false);
  
  // === Getters ===
  
  /** 是否已解锁 */
  const isUnlocked = computed(() => !locked.value);
  
  /** 是否有错误 */
  const hasError = computed(() => error.value !== null);
  
  // === Actions ===

  /** 检查初始是否已初始化（数据库是否有认证信息） */
  async function checkInitialized(): Promise<boolean> {
    try {
      // 尝试获取状态，如果返回 401 说明已初始化但未解锁
      await keeperClient.getStatus();
      isInitialized.value = true;
      return true;
    } catch (e) {
      if (e instanceof KeeperApiError && e.status === 400) {
        // 400 说明未初始化
        isInitialized.value = false;
        return false;
      }
      // 其他错误假设已初始化
      isInitialized.value = true;
      return true;
    }
  }

  /** 检查会话状态 */
  async function checkStatus(): Promise<void> {
    loading.value = true;
    error.value = null;
    
    try {
      const status = await keeperClient.getStatus();
      
      if ('locked' in status && status.locked) {
        locked.value = true;
        sessionExpiresAt.value = null;
      } else {
        locked.value = false;
        sessionExpiresAt.value = 'sessionExpiresAt' in status 
          ? status.sessionExpiresAt 
          : null;
        
        // 尝试从 session storage 恢复密钥
        const restored = keyManager.restoreFromSession();
        if (!restored) {
          // 需要重新解锁
          locked.value = true;
        }
      }
    } catch (e) {
      locked.value = true;
      sessionExpiresAt.value = null;
    } finally {
      loading.value = false;
    }
  }

  /** 初始化（首次使用） */
  async function initialize(
    email: string,
    masterPasswordHash: string,
    kdfParams: CryptoKdfParams
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    
    try {
      // 生成加密的用户密钥
      const { encryptedUserKey } = await KeyManager.createEncryptedUserKey(
        masterPasswordHash,
        email
      );
      
      // 调用 API 初始化
      await keeperClient.initialize({
        email,
        masterPasswordHash,
        encryptedUserKey,
        kdfParams: {
          algorithm: kdfParams.algorithm,
          memory: kdfParams.memory,
          iterations: kdfParams.iterations,
          parallelism: kdfParams.parallelism,
          salt: kdfParams.salt,
        },
      });
      
      isInitialized.value = true;
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '初始化失败';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /** 解锁（登录） */
  async function unlock(masterPasswordHash: string): Promise<void> {
    loading.value = true;
    error.value = null;
    
    try {
      // 调用 API 解锁
      const response: UnlockResponse = await keeperClient.unlock({
        masterPasswordHash,
      });
      
      // 使用 KeyManager 解密用户密钥
      const kdfParams: CryptoKdfParams = {
        algorithm: response.kdfParams.algorithm,
        memory: response.kdfParams.memory,
        iterations: response.kdfParams.iterations,
        parallelism: response.kdfParams.parallelism,
        salt: response.kdfParams.salt,
      };
      
      await keyManager.initialize(response.encryptedUserKey, kdfParams);
      await keyManager.unlock(masterPasswordHash);
      
      locked.value = false;
      sessionExpiresAt.value = null; // API 会返回新的 session
      
    } catch (e) {
      if (e instanceof KeeperApiError) {
        error.value = e.detail;
      } else {
        error.value = '解锁失败';
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /** 锁定（登出） */
  async function lock(): Promise<void> {
    loading.value = true;
    error.value = null;
    
    try {
      await keeperClient.lock();
      keyManager.lock();
      locked.value = true;
      sessionExpiresAt.value = null;
    } catch (e) {
      // 即使 API 调用失败，也要清除本地状态
      keyManager.lock();
      locked.value = true;
      sessionExpiresAt.value = null;
    } finally {
      loading.value = false;
    }
  }

  /** 清除错误 */
  function clearError(): void {
    error.value = null;
  }

  /** 重置状态（用于退出登录等） */
  function reset(): void {
    locked.value = true;
    loading.value = false;
    error.value = null;
    sessionExpiresAt.value = null;
    keyManager.lock();
  }

  return {
    // State
    locked,
    loading,
    error,
    sessionExpiresAt,
    isInitialized,
    
    // Getters
    isUnlocked,
    hasError,
    
    // Actions
    checkInitialized,
    checkStatus,
    initialize,
    unlock,
    lock,
    clearError,
    reset,
  };
});
