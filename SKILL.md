---
name: worldcup-2026-scores
description: 一键部署2026世界杯实时比分系统，双数据源（worldcup26.ir + 直播吧），免API Key
agent_created: false
---

# 2026世界杯实时比分系统

一键部署完整的 **2026世界杯实时比分网站**。零成本、免API Key、双数据源。

## 一句话部署

```bash
git clone https://github.com/liuboacean/WorldCup-2026.git
cd WorldCup-2026
npm install
node server.js
# 打开 http://localhost:3001
```

## 特性

- ⏱️ **实时比分** — 比赛中自动刷新，主页和详情弹窗实时更新
- 🏆 **赛程积分榜** — 12个小组、48支球队完整赛程
- 🖼️ **球队阵容** — 48队球员中文名+头像+FIFA世界排名
- ⚽ **比赛详情** — 首发阵容(SVG)、事件时间线、技术统计
- 🇨🇳 **全中文** — 球队名、球员名、球场全部中文展示
- 🆓 **完全免费** — 无需任何 API Key

## 技术栈

Node.js + Express + Axios + 原生前端

## 数据源

| 数据源 | 用途 | 限制 |
|:-------|:-----|:-----|
| **worldcup26.ir** | 赛程/比分/积分榜 | 赛中不实时更新 |
| **直播吧(qiumibao)** | 实时数据/阵容/事件/统计 | 无限制 |

## 详细信息

见 [README.md](README.md)
