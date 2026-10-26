# 小芙的代码结构

前端使用 React 19、Vite 8、React Router、Vitest；后端使用 FastAPI、Pydantic 2、Google GenAI SDK。Python 依赖由 `uv.lock` 固定，前端依赖由 `package-lock.json` 固定。前端本地与 Vercel 统一使用 Node.js 24。

## 前端

代码位于 `frontend/ai-react-chat/src/`。

| 文件或目录 | 职责 |
| --- | --- |
| `main.jsx` | 唯一 SPA 启动入口，安装语言、路由与 React StrictMode |
| `App.jsx` | 组合页面、路由与各功能模块 |
| `component/ChatComposer.jsx` | 输入、上传、模型选择、停止、恢复草稿与方案入口 |
| `component/ChatMessage.jsx` | 消息、图片预览/下载和历史图片警告 |
| `component/MarkdownMessage.jsx` | 按需加载 Markdown/GFM 渲染，保留代码块、表格和安全文本处理 |
| `component/Settings.jsx` | 按需加载设置页，保留语言、主题与通知配置 |
| `hooks/useChat.js` | 生成、取消、上传和订阅用户的请求恢复 |
| `hooks/useConversations.js` | 会话 CRUD、身份隔离、30 秒内存缓存和过期请求取消 |
| `hooks/useChatViewport.js` | 移动端侧栏、输入框尺寸、滚动与下拉刷新 |
| `hooks/useRecoveryAccess.js` | 后端验证的 Pro/测试账号恢复权限与到期计时 |
| `hooks/useTheme.js` | 主题偏好、系统主题订阅与跨标签页同步 |
| `api/` | HTTP 身份头、错误解析与各 API 调用 |
| `i18n/` | 英文、中文、马来文界面文案 |

页面组件不直接读取数据库或计算付费权限。缓存只在当前页面内存中保存，不能跨账号复用。Google 登录、游客模式、图片上传与生成、私有图片、历史继承、测试账号、订阅模板和版权均保留。

## 后端

代码位于 `backend/`。`routers/` 处理 HTTP，`dependencies.py` 验证身份，`services/` 负责业务与存储，`core/agent.py` 封装模型调用，`schemas/` 定义输入，`migrations/` 保存按序执行的 SQL。

现有迁移 001～005 保留，已执行的迁移不重写；未来数据库变更增加新迁移。额度、预算、归属和请求幂等继续由后端与数据库检查。不能用前端状态替代权限判断。

`app.yaml` 是可选 App Engine 配置，不参与 Cloud Run 容器部署；Cloud Run 使用 `Dockerfile`。保留这项部署选项。

## 维护规则

- 新功能放入对应组件、hook 或 service，避免重新堆进 App。
- 不为追求版本号强换技术栈。主版本升级单独验证兼容性；Vite 8 已移除旧对象形式的 `manualChunks` 配置，并显式保留升级前的浏览器构建目标。
- 依赖更新同步提交锁文件。按影响范围执行测试与生产构建；CI 检查前后端、SQL 权限和依赖安全。
- 不保存真实密钥到 Git；`.env`、`.local/` 继续忽略。
- `docs/archive/indexeddb/` 仅保存旧设计记录，其命令不可用于当前版本。旧诊断代码依赖已不存在的模块，已从活动代码移除。

参考：[Vite 8 迁移](https://vite.dev/guide/migration.html)、[React 按需加载](https://react.dev/reference/react/lazy)、[React 外部状态订阅](https://react.dev/reference/react/useSyncExternalStore)。
