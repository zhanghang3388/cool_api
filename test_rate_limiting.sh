#!/bin/bash

# 限流功能测试脚本

BASE_URL="http://localhost:3000"
ADMIN_TOKEN=""
USER_TOKEN=""
API_KEY=""

echo "=== 限流功能测试 ==="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 管理员登录
echo "1. 管理员登录..."
ADMIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | jq -r '.access_token')
if [ "$ADMIN_TOKEN" != "null" ]; then
  echo -e "${GREEN}✓ 管理员登录成功${NC}"
else
  echo -e "${RED}✗ 管理员登录失败${NC}"
  exit 1
fi

# 2. 创建测试用户
echo ""
echo "2. 创建测试用户..."
USER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser_'$(date +%s)'",
    "email": "test'$(date +%s)'@example.com",
    "password": "Test1234"
  }')

USER_TOKEN=$(echo $USER_RESPONSE | jq -r '.access_token')
USER_ID=$(echo $USER_RESPONSE | jq -r '.user.id')

if [ "$USER_TOKEN" != "null" ]; then
  echo -e "${GREEN}✓ 用户创建成功 (ID: $USER_ID)${NC}"
else
  echo -e "${RED}✗ 用户创建失败${NC}"
  exit 1
fi

# 3. 为用户设置低限流（5 RPM）
echo ""
echo "3. 设置用户限流为 5 RPM..."
curl -s -X PATCH "$BASE_URL/api/admin/users/$USER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "rpm_limit": 5
  }' > /dev/null

echo -e "${GREEN}✓ 限流设置完成${NC}"

# 4. 创建API Key
echo ""
echo "4. 创建API Key..."
KEY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/client/keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{
    "name": "Test Key"
  }')

API_KEY=$(echo $KEY_RESPONSE | jq -r '.key')
if [ "$API_KEY" != "null" ]; then
  echo -e "${GREEN}✓ API Key创建成功${NC}"
  echo "  Key: ${API_KEY:0:20}..."
else
  echo -e "${RED}✗ API Key创建失败${NC}"
  exit 1
fi

# 5. 测试限流
echo ""
echo "5. 测试限流（发送10次请求，限制5 RPM）..."
echo ""

SUCCESS_COUNT=0
RATE_LIMITED_COUNT=0

for i in {1..10}; do
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d '{
      "model": "gpt-3.5-turbo",
      "messages": [{"role": "user", "content": "Hello"}]
    }')

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "  请求 $i: ${GREEN}✓ 成功 (200)${NC}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ "$HTTP_CODE" = "429" ]; then
    RETRY_AFTER=$(echo "$RESPONSE" | grep -o '"message":"[^"]*"' | grep -o '[0-9]\+s' | grep -o '[0-9]\+')
    echo -e "  请求 $i: ${YELLOW}⚠ 限流 (429) - Retry after ${RETRY_AFTER}s${NC}"
    RATE_LIMITED_COUNT=$((RATE_LIMITED_COUNT + 1))
  else
    echo -e "  请求 $i: ${RED}✗ 错误 ($HTTP_CODE)${NC}"
  fi

  sleep 0.1
done

# 6. 结果统计
echo ""
echo "=== 测试结果 ==="
echo "成功请求: $SUCCESS_COUNT"
echo "被限流: $RATE_LIMITED_COUNT"
echo ""

if [ $SUCCESS_COUNT -le 5 ] && [ $RATE_LIMITED_COUNT -ge 4 ]; then
  echo -e "${GREEN}✓ 限流功能正常工作！${NC}"
  echo "  前5个请求成功，后续请求被限流"
else
  echo -e "${YELLOW}⚠ 限流结果异常${NC}"
  echo "  预期：前5个成功，后5个被限流"
  echo "  实际：$SUCCESS_COUNT 成功，$RATE_LIMITED_COUNT 被限流"
fi

# 7. 测试用户级限流更新
echo ""
echo "7. 更新用户限流为 100 RPM..."
curl -s -X PATCH "$BASE_URL/api/admin/users/$USER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "rpm_limit": 100
  }' > /dev/null

echo -e "${GREEN}✓ 限流已更新${NC}"

# 8. 等待60秒后重新测试
echo ""
echo "8. 等待5秒后测试新限流..."
sleep 5

SUCCESS_COUNT_2=0
for i in {1..10}; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d '{
      "model": "gpt-3.5-turbo",
      "messages": [{"role": "user", "content": "Hello"}]
    }')

  if [ "$HTTP_CODE" = "200" ]; then
    SUCCESS_COUNT_2=$((SUCCESS_COUNT_2 + 1))
  fi

  sleep 0.1
done

echo "新限流下成功请求: $SUCCESS_COUNT_2 / 10"

if [ $SUCCESS_COUNT_2 -ge 8 ]; then
  echo -e "${GREEN}✓ 限流更新生效！${NC}"
else
  echo -e "${YELLOW}⚠ 限流更新可能未完全生效${NC}"
fi

echo ""
echo "=== 测试完成 ==="
