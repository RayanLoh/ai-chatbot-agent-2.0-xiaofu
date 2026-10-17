# 小芙后端

FastAPI + Google GenAI SDK + Supabase + Cloudflare R2，配套静态 React 前端。需要 Python 3.12 和 uv。

免费体验与订阅目前仅保留模板：登录账号总共 20 次，方案展示 USD 4.99/月，付款及自动开通暂不启用。配置与迁移说明见 [订阅模板](BILLING_TEMPLATE.md)。

## 本地启动

在本目录执行：

```powershell
uv sync --frozen
Copy-Item .env.example .env
# 填写 .env 后启动；已有 .env 时不要覆盖
uv run uvicorn main:app --host 127.0.0.1 --port 8080
uv run pytest -q
```

测试会清空真实服务配置并模拟外部服务，不连接生产资源。

## 配置与迁移

1. 在 Google、Supabase、Cloudflare 后台更换曾被提交的真实密钥。当前版本不跟踪 .env，app.yaml 已移除密钥；旧 Git 历史仍有敏感内容。不要仅删除文件而不撤销密钥。
2. 填写 GEMINI_API_KEY、GOOGLE_CLIENT_ID、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY。兼容旧 SUPABASE_KEY 名称，但必须使用后端专用 service_role/secret key；前端不能持有此密钥。
3. 设置至少 32 字符的 GUEST_SIGNING_SECRET，所有实例必须一致。生成命令：python -c "import secrets; print(secrets.token_hex(32))"。更换会使现有游客 token 失效。
4. 备份数据库，先在测试库依序执行 migrations/001_maintenance.sql、002_reliability.sql、003_subscriptions.sql、004_backend_reliability.sql，再应用到目标 Supabase。新后端依赖上述四份迁移。迁移保留 conversations/messages，扩大会话 ID 为 text，新增原子消息 RPC、额度计数和生成请求状态，并撤销 anon/authenticated 直接访问。其他直接访问这些表的应用需要同步迁移。
5. FRONTEND_ORIGIN 填前端准确 origin，可用逗号分隔；不再放行所有 Vercel 预览域名。
6. 图片功能需要完整私有 R2 配置。先关闭 bucket 的 r2.dev 和公共自定义域名访问，再设置 R2_PRIVATE_BUCKET_CONFIRMED=true；新图只返回 /assets/{uuid}。旧公共 URL 不再自动读取，需审核迁移或重新上传。
7. ALLOWED_MODELS 定义模型白名单，前端从 /models 加载。结合自己的 Gemini 账户和官方模型列表确认可用性；图像模型设置 TEXT/IMAGE 输出。配置变更后重启。

本轮五项后端修复与配置就绪检查见 [后端修复记录](BACKEND_FIXES.md)。

## 接口与行为

- GET /health 仅检查进程存活；GET /models 返回配置的模型。
- POST /guest-session 签发 30 天游客 token，后续通过 X-Guest-Token 传递。旧 X-Guest-Id 不再可信，旧游客历史不会自动交给新身份。
- Google 用户使用 Authorization: Bearer ID_TOKEN。无效 token 返回 401，不降级为游客。
- /conversations 的 CRUD 均按已验证用户隔离，列表仅返回摘要。
- POST /generate 包含 prompt、request_id(UUID)、可选 conversation_id、model_name、image_urls。每个会话同时仅一个请求；相同内容的成功编号返回缓存结果，失败编号需明确重新发送。上下文取数据库最近 40 条消息与最近 4 张图片，问答及结果原子提交。
- GET /generations/{request_id} 查询所属请求。浏览器断线后可查询原请求恢复结果，不会自动新建付费请求；进程崩溃后租约到期视为失败。
- POST /stop 包含 request_id，只能取消所属用户请求。取消状态存入数据库，其他实例也可观察；取消后的回复不再写入。上游已发生的计算可能仍计费。
- POST /upload 检查身份、频率、文件实际格式、大小和像素。支持 PNG/JPEG/WebP/GIF，最多 10 MiB/张、2000 万像素。请求体限制：上传 11 MiB，其他 256 KiB。
- GET /download-image?url=/assets/{uuid} 需要身份头，校验归属后从私有 R2 获取数据；客户端不再传公共 URL。
- MODEL_BUDGETS_JSON 必须按允许模型配置最高适用输入/输出 token 费率及图片额外收费上界，否则拒绝生成。新增环境变量和单位见 .env.example；预算为保守预留，不等于实际账单。详细行为和部署要求见[高优先级修复交付](HIGH_PRIORITY_FIXES.md)。
- 游客签名身份总额度 8 次生成尝试，网络每日另限 8 次；删除会话不会重置。失败/取消也占额度，共享网络用户可能共享每日额度。
- 额度和频率计数在数据库原子更新，数据库失败时拒绝继续请求。网络地址只取 ASGI client，不自行相信客户端转发头。

## 部署

部署顺序：备份/测试数据库迁移，然后新后端配置与发布，最后新前端构建与发布。此次接口需要前后端配套升级。

Cloud Run 使用部署环境或 Secret Manager 注入配置。app.yaml 只保留运行时和入口；App Engine 用户需要自己的 Secret Manager 注入流程，不能把秘密重新写回仓库。

反向代理场景准确设置 uvicorn FORWARDED_ALLOW_IPS 为可信代理地址，并限制源站访问。不应直接信任公网 X-Forwarded-For；未配置时多个用户可能被视为同一网络。入口网关也应设置请求体/超时限制。

uv.lock 复现全部依赖，requirements.txt 为生产依赖导出。更新后执行：

```powershell
uv lock
uv export --frozen --no-dev --no-hashes --format requirements.txt --output-file requirements.txt
```

定期清理过期 rate/network 计数，保留 guest-total 终身计数。成功生成记录承载幂等边界，不能再按旧示例一天后直接清除。每小时执行 python cleanup_assets.py，处理删除队列和超过 24 小时未绑定的上传；故障重试保留队列。

## 验证

pytest 覆盖伪造/过期身份、越权、SSRF、图片格式、参数校验、存储失败、数据库历史和取消。tests/database.sql 在独立测试库运行，CI 使用 PostgreSQL 16 验证迁移和权限。

真实 OAuth、Supabase、R2 和模型响应仍需使用更换后的凭据联调。SDK 迁移参考：https://googleapis.github.io/python-genai/ 。

## 模型列表更新（2026-10-17）

默认聊天模型为 Gemini 3.8 Flash，附带 3.5 Flash-Lite、4 Argon、3.1 Pro 预览，以及 Nano Banana 2.1 / 2 / Pro 图片模型。前端按通用聊天、推理与编程、图片生成分组。ALLOWED_MODELS 可显式缩小范围；旧部署如设置了此变量，需同步更新并重启。名单表示配置允许使用，不代表已经验证账户权限或免费额度。来源：https://ai.google.dev/gemini-api/docs/models 。

