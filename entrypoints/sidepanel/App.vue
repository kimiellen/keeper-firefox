<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useSettingsStore } from '../../stores/settings';
import type { Bookmark } from '../../api/types';

import UnlockView from './views/Unlock.vue';
import MainView from './views/Main.vue';
import BookmarkEditView from './views/BookmarkEdit.vue';
import SettingsView from './views/Settings.vue';

type ViewName = 'unlock' | 'main' | 'edit' | 'settings';

const authStore = useAuthStore();
const settingsStore = useSettingsStore();

const currentView = ref<ViewName>('unlock');
const editingBookmark = ref<Bookmark | null>(null);

// 初始化主题
onMounted(async () => {
  settingsStore.initTheme();

  // 检查认证状态
  try {
    await authStore.checkStatus();
    if (!authStore.locked) {
      currentView.value = 'main';
    }
  } catch {
    // 未初始化或已锁定，停留在解锁页
  }
});

// 监听锁定状态
watch(
  () => authStore.locked,
  (locked) => {
    if (locked) {
      currentView.value = 'unlock';
    }
  }
);

// 导航方法
function onUnlocked() {
  currentView.value = 'main';
}

function onEdit(bookmark: Bookmark | null) {
  editingBookmark.value = bookmark;
  currentView.value = 'edit';
}

function onEditSaved() {
  currentView.value = 'main';
}

function onEditCancel() {
  currentView.value = 'main';
}

function goSettings() {
  currentView.value = 'settings';
}

function goBack() {
  currentView.value = 'main';
}

function onLock() {
  authStore.lock();
  currentView.value = 'unlock';
}
</script>

<template>
  <div class="keeper-app">
    <UnlockView
      v-if="currentView === 'unlock'"
      @unlocked="onUnlocked"
    />
    <MainView
      v-else-if="currentView === 'main'"
      @edit="onEdit"
      @settings="goSettings"
    />
    <BookmarkEditView
      v-else-if="currentView === 'edit'"
      :bookmark="editingBookmark"
      @saved="onEditSaved"
      @cancel="onEditCancel"
    />
    <SettingsView
      v-else-if="currentView === 'settings'"
      @back="goBack"
      @lock="onLock"
    />
  </div>
</template>

<style>
/* CSS 变量 - 亮色主题 */
:root {
  --color-bg: #ffffff;
  --color-bg-secondary: #f9f9f9;
  --color-bg-tertiary: #f5f5f5;
  --color-bg-hover: #f0f0f0;
  --color-text-primary: #333333;
  --color-text-secondary: #666666;
  --color-text-tertiary: #999999;
  --color-text-hint: #bbbbbb;
  --color-border: #eeeeee;
  --color-border-strong: #dddddd;
  --color-accent: #e74c3c;
  --color-accent-hover: #c0392b;
  --color-accent-soft: #fff0f0;
  --color-input-bg: #ffffff;
  --color-tag-bg: #e74c3c;
  --color-tag-text: #ffffff;
}

/* CSS 变量 - 暗色主题 */
.dark {
  --color-bg: #1a1a1a;
  --color-bg-secondary: #252525;
  --color-bg-tertiary: #333333;
  --color-bg-hover: #383838;
  --color-text-primary: #eeeeee;
  --color-text-secondary: #cccccc;
  --color-text-tertiary: #888888;
  --color-text-hint: #666666;
  --color-border: #333333;
  --color-border-strong: #444444;
  --color-accent: #e74c3c;
  --color-accent-hover: #ff5a4a;
  --color-accent-soft: #3d2020;
  --color-input-bg: #333333;
  --color-tag-bg: #e74c3c;
  --color-tag-text: #ffffff;
}

/* 全局重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 100%;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  background: var(--color-bg);
  color: var(--color-text-primary);
  transition: background 0.2s, color 0.2s;
}

.keeper-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 520px;
  background: var(--color-bg);
}
</style>
