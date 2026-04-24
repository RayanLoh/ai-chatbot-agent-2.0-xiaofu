# XiaoFu AI Chat

一个面向真实使用场景的 AI 聊天前端：支持多会话、图片理解、Google 登录、主题切换与流式交互体验。

---

## 这是什么

`ai-react-chat` 是一个基于 React + Vite 的现代化聊天应用前端，定位是“可直接演示、可继续扩展、可上线部署”的 AI Chat UI。

它不仅是一个聊天页面，而是一套完整的交互方案：

- 支持多轮会话管理（新建、切换、重命名、删除）
- 支持图片上传并参与 AI 问答
- 支持 Google 登录与游客模式切换
- 支持模型切换（多种 Gemini 模型）
- 支持浅色/深色主题和移动端交互优化

---

## 为什么做这个

很多 AI Demo 只能“发一句、回一句”，无法满足真实团队演示和持续迭代需求。

这个项目的目标是：

- 让产品、设计、开发、业务都能快速看到 AI 产品形态
- 让团队在稳定前端骨架上快速接入不同后端能力
- 让项目具备“可演示 + 可维护 + 可部署”的工程价值

一句话：它是一个面向团队协作和对外展示的 AI 聊天前端基座。

---

## 我们是怎么做的

### 1) 前端架构分层

- `src/component/`：界面组件（Header、侧边栏、设置、登录弹窗等）
- `src/hooks/`：核心业务状态（认证、聊天、会话、主题）
- `src/api/`：统一 API 请求层（会话、生成、上传）
- `src/styles/`：组件样式拆分，便于维护与替换

通过 “组件 + Hook + API” 三层拆分，把 UI、业务、接口解耦，降低迭代成本。

### 2) 聊天体验设计

- 使用流式文本揭示与中断机制，提升“正在思考”的反馈感
- 支持上传图片并绑定到当前消息上下文
- 移动端做了输入框高度、自适应滚动和下拉刷新等细节优化

### 3) 会话与身份

- 使用会话列表管理历史上下文
- 支持游客与登录态切换
- Google OAuth 登录成功后持久化本地信息，保障连续体验

### 4) 环境适配与部署

- 本地开发默认走本地 API
- Vercel 场景支持生产 API 回退策略
- 提供独立 `server.js` 示例服务用于快速联调

---

## 技术栈

- 前端框架：React 19
- 构建工具：Vite 7
- 路由：React Router 7
- Markdown 渲染：react-markdown + remark-gfm
- 图标：lucide-react
- 认证：@react-oauth/google + jwt-decode
- 服务端示例：Express

---

## 项目结构（核心）

```text
frontend/
  ai-react-chat/
    src/
      App.jsx                 # 页面主入口与交互编排
      component/              # UI 组件
      hooks/                  # useAuth/useChat/useConversations/useTheme
      api/                    # 接口请求与配置
      styles/                 # 组件样式
    api/index.js              # 可能用于部署平台的 API 入口
    server.js                 # 本地示例后端服务
    vite.config.js
    vercel.json
```

---

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 启动前端开发环境

```bash
npm run dev
```

### 3) 如需本地联调示例服务

```bash
npm run server
```

前端默认开发地址通常为：`http://localhost:5173`

---

## 环境变量

建议在项目根目录创建 `.env.local`：

```env
# 前端请求后端的基础地址
VITE_API_BASE=http://localhost:8080

# Google OAuth Client ID（可选，启用登录时需要）
VITE_GOOGLE_CLIENT_ID=your_google_client_id

# 若使用 server.js 示例服务，需要在服务端环境配置
# GEMINI_API_KEY=your_gemini_api_key
```

---

## 对项目成员/外部读者的价值

- 对产品：快速验证 AI 交互流程与功能闭环
- 对设计：有完整 UI 载体，可持续打磨体验细节
- 对开发：结构清晰，便于多人协作和功能扩展
- 对业务/客户：可直接演示，展示“可落地”的产品能力

---

## 后续可扩展方向

- 接入更多模型供应商与路由策略
- 增加会话搜索、标签、归档等知识管理能力
- 引入权限系统与团队级协作空间
- 补齐测试与监控，提升生产可用性

---

如果你希望，这是一个“今天能演示、明天能迭代、后天能上线”的 AI 聊天前端起点。