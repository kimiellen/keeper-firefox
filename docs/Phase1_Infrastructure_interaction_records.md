# 阶段一：基础设施 - 交互记录

**项目**：Keeper 密码管理器  
**阶段**：Phase 1 - Infrastructure  
**日期**：2026-03-06  
**参与者**：用户 + AI 助手（Sisyphus）

---

## 会话概览

本文档记录了 Keeper 项目从概念到基础设施搭建的完整过程，包括技术栈选型、数据库设计、安全架构决策等关键讨论。

### 核心成果

1. ✅ **技术栈确定**：FastAPI + SQLite + Vue 3 + WXT
2. ✅ **数据库设计**：4 表结构（Bookmark, Tag, Relation, Authentication）
3. ✅ **安全方案**：四层防护（HTTPS + Localhost + 客户端加密 + 证书固定）
4. ✅ **仓库初始化**：keeper（后端）+ keeper-firefox（前端）
5. ✅ **文档创建**：schema.md + 本交互记录

---

## 第一部分：项目需求与目标

### 用户需求（原文）

> "我想开发一个密码管理器 Keeper，类似 Bitwarden，功能包括：
> - 密码管理
> - 书签管理（可带登录凭证）
> - 后端用 FastAPI + SQLite，运行在本地
> - 浏览器扩展用 WXT + Vue 3 + TypeScript
> - 只需支持 Firefox + Linux
> - 需要生物识别（指纹）解锁
> - 键盘导航优先"

### 关键决策点

1. **本地优先架构**：
   - 用户明确：`keeper跑在电脑本地`
   - 不需要云同步
   - 单用户场景，无并发要求

2. **安全级别**：
   - 用户选择：自签名 HTTPS + localhost 绑定 + 客户端加密（三层同时使用）
   - 参考 Bitwarden 的零知识架构

3. **中文支持**：
   - 用户要求：拼音首字母搜索（`pinyinInitials` 字段）

---

## 第二部分：技术栈选型

### 浏览器扩展框架

**研究问题**：如何选择 Firefox 扩展开发框架？

**研究结果**（librarian agent: `bg_b35b1260`）：
- **WXT 框架**：2025 年主流选择，支持 Vue/React，热重载，TypeScript 原生支持
- **Vue vs React**：用户选择 Vue 3（更熟悉）
- **推荐库**：
  - 动画：Motion（~14KB）
  - 键盘导航：cmdk（React 为主，需要 Vue 替代方案）

**最终决策**：
```
框架：WXT
UI：Vue 3 + Composition API
状态管理：Zustand（轻量级）
动画：Motion
```

---

### 后端框架

**研究问题**：FastAPI vs Node.js vs Go？

**研究结果**（librarian agent: `bg_330e270a`）：
- **FastAPI**：用户已选定，适合快速开发 + 类型安全
- **数据库**：SQLite 适合单用户场景（vs PostgreSQL）
- **备份方案**：加密 JSON 导出（参考 Bitwarden）

**最终决策**：
```
后端：FastAPI
数据库：SQLite（aiosqlite 异步驱动）
包管理：uv（用户要求）
```

---

### 安全实现

**研究问题**：
1. Bitwarden 的加密方案是什么？
2. 本地 HTTPS 如何实现？

**研究结果**（librarian agents: `bg_3960bf66` + `bg_eb51fdbb`）：

#### Bitwarden 加密架构
- **主密钥派生**：Argon2id（64MB 内存 + 3 次迭代）
- **密钥扩展**：HKDF-SHA256
- **数据加密**：AES-256-CBC + HMAC（新功能迁移到 AES-GCM）
- **零知识**：服务器只存储密文，主密码永不发送

#### 本地 HTTPS 方案
- **工具**：mkcert（生成本地 CA 证书）
- **证书固定**：Firefox 扩展使用 `webRequest.getSecurityInfo()` 验证证书指纹
- **CORS 限制**：仅允许 `moz-extension://<extension_id>`

**最终决策**：
```
加密：Argon2id + HKDF + AES-256-GCM
传输：mkcert 自签名证书 + 证书固定
网络：仅绑定 127.0.0.1
额外防护：自定义认证头（X-Keeper-Secret）
```

---

## 第三部分：数据库设计演进

### 初始设计（5 表方案）

用户最初提出的结构：
- Bookmark 表（主表）
- Tag 表（独立）
- Relation 表（独立）
- URL 表（独立）
- Account 表（独立）

### 第一次简化（2 表方案）

**讨论点**：是否需要独立表？

**AI 建议**：
> "单用户场景 + 无并发，JSON 数组足够。独立表的优势（事务隔离、范式化）在此场景下不适用。"

**用户反馈**：
> "标签和关联都独立管理增删改查"

**AI 方案**：
- 保留 Tag 和 Relation 独立表（便于 UI 管理页面）
- URL 和 Account 合并到 Bookmark 表的 JSON 数组
- 应用层处理级联删除逻辑

### 第二次调整（字段位置）

**用户需求**（3 次修改）：
1. ✅ `accounts` 数组中加 `createdAt` 字段
2. ✅ `related` 数组从 bookmark 级别移到 account 级别
   - **原因**："不同账号可能用不同联系方式注册"
3. ✅ 加 `pinyinInitials` 字段支持中文搜索

### 最终方案（4 表）

```sql
-- 独立表
CREATE TABLE tags (id, name, color, created_at);
CREATE TABLE relations (id, type, value, label, created_at);
CREATE TABLE authentication (id, email, encrypted_user_key, kdf_params, ...);

-- 主表（包含 JSON 数组）
CREATE TABLE bookmarks (
    id, name, pinyin_initials,
    tag_ids TEXT,      -- JSON: [1, 3, 5]
    urls TEXT,         -- JSON: [{ url, lastUsed }, ...]
    accounts TEXT,     -- JSON: [{ id, username, password, relatedIds: [1,2], ... }, ...]
    notes, created_at, updated_at, last_used_at
);
```

---

## 第四部分：安全架构设计

### 四层防护体系

#### 第 1 层：自签名 HTTPS
```bash
mkcert -install
mkcert localhost 127.0.0.1 ::1
```
- 防止网络嗅探
- Firefox 自动信任 mkcert 生成的证书

#### 第 2 层：Localhost 绑定
```python
uvicorn.run(app, host="127.0.0.1", port=8443)  # 仅本机可访问
```
- 防止局域网内其他设备访问

#### 第 3 层：客户端加密
```python
# 用户注册流程
master_key = argon2id(master_password, salt=email)
enc_key = hkdf(master_key, info="keeper-v1")
user_key = random(32)
encrypted_user_key = aes_gcm_encrypt(user_key, key=enc_key)
# 发送 encrypted_user_key 到服务器（服务器无法解密）
```
- 零知识架构
- 服务器只存储密文

#### 第 4 层：证书固定
```javascript
// Firefox 扩展中验证证书指纹
browser.webRequest.onHeadersReceived.addListener(async (details) => {
  const secInfo = await browser.webRequest.getSecurityInfo(details.requestId);
  if (secInfo.certificates[0].fingerprintSha256 !== EXPECTED) {
    return { cancel: true };  // 阻止请求
  }
}, { urls: ["https://127.0.0.1:8443/*"] }, ["blocking"]);
```
- 防止本地 CA 污染
- 防止恶意进程伪装 API

### 用户确认

**用户问**："这个加密方案是否匹配 Bitwarden？三层防护是否必要？"

**AI 回答**：
1. ✅ **加密方案对标 Bitwarden**：
   - 需要调整：用 Argon2id 替代 PBKDF2
   - 需要加上：HKDF 密钥扩展
   - AES-256-GCM 很好（Bitwarden 也在迁移到此）

2. ✅ **三层防护必要**：
   - 每层防护不同威胁
   - 叠加使用达到纵深防御
   - 四层配合覆盖所有本地威胁场景

---

## 第五部分：数据模型最终确认

### 用户最后确认（重要转折点）

**用户**："tags也要像relation一样独立成表，因为在插件中我有专门针对tags和relation的增删改查页面。在创建书签记录的时候tags的输入界面和relation的输入界面，只提供多选框。"

**影响**：
- ✅ Tag 表必须独立（之前 AI 建议过 JSON 数组，但用户明确需要 UI 管理页面）
- ✅ bookmark 表中 `tags` 字段改为 `tagIds`（存储整数数组 `[1, 3, 5]`）
- ✅ accounts 数组中 `related` 改为 `relatedIds`（存储整数数组 `[1, 2]`）

### 最终 JSON 结构

**Bookmark 示例**：
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "GitHub",
  "pinyinInitials": "gh",
  "tagIds": [1, 3],
  "urls": [
    { "url": "https://github.com", "lastUsed": "2026-03-06T10:30:00Z" }
  ],
  "notes": "个人开发账号",
  "accounts": [
    {
      "id": 1,
      "username": "kimiellen",
      "password": "encrypted_base64",
      "relatedIds": [1, 3],
      "createdAt": "2026-01-15T08:00:00Z",
      "lastUsed": "2026-03-06T10:30:00Z"
    }
  ],
  "createdAt": "2026-01-15T08:00:00Z",
  "updatedAt": "2026-03-06T10:30:00Z",
  "lastUsedAt": "2026-03-06T10:30:00Z"
}
```

**Tag 示例**：
```json
{
  "id": 1,
  "name": "工作",
  "color": "#3B82F6",
  "createdAt": "2026-01-10T08:00:00Z"
}
```

**Relation 示例**：
```json
{
  "id": 1,
  "type": "phone",
  "value": "+86 138****1234",
  "label": "主手机号",
  "createdAt": "2026-01-10T08:00:00Z"
}
```

---

## 第六部分：仓库初始化

### Keeper（后端）

**仓库**：https://github.com/kimiellen/keeper

**初始化步骤**：
1. 创建 `pyproject.toml`（FastAPI + aiosqlite + argon2-cffi + cryptography）
2. 迁移到 uv 包管理器
3. 创建 `src/main.py`（FastAPI 基础结构）
4. 提交到 GitHub

**当前文件**：
```
keeper/
├── src/main.py          # FastAPI 入口（基础 stub）
├── pyproject.toml       # 依赖管理
├── uv.lock             # 锁定依赖版本
├── README.md           # 安装说明
└── docs/
    └── schema.md       # 数据库设计文档
```

---

### Keeper-Firefox（前端）

**仓库**：https://github.com/kimiellen/keeper-firefox

**初始化步骤**：
1. 创建 `wxt.config.ts`（WXT 配置）
2. 创建 `src/popup/App.vue`（Vue 3 基础组件）
3. 创建 `package.json`（依赖：wxt + vue + @vueuse/core + motion）
4. 提交到 GitHub

**当前文件**：
```
keeper-firefox/
├── src/
│   ├── popup/
│   │   ├── App.vue      # Vue 弹出窗口（基础 stub）
│   │   └── main.ts      # Vue 入口
│   └── env.d.ts        # TypeScript 声明
├── public/popup.html   # 弹出窗口 HTML
├── wxt.config.ts       # WXT 配置
├── package.json        # 依赖管理
├── tsconfig.json       # TypeScript 配置
└── docs/
    └── schema.md       # 数据库设计文档（与 keeper 同步）
```

---

## 第七部分：关键技术决策记录（ADR）

### ADR-001：为何选择 SQLite 而非 PostgreSQL

**背景**：密码管理器需要数据库存储

**决策**：使用 SQLite

**理由**：
1. 单用户场景，无并发需求
2. 本地文件存储，无需服务器进程
3. 备份简单（直接复制 .db 文件）
4. 性能足够（个人密码数量通常 < 1000 条）

**权衡**：
- ✅ 简单、轻量、无依赖
- ❌ 不适合多用户（但不需要）
- ❌ 并发写入性能差（但不需要）

---

### ADR-002：为何 Tag/Relation 独立成表而非 JSON 数组

**背景**：Tag 和 Relation 需要 CRUD 管理

**决策**：独立表 + bookmark 中存储 ID 数组

**理由**：
1. 插件 UI 需要专门的管理页面
2. 创建书签时只需多选现有 tag/relation
3. 删除 tag 时需要级联清理所有 bookmark 引用
4. 独立表便于展示"标签使用次数"等统计

**权衡**：
- ✅ UI 交互清晰
- ✅ 便于统计和管理
- ❌ 需要应用层处理级联删除（但单用户场景可接受）

---

### ADR-003：为何使用 Argon2id 而非 PBKDF2

**背景**：主密码派生需要抗暴力破解

**决策**：Argon2id（64MB 内存 + 3 次迭代）

**理由**：
1. Argon2 是 2015 年密码哈希竞赛冠军
2. 内存密集型设计抵抗 GPU/ASIC 攻击
3. Bitwarden 推荐使用 Argon2id
4. Python 有成熟库（argon2-cffi）

**权衡**：
- ✅ 安全性显著优于 PBKDF2
- ✅ 可调节参数（内存/时间成本）
- ❌ 计算耗时稍长（但登录时可接受）

---

### ADR-004：为何同时使用 HTTPS + Localhost + 加密 + 证书固定

**背景**：本地密码管理器的威胁模型

**决策**：四层防护全部启用

**理由**：
1. **HTTPS**：防止同局域网嗅探
2. **Localhost**：防止远程访问
3. **客户端加密**：防止数据库泄露
4. **证书固定**：防止本地恶意进程伪装 API

**权胁矩阵**：
| 威胁 | 仅 HTTPS | 仅 Localhost | 仅加密 | 四层组合 |
|------|---------|-------------|--------|---------|
| 网络嗅探 | ✅ | ✅ | ✅ | ✅ |
| 恶意扩展 | ❌ | ❌ | ✅ | ✅ |
| 伪装 API | ❌ | ❌ | ✅ | ✅ |
| DB 泄露 | ❌ | ❌ | ✅ | ✅ |

**权衡**：
- ✅ 纵深防御，覆盖所有威胁
- ❌ 配置复杂度增加（但安全优先）

---

### ADR-005：为何选择 WXT 框架而非原生 WebExtension API

**背景**：Firefox 扩展开发框架选择

**决策**：使用 WXT

**理由**：
1. 2025 年主流选择（GitHub 3.4k+ stars）
2. 支持 Vue 3 + TypeScript + 热重载
3. 自动处理 manifest.json 生成
4. 统一的构建系统（Vite）

**权衡**：
- ✅ 开发体验优秀
- ✅ Vue 生态完整支持
- ❌ 学习曲线（但文档完善）
- ❌ 额外抽象层（但收益 >> 成本）

---

## 第八部分：下一阶段规划

### Phase 2：后端核心（预计 2-3 天）

**目标**：实现可用的 REST API

**任务列表**：
1. 数据库初始化脚本
   - [ ] 创建 4 张表
   - [ ] 添加索引
   - [ ] 数据库迁移工具

2. 加密模块
   - [ ] Argon2id 密钥派生
   - [ ] HKDF 密钥扩展
   - [ ] AES-256-GCM 加密/解密
   - [ ] User Key 管理

3. 认证模块
   - [ ] 用户注册
   - [ ] 用户登录
   - [ ] JWT token 生成/验证

4. CRUD API
   - [ ] Bookmark CRUD
   - [ ] Tag CRUD（级联删除）
   - [ ] Relation CRUD（级联删除）
   - [ ] 搜索接口（拼音首字母）

5. HTTPS 配置
   - [ ] mkcert 证书生成
   - [ ] Uvicorn SSL 配置
   - [ ] CORS 中间件

---

### Phase 3：前端核心（预计 3-4 天）

**目标**：实现基础 UI 和数据交互

**任务列表**：
1. 解锁界面
   - [ ] 主密码输入
   - [ ] Argon2id 客户端派生
   - [ ] User Key 解密

2. Vault 列表
   - [ ] 书签列表展示
   - [ ] 标签筛选
   - [ ] 搜索框（拼音支持）

3. 书签管理
   - [ ] 创建/编辑书签表单
   - [ ] 标签多选框
   - [ ] 关联多选框
   - [ ] 账号数组编辑

4. 标签/关联管理
   - [ ] 标签 CRUD 页面
   - [ ] 关联 CRUD 页面
   - [ ] 颜色选择器（标签）

5. 键盘导航
   - [ ] 全局快捷键（Ctrl+Shift+K）
   - [ ] 搜索框快速定位
   - [ ] 上下键选择项目

---

### Phase 4：核心场景（预计 2-3 天）

1. URL 打开
   - [ ] 点击 URL 打开新标签
   - [ ] 多 URL 时显示选择菜单
   - [ ] 记录 lastUsed 时间

2. 自动填充
   - [ ] Content Script 注入
   - [ ] 检测登录表单
   - [ ] 域名匹配
   - [ ] 填充用户名/密码

3. 快捷操作
   - [ ] 快速复制密码
   - [ ] 快速生成密码
   - [ ] 快速添加当前页为书签

---

### Phase 5：辅助功能（预计 1-2 天）

1. 密码生成器
   - [ ] 长度/复杂度配置
   - [ ] 排除相似字符
   - [ ] 强度指示器

2. 备份/导出
   - [ ] 加密 JSON 导出
   - [ ] 导入验证
   - [ ] 自动备份（定期）

3. 设置页面
   - [ ] 超时锁定时间
   - [ ] 主题切换
   - [ ] 快捷键配置

---

### Phase 6：安全加固（预计 1 天）

1. 内存安全
   - [ ] 敏感数据清零
   - [ ] 超时自动锁定
   - [ ] 页面关闭时清理

2. 通信安全
   - [ ] 证书固定实现
   - [ ] X-Keeper-Secret 认证头
   - [ ] 请求签名（可选）

3. 审计日志
   - [ ] 登录记录
   - [ ] 密码访问记录
   - [ ] 异常行为检测

---

## 第九部分：重要约定与规范

### 代码规范

**Python（后端）**：
- 使用 `black` 格式化（88 字符宽度）
- 使用 `ruff` 进行 linting
- 类型提示：必须使用（FastAPI 要求）
- 异步优先：所有 I/O 操作使用 async/await

**TypeScript（前端）**：
- 使用 ESLint + Prettier
- 严格模式：`"strict": true`
- 组件命名：PascalCase（`BookmarkList.vue`）
- 组合式函数：`use` 前缀（`useAuth.ts`）

---

### Git 提交规范

**格式**：`<type>(<scope>): <subject>`

**类型**：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响逻辑）
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

**示例**：
```
feat(auth): implement Argon2id key derivation
fix(bookmark): resolve tag deletion cascade issue
docs(schema): update JSON structure examples
```

---

### 分支策略

**主分支**：
- `main`：稳定版本，每个 Phase 完成后合并

**开发分支**：
- `phase-1-infrastructure`
- `phase-2-backend-core`
- `phase-3-frontend-core`
- ...

**功能分支**（可选）：
- `feat/argon2-encryption`
- `feat/bookmark-crud`

---

### 测试策略

**后端**：
- 单元测试：pytest（覆盖率 > 80%）
- API 测试：httpx + pytest-asyncio
- 加密测试：验证密文不可逆

**前端**：
- 单元测试：Vitest
- 组件测试：@vue/test-utils
- E2E 测试：Playwright（可选）

---

## 第十部分：待解决问题清单

### 技术问题

1. **拼音首字母生成**：
   - [ ] 选择 Python 库（pypinyin）
   - [ ] 客户端还是服务端生成？
   - [ ] 非中文字符如何处理？

2. **生物识别解锁**：
   - [ ] Firefox Native Messaging 配置
   - [ ] Linux 指纹设备支持（fprintd）
   - [ ] 降级方案（主密码解锁）

3. **性能优化**：
   - [ ] 大量书签时的搜索性能（全文索引？）
   - [ ] Argon2id 计算时间（Web Worker？）
   - [ ] 加密/解密批处理

---

### 产品问题

1. **首次使用体验**：
   - [ ] 引导用户创建主密码
   - [ ] 强密码提示
   - [ ] 安全提示教育

2. **数据迁移**：
   - [ ] 从 Bitwarden 导入
   - [ ] 从浏览器密码管理器导入
   - [ ] 数据格式转换

3. **错误恢复**：
   - [ ] 忘记主密码时的处理
   - [ ] 数据库损坏时的恢复
   - [ ] 备份验证机制

---

## 第十一部分：参考资料索引

### 研究成果

1. **Bitwarden 加密架构**（Session: `ses_33ea7658cffeQPaMMxbn1WSR4A`）：
   - Argon2id 参数配置
   - HKDF 密钥扩展
   - 零知识架构设计

2. **本地 HTTPS 实践**（Session: `ses_33ea7535fffeUcfQWMFk5gJKvo`）：
   - mkcert 使用指南
   - Firefox 证书固定 API
   - CORS 配置

3. **Firefox 扩展技术栈**（Task: `bg_b35b1260`）：
   - WXT vs Plasmo 对比
   - Vue vs React 生态
   - 键盘导航库推荐

4. **后端框架选型**（Task: `bg_330e270a`）：
   - FastAPI 优势
   - SQLite 适用场景
   - 备份策略

5. **密码管理器安全实践**（Task: `bg_254a6be1`）：
   - 生物识别实现
   - 自动填充安全
   - 内存清理

---

### 外部资源

**官方文档**：
- [Bitwarden Security Whitepaper](https://bitwarden.com/help/bitwarden-security-white-paper/)
- [WXT Framework](https://wxt.dev/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Firefox WebExtension API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)

**技术规范**：
- [Argon2 RFC 9106](https://datatracker.ietf.org/doc/html/rfc9106)
- [HKDF RFC 5869](https://datatracker.ietf.org/doc/html/rfc5869)
- [AES-GCM NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800-38d/final)

**工具**：
- [mkcert](https://github.com/FiloSottile/mkcert) - 本地 HTTPS 证书生成
- [uv](https://github.com/astral-sh/uv) - Python 包管理器

---

## 第十二部分：新 Session 延续指南

### 当你在新 Session 中打开 Keeper 项目时

**必读文档**：
1. `/docs/schema.md` - 数据库设计和安全架构
2. `/docs/Phase1_Infrastructure_interaction_records.md`（本文档）- 完整决策过程

**快速上下文恢复**：
```bash
# 1. 查看当前进度
cat ~/workspace/projects/keeper/docs/schema.md | grep "当前状态"

# 2. 查看最后一次提交
cd ~/workspace/projects/keeper && git log -1 --oneline

# 3. 查看待办事项
grep "- \[ \]" ~/workspace/projects/keeper/docs/Phase1_Infrastructure_interaction_records.md
```

**关键上下文**：
- 用户熟悉 Vue，优先使用 Vue 3 Composition API
- 只需支持 Firefox + Linux（无需跨浏览器兼容）
- 安全优先，不妥协（四层防护全部启用）
- 键盘导航是核心交互方式
- 中文支持通过拼音首字母实现

---

### 避免重复讨论的决策

以下问题已明确，无需再问：

1. ✅ **技术栈**：FastAPI + SQLite + Vue 3 + WXT（已锁定）
2. ✅ **加密方案**：Argon2id + HKDF + AES-GCM（已确定）
3. ✅ **数据库设计**：4 表结构（Tag/Relation 独立，URL/Account 合并到 Bookmark）
4. ✅ **安全层级**：四层防护（HTTPS + Localhost + 加密 + 证书固定）
5. ✅ **JSON 数组 vs 独立表**：Tag/Relation 独立，URL/Account 数组（已定稿）

---

### 推荐的新 Session 开场白

**好的开场**：
> "我看了 schema.md 和交互记录，现在开始实现 Phase 2 的加密模块。我想先创建 `src/crypto/argon2.py`，你有什么建议吗？"

**不好的开场**：
> "我们用什么数据库？"（已在文档中明确）
> "Tag 要不要独立成表？"（已讨论并确定）

---

## 总结

### 已完成的工作

1. ✅ 技术栈选型（含深度研究）
2. ✅ 数据库设计（4 表 + JSON 数组混合方案）
3. ✅ 安全架构设计（四层防护）
4. ✅ 仓库初始化（keeper + keeper-firefox）
5. ✅ 文档创建（schema.md + 本文档）

### 下一步行动

**Phase 2 优先任务**：
1. 创建数据库初始化脚本（`src/db/init.sql`）
2. 实现 Argon2id 加密模块（`src/crypto/argon2.py`）
3. 实现 HKDF 密钥扩展（`src/crypto/hkdf.py`）
4. 实现 AES-GCM 加密（`src/crypto/aes_gcm.py`）
5. 创建 Authentication API（`src/routers/auth.py`）

**预计时间**：2-3 天

---

**文档版本**：v1.0.0  
**最后更新**：2026-03-06  
**下次审查**：Phase 2 完成时
