# 小芙 AI Chatbot

前后端统一维护于 [ai-chatbot-agent-2.0-xiaofu](https://github.com/RayanLoh/ai-chatbot-agent-2.0-xiaofu)。

| 目录 | 用途 |
| --- | --- |
| `frontend/ai-react-chat/` | React + Vite 前端 |
| `backend/` | FastAPI API、数据库迁移、后台清理与测试 |
| `.github/workflows/` | 前端与后端独立检查 |

## 本地开发

从本仓库根目录打开两个终端。

后端（Python 3.12、uv）：

```powershell
cd backend
uv sync --frozen
# 首次配置时复制；已有 .env 不要覆盖
Copy-Item .env.example .env
uv run uvicorn main:app --host 127.0.0.1 --port 8080
```

前端（建议 Node.js 24）：

```powershell
cd frontend/ai-react-chat
npm ci
# 首次配置时复制；已有 .env.local 不要覆盖
Copy-Item .env.example .env.local
npm run dev -- --port 5174 --strictPort
```

前端 `VITE_API_BASE=http://localhost:8080`，后端 `FRONTEND_ORIGIN=http://localhost:5174`。启动前按[后端说明](backend/README.md)配置服务，并依序执行四份数据库迁移。

## 配置与部署

后端密钥仅放在 `backend/.env` 或部署平台的 Secret Manager；前端配置放在 `frontend/ai-react-chat/.env.local`。这些本地文件均忽略，仅提交 `.env.example`。整合没有复制原后端的真实 `.env`，新目录需要自行配置。

前端部署 Root Directory 保持 `frontend/ai-react-chat`；后端部署 Root Directory 改为 `backend`。同仓库仍分别构建与部署。

免费额度和订阅目前仅为模板，付款未启用。功能说明见[前端 README](frontend/ai-react-chat/README.md)和[后端 README](backend/README.md)。

## 检查

```powershell
npm --prefix frontend/ai-react-chat test
npm --prefix frontend/ai-react-chat run build
cd backend
uv run pytest -q
```

前端原有 Git 历史保留。旧后端仓库仍作为历史备份；因旧提交曾包含密钥，没有将其历史导入此仓库，当前后端代码已整合于 `backend/`。
