# 部署指南（Ubuntu + 宿主机 nginx + Docker Compose）

## 架构

```
           ┌─────────────────────────┐
           │    宿主机 nginx + certbot │  ← apt 装，systemctl 管
           │    (/etc/nginx)          │
           └─┬─────────────┬─────────┘
             │             │
             │ 静态文件      │ proxy_pass 127.0.0.1:3000
             ▼             ▼
      /var/www/aethergate  ┌───────── docker compose ─────────┐
                            │  backend (127.0.0.1:3000)        │
                            │  postgres (127.0.0.1:5432)       │
                            │  redis    (127.0.0.1:6379)       │
                            └───────────────────────────────────┘
```

- nginx/TLS 在宿主机 — `nginx -t` / `systemctl reload nginx` / `certbot renew` 都是标准操作
- 应用层容器化，端口全部绑 127.0.0.1，唯一入口是宿主 nginx
- 前端 Vite build 产物直接 rsync 到 `/var/www/aethergate`，nginx 静态 root

---

## 1. 准备工作

### 1.1 DNS 解析

| Host | Type | Value |
|---|---|---|
| `app.example.com` (前端) | A | 服务器公网 IP |
| `api.example.com` (后端) | A | 服务器公网 IP |

`dig app.example.com +short` 能返回对的 IP 再继续。

### 1.2 服务器安装基础软件

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER          # 退出重登生效

# nginx + certbot + rsync
sudo apt update
sudo apt install -y nginx python3-certbot-nginx rsync

# Node.js 20 + pnpm（用来 build 前端）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
```

### 1.3 防火墙

```bash
sudo ufw allow 'Nginx Full'    # 80 + 443
sudo ufw enable
```

云厂商安全组同样放行 80、443。

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

⚠️ **`JWT_SECRET` 和 `ENCRYPTION_KEY` 一经设置不要再改**：
- 改 `JWT_SECRET` → 所有登录失效
- 改 `ENCRYPTION_KEY` → 存储的渠道 API Key / 支付密钥无法解密

### 2.2 起后端栈

```bash
cd cool_api/deploy
docker compose up -d --build        # 首次 build 5-8 分钟
docker compose logs -f backend
```

验证后端可达：

```bash
curl http://127.0.0.1:3000/healthz    # -> {"status":"ok"}
```

### 2.3 构建前端并部署

```bash
cd cool_api
chmod +x deploy/build-frontend.sh
./deploy/build-frontend.sh
```

构建产物会落到 `/var/www/aethergate`。

### 2.4 配置宿主机 nginx

```bash
cd cool_api/deploy
sudo cp nginx-aethergate.conf /etc/nginx/sites-available/aethergate.conf

# 替换模板里的域名占位符
sudo sed -i \
    -e "s/app\.example\.com/$(grep WEB_DOMAIN .env | cut -d= -f2)/g" \
    -e "s/api\.example\.com/$(grep API_DOMAIN .env | cut -d= -f2)/g" \
    /etc/nginx/sites-available/aethergate.conf

sudo ln -sf /etc/nginx/sites-available/aethergate.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 2.5 申请 TLS 证书

```bash
sudo certbot --nginx \
    -d app.example.com \
    -d api.example.com \
    --email you@example.com \
    --agree-tos --no-eff-email \
    --redirect
```

certbot 会：
1. 通过 :80 的 HTTP-01 挑战拿到证书
2. 自动改写 `/etc/nginx/sites-available/aethergate.conf` 加上 :443 ssl 段
3. 加 80→443 跳转
4. 安装 systemd timer 每天 2 次自动续期

### 2.6 访问

- 前端：`https://app.example.com`
- API 健康：`https://api.example.com/healthz` → `{"status":"ok"}`
- 用 `.env` 里的 `ADMIN_INITIAL_USERNAME / PASSWORD` 登录管理后台

---

## 3. 日常操作

### 3.1 查看日志

```bash
docker compose logs -f backend          # 应用日志
sudo tail -f /var/log/nginx/access.log  # 访问日志
sudo tail -f /var/log/nginx/error.log   # nginx 错误
sudo journalctl -u certbot.timer        # 证书续期
```

### 3.2 更新代码

```bash
cd cool_api
git pull

# 后端
cd deploy
docker compose build backend
docker compose up -d backend

# 前端（如果有改动）
cd ..
./deploy/build-frontend.sh

# 若改了 nginx 配置
sudo cp deploy/nginx-aethergate.conf /etc/nginx/sites-available/aethergate.conf
sudo nginx -t && sudo systemctl reload nginx
```

后端有新 migration 启动时自动跑。

### 3.3 数据库备份

```bash
docker compose exec -T postgres \
    pg_dump -U $(grep POSTGRES_USER deploy/.env | cut -d= -f2) \
            $(grep POSTGRES_DB deploy/.env | cut -d= -f2) \
  | gzip > backup-$(date +%Y%m%d).sql.gz
```

### 3.4 证书续期

certbot 自带 systemd timer，**全自动**。手动触发：

```bash
sudo certbot renew --dry-run      # 验证流程
sudo certbot renew                # 实际续期（到期 <30d 才动）
```

### 3.5 进 DB / Redis 调试

```bash
docker compose exec postgres psql -U aethergate -d aethergate
docker compose exec redis redis-cli
```

也可以从宿主机直接连（端口已绑 127.0.0.1）：

```bash
psql -h 127.0.0.1 -U aethergate -d aethergate
redis-cli -h 127.0.0.1
```

---

## 4. 扩展到多节点

**所有后端节点共享同一套 Postgres + Redis**。

### 单机内多副本（水平扩展同一台机）

默认 `docker-compose.yml` 里 backend 映射了 `127.0.0.1:3000`，`BACKEND_REPLICAS>1` 时端口冲突。改造：

1. `docker-compose.yml` 里给 backend 改成 `expose` 而不是 `ports`，让容器彼此可达但不绑宿主
2. 新增一个 haproxy / 轻量 nginx 容器监听 `127.0.0.1:3000`，upstream 写 docker DNS `backend:3000`（会 round-robin）
3. 宿主 nginx 不变

### 多服务器节点

每台应用节点起自己的 docker compose（只含 backend），`.env` 里：

```
DATABASE_URL=postgres://...@<中央 DB 地址>:5432/aethergate
REDIS_URL=redis://<中央 Redis 地址>:6379
```

把 `docker-compose.yml` 里的 `postgres` 和 `redis` 两个 service 删掉。宿主 nginx 的 upstream 添加多台机器的 IP 做负载均衡。

---

## 5. 常见问题

**certbot 申请失败？**
1. `dig app.example.com +short` 看 DNS
2. `curl -I http://app.example.com` 看 80 外网可达
3. `sudo tail -50 /var/log/letsencrypt/letsencrypt.log`
4. 频控：一周同一域名失败超 5 次锁 1h

**前端能打开但 API 调用失败？**
1. DevTools Network 看请求目标是不是 `https://api.example.com`
2. 若不对：`.env` 里的 `API_DOMAIN` 改过之后要**重 build 前端**：`./deploy/build-frontend.sh`
3. 直接 curl：`curl https://api.example.com/healthz`

**nginx 报 502 Bad Gateway？**
1. `docker compose ps` 看 backend 是否 up
2. `curl http://127.0.0.1:3000/healthz` 从宿主机直连
3. `docker compose logs --tail=100 backend` 看错误

**忘记管理员密码？**
```bash
docker compose exec postgres psql -U aethergate -d aethergate -c \
  "DELETE FROM users WHERE role = 'admin';"
# .env 里改 ADMIN_INITIAL_PASSWORD，重启 backend 会重建 admin
docker compose up -d backend
```

**完全清空重来**：
```bash
docker compose down -v                   # 删 pgdata + redisdata
sudo rm -rf /var/www/aethergate          # 删静态文件
sudo rm /etc/nginx/sites-enabled/aethergate.conf
sudo systemctl reload nginx
```
