<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useAuthStore } from '../../../stores/auth';
import { ElMessage } from 'element-plus';

const emit = defineEmits<{
  (e: 'unlocked'): void;
}>();

const authStore = useAuthStore();
const password = ref('');
const isLoading = ref(false);
const error = ref('');
const activeTab = ref<string>('password');
const passwordInput = ref<InstanceType<typeof import('element-plus')['ElInput']> | null>(null);

// 加载保存的 tab 状态
onMounted(() => {
  const savedTab = localStorage.getItem('unlockTab');
  if (savedTab === 'password' || savedTab === 'fingerprint') {
    activeTab.value = savedTab;
  }
  // 自动聚焦密码输入框
  nextTick(() => {
    passwordInput.value?.focus();
  });
});

// Tab 切换
function handleTabChange(tab: string) {
  activeTab.value = tab;
  localStorage.setItem('unlockTab', tab);
  if (tab === 'password') {
    nextTick(() => {
      passwordInput.value?.focus();
    });
  }
}

// 密码解锁
async function handleUnlock() {
  if (!password.value) {
    error.value = '请输入主密码';
    return;
  }

  isLoading.value = true;
  error.value = '';

  try {
    const success = await authStore.unlock(password.value);
    if (success) {
      emit('unlocked');
    } else {
      error.value = '密码错误';
    }
  } catch (e) {
    error.value = '解锁失败';
  } finally {
    isLoading.value = false;
  }
}

// 指纹解锁（暂不实现功能）
function handleFingerprint() {
  ElMessage.info('指纹解锁功能暂未实现');
}
</script>

<template>
  <div class="unlock-page">
    <div class="unlock-header">
      <h1>Keeper</h1>
      <p class="subtitle">密码管理器</p>
    </div>

    <!-- Tabs - Element Plus -->
    <el-tabs
      v-model="activeTab"
      class="unlock-tabs"
      @tab-change="handleTabChange"
    >
      <el-tab-pane label="密码解锁" name="password">
        <form class="unlock-form" @submit.prevent="handleUnlock">
          <el-input
            ref="passwordInput"
            v-model="password"
            type="password"
            placeholder="请输入主密码"
            size="large"
            show-password
            @keyup.enter="handleUnlock"
          />

          <div v-if="error" class="error-message">
            {{ error }}
          </div>

          <el-button
            type="primary"
            size="large"
            :loading="isLoading"
            class="unlock-button"
            native-type="submit"
          >
            {{ isLoading ? '解锁中...' : '解锁' }}
          </el-button>
        </form>
      </el-tab-pane>

      <el-tab-pane label="指纹解锁" name="fingerprint">
        <div class="fingerprint-content">
          <div class="fingerprint-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
              <path d="M10 12a6 6 0 0 0 4 2"/>
              <path d="M12 14v4"/>
              <circle cx="12" cy="9" r="2"/>
            </svg>
          </div>
          <p class="fingerprint-hint">点击使用指纹解锁</p>
          <el-button
            type="primary"
            size="large"
            class="unlock-button"
            @click="handleFingerprint"
          >
            使用指纹
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.unlock-page {
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.unlock-header {
  text-align: center;
  margin-bottom: 28px;
}

.unlock-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 4px 0 0;
}

/* Element Plus Tabs 样式覆盖 */
.unlock-tabs {
  width: 100%;
}

.unlock-tabs :deep(.el-tabs__nav-wrap::after) {
  background-color: var(--color-border);
}

.unlock-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--color-accent);
}

.unlock-tabs :deep(.el-tabs__item) {
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.unlock-tabs :deep(.el-tabs__item.is-active) {
  color: var(--color-accent);
  font-weight: 500;
}

.unlock-tabs :deep(.el-tabs__item:hover) {
  color: var(--color-accent);
}

/* 表单 */
.unlock-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 8px;
}

.error-message {
  color: var(--color-accent);
  font-size: 13px;
  text-align: center;
}

.unlock-button {
  width: 100%;
  --el-button-bg-color: var(--color-accent);
  --el-button-border-color: var(--color-accent);
  --el-button-hover-bg-color: var(--color-accent-hover);
  --el-button-hover-border-color: var(--color-accent-hover);
  --el-button-active-bg-color: var(--color-accent-hover);
  --el-button-active-border-color: var(--color-accent-hover);
}

/* 指纹区域 */
.fingerprint-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0;
}

.fingerprint-icon {
  color: var(--color-text-tertiary);
  margin-bottom: 16px;
}

.fingerprint-hint {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 20px;
}

/* Element Plus 输入框主题适配 */
.unlock-form :deep(.el-input__wrapper) {
  background-color: var(--color-input-bg);
  border-radius: 8px;
}

.unlock-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--color-accent) inset;
}
</style>
