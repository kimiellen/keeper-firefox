# Keeper Firefox - AI 代理文档

> **版本**: 1.0.0  
> **语言**: 中文 (zh-CN)  
> **项目类型**: Firefox 浏览器扩展

---

## 约束

**使用中文进行交流。**

## 关于查看截图
在会话中我会提及"查看最新的一个截图"或者"查看最新的几个截图",你直接去/home/kimi/Pictures/screenshots目录下找最新的截图,不需要找我确认.


---

## 项目概述

**Keeper Firefox** 是一个本地密码管理器的 Firefox 浏览器扩展前端。它与 [keeper](https://github.com/kimiellen/keeper) 后端服务配合工作，提供安全的密码管理功能。

```
keeper (后端 API) ──▶ keeper-firefox (本仓库, Firefox 扩展)
                  └──▶ keeper-chrome (Chrome 扩展)
```

所有密码数据都存储在本地机器上，不会通过任何云服务传输。
### 后端项目路径
/home/kimi/workspace/projects/keeper/
后端是rust项目,不要管里面的python代码

### 主要功能

- **侧边栏界面**: 作为 Firefox 侧边栏运行，使用 `Alt+.` 切换
- **自动填充**: 检测登录页面，使用 `Alt+P` 填充凭据，支持多账户选择
- **密码生成**: 右键上下文菜单生成随机密码
- **本地通信**: 与后端通过 HTTP 在本地通信，数据不经过网络
- **数据库管理**: 支持创建、切换和删除本地数据库
- **解锁/锁定**: 主密码解锁，1 小时会话自动过期

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 扩展框架 | [WXT](https://wxt.dev/) 0.21+ |
| 前端框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| UI 组件库 | Element Plus |
| 动画 | Motion |
| 构建工具 | Vite |
| 包管理器 | npm |

---

## 项目结构

```
keeper-firefox/
├── entrypoints/              # 扩展入口点
│   ├── sidepanel/            # 侧边栏主界面 (Vue SPA)
│   │   ├── main.ts           # Vue 应用入口
│   │   ├── App.vue           # 根组件
│   │   ├── index.html        # HTML 模板
│   │   └── views/            # 视图组件
│   │       ├── Unlock.vue    # 解锁/登录视图
│   │       ├── Main.vue      # 主书签列表视图
│   │       ├── BookmarkEdit.vue  # 书签编辑/创建视图
│   │       └── Settings.vue  # 设置视图
│   ├── background.ts         # Service Worker (自动填充、密码生成)
│   ├── autofill.content.ts   # 内容脚本 (页面注入、表单填充)
│   └── capture.content.ts    # 内容脚本 (捕获登录信息)
│
├── api/                      # Keeper 后端 API 客户端
│   ├── client.ts             # 完整 REST API 的 KeeperClient 类
│   ├── types.ts              # TypeScript 类型定义
│   └── __tests__/            # API 客户端测试
│
├── stores/                   # Pinia 状态管理
│   ├── index.ts              # Store 导出
│   ├── auth.ts               # 认证状态存储
│   ├── bookmarks.ts          # 书签 CRUD 状态存储
│   ├── tags.ts               # 标签管理状态存储
│   ├── relations.ts          # 关系状态存储
│   ├── database.ts           # 数据库管理状态存储
│   └── settings.ts           # 用户设置状态存储
│
├── utils/                    # 工具函数
│   ├── security/             # 安全工具
│   │   ├── index.ts          # 安全工具导出（证书固定已移除）
│   │   └── index.ts          # 安全导出
│   ├── tagColors.ts          # 标签颜色工具
│   └── __tests__/            # 工具测试
│
├── public/                   # 静态资源
│   └── icons/                # 扩展图标
│
├── package.json              # 依赖和脚本
├── tsconfig.json             # TypeScript 配置
├── wxt.config.ts             # WXT 扩展配置
└── env.d.ts                  # 类型声明
```

---

## 构建和开发命令

### 前置条件

- Node.js 18+
- npm (或 pnpm)

### 设置

```bash
# 安装依赖
npm install

# 或使用 pnpm (CONTRIBUTING.md 推荐)
pnpm install
```

### 开发

```bash
# 启动开发模式 (热重载)
npm run dev

# 构建生产版本
npm run build

# 创建 AMO 提交的 zip 包
npm run zip

# 预览生产构建
npm run preview
```

### 在 Firefox 中加载

构建完成后：

1. 打开 Firefox，访问 `about:debugging`
2. 点击"此 Firefox" → "临时加载附加组件"
3. 选择 `.output/firefox-mv2/manifest.json`

---

## 代码风格规范

### TypeScript/Vue 命名约定

**命名规范：**
```typescript
// ✅ 正确
export interface Bookmark {        // 接口/类型: PascalCase
  id: string;
  tagIds: number[];                // 字段: camelCase
}

export class BookmarkService {     // 类: PascalCase
  async getById(id: string) {}     // 方法: camelCase
}

export const API_BASE_URL = "..."; // 常量: UPPER_SNAKE_CASE
const userKey = deriveKey();       // 变量: camelCase

// ❌ 错误
export interface bookmark {}       // 应该使用 PascalCase
export const apiBaseUrl = "...";   // 常量应该使用 UPPER_SNAKE_CASE
```

**组件命名：**
```vue
<!-- ✅ 正确: PascalCase 文件名 + 多词 -->
<!-- BookmarkList.vue -->
<script setup lang="ts">
defineOptions({ name: 'BookmarkList' })
</script>

<!-- ❌ 错误: 单字组件名 -->
<!-- List.vue -->
```

**组合式函数：**
```typescript
// ✅ 正确: use 前缀 + camelCase
// composables/useAuth.ts
export function useAuth() {
  const isAuthenticated = ref(false)
  const login = async (password: string) => { ... }
  return { isAuthenticated, login }
}

// ❌ 错误: 缺少 use 前缀
export function auth() { ... }
```

### Vue 3 组合式 API

- 使用 `<script setup lang="ts">` 语法
- 使用 `ref()`、`computed()`、`watch()` 的组合式 API
- 使用 Pinia 进行状态管理

---

## 测试策略

### 测试组织

测试与源文件共置在 `__tests__/` 目录中：

```
api/
├── client.ts
└── __tests__/
    └── client.test.ts

utils/
├── security/
│   ├── certPinning.ts
│   └── __tests__/
│       └── certPinning.test.ts
```

### 运行测试

测试设计为在浏览器控制台中手动运行：

```typescript
// API 客户端测试
import './api/__tests__/client.test';
testApiClient.runTests();

// 示例：运行测试
// import './api/__tests__/client.test';
```

### 测试方法

- **手动测试**: 测试设计为在浏览器控制台中针对运行中的后端运行
- **无自动化测试运行器**: 本项目使用基于浏览器的手动测试
- 测试需要后端服务器运行在 `http://127.0.0.1:51000`

---

## 安全考虑

### 本地 HTTP 通信

扩展与后端通过 HTTP 在本地通信：

- 后端运行在本机，使用 HTTP 协议
- 前端通过 `http://127.0.0.1:51000/api` 访问后端
- 无需证书，适合本地部署场景

### 密码处理

- **前端**: 从不存储密码；通过 HTTP 以明文形式发送到后端（本地通信）
- **后端**: 处理所有加密/解密
- **会话**: 1 小时自动过期，锁定时从内存中清除密钥

### 所需权限

| 权限 | 用途 |
|------|------|
| `storage` | 存储用户设置 |
| `activeTab` | 获取当前标签页 URL 进行书签匹配 |
| `contextMenus` | 右键菜单"生成密码" |
| `tabs` | 监听标签页切换 |
| `webRequest` / `webRequestBlocking` | 拦截 HTTP 请求（预留） |
| `<all_urls>` | 自动填充功能需要访问任何页面 |

---

## 关键组件

### 后台脚本 (`entrypoints/background.ts`)

Service Worker 处理：
- 上下文菜单设置 (密码生成)
- 消息传递处理
- 键盘快捷键 (`toggle_sidebar`、`fill_credentials`)
- 来自内容脚本的消息传递

### 内容脚本

1. **`autofill.content.ts`**: 注入所有页面
   - 检测登录表单
   - 填充用户名/密码
   - 显示账户选择下拉框
   - 处理 `Alt+P` 快捷键

2. **`capture.content.ts`**: 捕获登录提交
   - 检测凭据表单提交
   - 提供保存新凭据的功能

### API 客户端 (`api/client.ts`)

`KeeperClient` 类提供：
- 认证 (初始化、解锁、锁定、状态)
- 书签 CRUD 操作
- 标签管理
- 关系管理
- 数据库管理
- 导入/导出
- 健康检查

基础 URL: `http://127.0.0.1:51000/api`

### 状态存储

所有状态存储使用 Pinia 和组合式 API 模式：

- **`auth.ts`**: 登录状态、解锁/锁定
- **`bookmarks.ts`**: 书签列表、CRUD 操作
- **`tags.ts`**: 标签管理
- **`relations.ts`**: 联系人/关系管理
- **`database.ts`**: 数据库切换和创建
- **`settings.ts`**: 主题、密码生成器配置、会话超时

---

## Git 提交规范

### 格式

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### 类型

| 类型 | 描述 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档 |
| `style` | 代码样式 (无逻辑更改) |
| `refactor` | 代码重构 |
| `test` | 测试 |
| `chore` | 构建/工具 |

### 作用域 (前端)

- `popup` - 弹出窗口
- `background` - 后台脚本
- `content` - 内容脚本
- `composable` - 组合式函数
- `ui` - UI 组件
- `store` - 状态管理

### 示例

```bash
git commit -m "feat(auth): 实现带会话超时的解锁"
git commit -m "fix(autofill): 解决多步登录表单检测问题"
git commit -m "docs(api): 更新书签接口文档"
```

---

## 文档规范

### 语言策略

- **文档**: 使用中文 (zh-CN) 编写
- **文件名**: 使用英文

### 文档文件

| 文件 | 用途 |
|------|------|
| `README.md` | 面向用户的文档 |
| `CONTRIBUTING.md` | 开发指南 |
| `AGENTS.md` | 本文件 - AI 代理上下文 |

---

## 故障排除

### 扩展无法加载

```bash
# 检查构建输出
npm run build
ls -la .output/firefox-mv2/
# 确保 manifest.json 存在
```

### 后端连接问题

- 确认 keeper 后端运行在 `http://127.0.0.1:51000`
- 检查后端服务是否已启动
- 在设置中查看连接状态

---

## 许可证

[MIT](LICENSE)
