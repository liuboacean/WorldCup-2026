# 2026世界杯实时比分系统 🏆

> **2026 FIFA World Cup Live Score System** — Node.js + Express
>
> 以两种免费数据源互补（worldcup26.ir + qiumibao/直播吧 API）构建的零成本世界杯实时比分站，支持赛程浏览、比赛事件时间线、技术统计、首发阵容 SVG 可视化、AI 预测。

---

## 功能特性 ✨

| 功能 | 说明 |
|:----|:------|
| 📊 **实时比分** | 赛程列表、比赛状态（未开始/进行中/已结束）、实时比分更新，每 30 秒自动刷新 |
| 📋 **积分榜** | 小组积分、排名、净胜球，支持分屏对比 |
| 🏃 **首发阵容** | 足球场 SVG 阵容图（按阵型排列）、球员号码/姓名/位置、替补名单 |
| ⚽ **比赛事件** | 进球时间线（带国旗）、红黄牌、换人记录，**乌龙球自动标注** |
| 📈 **技术统计** | 射门/射正/控球率/传球成功率/角球/犯规等 10 项统计，双队百分比对比条 |
| 🖼️ **球员数据** | 48 队 1248 名球员中文名、照片、年龄、身价、俱乐部、国籍 |
| 🏟️ **球场信息** | 12 座场馆信息（中文名+所在城市） |
| 🤖 **AI 预测** | 基于 DeepSeek API 的比赛结果预测，含分析摘要、关键因素、信心指数 |
| 📜 **预测历史** | 每次预测永久保存，支持回顾 |
| 🌍 **多语言队名** | 球队显示中文名 + 国旗（flagcdn.com），进球事件优先使用中文球员名 |
| 🔄 **双源合并** | worldcup26.ir + 直播吧 API 互补，自动去重、补全缺失数据 |

---

## 数据源架构 🔧

```
浏览器 (深色主题前端)
    ↓ fetch /api/* (30s 自动刷新)
Express 后端 :3001
    ├── dataFetcher.js  ── worldcup26.ir (赛程/比分/积分榜)
    │                      └── 5 分钟轮询 + JSON 文件缓存
    │
    └── dataFetcherAlt.js ── zhiboFetcher.js (直播吧数据)
           │                                        │
           │                                        ├── s.qiumibao.com       (比赛基本信息/阵型)
           │                                        ├── bifen4m.qiumibao.com (实时比分+进球)
           │                                        └── dc.qiumibao.com      (事件/技术统计/阵容)
           │
           └── mergeScorersIntoEvents()
                └── 自动合并 worldcup26.ir 的进球数据
                     ├── 模糊分钟去重 (±2分钟容差)
                     ├── 补全直播吧API缺失的进球事件
                     └── 修复 team 字段以正确显示国旗
```

**数据来源对比：**

| 数据源 | 费用 | 用途 | 特点 | 限制 |
|:------|:----|:-----|:-----|:-----|
| **worldcup26.ir** | 免费 | 赛程/比分/积分榜 | 赛程完整，含球队 flagcdn 国旗 | 赛中不实时更新，球员名常为阿拉伯语 |
| **qiumibao API** (直播吧) | 免费 | 实时数据/统计/阵容/事件 | 实时更新，中文名，含技术统计 | 偶有进球事件缺失 |
| **DeepSeek API** | ¥0.5/次 | AI 比赛预测 | 基于双方历史数据生成分析 | 需自行配置 API Key |

### 数据合并策略

当直播吧API缺失进球事件时，系统自动从 worldcup26.ir 补全：

1. 检查直播吧 events 已有的进球分钟数
2. 匹配 worldcup26.ir 的 scorers 数据
3. 模糊去重（±2分钟），防止同一进球被重复添加
4. 自动设置 team='home'/'away'，保证国旗正确显示
5. 优先使用直播吧数据源的中文球员名

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
```

### 启动

```bash
node server.js
```

打开浏览器访问 `http://localhost:3001`

### 使用 PM2 进程管理（推荐）

```bash
npm install -g pm2
pm2 start server.js --name worldcup-2026
pm2 save
pm2 startup   # 开机自启
```

---

## 比赛 ID 映射 ⚙️

系统需要将 worldcup26.ir 的比赛 ID 映射到 qiumibao 的比赛 ID，映射文件位于 `data/zhibo_mapping.json`。

目前已包含 **68 场小组赛**的完整映射（ID 1-68）。

映射可通过以下方式管理：
1. **API 查询**：`GET /api/mapping` 查看当前所有映射
2. **API 设置**：`POST /api/mapping` 添加新映射（`{ wcMatchId, zhiboId }`）
3. **直接编辑**：修改 `data/zhibo_mapping.json`
4. **自动发现**：通过 HE Agent Hub 自动发现并注入

---

## API 接口 📡

| 方法 | 路径 | 说明 |
|:----|:-----|:------|
| **GET** | `/api/matches` | 全部比赛列表（支持 `?group=&date=&status=` 筛选） |
| **GET** | `/api/matches/:id` | 单场比赛详情（含事件/统计/战报/阵容） |
| **GET** | `/api/matches/:id/lineups` | 首发阵容 |
| **GET** | `/api/matches/:id/events` | 比赛事件（进球/红黄牌/换人） |
| **GET** | `/api/matches/:id/stats` | 技术统计 |
| **GET** | `/api/standings` | 小组积分榜 |
| **GET** | `/api/live` | 进行中的比赛 |
| **GET** | `/api/stats` | 赛事统计 |
| **GET** | `/api/teams` | 球队列表 |
| **GET** | `/api/teams/:id/squad` | 球队阵容（球员列表） |
| **GET** | `/api/stadiums` | 球场列表 |
| **GET** | `/api/health` | 健康检查 |
| **GET** | `/api/predict/:id` | AI 比赛预测 |
| **GET** | `/api/predict/history/:id` | 预测历史 |

---

## 项目结构 📁

```
WorldCup-2026/
├── server.js                       # Express 主入口 (端口 3001)
├── package.json
├── ecosystem.config.js             # PM2 配置文件
├── routes/
│   └── api.js                      # REST API 路由 (14 个端点)
├── services/
│   ├── dataFetcher.js              # worldcup26.ir 轮询 + 缓存
│   ├── dataFetcherAlt.js           # 增强数据 (合并双源+事件+统计+战报)
│   ├── zhiboFetcher.js             # 直播吧 API 封装 (核心，200+ 行)
│   ├── lineupFetcher.js            # 阵容数据接口
│   ├── squadFetcher.js             # 球员名单 (FIFA API)
│   ├── predictionService.js        # AI 预测 (DeepSeek API)
│   └── dataRelay.js                # 离线请求中继
├── public/
│   ├── index.html                  # 单页应用入口
│   ├── css/
│   │   └── style.css               # 深色主题 CSS (700+ 行)
│   ├── js/
│   │   ├── main.js                 # 主逻辑 (比赛列表渲染/筛选/自动刷新)
│   │   ├── modal.js                # 比赛详情弹窗 (v2 - 直播吧数据源)
│   │   ├── squad.js                # 球员阵容页
│   │   ├── standings.js            # 积分榜
│   │   ├── predictions.js          # AI 预测 UI
│   │   └── filters.js              # 筛选组件
│   └── photos/                     # 1092 张球员本地头像
├── cache/                          # JSON 文件缓存
│   ├── games.json                  # 比赛缓存 (104 场)
│   ├── teams.json                  # 球队缓存 (48 队，含 flagcdn URL)
│   ├── groups.json                 # 积分榜缓存
│   └── stadiums.json               # 球场缓存 (12 座)
└── data/
    ├── fifaSquadData.json           # 合并球员数据 (48 队 1248 人)
    ├── matches/                     # 直播吧数据缓存 (按 matchId)
    ├── predictions/                 # AI 预测历史
    └── zhibo_mapping.json           # 比赛 ID 映射 (68 场)
```

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
| **AI 预测** | DeepSeek API（可选，¥0.5/次） |
| **球队国旗** | flagcdn.com CDN |
| **球员照片** | 本地存储 1092 张 |

---

## 本地化 🌐

- 球队名以中文优先展示（`nameZh` 字段）
- 球员名优先使用直播吧中文数据
- 比赛详情显示中文标注（进球/乌龙/黄牌/红牌/换人）
- 球场名、城市名均有中文翻译
- 技术统计指标为中文标签

---

## 许可证 📄

MIT
