#!/usr/bin/env bash
# 2026世界杯实时比分系统 - 一键部署脚本
# 用法: bash scripts/setup.sh

set -e

echo "======================================"
echo " 2026世界杯实时比分系统 - 一键部署"
echo "======================================"

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 需要 Node.js >= 18"
    exit 1
fi

echo "✅ Node.js $(node -v)"

# 安装依赖
echo "📦 安装依赖..."
npm install

# 创建目录
mkdir -p data/matches cache

# 启动
PORT=${1:-3001}
echo "🚀 启动服务器 (端口 $PORT)..."
nohup node server.js > server.log 2>&1 &
sleep 3

# 验证
if curl -s http://localhost:$PORT/api/health &>/dev/null; then
    echo "✅ 部署成功！访问 http://localhost:$PORT"
else
    echo "❌ 启动失败，查看日志: cat server.log"
    exit 1
fi
