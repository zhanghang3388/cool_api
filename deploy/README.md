# 部署指南（Ubuntu + Docker Compose + nginx + Let's Encrypt）

本目录一键部署整套后端 + 前端 + Postgres + Redis + nginx + certbot。

## 架构

```
                  443 (HTTPS)
           ┌──────────┴──────────┐
           │       nginx         │ ← TLS 终止 + 反代
           │ WEB_DOMAIN / API_DOMAIN │
           └────┬────────────┬───┘
                │            │        ┌──────────┐
                │            │        │ certbot  │ ← 每 12h 续期
                │            │        └────┬─────┘
                │            │             │
                │            │         /etc/letsencrypt (共享卷)
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

> certbot 会通过 Let's Encrypt 的 HTTP-01 挑战申请证书，**DNS 必须先生效**才能通过验证。用 `dig app.example.com +short` 返回服务器 IP 再继续。

### 1.2 服务器安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 退出重登让 docker 组生效
```

### 1.3 防火墙

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

云厂商的**安全组/防火墙**也要放行 80/443，否则 Let's Encrypt 挑战过不来。

---

## 2. 首次部署

### 2.1 拉代码 + 配置

```bash
git clone https://github.com/zhanghang3388/cool_api.git
cd cool_api/deploy
cp .env.example .env
vi .env     # 至少改：域名、ACME_EMAIL、POSTGRES_PASSWORD、
            # JWT_SECRET、ENCRYPTION_KEY、ADMIN_INITIAL_PASSWORD
```

⚠️ **`JWT_SECRET` 和 `ENCRYPTION_KEY` 一经设置，不要再改**：
- 改 `JWT_SECRET` → 所有用户登录状态失效
- 改 `ENCRYPTION_KEY` → 存储的渠道 API Key 和支付密钥无法解密

妥善备份这两个值。

### 2.2 先申请 TLS 证书（只跑一次）

```bash
chmod +x init-letsencrypt.sh
./init-letsencrypt.sh
```

脚本会：
1. 临时起一个 HTTP-only nginx 监听 :80
2. 调 certbot 为 `WEB_DOMAIN` 和 `API_DOMAIN` 各申请一张证书
3. 证书存到 docker 卷 `aethergate_letsencrypt`
4. 关闭临时 nginx

输出以 `[done] Certificates issued.` 结束就成功了。失败排查：
- `dig ... +short` DNS 是否生效
- 80 端口是否真能从外网访问（云安全组/防火墙）
- Let's Encrypt 频控：一周对同一域名失败超过 5 次会锁 1h，等等再重试

### 2.3 起栈

```bash
docker compose up -d --build        # 首次 build 约 5-8 分钟（Rust 编译）
docker compose logs -f              # 看启动日志
```

### 2.4 访问

- 前端：`https://app.example.com`
- API 健康：`https://api.example.com/healthz` → `{"status":"ok"}`
- 用 `.env` 里的 `ADMIN_INITIAL_USERNAME / PASSWORD` 登录后端管理后台

---

## 3. 日常操作

### 3.1 查看日志

```bash
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f certbot      # 看证书续期
```

### 3.2 更新代码

```bash
cd cool_api
git pull
cd deploy
docker compose build backend frontend
docker compose up -d                # 滚动替换
```

后端有新 migration 启动时自动跑。

### 3.3 数据库备份

```bash
docker compose exec -T postgres \
    pg_dump -U $(grep POSTGRES_USER .env | cut -d= -f2) \
            $(grep POSTGRES_DB .env | cut -d= -f2) \
  | gzip > backup-$(date +%Y%m%d).sql.gz
```

### 3.4 证书续期

**全自动**：`certbot` 服务每 12h 跑 `certbot renew`，不到 30 天内到期不动；到期自动换新。`nginx` 容器每 6h `reload` 一次拾取新证书。手动触发：

```bash
docker compose exec certbot certbot renew --force-renewal
docker compose exec nginx nginx -s reload
```

### 3.5 进 DB / Redis 调试

```bash
docker compose exec postgres psql -U aethergate -d aethergate
docker compose exec redis redis-cli
```

---

## 4. 扩展到多节点（横向扩容）

**所有后端节点共享同一套 Postgres + Redis**，加节点只是多起几个 backend 容器：

```bash
echo "BACKEND_REPLICAS=3" >> .env
docker compose up -d
```

nginx 的 `proxy_pass http://backend:3000` 被 docker DNS 解析成 3 个容器 IP，round-robin 分发。**不需要改代码**。

把数据库/Redis 独立到专用机器的改造（未来）：
1. `.env` 里加 `DATABASE_URL` / `REDIS_URL` 远程连接串
2. `docker-compose.yml` 删除 `postgres` / `redis` 两个 service
3. 每个应用节点只起 `backend + frontend + nginx + certbot`

---

## 5. 常见问题

**证书申请失败？**
1. `dig app.example.com +short` 看 DNS 指向
2. `curl -I http://app.example.com/.well-known/acme-challenge/test` 看 80 可达性
3. `docker compose logs certbot` 看具体错误
4. 频控：等 1h 再试

**前端能打开但 API 调用失败？**
1. DevTools Network 看请求 URL 是不是 `https://api.example.com`
2. 若不是，`API_DOMAIN` 变过但 bundle 没重 build：
   ```bash
   docker compose build frontend && docker compose up -d frontend
   ```
3. 直接 curl：`curl https://api.example.com/healthz`

**nginx 报 "cannot load certificate"？**
说明 `init-letsencrypt.sh` 没跑或跑失败。先看卷：
```bash
docker volume ls | grep letsencrypt
docker run --rm -v aethergate_letsencrypt:/etc/letsencrypt alpine \
    ls -la /etc/letsencrypt/live/
```
没有对应域名目录就重跑 `./init-letsencrypt.sh`。

**忘记管理员密码？**
```bash
docker compose exec postgres psql -U aethergate -d aethergate -c \
  "DELETE FROM users WHERE role = 'admin';"
# 改 .env 里 ADMIN_INITIAL_PASSWORD，重启 backend
docker compose up -d backend
```

**完全清空重来**：
```bash
docker compose down -v     # 同时删 pgdata / redisdata / letsencrypt
```
