<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  ElInput,
  ElInputNumber,
  ElButton,
  ElSelect,
  ElOption,
  ElCheckbox,
  ElMessage,
  ElMessageBox,
  ElDivider,
  ElSwitch,
  ElDialog
} from 'element-plus';
import { useSettingsStore, type Theme } from '../../../stores/settings';
import { useTagsStore } from '../../../stores/tags';
import { useRelationsStore } from '../../../stores/relations';
import { useAuthStore } from '../../../stores/auth';
import type { RelationType, RelationCreate, RelationUpdate } from '../../../api';

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'lock'): void;
}>();

const settingsStore = useSettingsStore();
const tagsStore = useTagsStore();
const relationsStore = useRelationsStore();
const authStore = useAuthStore();

onMounted(() => {
  tagsStore.fetchTags();
  relationsStore.fetchRelations();
});

// === 主题 ===
const themeOptions: { value: Theme; label: string }[] = [
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
  { value: 'system', label: '跟随系统' },
];

// === 密码生成器 ===
const pwLength = ref(settingsStore.passwordGenerator.length);
const pwLowercase = ref(settingsStore.passwordGenerator.includeLowercase);
const pwUppercase = ref(settingsStore.passwordGenerator.includeUppercase);
const pwNumbers = ref(settingsStore.passwordGenerator.includeNumbers);
const pwSpecial = ref(settingsStore.passwordGenerator.includeSpecial);
const generatedPassword = ref('');

watch([pwLength, pwLowercase, pwUppercase, pwNumbers, pwSpecial], () => {
  settingsStore.updatePasswordGenerator({
    length: pwLength.value,
    includeLowercase: pwLowercase.value,
    includeUppercase: pwUppercase.value,
    includeNumbers: pwNumbers.value,
    includeSpecial: pwSpecial.value,
  });
});

const pwHasSelection = computed(() => {
  return pwLowercase.value || pwUppercase.value || pwNumbers.value || pwSpecial.value;
});

function generatePassword() {
  let charset = '';
  if (pwLowercase.value) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (pwUppercase.value) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (pwNumbers.value) charset += '0123456789';
  if (pwSpecial.value) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!charset) {
    generatedPassword.value = '';
    return;
  }

  const arr = new Uint32Array(pwLength.value);
  crypto.getRandomValues(arr);
  generatedPassword.value = Array.from(arr, v => charset[v % charset.length]).join('');
}

async function copyPassword() {
  if (!generatedPassword.value) return;
  await navigator.clipboard.writeText(generatedPassword.value);
  ElMessage.success('密码已复制');
}

// === 用户名生成器 ===
const unIncludeNumbers = ref(settingsStore.usernameGenerator.includeNumbers);
const generatedUsername = ref('');

watch(unIncludeNumbers, (val) => {
  settingsStore.updateUsernameGenerator({ includeNumbers: val });
});

const consonants = 'bcdfghjklmnpqrstvwxyz';
const vowels = 'aeiou';

function generateUsername() {
  const length = 6 + Math.floor(Math.random() * 7);
  let word = '';

  for (let i = 0; i < length; i++) {
    if (i % 2 === 0) {
      word += consonants[Math.floor(Math.random() * consonants.length)];
    } else {
      word += vowels[Math.floor(Math.random() * vowels.length)];
    }
  }

  if (unIncludeNumbers.value) {
    const num = Math.floor(Math.random() * 900) + 100;
    word += num.toString();
  }

  generatedUsername.value = word;
}

async function copyUsername() {
  if (!generatedUsername.value) return;
  await navigator.clipboard.writeText(generatedUsername.value);
  ElMessage.success('用户名已复制');
}

// === 标签管理 ===
const selectedTagId = ref<number | undefined>(undefined);

async function handleAddTag() {
  try {
    const { value } = await ElMessageBox.prompt('请输入标签名称', '新增标签', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '标签名称不能为空'
    });
    
    if (value) {
      const tag = await tagsStore.createTag({ name: value.trim() });
      if (tag) {
        ElMessage.success('标签创建成功');
        selectedTagId.value = tag.id;
      } else {
        ElMessage.error(tagsStore.error || '创建失败');
      }
    }
  } catch {
    // cancelled
  }
}

async function handleEditTag() {
  if (!selectedTagId.value) {
    ElMessage.warning('请先选择一个标签');
    return;
  }
  const tag = tagsStore.tags.find(t => t.id === selectedTagId.value);
  if (!tag) return;
  
  try {
    const { value } = await ElMessageBox.prompt('请输入新名称', '修改标签', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: tag.name,
      inputPattern: /\S+/,
      inputErrorMessage: '标签名称不能为空'
    });
    
    if (value && value.trim() !== tag.name) {
      const updated = await tagsStore.updateTag(tag.id, { name: value.trim() });
      if (updated) {
        ElMessage.success('标签修改成功');
      } else {
        ElMessage.error(tagsStore.error || '修改失败');
      }
    }
  } catch {
    // cancelled
  }
}

async function handleDeleteTag() {
  if (!selectedTagId.value) {
    ElMessage.warning('请先选择一个标签');
    return;
  }
  
  try {
    await ElMessageBox.confirm('确定要删除该标签吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    });
    
    const success = await tagsStore.deleteTag(selectedTagId.value);
    if (success) {
      ElMessage.success('标签删除成功');
      selectedTagId.value = undefined;
    } else {
      ElMessage.error(tagsStore.error || '删除失败');
    }
  } catch {
    // cancelled
  }
}

// === 关联管理 ===
const selectedRelationId = ref<number | undefined>(undefined);
const relationDialogVisible = ref(false);
const editingRelationId = ref<number | undefined>(undefined);
const relationForm = ref({
  name: '',
  value: '',
  type: 'other' as RelationType
});

function handleAddRelation() {
  editingRelationId.value = undefined;
  relationForm.value = { name: '', value: '', type: 'other' };
  relationDialogVisible.value = true;
}

function handleEditRelation() {
  if (!selectedRelationId.value) {
    ElMessage.warning('请先选择一个关联');
    return;
  }
  const relation = relationsStore.relations.find(r => r.id === selectedRelationId.value);
  if (!relation) return;
  
  editingRelationId.value = relation.id;
  relationForm.value = {
    name: relation.name,
    value: relation.value || '',
    type: relation.type
  };
  relationDialogVisible.value = true;
}

async function saveRelation() {
  if (!relationForm.value.name.trim()) {
    ElMessage.warning('名称不能为空');
    return;
  }
  
  const payload = {
    name: relationForm.value.name.trim(),
    value: relationForm.value.value.trim() || undefined,
    type: relationForm.value.type
  };
  
  if (editingRelationId.value) {
    const updated = await relationsStore.updateRelation(editingRelationId.value, payload);
    if (updated) {
      ElMessage.success('关联修改成功');
      relationDialogVisible.value = false;
    } else {
      ElMessage.error(relationsStore.error || '修改失败');
    }
  } else {
    const created = await relationsStore.createRelation(payload as RelationCreate);
    if (created) {
      ElMessage.success('关联创建成功');
      selectedRelationId.value = created.id;
      relationDialogVisible.value = false;
    } else {
      ElMessage.error(relationsStore.error || '创建失败');
    }
  }
}

async function handleDeleteRelation() {
  if (!selectedRelationId.value) {
    ElMessage.warning('请先选择一个关联');
    return;
  }
  
  try {
    await ElMessageBox.confirm('确定要删除该关联吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    });
    
    const success = await relationsStore.deleteRelation(selectedRelationId.value);
    if (success) {
      ElMessage.success('关联删除成功');
      selectedRelationId.value = undefined;
    } else {
      ElMessage.error(relationsStore.error || '删除失败');
    }
  } catch {
    // cancelled
  }
}

// === 会话设置 ===
const sessionTimeout = ref(settingsStore.settings.sessionTimeout);
watch(sessionTimeout, (val) => {
  if (typeof val === 'number' && val > 0) {
    settingsStore.setSessionTimeout(val);
  }
});

async function handleLock() {
  await authStore.lock();
  emit('lock');
}

// === 数据管理 ===
async function handleExport() {
  try {
    ElMessage.info('导出功能开发中');
  } catch (e) {
    ElMessage.error('导出失败');
  }
}

function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      ElMessage.info(`模拟导入文件: ${file.name}`);
    } catch (e) {
      ElMessage.error('导入失败');
    }
  };
  input.click();
}
</script>

<template>
  <div class="settings-page">
    <!-- 头部 -->
    <div class="page-header">
      <button class="back-btn" @click="emit('back')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5"/>
          <path d="M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h2>设置</h2>
    </div>

    <div class="settings-content">
      <!-- 主题设置 -->
      <section class="setting-section">
        <h3 class="section-title">外观</h3>
        <div class="theme-options">
          <el-button
            v-for="opt in themeOptions"
            :key="opt.value"
            :class="['theme-btn-ep', { 'is-active': settingsStore.settings.theme === opt.value }]"
            :type="settingsStore.settings.theme === opt.value ? 'primary' : 'default'"
            :plain="settingsStore.settings.theme !== opt.value"
            @click="settingsStore.setTheme(opt.value)"
          >
            <div class="theme-btn-inner">
              <span class="theme-icon">
                <svg v-if="opt.value === 'light'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
                <svg v-else-if="opt.value === 'dark'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </span>
              <span>{{ opt.label }}</span>
            </div>
          </el-button>
        </div>
      </section>

      <!-- 密码生成器 -->
      <section class="setting-section">
        <h3 class="section-title">密码生成器</h3>

        <div class="generator-config">
          <div class="length-control-ep">
            <span class="label-text">长度:</span>
            <el-input-number v-model="pwLength" :min="6" :max="66" :step="1" size="small" />
          </div>

          <div class="checkbox-group-ep">
            <el-checkbox v-model="pwLowercase">小写字母 (a-z)</el-checkbox>
            <el-checkbox v-model="pwUppercase">大写字母 (A-Z)</el-checkbox>
            <el-checkbox v-model="pwNumbers">数字 (0-9)</el-checkbox>
            <el-checkbox v-model="pwSpecial">特殊符号 (!@#$...)</el-checkbox>
          </div>

          <el-button
            type="primary"
            :disabled="!pwHasSelection"
            @click="generatePassword"
          >
            生成密码
          </el-button>

          <div v-if="generatedPassword" class="generated-result">
            <code class="generated-text">{{ generatedPassword }}</code>
            <el-button link type="info" @click="copyPassword" title="复制" class="copy-btn-ep">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </el-button>
          </div>
        </div>
      </section>

      <!-- 用户名生成器 -->
      <section class="setting-section">
        <h3 class="section-title">用户名生成器</h3>

        <div class="generator-config">
          <div class="checkbox-group-ep">
            <el-checkbox v-model="unIncludeNumbers">包含数字后缀 (3位随机数)</el-checkbox>
          </div>

          <el-button type="primary" @click="generateUsername">
            生成用户名
          </el-button>

          <div v-if="generatedUsername" class="generated-result">
            <code class="generated-text">{{ generatedUsername }}</code>
            <el-button link type="info" @click="copyUsername" title="复制" class="copy-btn-ep">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </el-button>
          </div>
        </div>
      </section>

      <!-- 标签管理 -->
      <section class="setting-section">
        <h3 class="section-title">标签管理</h3>
        <div class="crud-row">
          <el-button type="success" @click="handleAddTag">新增</el-button>
          <el-select v-model="selectedTagId" placeholder="选择标签" class="flex-1" clearable>
            <el-option
              v-for="tag in tagsStore.tags"
              :key="tag.id"
              :label="tag.name"
              :value="tag.id"
            />
          </el-select>
          <el-button type="warning" @click="handleEditTag" :disabled="!selectedTagId">修改</el-button>
          <el-button type="danger" @click="handleDeleteTag" :disabled="!selectedTagId">删除</el-button>
        </div>
      </section>

      <!-- 关联管理 -->
      <section class="setting-section">
        <h3 class="section-title">关联管理</h3>
        <div class="crud-row">
          <el-button type="success" @click="handleAddRelation">新增</el-button>
          <el-select v-model="selectedRelationId" placeholder="选择关联" class="flex-1" clearable>
            <el-option
              v-for="relation in relationsStore.relations"
              :key="relation.id"
              :label="relation.name"
              :value="relation.id"
            />
          </el-select>
          <el-button type="warning" @click="handleEditRelation" :disabled="!selectedRelationId">修改</el-button>
          <el-button type="danger" @click="handleDeleteRelation" :disabled="!selectedRelationId">删除</el-button>
        </div>
      </section>

      <!-- 会话设置 -->
      <section class="setting-section">
        <h3 class="section-title">会话设置</h3>
        <div class="session-config">
          <div class="config-item">
            <span class="label-text">会话超时 (分钟):</span>
            <el-input-number v-model="sessionTimeout" :min="1" :max="1440" :step="1" size="small" />
          </div>
          <el-divider />
          <el-button type="danger" class="full-width-btn" @click="handleLock">锁定并退出</el-button>
        </div>
      </section>

      <!-- 导入导出 -->
      <section class="setting-section">
        <h3 class="section-title">数据管理</h3>
        <div class="data-actions">
          <el-button @click="handleExport" class="flex-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            导出数据
          </el-button>
          <el-button @click="handleImport" class="flex-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            导入数据
          </el-button>
        </div>
      </section>
    </div>

    <!-- 关联管理 Dialog -->
    <el-dialog v-model="relationDialogVisible" :title="editingRelationId ? '修改关联' : '新增关联'" width="90%">
      <div class="dialog-form">
        <el-input v-model="relationForm.name" placeholder="名称 (如: 个人手机)" />
        <el-input v-model="relationForm.value" placeholder="值 (如: 13800138000)" />
        <el-select v-model="relationForm.type" placeholder="类型" class="full-width-select">
          <el-option label="手机" value="phone" />
          <el-option label="邮箱" value="email" />
          <el-option label="身份证" value="idcard" />
          <el-option label="社交账号" value="social" />
          <el-option label="其他" value="other" />
        </el-select>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="relationDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveRelation">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.page-header h2 {
  font-size: 16px;
  font-weight: 500;
  margin: 0;
  color: var(--el-text-color-primary);
}

.back-btn {
  padding: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--el-text-color-regular);
  border-radius: 4px;
}

.back-btn:hover {
  background: var(--el-fill-color-light);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 分节 */
.setting-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

/* 主题选择 */
.theme-options {
  display: flex;
  gap: 8px;
}

.theme-btn-ep {
  flex: 1;
  height: auto;
  padding: 12px 8px;
}

.theme-btn-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

/* 生成器配置 */
.generator-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.length-control-ep {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label-text {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.checkbox-group-ep {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* CRUD 行 */
.crud-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flex-1 {
  flex: 1;
}

/* 会话配置 */
.session-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.full-width-btn {
  width: 100%;
}

.full-width-select {
  width: 100%;
}

/* 弹窗表单 */
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.generated-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.generated-text {
  flex: 1;
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  word-break: break-all;
  color: var(--el-text-color-primary);
}

/* 数据管理 */
.data-actions {
  display: flex;
  gap: 8px;
}

/* 暗色模式特定调整 (基于原有实现) */
:global(.dark) .generated-result {
  background: #252525;
}

:global(.dark) .generated-text {
  color: #eee;
}

/* Fix element plus component internal styles to fit better if needed, relying on standard EP dark mode vars */
</style>
