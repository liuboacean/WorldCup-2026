# 2026世界杯实时比分系统 🏆

> 2026 FIFA World Cup Live Score System — Node.js + Express

基于 Node.js + Express 的 2026 世界杯实时比分、赛程、技术统计和 AI 预测系统。数据来源为 **worldcup26.ir**（免费赛程接口）和 **qiumibao.com**（直播吧/球球宝 API），完全免费，无需 API Key。

---

## 功能特性 ✨

| 功能 | 说明 |
|:----|:------|
| 📊 **实时比分** | 赛程列表、比赛状态（未开始/进行中/已结束）、实时比分更新 |
| 📋 **积分榜** | 小组积分、排名、净胜球、交锋记录 |
| 🏃 **首发阵容** | 足球场 SVG 阵容图、替补名单、阵型展示 |
| ⚽ **比赛事件** | 进球时间线、红黄牌、换人记录 |
| 📈 **技术统计** | 射门/射正/控球率/传球成功率/角球/犯规等 10 项统计 |
| 🖼️ **球员数据** | 48 队 1248 名球员中文名、照片、年龄、身价、俱乐部、国籍 |
| 🤖 **AI 预测** | 基于 DeepSeek API 的比赛结果预测，含分析摘要和关键因素 |
| 📜 **预测历史** | 每次预测永久保存，支持历史回顾 |

---

## 数据源架构 🔧

```
worldcup26.ir (赛程/积分榜)
    └── dataFetcher.js → 比赛数据
         ├── 主页面 (赛程列表)
         ├── 积分榜
         └── 比赛详情弹窗 → dataFetcherAlt.js
                                  └── zhiboFetcher.js (qiumibao API)
                                       ├── s.qiumibao.com       (比赛基本信息)
                                       ├── bifen4m.qiumibao.com (实时比分+进球)
                                       └── dc.qiumibao.com      (事件+技术统计+阵容)
```

**数据来源对比：**

| 数据源 | 费用 | 用途 | 限制 |
|:------|:----|:-----|:----|
| worldcup26.ir | 免费 | 赛程/比分/积分榜 | 赛中不实时更新 |
| qiumibao API | 免费 | 实时数据/统计/阵容 | 60 秒缓存 |
| DeepSeek API | ¥0.5/次 | AI 比赛预测 | 需自行配置 Key |

---

## 快速开始 🚀

### 前置要求

- Node.js >= 18
- npm

### 安装

```bash
# 克隆仓库
git clone git@github.com:liuboacean/WorldCup-2026.git
cd WorldCup-2026

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 DeepSeek API Key（如需 AI 预测功能）
```

> **DeepSeek API Key** 注册地址：https://platform.deepseek.com/
> 
> AI 预测为可选功能，不配置 Key 不影响其他功能运行。

### 启动

```bash
node server.js
```

访问 `http://localhost:3001`

### 使用 PM2 进程管理（推荐）

```bash
npm install -g pm2
# 创建 ecosystem.config.js 并配置 DEEPSEEK_API_KEY
pm2 start ecosystem.config.js
```

---

## 比赛 ID 映射 ⚙️

系统需要将 worldcup26.ir 的比赛 ID 映射到 qiumibao 的比赛 ID，映射文件位于 `data/zhibo_mapping.json`。

默认已包含 2 场比赛的映射：

| worldcup26.ir | qiumibao | 比赛 |
|:---:|:--------:|:-----|
| 1 | 1867414 | 墨西哥 vs 南非 |
| 2 | 1869142 | 韩国 vs 捷克 |

新比赛开赛前，需要添加映射。有两种方式：

1. **手动设置**：通过 API `POST /api/mapping` 或直接编辑 `data/zhibo_mapping.json`
2. **HE Agent Hub**：通过 WorkBuddy/Hermes 自动发现并注入映射（如部署在 WorkBuddy 生态中）

---

## API 接口 📡

| 方法 | 路径 | 说明 |
|:----|:-----|:------|
| GET | `/api/matches` | 全部比赛列表（支持筛选） |
| GET | `/api/matches/:id` | 单场比赛详情（含事件/统计/战报） |
| GET | `/api/matches/:id/lineups` | 首发阵容 |
| GET | `/api/matches/:id/events` | 比赛事件（进球/红黄牌/换人） |
| GET | `/api/matches/:id/stats` | 技术统计 |
| GET | `/api/standings` | 小组积分榜 |
| GET | `/api/live` | 进行中的比赛 |
| GET | `/api/stats` | 赛事统计 |
| GET | `/api/teams` | 球队列表 |
| GET | `/api/teams/:id/squad` | 球队阵容（球员列表） |
| GET | `/api/stadiums` | 球场列表 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/predict/:id` | AI 比赛预测 |
| GET | `/api/predict/history/:id` | 预测历史 |

---

## 项目结构 📁

```
WorldCup-2026/
├── server.js                    # Express 主入口
├── package.json
├── .env.example                 # 环境变量模板
├── config/
│   └── teamIdMapping.json       # 球队 ID 映射
├── routes/
│   └── api.js                   # REST API 路由（14 个端点）
├── services/
│   ├── dataFetcher.js           # worldcup26.ir 轮询 + 缓存
│   ├── dataFetcherAlt.js        # 增强数据（实时比分/事件）
│   ├── zhiboFetcher.js          # qiumibao API 封装（核心）
│   ├── lineupFetcher.js         # 阵容数据接口
│   ├── squadFetcher.js          # 球员名单
│   ├── predictionService.js     # AI 预测（DeepSeek API）
│   └── dataRelay.js             # 离线中继
├── public/
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── main.js              # 主页逻辑
│   │   ├── modal.js             # 比赛详情弹窗
│   │   ├── squad.js             # 球员阵容页
│   │   ├── standings.js         # 积分榜
│   │   ├── predictions.js       # AI 预测组件
│   │   └── filters.js           # 筛选组件
│   └── photos/                  # 球员照片（1092 张）
└── data/
    ├── fifaSquadData.json        # 合并球员数据（48 队 1248 人）
    ├── matches/                  # 比赛数据
    ├── predictions/              # AI 预测历史
    └── zhibo_mapping.json        # 比赛 ID 映射
```

---

## 技术栈 🛠️

| 层 | 技术 |
|:---|:-----|
| 前端 | 原生 HTML/CSS/JS + SVG 阵容图 |
| 后端 | Node.js + Express |
| 进程管理 | PM2 |
| 赛程数据 | worldcup26.ir（免费 API） |
| 实时数据 | qiumibao.com（直播吧 API，免费） |
| AI 预测 | DeepSeek API（可选） |
| 球员照片 | 本地存储（从 duoduocdn CDN 下载） |

---

## 许可证 📄

MIT
