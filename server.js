require("dotenv").config();
/**
 * server.js - Express 主入口
 *
 * 2026世界杯实时比分系统 - 后端服务器
 *
 * 端口: 从 PORT 环境变量读取，默认 3001
 * 静态文件: ./public 目录
 * API 路由: /api/*
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// ==== 配置 ====
const PORT = process.env.PORT || 3001;
const app = express();

// ==== 中间件 ====
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ==== 静态文件 ====
app.use(express.static(path.join(__dirname, 'public')));

// ==== API 路由 ====
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

// ==== 根路由 ====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==== 404 处理 ====
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `路径 ${req.url} 不存在`
  });
});

// ==== 错误处理 ====
app.use((err, req, res, next) => {
  console.error('[Server] 未捕获错误:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'
  });
});

// ==== 启动数据轮询 ====
const dataFetcher = require('./services/dataFetcher');
const dataFetcherAlt = require('./services/dataFetcherAlt');

// 注册数据更新回调：数据拉取完成后自动触发红黄牌检查
dataFetcher.onDataUpdate(({ games }) => {
  if (games && games.length > 0) {
    dataFetcherAlt.checkAndFetchFinished(games);
  }
});

// 启动主数据源轮询
dataFetcher.startPolling();

// ==== 启动服务器 ====
app.listen(PORT, '0.0.0.0', () => {
  console.log('============================================');
  console.log('  2026 FIFA World Cup - 实时比分系统');
  console.log('============================================');
  console.log(`  服务器: http://localhost:${PORT}`);
  console.log(`  API:    http://localhost:${PORT}/api/health`);
  console.log(`  静态:   http://localhost:${PORT}/`);
  console.log(`  PID:    ${process.pid}`);
  console.log('============================================');
});

// ==== 优雅关闭 ====
process.on('SIGTERM', () => {
  console.log('[Server] 收到 SIGTERM 信号，优雅关闭...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] 收到 SIGINT 信号，优雅关闭...');
  process.exit(0);
});

module.exports = app;
