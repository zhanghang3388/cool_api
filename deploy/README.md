# 部署指南（Ubuntu + Docker Compose + Caddy）

本目录一键部署整套后端 + 前端 + Postgres + Redis + Caddy。

## 架构

```
                  443 (HTTPS)
           ┌──────────┴──────────┐
           │       Caddy         │ ← Let's Encrypt 自动 HTTPS
           │ WEB_DOMAIN / API_DOMAIN │
           └────┬────────────┬───┘
                │            │
           ┌────▼─────┐  ┌───▼──────┐
           │ frontend │  │ backend  │ ← 可横向扩展 (BACKEND_REPLICAS)
           │ (静态)   │  │ :3000    │
           └──────────┘  └──┬───────┘
                            │
                     ┌──────┴──────┐
                     │             │
                ┌────▼────┐   ┌────▼────┐
                │ Postgres│   │  Redis  │
                └─────────┘   └─────────┘
```

所有后端节点**共用同一套** Postgres + Redis，用户数据/缓存/统计在任意节点一致。

---

## 1. 准备工作

### 1.1 DNS 解析

在你的域名服务商那里加两条 A 记录指向服务器公网 IP：

| Host | Type | Value |
|---|---|---|
| `app.example.com` (前端) | A | 你的服务器 IP |
| `api.example.com` (后端) | A | 你的服务器 IP |

> Caddy 会自动向 Let's Encrypt 申请证书，**必须先把 DNS 指过来**再启动，否则证书签不下来。

### 1.2 服务器安装 Docker

```bash
# 以 root 或 sudo 用户运行
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 把当前用户加入 docker 组
# 退出重新登录让分组生效
```

### 1.3 防火墙

放通 80 / 443（Caddy 只需这两个端口）：

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

---

## 2. 首次部署

### 2.1 拉代码

```bash
git clone https://github.com/zhanghang3388/cool_api.git
cd cool_api/deploy
```

### 2.2 配置 `.env`

```bash
cp .env.example .env
# 编辑 .env，至少改：
#   WEB_DOMAIN / API_DOMAIN
#   ACME_EMAIL
#   POSTGRES_PASSWORD
#   JWT_SECRET               openssl rand -hex 32
#   ENCRYPTION_KEY           openssl rand -base64 32
#   ADMIN_INITIAL_PASSWORD
vi .env
```

⚠️ **JWT_SECRET 和 ENCRYPTION_KEY 设置后不要再改** — 改 JWT_SECRET 会让所有登录失效，改 ENCRYPTION_KEY 会让渠道 API Key 和支付配置变成乱码无法使用。妥善备份。

### 2.3 构建 + 启动

```bash
docker compose build        # 第一次要几分钟（Rust 编译）
docker compose up -d
docker compose logs -f      # 看启动日志
```

启动顺序：Postgres/Redis → backend（自动跑 migration 创建表）→ frontend + caddy。
Caddy 首次启动会现申请 Let's Encrypt 证书，日志里能看到。

### 2.4 访问

- 前端：`https://app.example.com`
- API：`https://api.example.com/healthz` → `{"status":"ok"}`
- 用 `.env` 里的 `ADMIN_INITIAL_USERNAME / PASSWORD` 登录后端管理后台。

---

## 3. 日常操作

### 3.1 查看日志

```bash
docker compose logs -f backend       # 只看后端
docker compose logs -f caddy         # TLS / 访问日志
docker compose logs --tail=100
```

### 3.2 更新代码

```bash
cd cool_api
git pull
cd deploy
docker compose build backend frontend
docker compose up -d                 # 滚动替换
```

后端有新 migration 会在启动时自动跑，不需要手动操作。

### 3.3 数据库备份

```bash
# 备份到宿主机
docker compose exec -T postgres \
    pg_dump -U $(grep POSTGRES_USER .env | cut -d= -f2) \
            $(grep POSTGRES_DB .env | cut -d= -f2) \
  | gzip > backup-$(date +%Y%m%d).sql.gz
```

### 3.4 进 DB / Redis 调试

```bash
docker compose exec postgres psql -U aethergate -d aethergate
docker compose exec redis redis-cli
```

---

## 4. 扩展到多节点（横向扩容）

**所有后端节点共享同一份 Postgres + Redis**，所以加节点只是多起几个 backend 容器：

```bash
# .env 里加或改：
echo "BACKEND_REPLICAS=3" >> .env
docker compose up -d
```

Caddy 会自动把请求在 3 个 backend 容器间做 DNS 负载均衡。**不需要改代码**。

如果以后要把数据库/Redis 拉到单独服务器甚至云厂商托管：

1. 把 `.env` 里的 `DATABASE_URL` / `REDIS_URL` 单独配好（注意：当前 compose 里这两项写死在 service env 里，需要改 compose 把 postgres/redis 服务删掉，然后在 backend service 的 environment 里直接写远程连接串）
2. 每个应用服务器只起 `backend + frontend + caddy`，指向同一个中心 DB/Redis
3. 前面再加一层负载均衡（云厂商的 SLB / Nginx）分发到不同节点

---

## 5. 常见问题

**证书申请失败？**
1. 确认 DNS 已生效：`dig app.example.com +short` 应该返回服务器 IP
2. 确认 80/443 从公网可达（云厂商安全组也要放行，不只是 ufw）
3. `docker compose logs caddy` 看具体错误
4. Let's Encrypt 有频率限制，失败别狂重启，等几分钟

**前端能打开但 API 调用失败？**
1. 浏览器 DevTools 看 Network 里请求 URL 是不是 `https://api.example.com/...`
2. 若不是，说明 `VITE_API_BASE` build 时没传对。改 `.env` 里 `API_DOMAIN` 后必须 `docker compose build frontend` 重新构建
3. 直接 curl：`curl https://api.example.com/healthz`

**忘记管理员密码？**
进 DB 直接改（argon2 哈希用 `htpasswd` 或 backend 的 CLI）。临时方案：

```bash
docker compose exec postgres psql -U aethergate -d aethergate -c \
  "DELETE FROM users WHERE role = 'admin';"
# 改 .env 里 ADMIN_INITIAL_PASSWORD，重启 backend，它会重建 admin
docker compose up -d backend
```

**想完全清空数据重来？**
```bash
docker compose down -v        # 注意：-v 会删 postgres + redis 数据卷
```
