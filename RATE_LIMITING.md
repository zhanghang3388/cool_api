# 限流策略配置指南

## 概述

本系统实现了**三层限流策略**，提供灵活的流量控制：

1. **全局限流** - 保护整个系统不被过载
2. **API Key限流** - 为不同的API密钥设置不同的限制
3. **用户限流** - 为每个用户设置个性化的限制

## 限流层级

```
请求 → 全局限流 → API Key限流 → 用户限流 → 处理请求
         ↓            ↓             ↓
      拒绝(429)    拒绝(429)     拒绝(429)
```

## 配置方式

### 1. 全局限流（可选）

通过环境变量配置，限制整个系统的总请求数：

```bash
# .env
GLOBAL_RPM_LIMIT=10000  # 全局每分钟10000次请求
```

**使用场景：**
- 保护服务器不被过载
- 控制对上游API的总调用量
- 防止成本失控

**不设置则无全局限流。**

### 2. 用户默认限流

通过环境变量配置默认的用户限流：

```bash
# .env
DEFAULT_USER_RPM_LIMIT=60  # 默认每个用户每分钟60次请求
```

**说明：**
- 这是所有用户的默认限制
- 可以在数据库中为特定用户覆盖此值
- 默认值：60 RPM

### 3. 用户自定义限流

通过管理员API为特定用户设置限流：

```bash
# 为用户设置100 RPM的限制
PATCH /api/admin/users/{user_id}
Content-Type: application/json
Authorization: Bearer {admin_token}

{
  "rpm_limit": 100
}

# 移除用户自定义限制（使用默认值）
PATCH /api/admin/users/{user_id}
Content-Type: application/json
Authorization: Bearer {admin_token}

{
  "rpm_limit": null
}
```

**优先级：**
- 如果用户设置了 `rpm_limit`，使用该值
- 否则使用 `DEFAULT_USER_RPM_LIMIT`

### 4. API Key限流

在创建或更新relay_key时设置：

```bash
# 创建API key时设置限流
POST /api/client/keys
Content-Type: application/json
Authorization: Bearer {user_token}

{
  "name": "My API Key",
  "rpm_limit": 50  # 这个key每分钟最多50次请求
}

# 更新API key的限流
PATCH /api/client/keys/{key_id}
Content-Type: application/json
Authorization: Bearer {user_token}

{
  "rpm_limit": 100
}
```

## 限流优先级和组合

限流是**累加检查**的，所有层级都必须通过：

### 示例1：免费用户
```
全局限流: 10000 RPM (所有用户共享)
用户限流: 10 RPM (数据库设置)
API Key限流: 未设置

结果：该用户最多 10 RPM
```

### 示例2：付费用户
```
全局限流: 10000 RPM
用户限流: 1000 RPM (数据库设置)
API Key限流: 500 RPM (某个key的设置)

结果：
- 该用户所有key合计最多 1000 RPM
- 该特定key最多 500 RPM
```

### 示例3：VIP用户
```
全局限流: 未设置
用户限流: 5000 RPM
API Key限流: 未设置

结果：该用户最多 5000 RPM，无全局限制
```

## 限流响应

当请求被限流时，返回：

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 45
Content-Type: application/json

{
  "error": {
    "code": 429,
    "message": "User rate limit exceeded. Retry after 45s"
  }
}
```

**错误消息类型：**
- `Global rate limit exceeded` - 全局限流
- `API key rate limit exceeded` - API Key限流
- `User rate limit exceeded` - 用户限流

## 管理员操作

### 查看用户信息（包含rpm_limit）

```bash
GET /api/admin/users/{user_id}
Authorization: Bearer {admin_token}
```

响应：
```json
{
  "id": "uuid",
  "username": "user123",
  "email": "user@example.com",
  "role": "client",
  "balance": 1000000,
  "rpm_limit": 100,  // 用户自定义限流
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 批量设置用户限流

```bash
# 为所有免费用户设置10 RPM
# 为所有付费用户设置100 RPM
# 需要自己编写脚本或SQL
```

SQL示例：
```sql
-- 为所有普通用户设置60 RPM
UPDATE users SET rpm_limit = 60 WHERE role = 'client' AND rpm_limit IS NULL;

-- 为特定用户设置1000 RPM
UPDATE users SET rpm_limit = 1000 WHERE username = 'vip_user';

-- 移除用户的自定义限流（使用默认值）
UPDATE users SET rpm_limit = NULL WHERE username = 'some_user';
```

## 监控和调试

### 查看限流日志

限流事件会记录在 `request_logs` 表中：

```sql
SELECT 
    created_at,
    user_id,
    relay_key_id,
    status_code,
    error_message
FROM request_logs
WHERE status_code = 429
ORDER BY created_at DESC
LIMIT 100;
```

### 查看用户的请求频率

```sql
SELECT 
    user_id,
    COUNT(*) as request_count,
    COUNT(*) FILTER (WHERE status_code = 429) as rate_limited_count
FROM request_logs
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY user_id
ORDER BY request_count DESC;
```

## 最佳实践

### 1. 分层设置

```
全局限流: 10000 RPM (保护系统)
  ├─ 免费用户: 10 RPM
  ├─ 基础用户: 60 RPM (默认)
  ├─ 专业用户: 300 RPM
  └─ 企业用户: 1000 RPM
```

### 2. API Key限流

为不同用途的key设置不同限制：
- 开发测试key: 10 RPM
- 生产key: 100 RPM
- 批量处理key: 500 RPM

### 3. 渐进式限流

新用户：
1. 注册时：10 RPM
2. 验证邮箱后：60 RPM
3. 付费后：300 RPM
4. 企业客户：1000+ RPM

### 4. 监控告警

设置告警：
- 全局限流触发率 > 5%
- 单个用户频繁触发限流
- 某个时段限流激增

## 常见问题

### Q: 如何临时提高某个用户的限流？

```bash
PATCH /api/admin/users/{user_id}
{
  "rpm_limit": 500  # 临时提高到500 RPM
}
```

### Q: 如何完全禁用某个用户的访问？

```bash
PATCH /api/admin/users/{user_id}
{
  "is_active": false  # 禁用账户
}
```

### Q: 限流是基于什么时间窗口的？

使用**滑动窗口**算法，窗口大小为60秒。比如：
- 10:00:00 - 10:00:59 这60秒内的请求数
- 每次请求都会检查过去60秒的请求数

### Q: 如何查看当前的限流配置？

```bash
# 查看环境变量
echo $DEFAULT_USER_RPM_LIMIT
echo $GLOBAL_RPM_LIMIT

# 查看用户配置
GET /api/admin/users/{user_id}
```

### Q: 限流会影响性能吗？

- 使用内存中的DashMap，性能很高
- 每分钟自动清理过期数据
- 对正常请求几乎无影响

## 配置示例

### 小型项目（< 1000用户）

```bash
DEFAULT_USER_RPM_LIMIT=60
# 不设置GLOBAL_RPM_LIMIT
```

### 中型项目（1000-10000用户）

```bash
DEFAULT_USER_RPM_LIMIT=60
GLOBAL_RPM_LIMIT=10000
```

### 大型项目（> 10000用户）

```bash
DEFAULT_USER_RPM_LIMIT=30
GLOBAL_RPM_LIMIT=50000

# 为VIP用户单独设置更高的限制
# 通过管理员API或SQL批量更新
```

## 总结

三层限流策略提供了：
- ✅ 灵活性：可以为不同用户设置不同限制
- ✅ 安全性：防止系统过载和滥用
- ✅ 可扩展性：支持从小型到大型项目
- ✅ 易管理：通过API和数据库轻松配置

根据你的业务需求选择合适的配置策略！
