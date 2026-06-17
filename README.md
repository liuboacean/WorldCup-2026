# 2026世界杯实时比分系统 🏆

> **2026 FIFA World Cup Live Score System** — Node.js + Express
>
> 以两种免费数据源互补（worldcup26.ir + qiumibao/直播吧 API）构建的零成本世界杯实时比分站。支持实时比分、赛程赛果、积分榜、球队阵容（含球员头像+中文名+FIFA排名）、比赛详情（首发阵容、事件、技术统计）、AI 预测。

---

## 功能特性 ✨

| 功能 | 说明 |
|:----|:------|
| ⏱️ **实时比分** | 比赛中自动刷新比分、时间、进球事件，主页比赛卡片实时更新 |
| 📋 **积分榜** | 小组积分、排名、净胜球，支持分屏对比 |
| 🏃 **首发阵容** | 足球场 SVG 阵容图（按阵型排列）、球员号码/姓名/位置、替补名单 |
| ⚽ **比赛事件** | 进球时间线（带国旗）、红黄牌、换人记录，乌龙球自动标注 |
| 📈 **技术统计** | 射门/射正/控球率/传球成功率/角球/犯规等，双队百分比对比条 |
| 🖼️ **球员数据** | 48 队 1248+ 名球员中文名、照片（API-Football来源）、年龄、身价、俱乐部 |
| 🏆 **FIFA排名** | 阵容页显示球队 FIFA 世界排名（金色徽章） |
| 🏟️ **球场信息** | 16 座场馆信息（中文名+所在城市+时区） |
| 🤖 **AI 预测** | 基于 DeepSeek API 的比赛结果预测，含分析摘要、关键因素、信心指数 |
| 🌍 **全中文** | 球队名、球员名、球场名、技术统计全部中文展示 |
| 🔄 **双源合并** | worldcup26.ir + 直播吧 API 互补，自动去重、补全缺失数据 |

---

## 数据源架构 🔧

```
浏览器 (深色主题前端)
    ↓ fetch /api/* (30s 自动刷新)
Express 后端 :3001
    ├── dataFetcher.js  ── worldcup26.ir (赛程/比分/积分榜) ── 本地静态基础数据
    │                      └── 比赛日 5 分钟 / 非比赛日 30 分钟轮询
    │
    ├── zhiboFetcher.js ── 直播吧(qiumibao.com) 数据
    │    │                    ├── s.qiumibao.com       (比赛基本信息/阵型)
    │    │                    ├── bifen4m.qiumibao.com (实时比分+进球)
    │    │                    └── dc.qiumibao.com      (事件/技术统计/阵容)
    │    └── 60s 缓存 + 本地文件缓存
    │
    ├── dataFetcherAlt.js ── 双源合并增强
    │    └── mergeScorersIntoEvents()
    │         ├── 模糊分钟去重 (±2分钟容差)
    │         ├── 补全直播吧API缺失的进球事件
    │         └── 修复 team 字段以正确显示国旗
    │
    └── squadFetcher.js ── 球队阵容数据
         └── data/fifaSquadData.json (48 队球员数据)
              ├── PLAYER_NAME_ZH 映射 → 中文名
              ├── API-Football 照片 URL → 球员头像
              └── 主页面列表 async 增强 → 实时比分
```

**数据来源对比：**

| 数据源 | 费用 | 用途 | 特点 |
|:------|:----|:-----|:-----|
| **worldcup26.ir** | 免费 | 赛程/比分/积分榜 | 赛程完整，含 flagcdn 国旗，赛中不实时更新 |
| **qiumibao (直播吧)** | 免费 | 实时数据/阵容/统计/事件 | 实时更新，中文名，偶有进球事件缺失 |
| **API-Football** | 按量计费 | 球员照片 | 仅用于离线获取球员头像，不用于比赛数据 |
| **DeepSeek API** | ¥0.5/次 | AI 比赛预测 | 需自行配置 API Key |

---

## 快速开始 🚀

### 前置要求

- Node.js >= 18
- npm

### 安装

```bash
git clone git@github.com:liuboacean/WorldCup-2026.git
cd WorldCup-2026
npm install
```

### 启动

```bash
node server.js
```

访问 `http://localhost:3001`

### 使用 PM2 进程管理（推荐）

```bash
npm install -g pm2
pm2 start server.js --name worldcup-2026
pm2 save
pm2 startup
```

---

## API 接口 📡

| 方法 | 路径 | 说明 | 数据源 |
|:----|:-----|:-----|:-------|
| **GET** | `/api/matches` | 全部比赛列表（实时比分增强）| worldcup26.ir + zhibo8 |
| **GET** | `/api/matches/:id` | 单场比赛详情（事件/统计/战报） | worldcup26.ir + zhibo8 |
| **GET** | `/api/matches/:id/lineups` | 首发阵容 | zhibo8 |
| **GET** | `/api/matches/:id/events` | 比赛事件（进球/红黄牌/换人） | zhibo8 |
| **GET** | `/api/matches/:id/stats` | 技术统计 | zhibo8 |
| **GET** | `/api/standings` | 小组积分榜 | 本地静态数据 |
| **GET** | `/api/teams` | 球队列表（含FIFA排名） | 本地静态数据 |
| **GET** | `/api/teams/:id/squad` | 球队阵容（球员头像+中文名）| 本地 FIFA 数据 |
| **GET** | `/api/rankings` | 48队 FIFA 世界排名 | 本地静态数据 |
| **GET** | `/api/stadiums` | 球场列表 | 本地静态数据 |
| **GET** | `/api/health` | 健康检查 | — |
| **GET** | `/api/predict/:id` | AI 比赛预测 | DeepSeek API |

---

## 项目结构 📁

```
WorldCup-2026/
├── server.js                       # Express 主入口 (端口 3001)
├── package.json
├── ecosystem.config.js             # PM2 配置文件
├── routes/
│   └── api.js                      # REST API 路由 (含实时比分增强)
├── services/
│   ├── dataFetcher.js              # worldcup26.ir 轮询 + 静态数据加载
│   ├── dataFetcherAlt.js           # 双源合并（事件/统计/战报）
│   ├── zhiboFetcher.js             # 直播吧 API 封装（实时数据核心）
│   ├── squadFetcher.js             # 球队阵容（FIFA球员数据+中文名映射）
│   ├── lineupFetcher.js            # 阵容数据接口
│   ├── predictionService.js        # AI 预测 (DeepSeek)
│   └── dataRelay.js                # 离线请求中继
├── public/
│   ├── index.html                  # 单页应用入口
│   ├── css/style.css               # 深色主题 CSS
│   ├── js/
│   │   ├── main.js                 # 比赛列表渲染/筛选/自动刷新
│   │   ├── modal.js                # 比赛详情弹窗
│   │   ├── squad.js                # 球队阵容弹窗（含FIFA排名徽章）
│   │   ├── standings.js            # 积分榜渲染
│   │   ├── predictions.js          # AI 预测 UI
│   │   └── filters.js              # 筛选组件
│   └── photos/                     # 球员本地头像（按需）
├── static/                         # 基础数据（git跟踪，永不覆盖）
│   ├── static_teams.json           # 48支球队（含分组+国旗+排名）
│   ├── static_stadiums.json        # 16座球场（含时区）
│   ├── static_groups.json          # 12个小组积分榜
│   └── static_rankings.json        # 48队FIFA世界排名
├── cache/                          # 运行时缓存
│   ├── games.json                  # 比赛缓存
│   ├── teams.json                  # 球队缓存（含 flagcdn URL）
│   ├── groups.json                 # 积分榜缓存
│   └── stadiums.json               # 球场缓存
├── data/
│   ├── fifaSquadData.json          # 48队球员数据（姓名/号码/照片）
│   ├── matches/                    # 直播吧数据本地缓存
│   ├── predictions/                # AI 预测历史
│   ├── zhibo_mapping.json          # worldcup26.ir → 直播吧 matchId 映射
│   └── fifa_rankings.json          # FIFA排名数据（fallback）
└── config/
    └── teamIdMapping.json          # API-Football 球队ID映射
```

---

## 关键特性详解

### 1. 实时比分增强
主页 `/api/matches` 路由自动检测进行中的比赛，从 zhibo8 拉取实时比分：
- 30秒缓存避免频繁 API 调用
- 比分、状态（live/finished）、比赛时间（如"32′18″"）实时更新
- 未开始或已结束超过1小时的比赛跳过

### 2. 时区转换
16座球场分布3个国家4个时区，`localToBeijing()` 按球场ID分别转换：
- 🏟️ 墨西哥3座: UTC-6
- 🏟️ 美国东部4座: UTC-4
- 🏟️ 美国中部3座: UTC-5
- 🏟️ 美加西部4座: UTC-7

### 3. 基础数据本地化
`static/` 目录下的JSON文件是48队+12组+16球场的完整数据，git跟踪，永不覆盖：
- 避免 worldcup26.ir 网络问题导致国旗丢失
- 启动时从 `static/` 加载，`fetchAll()` 只拉取比赛数据

### 4. 球队阵容
- 26人完整名单，含球员编号、英文名、中文名、头像
- 头部显示 FIFA 世界排名（金色 `#XX` 徽章）
- 按位置分组（门将/后卫/中场/前锋）
- `PLAYER_NAME_ZH` 字典覆盖 700+ 条中文名映射

### 5. 数据合并与去重
`mergeScorersIntoEvents()` 处理直播吧API的进球缺失：
- 对比直播吧 events 和 worldcup26.ir scorers
- ±2分钟模糊匹配去重
- 自动补全进球事件，标记主客队

---

## 常见排查 🐛

| 问题 | 排查方向 |
|:-----|:---------|
| 国旗不显示 | `static/static_teams.json` 中 flag 字段是否为空 |
| 比赛时间不准 | 检查对应球场ID在 `localToBeijing()` 中的时区 |
| 阵容缺一支队 | 检查 `zhiboFetcher.js` 中主客队判断逻辑 |
| 球员无头像 | `data/fifaSquadData.json` 中 photo 字段是否为空 |
| 球员无中文名 | `squadFetcher.js` 中 `PLAYER_NAME_ZH` 映射是否覆盖 |
| 积分榜无名 | 检查 `static/static_groups.json` 中 name 字段 |
| 点击球队无反应 | 浏览器控制台检查 squad.js 是否有语法错误 |

---

## 技术栈 🛠️

| 层 | 技术 |
|:---|:------|
| **前端** | 原生 HTML/CSS/JS + SVG 阵容图 + 深色主题 |
| **后端** | Node.js + Express 4.x |
| **进程管理** | PM2 7.x |
| **HTTP 客户端** | Axios 1.x |
| **定时任务** | node-cron 3.x |
| **赛程数据** | worldcup26.ir（免费 API，5 分钟轮询） |
| **实时数据** | qiumibao.com（直播吧 API，60s 缓存） |
| **球员照片** | API-Football CDN |
| **球队国旗** | flagcdn.com CDN |
| **AI 预测** | DeepSeek API（可选，¥0.5/次） |

---

## 许可证 📄

MIT
