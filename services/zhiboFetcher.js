/**
 * zhiboFetcher.js - 直播吧(qiumibao) API 数据获取服务 (v2)
 *
 * 免费、无限制的2026世界杯实时数据源：
 * 通过逆向zhibo8的SPA JavaScript，发现其API端点为 qiumibao.com 域
 * - 实时比分 + 进球 (bifen4m.qiumibao.com)
 * - 比赛事件 + 技术统计 (dc.qiumibao.com)
 * - 首发阵容 + 球员评分 (dc.qiumibao.com)
 * - 比赛基本信息 (s.qiumibao.com)
 *
 * 数据策略：
 * 1. 优先读取本地缓存文件 (data/matches/match_{id}.json)
 * 2. 进行中的比赛每60秒通过API刷新
 * 3. 未开始的比赛每5分钟刷新
 * 4. 已结束的比赛永久缓存
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ==== 配置 ====
const QIUMIBAO_DOMAIN = 'qiumibao'; // zhibo8相关域名，见app.js: const r=document.body.classList.contains("dqd")?"qiumijia":"qiumibao"
const API_MATCH = `https://s.${QIUMIBAO_DOMAIN}.com`;           // 比赛基本信息
const API_BIFEN = `https://bifen4m.${QIUMIBAO_DOMAIN}.com`;     // 实时比分+进球
const API_DC = `https://dc.${QIUMIBAO_DOMAIN}.com`;             // 阵容/事件/统计

const MATCHES_DIR = path.join(__dirname, '..', 'data', 'matches');
const MAPPING_FILE = path.join(__dirname, '..', 'data', 'zhibo_mapping.json');
const CACHE_TTL_LIVE = 60000;      // 进行中的比赛60秒刷新
const CACHE_TTL_PRE = 300000;      // 未开始的比赛5分钟刷新
const CACHE_TTL_FINISHED = Infinity; // 已结束的比赛永久缓存

// ==== matchId映射 (worldcup26.ir → zhibo8) ====
let matchIdMapping = {};

// ==== 加载映射表 ====
function loadMapping() {
  try {
    ensureDir(path.dirname(MAPPING_FILE));
    if (fs.existsSync(MAPPING_FILE)) {
      matchIdMapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
      console.log(`[ZhiboFetcher] 映射表已加载: ${Object.keys(matchIdMapping).length} 场比赛`);
    } else {
      matchIdMapping = {
        "1": 1867414,   // 墨西哥 vs 南非
        "2": 1869142,   // 韩国 vs 捷克
      };
      saveMapping();
      console.log('[ZhiboFetcher] 创建默认映射表');
    }
  } catch (e) {
    console.error('[ZhiboFetcher] 加载映射表失败:', e.message);
    matchIdMapping = {};
  }
}

function saveMapping() {
  try {
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(matchIdMapping, null, 2), 'utf8');
  } catch (e) {
    console.error('[ZhiboFetcher] 保存映射表失败:', e.message);
  }
}

// ==== 目录工具 ====
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getMatchFilePath(wcMatchId) {
  return path.join(MATCHES_DIR, `match_${wcMatchId}.json`);
}

// ==== API 请求 ====
const httpClient = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    'Referer': 'https://m.zhibo8.cc/',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  }
});

let _matchInfoCache = {};

/**
 * 获取比赛基本信息（含match_date）
 */
async function fetchMatchInfo(zhiboId) {
  if (_matchInfoCache[zhiboId]) return _matchInfoCache[zhiboId];
  const url = `${API_MATCH}/json/match/${zhiboId}.htm?_t=${Date.now()}`;
  try {
    const res = await httpClient.get(url);
    _matchInfoCache[zhiboId] = res.data;
    return res.data;
  } catch (e) {
    console.error(`[ZhiboFetcher] matchInfo失败 zhiboId=${zhiboId}:`, e.message);
    return null;
  }
}

/**
 * 获取实时比分+进球数据
 */
async function fetchLiveScore(matchDate, zhiboId) {
  const url = `${API_BIFEN}/json/${matchDate}/v2/${zhiboId}.htm?_t=${Date.now()}`;
  try {
    const res = await httpClient.get(url);
    return res.data;
  } catch (e) {
    console.error(`[ZhiboFetcher] liveScore失败 ${zhiboId}:`, e.message);
    return null;
  }
}

/**
 * 获取比赛事件+技术统计
 */
async function fetchOuts(zhiboId) {
  const url = `${API_DC}/dc/matchs/data/outs/outs_${zhiboId}.htm?_t=${Date.now()}&_env=web&_platform=web`;
  try {
    const res = await httpClient.get(url);
    return res.data;
  } catch (e) {
    console.error(`[ZhiboFetcher] outs失败 ${zhiboId}:`, e.message);
    return null;
  }
}

/**
 * 获取首发阵容详情（含球员评分/年龄/国籍等）
 */
async function fetchLineupData(matchDate, zhiboId) {
  const url = `${API_DC}/dc/matchs/data/${matchDate}/match_lineup_${zhiboId}.htm?_t=${Date.now()}`;
  try {
    const res = await httpClient.get(url);
    return res.data;
  } catch (e) {
    console.error(`[ZhiboFetcher] lineup失败 ${zhiboId}:`, e.message);
    return null;
  }
}

// ==== 数据转换 ====

/**
 * 将位置编码转为标准缩写
 * positionX: GK→GK, D2→DF, DM→MF, M→MF, A→FW, S→FW
 */
function parsePosition(posX) {
  if (!posX || typeof posX !== 'string') return '';
  const first = posX[0].toUpperCase();
  const map = { 'G': 'GK', 'D': 'DF', 'M': 'MF', 'F': 'FW', 'S': 'FW', 'A': 'FW' };
  return map[first] || '';
}

/**
 * 将API的阵容数据转换为统一格式
 */
function transformLineups(matchDate, lineupRaw, liveScoreData) {
  const result = { home: null, away: null };
  if (!lineupRaw || !lineupRaw.data) return result;

  // liveScoreData 里有队名和队ID
  // 队名：优先用 matchInfo（s.qiumibao.com，始终有中文名），其次看 liveScore（bifen4m 常缺失）
  const homeName = matchDate?.home_team || liveScoreData?.left?.name || '主队';
  const awayName = matchDate?.visit_team || liveScoreData?.right?.name || '客队';

  const teams = Object.entries(lineupRaw.data);
  for (const [teamId, players] of teams) {
    if (!Array.isArray(players) || players.length === 0) continue;

    const isHome = teamId === String(liveScoreData?.left?.id);
    const team = { name: isHome ? homeName : awayName, starters: [], substitutes: [] };

    // 提取阵型 - 仅从首发球员按位置组统计
    // 根据positionX字段分层计算：GK、DF(D*非DM/CM)、DM/MF(DM/CM/M)、FW(A/F/S/W)
    const starters = players.filter(p => p.status === 'z' || p.status === '首发');
    const gkCount = starters.filter(p => /^GK/i.test(p.positionX || '')).length;
    const dfCount = starters.filter(p => /^D/i.test(p.positionX || '') && !/^DM|CM/i.test(p.positionX || '')).length;
    const midCount = starters.filter(p => /^(DM|CM|M)$/i.test(p.positionX || '')).length;
    const fwCount = starters.filter(p => /^A|F|S|W/i.test(p.positionX || '')).length;
    let formation = '';
    if (gkCount + dfCount + midCount + fwCount === starters.length && dfCount > 0) {
      formation = `${dfCount}-${midCount}-${fwCount}`;
    }

    // 分组（备用）
    const posGroupMap = {};

    for (const p of players) {
      const player = {
        number: parseInt(p.shirt_number) || 0,
        name: p.player_name_cn || '',
    position: parsePosition(p.positionX) || '',
    pos: parsePosition(p.positionX) || '',
    isCaptain: p.isCaptain === '1',
        age: p.age ? parseInt(p.age) : null,
        rate: p.rate || null,
        nationality: p.nationality || '',
        value: p.value || null
      };

      if (p.status === 'z' || p.status === '首发') {
        team.starters.push(player);
      } else if (p.status === 't' || p.status === '替补') {
        team.substitutes.push(player);
      } else if (p.status === 'z') {
        team.starters.push(player);
      }
    }

    team.formation = formation;

    if (isHome) {
      result.home = team;
    } else {
      result.away = team;
    }
  }

  // 如果数据不完整，从liveScoreData抽取信息
  if (result.home === null && liveScoreData) {
    result.home = { name: homeName, formation: '', coach: '', starters: [], substitutes: [] };
  }
  if (result.away === null && liveScoreData) {
    result.away = { name: awayName, formation: '', coach: '', starters: [], substitutes: [] };
  }

  return result;
}

/**
 * 将API的比赛事件转换为统一格式
 */
function transformEvents(outsRaw, lineupRaw) {
  const events = [];
  if (!outsRaw?.data?.match_event?.data) return events;

  // 建立球员→球队查找表（用于API不返回sl_team_id的情况）
  const playerLookup = {};
  if (lineupRaw?.data) {
    // 从lineupRaw.info确定主客队ID（info: {"233": {court: "home"}, "229": {court: "away"}}）
    let homeId = '', awayId = '';
    if (lineupRaw.info) {
      for (const [tid, info] of Object.entries(lineupRaw.info)) {
        if (info.court === 'home') homeId = tid;
        else if (info.court === 'away') awayId = tid;
      }
    }
    for (const [teamId, players] of Object.entries(lineupRaw.data)) {
      if (!Array.isArray(players)) continue;
      const isHome = teamId === homeId;
      const teamLabel = isHome ? 'home' : (teamId === awayId ? 'away' : '');
      if (!teamLabel) continue;
      for (const p of players) {
        if (p.player_name_cn) {
          playerLookup[p.player_name_cn] = teamLabel;
        }
      }
    }
  }

  for (const evt of outsRaw.data.match_event.data) {
    const code = parseInt(evt.event_code) || 0;
    const minute = parseInt(evt.time) || 0;
    const cn = evt.event_code_cn || '';
    
    // 用event_code_cn中文描述判断 + 数值代码兜底
    let type = '';
    if (cn.includes('进球') || cn.includes('乌龙')) type = 'goal';
    else if (cn.includes('红牌')) type = 'red_card';
    else if (cn.includes('黄牌') || cn.includes('两黄')) type = 'yellow_card';
    else if (cn.includes('换人') || cn.includes('上场')) type = 'substitution';
    else if (cn.includes('上半场结束')) type = 'half_time';
    else if (cn.includes('下半场结束') || cn.includes('全场结束') || cn.includes('完赛')) type = 'full_time';
    else if (cn.includes('伤停补时')) type = 'injury_time';
    else if (cn.includes('出牌升级')) type = 'red_card';
    else if (cn.includes('VAR') || cn.includes('var')) type = 'var_check';
    else if (code === 1) type = 'goal';
    else if (code === 2) type = 'yellow_card';
    else if (code === 5) type = 'red_card';
    else if (code === 100) type = 'half_time';
    else if (code === 92) type = 'full_time';
    else if (code === 101 || code === 102) type = 'injury_time';
    else type = 'other';

    const event = {
      minute,
      type,
      event_code: code,
      event_cn: evt.event_code_cn || '',
      info: evt.Info || '',
      team: evt.sl_team_id === '0' ? 'neutral' : ''
    };

    // 解析进球详情
    if (type === 'goal' && evt.squad_action) {
      const goalAction = evt.squad_action.find(a => a.event_type === 'goal');
      if (goalAction) {
        event.player = goalAction.player?.name || evt.player_name_cn || '';
        event.team = goalAction.player?.team || evt.sl_team_id || '';
        // 兜底：用球员名在lineup中查找归属
        if ((!event.team || event.team === '0') && event.player && playerLookup[event.player]) {
          event.team = playerLookup[event.player];
        }
        event.assist = null;
        const assistAction = evt.squad_action.find(a => a.is_assist === '1');
        if (assistAction) {
          event.assist = assistAction.player?.name || '';
        }
      }
    } else {
      event.player = evt.player_name_cn || '';
      event.team = evt.sl_team_id || '';
    }

    // 兜底：如果sl_team_id不返回，用球员名在lineup中查找归属
    if ((!event.team || event.team === '0') && event.player && playerLookup[event.player]) {
      event.team = playerLookup[event.player];
    }

    events.push(event);
  }

  events.sort((a, b) => a.minute - b.minute);
  return events;
}

/**
 * 将API的技术统计转换为统一格式
 */
function transformStats(outsRaw) {
  const stats = { home: {}, away: {} };
  if (!outsRaw?.data?.team_statics?.data) return stats;

  const raw = outsRaw.data.team_statics.data;
  stats.home = {
    shots: parseInt(raw.home.total_scoring_att) || 0,
    shotsOnTarget: parseInt(raw.home.ontarget_scoring_att) || 0,
    possession: raw.home.possession_percentage || '0%',
    corners: parseInt(raw.home.won_corners) || 0,
    saves: parseInt(raw.home.saves) || 0,
    fouls: parseInt(raw.home.fk_foul_lost) || 0,
    offsides: parseInt(raw.home.total_offside) || 0,
    passes: parseInt(raw.home.total_pass) || 0,
    passAccuracy: raw.home.pass_percentage || '0%',
    crossAccuracy: raw.home.cross_percentage || '0%'
  };
  stats.away = {
    shots: parseInt(raw.away.total_scoring_att) || 0,
    shotsOnTarget: parseInt(raw.away.ontarget_scoring_att) || 0,
    possession: raw.away.possession_percentage || '0%',
    corners: parseInt(raw.away.won_corners) || 0,
    saves: parseInt(raw.away.saves) || 0,
    fouls: parseInt(raw.away.fk_foul_lost) || 0,
    offsides: parseInt(raw.away.total_offside) || 0,
    passes: parseInt(raw.away.total_pass) || 0,
    passAccuracy: raw.away.pass_percentage || '0%',
    crossAccuracy: raw.away.cross_percentage || '0%'
  };

  return stats;
}

/**
 * 从阵容数据中提取换人和红黄牌事件（比赛事件API常缺失这些数据）
 * lineupRaw.dc.qiumibao.com 的阵容接口包含 card 和 up_time/down_time 字段
 */
function transformEventsFromLineup(lineupRaw, liveScoreData) {
  const events = [];
  if (!lineupRaw || !lineupRaw.data) return events;

  // 从liveScoreData获取主客队ID
  const homeId = String(liveScoreData?.left?.id || '');
  const awayId = String(liveScoreData?.right?.id || '');

  for (const [teamId, players] of Object.entries(lineupRaw.data)) {
    const isHome = teamId === homeId;
    const teamLabel = isHome ? 'home' : 'away';
    for (const p of players) {
      // 红黄牌
      const card = p.card || {};
      const y = parseInt(card.yellow) || 0;
      const r = parseInt(card.red) || 0;
      if (y > 0) {
        // 阵容数据没有黄牌具体分钟，用 down_time 或默认62分占位排序
        const downMin = p.down_time ? parseInt(p.down_time) : 0;
        const estMinute = downMin > 0 ? Math.max(downMin - 5, 1) : 62;
        events.push({
          minute: estMinute, type: 'yellow_card', event_code: 2, event_cn: '黄牌',
          info: `${p.player_name_cn || ''} 黄牌`, team: teamLabel,
          player: p.player_name_cn || ''
        });
      }
      if (r > 0) {
        const downMin = p.down_time ? parseInt(p.down_time) : 0;
        const estMinute = downMin > 0 ? Math.max(downMin - 5, 1) : 62;
        events.push({
          minute: estMinute, type: 'red_card', event_code: 5, event_cn: '红牌',
          info: `${p.player_name_cn || ''} 红牌`, team: teamLabel,
          player: p.player_name_cn || ''
        });
      }
      // 换人
      const upMin = p.up_time ? parseInt(p.up_time) : 0;
      const downMin = p.down_time ? parseInt(p.down_time) : 0;
      if (upMin > 0 || downMin > 0) {
        if (downMin > 0) {
          events.push({
            minute: downMin, type: 'substitution', event_code: downMin,
            event_cn: '换下', info: `${p.player_name_cn || ''} 换下`,
            team: teamLabel, player: p.player_name_cn || ''
          });
        }
        if (upMin > 0) {
          events.push({
            minute: upMin, type: 'substitution', event_code: upMin,
            event_cn: '换上', info: `${p.player_name_cn || ''} 换上`,
            team: teamLabel, player: p.player_name_cn || ''
          });
        }
      }
    }
  }

  events.sort((a, b) => a.minute - b.minute);
  return events;
}

/**
 * 从视频信号获取阵容标记（摘要版，从lineup数据获取）
 */
function extractFormationFromData(linesData) {
  if (!linesData) return '';
  // 从positionX2字段推断阵型
  const positions = new Set();
  for (const [teamId, players] of Object.entries(linesData.data || {})) {
    for (const p of players || []) {
      if (p.positionX) positions.add(p.positionX);
    }
  }
  return '';
}

// ==== 主接口 =====

/**
 * 从qiumibao API拉取比赛所有数据并缓存
 */
async function fetchFromZhibo(wcMatchId, zhiboId) {
  console.log(`[ZhiboFetcher] 拉取 matchId=${wcMatchId} zhiboId=${zhiboId} (API v2)`);
  
  try {
    // 1. 获取比赛基本信息（含match_date）
    const matchInfo = await fetchMatchInfo(zhiboId);
    if (!matchInfo) {
      console.log('[ZhiboFetcher] 比赛基本信息获取失败');
      return null;
    }

    const matchDate = matchInfo.match_date;
    if (!matchDate) {
      console.log('[ZhiboFetcher] 缺少match_date');
      return null;
    }

    // 2. 并行获取比分+阵容+事件统计
    const [liveScore, lineupRaw, outsRaw] = await Promise.all([
      fetchLiveScore(matchDate, zhiboId),
      fetchLineupData(matchDate, zhiboId),
      fetchOuts(zhiboId)
    ]);

    // 3. 转换数据
    const lineups = transformLineups(matchInfo, lineupRaw, liveScore);
    const events = transformEvents(outsRaw, lineupRaw);
    const stats = transformStats(outsRaw);

    // 3b. 从阵容数据补充红黄牌和换人（outs API常缺失这些）
    const lineupEvents = transformEventsFromLineup(lineupRaw, liveScore);
    for (const evt of lineupEvents) {
      // 去重：如果events中已有同类型同球员的事件，跳过
      const dup = events.find(e => e.type === evt.type && e.player === evt.player);
      if (!dup) events.push(evt);
    }
    events.sort((a, b) => a.minute - b.minute);

    // 4. 从liveScore获取实时比分
    let homeScore = 0, awayScore = 0;
    let periodCn = '';
    let matchStatus = 'notstarted';
    if (liveScore) {
      homeScore = parseInt(liveScore.left?.score) || 0;
      awayScore = parseInt(liveScore.right?.score) || 0;
      periodCn = liveScore.period_cn || '';
      const state = parseInt(liveScore.state) || 0;
      // state: 1=未开始, 2=进行中, 3=已结束
      if (state === 3) matchStatus = 'finished';
      else if (state === 2) matchStatus = 'live';
      else matchStatus = 'notstarted';

      // 不再从liveScore.player_data添加进球（已包含在outsRaw.match_event中）
      events.sort((a, b) => a.minute - b.minute);
    }

    const matchData = {
      wcMatchId,
      zhiboId,
      source: 'qiumibao_api',
      sourceUrl: `${API_MATCH}/json/match/${zhiboId}.htm`,
      fetchedAt: Date.now(),
      matchDate,
      match: `${matchInfo.home_team || ''} vs ${matchInfo.visit_team || ''}`,
      status: matchStatus,
      periodCn,
      score: { home: homeScore, away: awayScore },
      lineups,
      events,
      stats
    };

    // 保存到本地
    saveMatchData(wcMatchId, matchData);

    console.log(`[ZhiboFetcher] matchId=${wcMatchId} 数据已缓存 (状态:${matchStatus}, 比分:${homeScore}-${awayScore}, 事件:${events.length}, 统计:${Object.keys(stats.home).length}项)`);
    return matchData;
  } catch (e) {
    console.error(`[ZhiboFetcher] 拉取失败 matchId=${wcMatchId}:`, e.message);
    return null;
  }
}

/**
 * 从本地文件加载比赛数据
 */
function loadMatchData(wcMatchId) {
  const filePath = getMatchFilePath(wcMatchId);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data;
    }
  } catch (e) {
    console.error(`[ZhiboFetcher] 读取本地数据失败 matchId=${wcMatchId}:`, e.message);
  }
  return null;
}

/**
 * 保存比赛数据到本地
 */
function saveMatchData(wcMatchId, matchData) {
  ensureDir(MATCHES_DIR);
  const filePath = getMatchFilePath(wcMatchId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(matchData, null, 2), 'utf8');
  } catch (e) {
    console.error(`[ZhiboFetcher] 保存数据失败 matchId=${wcMatchId}:`, e.message);
  }
}

// ==== 公开 API ====

/**
 * 获取比赛所有数据（阵容+事件+统计+比分）
 * 策略：本地缓存 → API拉取
 */
async function getMatchData(wcMatchId) {
  // 1. 尝试本地缓存
  const cached = loadMatchData(wcMatchId);
  if (cached) {
    if (cached.status === 'finished') {
      return cached;  // 已结束的比赛永远用缓存
    }
    const age = Date.now() - cached.fetchedAt;
    if (age < CACHE_TTL_LIVE) {
      return cached;  // 60秒内不用刷新
    }
    console.log(`[ZhiboFetcher] 缓存过期 matchId=${wcMatchId}, 尝试刷新`);
  }

  // 2. 查找zhibo8 matchId
  const zhiboId = matchIdMapping[String(wcMatchId)];
  if (!zhiboId) {
    return cached || null;
  }

  // 3. 从API拉取
  const fresh = await fetchFromZhibo(wcMatchId, zhiboId);
  return fresh || cached;
}

/**
 * 获取首发阵容
 */
async function getLineups(wcMatchId) {
  const data = await getMatchData(wcMatchId);
  if (!data || !data.lineups) return { success: false, error: '暂无首发阵容数据' };
  
  const lineups = [];
  for (const side of ['home', 'away']) {
    const t = data.lineups[side];
    if (!t || !t.name) continue;
    lineups.push({
      teamName: t.name,
      formation: t.formation || '',
      coach: t.coach || '',
      startXI: (t.starters || []).map(p => ({
        number: p.number,
        name: p.name,
        pos: p.pos || p.position || ''
      })),
      substitutes: (t.substitutes || []).map(p => ({
        number: p.number || '',
        name: p.name,
        pos: p.pos || p.position || ''
      }))
    });
  }

  return {
    success: true,
    data: {
      fixtureId: data.zhiboId,
      lineups,
      fetchedAt: data.fetchedAt
    }
  };
}

/**
 * 获取比赛事件（进球/红黄牌/换人）
 */
async function getEvents(wcMatchId) {
  const data = await getMatchData(wcMatchId);
  if (!data) return [];
  return data.events || [];
}

/**
 * 获取技术统计
 */
async function getStats(wcMatchId) {
  const data = await getMatchData(wcMatchId);
  if (!data) return null;
  return data.stats || null;
}

/**
 * 获取实时比分信息
 */
async function getLiveScore(wcMatchId) {
  const data = await getMatchData(wcMatchId);
  if (!data) return null;
  return {
    status: data.status,
    periodCn: data.periodCn || '',
    score: data.score || { home: 0, away: 0 },
    match: data.match || '',
    fetchedAt: data.fetchedAt
  };
}

/**
 * 获取战报
 */
async function getReport(wcMatchId) {
  const data = await getMatchData(wcMatchId);
  if (!data) return null;
  return data.report || null;
}

/**
 * 设置/更新 matchId 映射
 */
function setMapping(wcMatchId, zhiboId) {
  matchIdMapping[String(wcMatchId)] = parseInt(zhiboId);
  saveMapping();
  console.log(`[ZhiboFetcher] 映射已更新: ${wcMatchId} → ${zhiboId}`);
}

/**
 * 获取映射表
 */
function getMapping() {
  return { ...matchIdMapping };
}

/**
 * 直接注入比赛数据（用于HE或其他来源手动提供的JSON数据）
 */
function injectMatchData(wcMatchId, matchData) {
  matchData.wcMatchId = wcMatchId;
  matchData.fetchedAt = matchData.fetchedAt || Date.now();
  saveMatchData(wcMatchId, matchData);
  console.log(`[ZhiboFetcher] 手动注入数据 matchId=${wcMatchId}`);
}

// ==== 初始化 ====
loadMapping();

module.exports = {
  getMatchData,
  getLineups,
  getEvents,
  getStats,
  getReport,
  getLiveScore,
  setMapping,
  getMapping,
  injectMatchData,
  fetchFromZhibo
};
