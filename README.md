# AetherGate

一个 AI API 网关（类 one-api 形态），支持 OpenAI 兼容协议和 Anthropic 原生协议，带多渠道路由、分组倍率计费、SSE 流式透传。

## 技术栈

- **后端**：Rust + Axum + sqlx + PostgreSQL + Redis + Tokio
- **前端**：Vite + React 18 + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Router

## 开发起步

### 前置依赖

- Rust 1.75+（`cargo --version` 验证）
- Node.js 20+ 和 pnpm 9+
- PostgreSQL 14+、Redis 6+（本地安装，或 `docker compose -f docker-compose.dev.yml up -d`）

### 后端

```bash
cd backend

# 1. 复制环境变量模板并按需修改
cp .env.example .env
# 编辑 .env：把 DATABASE_URL、JWT_SECRET、ENCRYPTION_KEY 改成真实值

# 2. 确保 Postgres 里有一个空库 aethergate
#    psql -U postgres -c "CREATE DATABASE aethergate;"

# 3. 启动（首次运行会自动跑迁移）
cargo run
```

启动后访问 `http://127.0.0.1:3000/healthz` 应返回 `{"status":"ok"}`。

### 前端

```bash
cd frontend
pnpm install
pnpm dev      # 启动 http://localhost:5173，已配置代理到后端 3000
pnpm build    # 打包到 dist/
```

## 目录结构

```
backend/
  src/
    main.rs             Axum 启动入口
    config.rs           环境变量 / config.toml 加载
    db.rs               PgPool 初始化
    redis_client.rs     Redis 连接池
    error.rs            AppError + IntoResponse
    auth/               JWT + API Key 中间件
    models/             领域实体
    repo/               sqlx 查询层
    services/           业务逻辑（路由、计费、缓存）
    upstream/           上游适配器（openai / anthropic）
    routes/
      admin.rs          管理后台 API
      v1.rs             OpenAI 兼容端点
      anthropic.rs      Anthropic 原生端点
      health.rs         /healthz
  migrations/           sqlx 迁移
  .env.example

frontend/
  src/
    main.tsx / App.tsx
    lib/api.ts          API 客户端（自动注入 JWT）
    lib/utils.ts        cn 等工具
    hooks/              TanStack Query hooks
    components/         通用组件
    pages/              页面级组件
  mock.html             早期的静态 mock，保留到页面迁移完成后删除

docker-compose.dev.yml   可选：本地依赖 Postgres + Redis
```

## 当前状态

阶段 0（工程基建）已完成。详细的分阶段计划见对话中的 plan 文件。
