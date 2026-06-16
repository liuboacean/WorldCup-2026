/**
 * dataFetcher.js - 主数据源 worldcup26.ir 轮询与缓存
 *
 * 功能：
 * - 定时轮询 worldcup26.ir 的四个端点
 * - 内存缓存 + JSON 文件双缓存（带时间戳快照）
 * - 时区转换：伊朗时间 (UTC+3:30) → 北京时间 (UTC+8)
 * - 进球数据兼容解析
 * - 淘汰赛标签处理
 * - 数据校验
 */

const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchWithRelay } = require('./dataRelay');

// ==== 配置 ====
const BASE_URL = 'https://worldcup26.ir';
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const DATA_DIR = path.join(__dirname, '..', 'static');     // 静态基础数据（git跟踪）
const POLL_INTERVAL_MATCHDAY = '*/5 * * * *';   // 比赛日每5分钟
const POLL_INTERVAL_OFFDAY = '*/30 * * * *';    // 非比赛日每30分钟

// 缓存键
const CACHE_KEYS = {
  games: 'games',
  teams: 'teams',
  groups: 'groups',
  stadiums: 'stadiums'
};

// ==== 内存缓存 ====
let memoryCache = {
  games: null,
  teams: null,
  groups: null,
  stadiums: null,
  lastFetch: null,
  version: 0
};

// ==== 中文球队名映射 ====
const CHINESE_TEAM_NAMES = {
  "Mexico": "墨西哥", "South Africa": "南非", "South Korea": "韩国",
  "Czech Republic": "捷克", "Canada": "加拿大", "Bosnia and Herzegovina": "波黑",
  "Qatar": "卡塔尔", "Switzerland": "瑞士", "Brazil": "巴西",
  "Morocco": "摩洛哥", "Haiti": "海地", "Scotland": "苏格兰",
  "United States": "美国", "Paraguay": "巴拉圭", "Australia": "澳大利亚",
  "Turkey": "土耳其", "Germany": "德国", "Curaçao": "库拉索",
  "Ivory Coast": "科特迪瓦", "Ecuador": "厄瓜多尔", "Netherlands": "荷兰",
  "Japan": "日本", "Sweden": "瑞典", "Tunisia": "突尼斯",
  "Belgium": "比利时", "Egypt": "埃及", "Iran": "伊朗",
  "New Zealand": "新西兰", "Spain": "西班牙", "Cape Verde": "佛得角",
  "Uruguay": "乌拉圭", "Saudi Arabia": "沙特阿拉伯", "France": "法国",
  "Senegal": "塞内加尔", "Iraq": "伊拉克", "Norway": "挪威",
  "Argentina": "阿根廷", "Algeria": "阿尔及利亚", "Austria": "奥地利",
  "Jordan": "约旦", "Portugal": "葡萄牙",
  "Democratic Republic of the Congo": "刚果民主共和国",
  "Uzbekistan": "乌兹别克斯坦", "Colombia": "哥伦比亚",
  "England": "英格兰", "Croatia": "克罗地亚", "Ghana": "加纳",
  "Panama": "巴拿马"
};

function getChineseName(enName) {
  return CHINESE_TEAM_NAMES[enName] || enName;
}

// ==== 球场时区映射 ====
// 2026世界杯在北美举办，6月采用夏令时
// 美国/加拿大夏令时: EDT -4, CDT -5, MDT -6, PDT -7
// 墨西哥 (无夏令时): CST -6 (全年不变)
const STADIUM_TIMEZONES = {
  // === 墨西哥 (CST, UTC-6, 全年不变) ===
  "1": -6,   // Estadio Azteca, Mexico City
  "2": -6,   // Estadio Akron, Guadalajara
  "3": -6,   // Estadio BBVA, Monterrey
  // === 美国中部 (CDT, UTC-5) ===
  "4": -5,   // AT&T Stadium, Dallas/Arlington, TX
  "5": -5,   // NRG Stadium, Houston, TX
  "6": -5,   // Arrowhead Stadium, Kansas City, MO
  // === 美国东部 (EDT, UTC-4) ===
  "7": -4,   // Mercedes-Benz Stadium, Atlanta, GA
  "8": -4,   // Hard Rock Stadium, Miami, FL
  "9": -4,   // Gillette Stadium, Boston, MA
  "10": -4,  // Lincoln Financial Field, Philadelphia, PA
  "11": -4,  // MetLife Stadium, East Rutherford, NJ
  "12": -4,  // BMO Field, Toronto, ON
  // === 美国/加拿大西部 (PDT, UTC-7) ===
  "13": -7,  // BC Place, Vancouver, BC
  "14": -7,  // Lumen Field, Seattle, WA
  "15": -7,  // Levi's Stadium, Santa Clara, CA
  "16": -7,  // SoFi Stadium, Inglewood, CA
};

function getStadiumTimezone(stadiumId) {
  return STADIUM_TIMEZONES[String(stadiumId)] || -5; // 默认中部时间
}

// ==== 工具函数 ====

/**
 * 当地比赛时间 → 北京时间
 * worldcup26.ir 的 local_date 为比赛举办地的当地时间
 * 根据球场所在时区转换，再转为北京时间 (UTC+8)
 */
function localToBeijing(localDateStr, stadiumId) {
  if (!localDateStr) return null;
  try {
    // 格式: "06/11/2026 20:00"
    const [datePart, timePart] = localDateStr.split(' ');
    const [month, day, year] = datePart.split('/');
    const [hour, minute] = timePart.split(':');

    // 获取球场所在时区偏移（相对于UTC）
    const localOffset = getStadiumTimezone(stadiumId);

    // 本地时间 → UTC → 北京时间 (UTC+8)
    const localUtcMs = Date.UTC(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hour), parseInt(minute)
    );
    // localOffset 是负数如 -7（PDT），减去 -7*3600 = 加上 7*3600
    const realUtcMs = localUtcMs - localOffset * 60 * 60 * 1000;

    // 北京时间 = UTC + 8h
    const bjMs = realUtcMs + 8 * 60 * 60 * 1000;
    const bjDate = new Date(bjMs);

    // 格式化为北京时间字符串
    const bjMonth = String(bjDate.getUTCMonth() + 1).padStart(2, '0');
    const bjDay = String(bjDate.getUTCDate()).padStart(2, '0');
    const bjHour = String(bjDate.getUTCHours()).padStart(2, '0');
    const bjMinute = String(bjDate.getUTCMinutes()).padStart(2, '0');

    return {
      date: `${bjMonth}/${bjDay}`,
      dateLabel: `${bjMonth}月${bjDay}日`,
      time: `${bjHour}:${bjMinute}`,
      full: `${bjMonth}/${bjDay} ${bjHour}:${bjMinute}`,
      timestamp: realUtcMs
    };
  } catch (e) {
    console.error(`[DataFetcher] 时区转换失败: ${localDateStr}`, e.message);
    return null;
  }
}

/**
 * 解析进球数据
 * 数据可能为: "null" (字符串), JSON 数组, 逗号分隔字符串
 */
function parseScorers(scorersStr) {
  if (!scorersStr || scorersStr === 'null' || scorersStr === 'NULL') {
    return [];
  }

  try {
    // 尝试 JSON 解析
    const parsed = JSON.parse(scorersStr);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [String(parsed)];
  } catch (e) {
    // 逗号分隔
    if (typeof scorersStr === 'string' && scorersStr.includes(',')) {
      return scorersStr.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [String(scorersStr).trim()];
  }
}

/**
 * 判断是否为比赛日
 * 比赛时间范围 2026-06-11 至 2026-07-19
 */
function isMatchDay() {
  const now = new Date();
  const start = new Date('2026-06-10T20:00:00Z'); // 北京时间6/11 04:00
  const end = new Date('2026-07-19T20:00:00Z');   // 比赛结束
  return now >= start && now <= end;
}

// ==== 回调 ====
let onDataUpdateCallbacks = [];

function onDataUpdate(callback) {
  if (typeof callback === 'function') {
    onDataUpdateCallbacks.push(callback);
  }
}

function notifyDataUpdate() {
  onDataUpdateCallbacks.forEach(cb => {
    try {
      cb({ version: memoryCache.version, games: memoryCache.games });
    } catch (e) {
      console.error('[DataFetcher] 回调执行错误:', e.message);
    }
  });
}

// ==== 缓存操作 ====

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheFilePath(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

function writeCacheFile(key, data) {
  ensureCacheDir();
  const filePath = getCacheFilePath(key);
  const cacheEntry = {
    data,
    timestamp: Date.now(),
    version: memoryCache.version
  };
  try {
    fs.writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[DataFetcher] 写入缓存文件失败: ${key}`, e.message);
  }
}

function readCacheFile(key) {
  const filePath = getCacheFilePath(key);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error(`[DataFetcher] 读取缓存文件失败: ${key}`, e.message);
  }
  return null;
}

/**
 * 从本地静态文件加载基础数据（球队/球场/积分榜）
 * 这些数据在整个赛事期间不变，无需从远端API重复拉取
 */
function loadStaticData() {
  const staticFiles = {
    teams: path.join(DATA_DIR, 'static_teams.json'),
    stadiums: path.join(DATA_DIR, 'static_stadiums.json'),
    groups: path.join(DATA_DIR, 'static_groups.json')
  };

  for (const [key, filePath] of Object.entries(staticFiles)) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          memoryCache[key] = data;
          console.log(`[DataFetcher] 静态数据已加载: ${key}=${data.length}条`);
        }
      }
    } catch (e) {
      console.error(`[DataFetcher] 静态数据加载失败: ${key}`, e.message);
    }
  }

  // 尝试从远端缓存文件恢复（作为静态数据缺失时的后备）
  for (const key of ['teams', 'stadiums', 'groups']) {
    if (!memoryCache[key]) {
      const cached = readCacheFile(key);
      if (cached && cached.data) {
        memoryCache[key] = cached.data;
        console.log(`[DataFetcher] 远端缓存恢复: ${key}=${cached.data.length}条`);
      }
    }
  }
}

function loadCacheFromFiles() {
  for (const key of Object.values(CACHE_KEYS)) {
    const cached = readCacheFile(key);
    if (cached && cached.data) {
      memoryCache[key] = cached.data;
    }
  }
  console.log('[DataFetcher] 缓存已从文件恢复');

  // 加载静态基础数据（优先级高于远端缓存）
  loadStaticData();
}

// ==== 数据校验 ====

function validateGame(game) {
  const errors = [];

  // 分数校验
  const homeScore = parseInt(game.home_score);
  const awayScore = parseInt(game.away_score);
  if (!isNaN(homeScore) && homeScore < 0) errors.push('home_score < 0');
  if (!isNaN(awayScore) && awayScore < 0) errors.push('away_score < 0');

  // ID 校验
  if (!game.id) errors.push('missing id');

  // 状态校验
  const validStatuses = ['TRUE', 'FALSE'];
  if (game.finished && !validStatuses.includes(game.finished.toUpperCase())) {
    errors.push(`invalid finished: ${game.finished}`);
  }

  if (errors.length > 0) {
    console.warn(`[DataFetcher] 比赛 ${game.id} 数据异常: ${errors.join(', ')}`);
    return false;
  }
  return true;
}

// ==== 数据拉取 ====

async function fetchEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`[DataFetcher] 拉取: ${url}`);
  const startTime = Date.now();

  try {
    const data = await fetchWithRelay(url);
    const elapsed = Date.now() - startTime;
    console.log(`[DataFetcher] ${endpoint} 完成 (${elapsed}ms)`);
    return data;
  } catch (error) {
    console.error(`[DataFetcher] 拉取失败: ${endpoint}`, error.message);
    return null;
  }
}

/**
 * 转换比赛数据
 */
function transformGame(rawGame, teamsMap) {
  if (!rawGame) return null;

  const beijingTime = localToBeijing(rawGame.local_date, rawGame.stadium_id);
  const homeScore = parseInt(rawGame.home_score) || 0;
  const awayScore = parseInt(rawGame.away_score) || 0;
  const isFinished = rawGame.finished?.toUpperCase() === 'TRUE';
  const timeElapsed = rawGame.time_elapsed || 'notstarted';

  // 判断比赛状态
  let status = 'notstarted';
  if (isFinished) {
    status = 'finished';
  } else if (timeElapsed !== 'notstarted' && timeElapsed !== 'NULL') {
    status = 'live';
  }

  // 进球者
  const homeScorers = parseScorers(rawGame.home_scorers);
  const awayScorers = parseScorers(rawGame.away_scorers);

  // 主客队信息
  const homeTeam = teamsMap[rawGame.home_team_id] || null;
  const awayTeam = teamsMap[rawGame.away_team_id] || null;

  return {
    id: rawGame.id,
    homeTeam: {
      id: rawGame.home_team_id,
      name: rawGame.home_team_name_en,
      nameZh: getChineseName(rawGame.home_team_name_en),
      label: rawGame.home_team_label !== 'N/A' ? rawGame.home_team_label : null,
      flag: homeTeam?.flag || null,
      score: homeScore,
      scorers: homeScorers
    },
    awayTeam: {
      id: rawGame.away_team_id,
      name: rawGame.away_team_name_en,
      nameZh: getChineseName(rawGame.away_team_name_en),
      label: rawGame.away_team_label !== 'N/A' ? rawGame.away_team_label : null,
      flag: awayTeam?.flag || null,
      score: awayScore,
      scorers: awayScorers
    },
    group: rawGame.group || null,
    matchday: parseInt(rawGame.matchday) || 0,
    type: rawGame.type || 'group',
    status,
    timeElapsed,
    beijingTime,
    stadiumId: rawGame.stadium_id,
    finished: isFinished
  };
}

/**
 * 全量拉取并转换数据
 * 策略：只从远端拉取比赛数据，球队/球场/积分榜使用本地静态数据
 */
async function fetchAll() {
  console.log('[DataFetcher] === 开始全量拉取 ===');

  // 只拉取比赛数据，基础数据用本地静态文件
  const gamesRaw = await fetchEndpoint('/get/games');

  if (!gamesRaw) {
    console.warn('[DataFetcher] 比赛数据拉取失败，使用缓存');
    return false;
  }

  // 构建球队映射（优先从内存中的静态数据，确保国旗不丢失）
  const teamsMap = {};
  const staticTeams = memoryCache.teams || [];
  if (Array.isArray(staticTeams)) {
    for (const team of staticTeams) {
      teamsMap[team.id] = {
        id: team.id,
        name: team.name_en || team.name,
        shortName: team.short_name || team.fifa_code || '',
        flag: team.flag || null
      };
    }
  }

  // 转换比赛数据（使用本地teamsMap保留国旗）
  const gamesRawArray = Array.isArray(gamesRaw) ? gamesRaw : (gamesRaw?.games || gamesRaw?.data || []);
  const games = gamesRawArray
    .filter(g => validateGame(g))
    .map(g => transformGame(g, teamsMap))
    .filter(Boolean);

  // === 更新内存缓存 ===
  memoryCache.version++;
  memoryCache.games = games;
  memoryCache.lastFetch = Date.now();

  // === 只写比赛数据到文件缓存（基础数据不覆盖） ===
  writeCacheFile(CACHE_KEYS.games, games);

  console.log(`[DataFetcher] === 拉取完成 (v${memoryCache.version}) ===`);
  console.log(`  比赛: ${games.length}场, 球队: ${(memoryCache.teams || []).length}支`);

  // 通知数据更新回调
  notifyDataUpdate();

  return true;
}

// ==== 启动定时任务 ====

let isRunning = false;

async function scheduledFetch() {
  if (isRunning) {
    console.log('[DataFetcher] 上一轮拉取尚未完成，跳过');
    return;
  }
  isRunning = true;
  try {
    await fetchAll();
  } catch (e) {
    console.error('[DataFetcher] 定时拉取出错:', e.message);
  } finally {
    isRunning = false;
  }
}

function startPolling() {
  // 首次立即拉取
  setTimeout(() => scheduledFetch(), 1000);

  // 比赛日每5分钟，非比赛日每30分钟
  cron.schedule(POLL_INTERVAL_MATCHDAY, () => {
    if (isMatchDay()) {
      scheduledFetch();
    }
  });

  cron.schedule(POLL_INTERVAL_OFFDAY, () => {
    if (!isMatchDay()) {
      scheduledFetch();
    }
  });

  console.log('[DataFetcher] 定时轮询已启动');
  console.log(`  比赛日间隔: 5分钟, 非比赛日间隔: 30分钟`);
}

// ==== 对外接口 ====

function getCache() {
  return {
    ...memoryCache,
    lastFetchISO: memoryCache.lastFetch ? new Date(memoryCache.lastFetch).toISOString() : null
  };
}

function getGames() {
  return memoryCache.games || [];
}

function getTeams() {
  return memoryCache.teams || [];
}

function getGroups() {
  return memoryCache.groups || [];
}

function getStadiums() {
  return memoryCache.stadiums || [];
}

function getLiveGames() {
  return (memoryCache.games || []).filter(g => g.status === 'live');
}

function getStats() {
  const games = getGames();
  const finished = games.filter(g => g.status === 'finished');
  const live = games.filter(g => g.status === 'live');
  const notStarted = games.filter(g => g.status === 'notstarted');

  const totalGoals = finished.reduce((sum, g) => sum + g.homeTeam.score + g.awayTeam.score, 0);

  return {
    totalMatches: games.length,
    finishedMatches: finished.length,
    liveMatches: live.length,
    notStartedMatches: notStarted.length,
    totalGoals,
    avgGoalsPerMatch: finished.length > 0 ? (totalGoals / finished.length).toFixed(1) : '0.0',
    lastUpdate: memoryCache.lastFetch ? new Date(memoryCache.lastFetch).toISOString() : null,
    cacheVersion: memoryCache.version
  };
}

function getHealth() {
  return {
    status: 'ok',
    uptime: process.uptime(),
    cacheVersion: memoryCache.version,
    gamesCached: memoryCache.games ? memoryCache.games.length : 0,
    lastFetch: memoryCache.lastFetch ? new Date(memoryCache.lastFetch).toISOString() : null,
    memoryUsage: process.memoryUsage().heapUsed
  };
}

// ==== 初始化：从文件缓存恢复 ====
loadCacheFromFiles();

module.exports = {
  startPolling,
  fetchAll,
  getCache,
  getGames,
  getTeams,
  getGroups,
  getStadiums,
  getLiveGames,
  getStats,
  getHealth,
  localToBeijing,
  parseScorers,
  validateGame,
  onDataUpdate
};
