# Keeper Firefox

本地密码管理器的 Firefox 浏览器扩展前端，配合 [keeper](https://github.com/kimiellen/keeper) 后端使用。

## 项目关系

```
keeper（后端 API）──▶  keeper-firefox（本仓库，Firefox 扩展）
                  └──▶  keeper-chrome（Chrome 扩展）
```

keeper 是本地自部署的后端服务，keeper-firefox 通过 HTTPS REST API 与其通信，所有密码数据均存储在本机，不经过任何云服务。

## 技术栈

| 层级 | 技术 |
|------|------|
| 扩展框架 | WXT 0.21+ |
| 前端框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| UI 组件库 | Element Plus |
| 动画 | Motion |
| 构建工具 | Vite |
| 包管理 | npm |

## 主要特性

- **侧边栏界面**：以 Firefox 侧边栏形式运行，快捷键 `Alt+.` 切换显示
- **自动填充**：检测登录页面，`Alt+P` 一键填充账号密码，支持多账号选择
- **密码生成**：右键菜单快速生成随机密码，可自定义长度和字符集
- **证书固定**：TOFU（首次使用信任）策略，固定后端 HTTPS 证书指纹，防止中间人攻击
- **数据库管理**：支持新建、切换、删除本地数据库
- **解锁 / 锁定**：主密码解锁，会话 1 小时自动过期

## 前置条件

需要先在本机运行 [keeper](https://github.com/kimiellen/keeper) 后端服务（HTTPS，默认端口 8443）。

## 安装扩展

### 从源码构建安装

```bash
git clone https://github.com/kimiellen/keeper-firefox.git
cd keeper-firefox
npm install
npm run build
```

构建完成后：

1. 打开 Firefox，地址栏输入 `about:debugging`
2. 点击「此 Firefox」→「临时载入附加组件」
3. 选择 `.output/firefox-mv2/manifest.json`

### 打包为 .zip 提交 AMO

```bash
npm run zip
```

## 开发

```bash
# 启动开发模式（热重载）
npm run dev

# 构建生产版本
npm run build

# 打包为 zip
npm run zip
```

开发模式下，WXT 会自动在 Firefox 中加载扩展并监听文件变化。

## 权限说明

扩展申请以下 Firefox 权限：

| 权限 | 用途 |
|------|------|
| `storage` | 存储证书指纹和用户设置 |
| `activeTab` | 获取当前标签页 URL 用于书签匹配 |
| `contextMenus` | 右键菜单「生成密码」 |
| `tabs` | 监听标签页切换 |
| `webRequest` / `webRequestBlocking` | 拦截 HTTPS 请求以验证证书指纹 |
| `<all_urls>` | 自动填充功能需要访问任意页面 |

## 项目结构

```
keeper-firefox/
├── entrypoints/
│   ├── sidepanel/            # 侧边栏主界面（Vue SPA）
│   ├── background.ts         # Service Worker（自动填充、密码生成、证书验证）
│   ├── autofill.content.ts   # 内容脚本（页面注入，填充表单）
│   └── capture.content.ts    # 内容脚本（捕获登录信息）
├── api/                      # Keeper 后端 API 客户端
├── stores/                   # Pinia 状态管理
├── utils/
│   └── security/             # 证书固定（TOFU）
└── public/                   # 静态资源（图标等）
```

## 安全说明

- 与后端的通信全程使用 HTTPS
- 证书固定（TOFU）：首次连接后固定证书指纹，后续连接若指纹变更会阻断请求并提示用户
- 扩展本身不存储任何密码明文，所有加密由后端完成
- 会话 1 小时自动过期，锁定后密钥立即从内存消失

## 许可证

[MIT](LICENSE)
