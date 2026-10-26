# 小芙聊天前端

React 19 + Vite 8 静态 SPA，对接独立 Python API。本地与 Vercel 统一使用 Node.js 24；`.node-version` 与 `package.json` 均已固定主版本。

SPA 唯一入口为 `src/main.jsx`。消息、输入器、滚动手势和恢复权限各自独立；设置页与 Markdown 渲染器按需加载。结构和维护说明见 [ARCHITECTURE.md](../../docs/ARCHITECTURE.md)。

## 启动

在本目录运行：

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

已有 .env.local 时直接编辑，不要覆盖。先按后端 README 完成数据库迁移和配置。

- VITE_API_BASE：后端完整地址，本地 http://localhost:8080。生产必须设置 HTTPS API 地址，或留空使用同源反向代理；不再硬编码回退到旧 Cloud Run/duckdns/ngrok。
- VITE_GOOGLE_CLIENT_ID：与后端 GOOGLE_CLIENT_ID 一致，在 Google 控制台登记前端 origin。未配置时游客模式仍可用。

VITE_ 变量会进入浏览器，不能放入 Gemini、Supabase service_role、R2 密钥。环境变量更改后重新构建。后端 FRONTEND_ORIGIN 必须包含前端实际 origin。

## 检查和部署

```powershell
npm test
npm run build
npm run preview
npm audit
```

preview 使用 Vite 预览 dist 静态产物，默认 http://localhost:4173。Vercel Root Directory 为 frontend/ai-react-chat（相对前端仓库根）；vercel.json 已配置静态资源与路由回退。其他静态平台也需要页面路由回退到 index.html，同源 API 路径应先交给反向代理，不能被 SPA 回退吞掉。

移除了不完整的 Express 示例服务器、SSR 和 GitHub 登录入口，统一 SPA + Python API，保留 Google 登录。npm run server/build:ssr 已移除。不要使用旧诊断文档中的临时 ngrok 地址。生产构建不包含 source map。

## 行为说明

游客 token 由后端签发，通过 X-Guest-Token 传递；Google ID token 使用 Authorization。身份最终以服务端验证为准。过期 Google 登录会清除状态并提示重登；过期游客 token 最多重建一次。

取消按独立 request_id 执行；切换会话、账户或卸载会取消旧等待并隔离旧响应。上传时禁止发送，最多 4 张、每张 10 MiB，支持 PNG/JPEG/WebP/GIF。后端再次校验。

回复在服务器完整返回后显示，当前不提供 SSE 流式输出。模型列表来自后端 /models，加载失败时暂停发送。会话列表不会自动删除空会话。

回归测试覆盖取消后继续发送、旧账户/旧会话响应隔离、上传等待、身份头和统一错误处理。线上 Google OAuth、图片和模型调用仍需真实配置后联调。

CSP 在构建时根据 VITE_API_BASE 注入 API origin，不再放行任意 HTTPS/WebSocket 连接；本地开发额外允许本地 API 和 Vite 热更新。生产模式移除脚本 unsafe-eval/unsafe-inline。

模型选择器展示后端提供的名称与分类（通用聊天、推理与编程、图片生成）；预览模型有标记，旧的本地选择若不在白名单内，会自动切换到列表首项。

## 界面更新（2026-10-17）

聊天工作区采用暖白、墨色与杏桃色主题，支持深色模式。欢迎页的快捷卡片填入草稿，不会自动发送；画图卡片会优先选择图片模型。模型菜单支持方向键、Enter 和 Escape，并在手机端保持在视口内。输入支持 Enter 发送、Shift+Enter 换行，中文输入法选词期间不会误发送。历史加载失败提供持续的重试入口，通知改为轻量浮层。

## 界面语言与版权

默认界面语言为 English。页头 EN / 中文 / BM 或设置页的 Interface language 可即时切换 English、中文和 Bahasa Melayu；选择保存在本机 localStorage（xiaofu_language），刷新后继续生效。切换不刷新页面，不清空当前草稿，也不翻译或改写历史消息。新点击的提示卡片会填入当前语言的草稿。

原版权文案固定保留：copyright © | **rAyAnChbT** | 2025 | All Rights Reserved，所有语言下相同。
