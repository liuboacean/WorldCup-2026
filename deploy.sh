#!/bin/bash
#
# deploy.sh - 2026世界杯实时比分系统部署脚本
#
# 用法:
#   ./deploy.sh              # 部署到本机
#   ./deploy.sh --install    # 首次安装（安装依赖+PM2）
#   ./deploy.sh --restart    # 重启服务
#   ./deploy.sh --stop       # 停止服务
#   ./deploy.sh --logs       # 查看日志
#   ./deploy.sh --status     # 查看状态
#

set -e

# ==== 配置 ====
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="worldcup-2026"
PORT="${PORT:-3001}"
NODE_ENV="${NODE_ENV:-production}"

echo "============================================"
echo "  2026 FIFA World Cup - 部署脚本"
echo "============================================"
echo "  目录: ${APP_DIR}"
echo "  端口: ${PORT}"
echo "  环境: ${NODE_ENV}"
echo "============================================"
echo ""

# ==== 函数 ====

check_dependencies() {
  echo "[部署] 检查依赖..."

  # 检查 Node.js
  if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js v18+"
    echo "  macOS: brew install node"
    echo "  Linux: apt install nodejs"
    exit 1
  fi
  echo "  Node.js: $(node -v)"

  # 检查 npm
  if ! command -v npm &> /dev/null; then
    echo "[错误] 未找到 npm"
    exit 1
  fi
  echo "  npm: $(npm -v)"

  # 检查 PM2
  if command -v pm2 &> /dev/null; then
    echo "  PM2: $(pm2 -v)"
    HAS_PM2=true
  else
    echo "  PM2: 未安装"
    HAS_PM2=false
  fi
}

install_dependencies() {
  echo "[部署] 安装项目依赖..."
  cd "${APP_DIR}"
  npm install --production
  echo "[部署] 依赖安装完成"
}

install_pm2() {
  if [ "$HAS_PM2" = false ]; then
    echo "[部署] 安装 PM2..."
    npm install -g pm2
    echo "[部署] PM2 安装完成"
  fi
}

create_cache_dir() {
  mkdir -p "${APP_DIR}/cache"
  echo "[部署] 缓存目录已就绪"
}

start_service() {
  echo "[部署] 启动服务..."

  if [ "$HAS_PM2" = true ]; then
    cd "${APP_DIR}"
    PORT="${PORT}" NODE_ENV="${NODE_ENV}" pm2 start server.js \
      --name "${APP_NAME}" \
      --watch \
      --ignore-watch="cache" \
      --max-memory-restart "200M" \
      --log-date-format "YYYY-MM-DD HH:mm:ss" \
      --output "${APP_DIR}/logs/out.log" \
      --error "${APP_DIR}/logs/err.log"
    echo "[部署] PM2 服务已启动"
    pm2 save
  else
    echo "[部署] 使用 nohup 启动 (建议安装 PM2)"
    nohup node "${APP_DIR}/server.js" > "${APP_DIR}/logs/app.log" 2>&1 &
    echo "[部署] PID: $!"
  fi

  echo "[部署] 访问地址: http://localhost:${PORT}"
}

stop_service() {
  echo "[部署] 停止服务..."
  if command -v pm2 &> /dev/null; then
    pm2 stop "${APP_NAME}" 2>/dev/null || true
    echo "[部署] PM2 服务已停止"
  else
    pkill -f "node.*server.js" 2>/dev/null || true
    echo "[部署] 进程已停止"
  fi
}

restart_service() {
  echo "[部署] 重启服务..."
  if command -v pm2 &> /dev/null; then
    pm2 restart "${APP_NAME}" 2>/dev/null || start_service
    echo "[部署] PM2 服务已重启"
  else
    stop_service
    sleep 1
    start_service
  fi
}

show_status() {
  echo "[部署] 服务状态:"
  if command -v pm2 &> /dev/null; then
    pm2 show "${APP_NAME}" 2>/dev/null || echo "  PM2: 服务未运行"
  fi

  # 健康检查
  if curl -s "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
    echo "  HTTP: 服务正常 (端口 ${PORT})"
    curl -s "http://localhost:${PORT}/api/health" | python3 -m json.tool 2>/dev/null || true
  else
    echo "  HTTP: 服务未响应"
  fi
}

show_logs() {
  if command -v pm2 &> /dev/null; then
    pm2 logs "${APP_NAME}" --lines 30
  else
    tail -30 "${APP_DIR}/logs/app.log" 2>/dev/null || echo "  无日志文件"
  fi
}

# ==== 主流程 ====

# 创建日志目录
mkdir -p "${APP_DIR}/logs"

# 参数处理
case "${1:-}" in
  --install)
    check_dependencies
    install_dependencies
    install_pm2
    create_cache_dir
    start_service
    ;;
  --restart)
    restart_service
    ;;
  --stop)
    stop_service
    ;;
  --logs)
    show_logs
    ;;
  --status)
    show_status
    ;;
  --help)
    echo "用法: $0 [选项]"
    echo "  无参数    部署到本机"
    echo "  --install 首次安装（安装依赖+PM2）"
    echo "  --restart 重启服务"
    echo "  --stop    停止服务"
    echo "  --logs    查看日志"
    echo "  --status  查看状态"
    echo "  --help    显示帮助"
    ;;
  *)
    # 默认：部署
    check_dependencies
    install_dependencies
    create_cache_dir
    start_service
    show_status
    ;;
esac

echo ""
echo "============================================"
echo "  部署操作完成"
echo "============================================"
