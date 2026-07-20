/**
 * api.js - REST API 路由
 *
 * 接口列表：
 *  GET  /api/matches        → 全部比赛（比分+进球+状态，北京时间）
 *  GET  /api/matches/:id    → 单场比赛详情（含红黄牌+进球+统计）
 *  GET  /api/matches/:id/lineups → 首发阵容（直播吧数据源）
 *  GET  /api/matches/:id/events  → 比赛事件（进球/红黄牌/换人）
 *  GET  /api/matches/:id/stats   → 技术统计
 *  GET  /api/standings      → 全部小组积分榜
 *  GET  /api/live           → 进行中的比赛
 *  GET  /api/stats          → 赛事统计
 *  GET  /api/teams          → 球队列表
 *  GET  /api/stadiums       → 球场列表
 *  GET  /api/health         → 健康检查
 */

const express = require('express');
const router = express.Router();
const dataFetcher = require('../services/dataFetcher');
const dataFetcherAlt = require('../services/dataFetcherAlt');
const squadFetcher = require('../services/squadFetcher');
const lineupFetcher = require('../services/lineupFetcher');
const predictionService = require("../services/predictionService");

/**
 * GET /api/matches
 * 全部比赛列表，支持筛选参数
 */
/**
 * 实时比分缓存（避免每次请求都调用zhibo8 API）
 */
let liveScoreCache = {};
const LIVE_CACHE_TTL = 30000; // 30秒缓存

/**
 * 为进行中的比赛增强实时数据
 */
async function enhanceLiveMatches(games) {
  const now = Date.now();
  const enhanced = [];

  for (const match of games) {
    // 跳过已结束的比赛
    if (match.status === 'finished') {
      enhanced.push(match);
      continue;
    }

    // 跳过未来24小时以外的比赛
    const matchTime = match.beijingTime?.timestamp || 0;
    if (now < matchTime - 3600000) {
      enhanced.push(match);
      continue;
    }

    // 检查缓存
    const cached = liveScoreCache[match.id];
    if (cached && (now - cached.fetchedAt) < LIVE_CACHE_TTL) {
      const m = { ...match };
      m.homeTeam = { ...m.homeTeam };
      m.awayTeam = { ...m.awayTeam };
      m.homeTeam.score = cached.score.home;
      m.awayTeam.score = cached.score.away;
      m.status = cached.status || m.status;
      m.timeElapsed = cached.periodCn || m.timeElapsed;
      enhanced.push(m);
      continue;
    }

    // 从zhibo8获取实时比分
    try {
      const live = await dataFetcherAlt.getMatchLiveScore(match.id);
      if (live && live.score) {
        liveScoreCache[match.id] = {
          score: live.score,
          status: live.status,
          periodCn: live.periodCn,
          fetchedAt: now
        };
        const m = { ...match };
        m.homeTeam = { ...m.homeTeam };
        m.awayTeam = { ...m.awayTeam };
        m.homeTeam.score = live.score.home;
        m.awayTeam.score = live.score.away;
        m.status = live.status || m.status;
        m.timeElapsed = live.periodCn || m.timeElapsed;
        enhanced.push(m);
        continue;
      }
    } catch (e) {
      // zhibo8失败时用原始数据
    }
    enhanced.push(match);
  }
  return enhanced;
}

/**
 * GET /api/matches
 * 全部比赛列表，支持筛选参数 + 进行中比赛实时比分
 */
router.get('/matches', async (req, res) => {
  try {
    let games = dataFetcher.getGames();

    const { group, date, status, type, search } = req.query;

    if (group) {
      games = games.filter(g => g.group?.toUpperCase() === group.toUpperCase());
    }
    if (date) {
      const targetDate = date.replace(/-/g, '/');
      games = games.filter(g => g.beijingTime?.date === targetDate || g.beijingTime?.date === date);
    }
    if (status) {
      games = games.filter(g => g.status === status);
    }
    if (type) {
      games = games.filter(g => g.type === type);
    }
    if (search) {
      const q = search.toLowerCase();
      games = games.filter(g =>
        g.homeTeam.name?.toLowerCase().includes(q) ||
        g.awayTeam.name?.toLowerCase().includes(q)
      );
    }

    games.sort((a, b) => (a.beijingTime?.timestamp || 0) - (b.beijingTime?.timestamp || 0));

    // 增强实时数据（异步，不影响响应速度）
    games = await enhanceLiveMatches(games);

    // Fix: reload from cache file for matches with 0-0 score (both live and finished)
    // In-memory cache may be stale before fetchAll completes
    try {
      const cacheFile = require('path').join(__dirname, '..', 'cache', 'games.json');
      if (require('fs').existsSync(cacheFile)) {
        const cachedData = JSON.parse(require('fs').readFileSync(cacheFile, 'utf8'));
        const cachedGames = cachedData.data || [];
        const scoreMap = {};
        for (const cg of cachedGames) {
          const hs = parseInt(cg.homeTeam?.score) || 0;
          const as = parseInt(cg.awayTeam?.score) || 0;
          if (hs > 0 || as > 0) {
            scoreMap[cg.id] = { home: hs, away: as };
          }
        }
        games = games.map(g => {
          if (!parseInt(g.homeTeam?.score) && !parseInt(g.awayTeam?.score)) {
            const cached = scoreMap[g.id];
            if (cached) {
              g = { ...g };
              g.homeTeam = { ...g.homeTeam, score: cached.home };
              g.awayTeam = { ...g.awayTeam, score: cached.away };
            }
          }
          return g;
        });
      }
    } catch (e) { /* cache reload optional */ }

    // Filter out disallowed goals from scorers (scorers count may exceed actual score)
    games.forEach(g => {
      const homeScore = parseInt(g.homeTeam?.score) || 0;
      const awayScore = parseInt(g.awayTeam?.score) || 0;
      if (g.homeTeam?.scorers && g.homeTeam.scorers.length > homeScore) {
        g.homeTeam.scorers = g.homeTeam.scorers.slice(-homeScore);
      }
      if (g.awayTeam?.scorers && g.awayTeam.scorers.length > awayScore) {
        g.awayTeam.scorers = g.awayTeam.scorers.slice(-awayScore);
      }
    });
    
    // Fix status: if timeElapsed indicates live but status is notstarted, correct it
    games.forEach(g => {
      if (g.status === 'notstarted' && g.timeElapsed && g.timeElapsed !== 'notstarted' && g.timeElapsed !== 'NULL') {
        g.status = 'live';
      }
    });
    
    // Load penalty data from zhibo cache for knockout matches
    const fs = require('fs');
    const path = require('path');
    const MATCHES_DIR = path.join(__dirname, '..', 'data', 'matches');
    games.forEach(g => {
      if (g.status === 'finished') {
        const cachePath = path.join(MATCHES_DIR, `match_${g.id}.json`);
        try {
          if (fs.existsSync(cachePath)) {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (cached.penalty) {
              g.penalty = cached.penalty;
            }
          }
        } catch (e) { /* ignore */ }
      }
    });

    res.json({
      success: true,
      count: games.length,
      data: games,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/matches 错误:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/matches/:id
 * 单场比赛详情（含红黄牌+进球+统计+战报）
 */
router.get('/matches/:id', async (req, res) => {
  try {
    const matchId = req.params.id;
    const fs = require('fs');
    const path = require('path');
    const games = dataFetcher.getGames();
    const match = games.find(g => g.id === matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `比赛 ${matchId} 不存在`
      });
    }

    // Fix score: reload from cache file for finished matches with 0-0 score
    if (match.status === 'finished' && (!parseInt(match.homeTeam?.score) && !parseInt(match.awayTeam?.score))) {
      try {
        const cacheFile = require('path').join(__dirname, '..', 'cache', 'games.json');
        if (require('fs').existsSync(cacheFile)) {
          const cachedData = JSON.parse(require('fs').readFileSync(cacheFile, 'utf8'));
          const cachedGames = cachedData.data || [];
          const cached = cachedGames.find(cg => String(cg.id) === String(matchId));
          if (cached && (parseInt(cached.homeTeam?.score) > 0 || parseInt(cached.awayTeam?.score) > 0)) {
            match.homeTeam.score = parseInt(cached.homeTeam.score);
            match.awayTeam.score = parseInt(cached.awayTeam.score);
          }
        }
      } catch (e) { /* optional */ }
    }

    // Fix status for live matches
    if (match.status === 'notstarted' && match.timeElapsed && match.timeElapsed !== 'notstarted' && match.timeElapsed !== 'NULL') {
      match.status = 'live';
    }

    // 获取本地增强数据（事件+统计+战报，来自直播吧）
    const enhanced = await dataFetcherAlt.getMatchEnhanced(match, matchId);

    res.json({
      success: true,
      data: enhanced,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/matches/:id 错误:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/standings
 * 全部小组积分榜
 */
router.get('/standings', (req, res) => {
  try {
    const games = dataFetcher.getGames() || [];
    const staticGroups = dataFetcher.getGroups();

    // Build team name (nameZh + flag) from games
    const teamInfo = {};
    games.forEach(g => {
      if (g.homeTeam?.id) teamInfo[String(g.homeTeam.id)] = { nameZh: g.homeTeam.nameZh || g.homeTeam.name, flag: g.homeTeam.flag || '' };
      if (g.awayTeam?.id) teamInfo[String(g.awayTeam.id)] = { nameZh: g.awayTeam.nameZh || g.awayTeam.name, flag: g.awayTeam.flag || '' };
    });

    // Compute standings from finished group matches
    const groupFinished = games.filter(m => m.type === 'group' && m.group && m.status === 'finished');

    // Initialize standings from static group structure
    const standings = {};
    staticGroups.forEach(g => {
      const gn = g.name;
      if (!standings[gn]) standings[gn] = {};
      (g.teams || []).forEach(t => {
        const id = String(t.id);
        const info = teamInfo[id] || {};
        standings[gn][id] = {
          id: t.id,
          name: t.name,
          shortName: t.name.substring(0, 3),
          flag: info.flag || t.flag || '',
          nameZh: info.nameZh || t.nameZh || t.name,
          played: 0, won: 0, drawn: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, points: 0
        };
      });
    });

    // Process finished group matches
    groupFinished.forEach(m => {
      const gn = m.group;
      const homeId = String(m.homeTeam.id);
      const awayId = String(m.awayTeam.id);
      const hs = parseInt(m.homeTeam.score) || 0;
      const as = parseInt(m.awayTeam.score) || 0;

      if (!standings[gn]) standings[gn] = {};
      if (!standings[gn][homeId]) {
        const info = teamInfo[homeId] || {};
        standings[gn][homeId] = { id: m.homeTeam.id, name: m.homeTeam.name, nameZh: info.nameZh || m.homeTeam.nameZh || m.homeTeam.name, flag: info.flag || m.homeTeam.flag || '', played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
      }
      if (!standings[gn][awayId]) {
        const info = teamInfo[awayId] || {};
        standings[gn][awayId] = { id: m.awayTeam.id, name: m.awayTeam.name, nameZh: info.nameZh || m.awayTeam.nameZh || m.awayTeam.name, flag: info.flag || m.awayTeam.flag || '', played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
      }

      const home = standings[gn][homeId];
      const away = standings[gn][awayId];
      home.played++; away.played++;
      home.goalsFor += hs; home.goalsAgainst += as;
      away.goalsFor += as; away.goalsAgainst += hs;
      if (hs > as) { home.won++; home.points += 3; away.lost++; }
      else if (hs < as) { away.won++; away.points += 3; home.lost++; }
      else { home.drawn++; home.points++; away.drawn++; away.points++; }
    });

    // Sort teams within each group: Pts desc, GD desc, GF desc
    const result = Object.keys(standings).sort().map(gn => ({
      name: gn,
      teams: Object.values(standings[gn]).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = (a.goalsFor - a.goalsAgainst);
        const gdB = (b.goalsFor - b.goalsAgainst);
        if (gdB !== gdA) return gdB - gdA;
        return (b.goalsFor || 0) - (a.goalsFor || 0);
      }).map(t => ({ ...t, goalDiff: t.goalsFor - t.goalsAgainst }))
    }));

    const { group } = req.query;
    let filtered = result;
    if (group) {
      filtered = result.filter(g => g.name?.toUpperCase() === group.toUpperCase());
    }
    res.json({
      success: true,
      count: filtered.length,
      data: filtered,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/standings 错误:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/live
 * 进行中的比赛
 */
router.get('/live', (req, res) => {
  try {
    const liveGames = dataFetcher.getLiveGames();
    res.json({
      success: true,
      count: liveGames.length,
      data: liveGames,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/live 错误:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/stats
 * 赛事统计
 */
router.get('/stats', (req, res) => {
  try {
    const stats = dataFetcher.getStats();
    res.json({
      success: true,
      data: stats,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/stats 错误:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/teams
 * 球队列表
 */
router.get('/teams', (req, res) => {
  try {
    const teams = dataFetcher.getTeams();
    const rankings = loadRankings();
    teams.forEach(function(t) {
      t.fifaRank = rankings[String(t.id)] || null;
    });
    res.json({
      success: true,
      count: teams.length,
      data: teams,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/teams 错误:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/stadiums
 * 球场列表
 */
router.get('/stadiums', (req, res) => {
  try {
    const stadiums = dataFetcher.getStadiums();
    res.json({
      success: true,
      count: stadiums.length,
      data: stadiums,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/stadiums 错误:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/teams/:id/squad
 * 获取球队阵容（球员号码、姓名、位置、头像）
 */
router.get('/teams/:id/squad', async (req, res) => {
  try {
    const teamId = req.params.id;
    const result = await squadFetcher.getSquad(teamId);
    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.json({ success: false, error: result.error || '暂无阵容数据' });
    }
  } catch (error) {
    console.error('[API] /api/teams/:id/squad 错误:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /api/matches/:id/lineups
 * 获取比赛首发阵容（直播吧数据源）
 */
router.get('/matches/:id/lineups', async (req, res) => {
  try {
    const matchId = req.params.id;
    const result = await lineupFetcher.getLineups(matchId);
    res.json(result);
  } catch (error) {
    console.error('[API] /api/matches/:id/lineups 错误:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /api/matches/:id/events
 * 获取比赛事件（进球/红黄牌/换人）
 */
router.get('/matches/:id/events', async (req, res) => {
  try {
    const matchId = req.params.id;
    const events = await dataFetcherAlt.getMatchEvents(matchId);
    res.json({
      success: true,
      data: events,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/matches/:id/events 错误:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /api/matches/:id/stats
 * 获取技术统计
 */
router.get('/matches/:id/stats', async (req, res) => {
  try {
    const matchId = req.params.id;
    const stats = await dataFetcherAlt.getMatchStats(matchId);
    res.json({
      success: true,
      data: stats,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/matches/:id/stats 错误:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /api/health
 * 健康检查
 */
router.get('/health', (req, res) => {
  try {
    const health = dataFetcher.getHealth();
    res.json({
      success: true,
      data: health,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/health 错误:', error.message);
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message
    });
  }
});




/**
 * GET /api/predict/history/:id
 * 获取比赛预测历史
 */
router.get('/predict/history/:id', async (req, res) => {
  try {
    const matchId = req.params.id;
    const result = await predictionService.getHistory(matchId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[API] /api/predict/history:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/predict/:id
 * AI比赛预测（调用DeepSeek API）
 */
router.get('/predict/:id', async (req, res) => {
  try {
    const matchId = req.params.id;
    const games = dataFetcher.getGames();
    const match = games.find(g => g.id === matchId);
    if (!match) {
      return res.status(404).json({ success: false, error: '比赛不存在' });
    }
    const result = await predictionService.getPrediction(matchId, match);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[API] /api/predict:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/top-scorers
 * 射手榜 - 从已完赛比赛事件中聚合
 */
router.get('/top-scorers', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const games = dataFetcher.getGames();
    const finished = games.filter(g => g.status === 'finished');
    const scorerMap = {};
    const teamMap = {};

    for (const game of finished) {
      try {
        const matchPath = path.join(__dirname, '..', 'data', 'matches', 'match_' + game.id + '.json');
        let events = [];
        if (fs.existsSync(matchPath)) {
          const md = JSON.parse(fs.readFileSync(matchPath, 'utf8'));
          events = md.events || [];
        } else {
          const enhanced = await dataFetcherAlt.getMatchEnhanced(game, game.id);
          events = enhanced.events || [];
        }
        const homeName = game.homeTeam?.nameZh || game.homeTeam?.name || '';
        const awayName = game.awayTeam?.nameZh || game.awayTeam?.name || '';
        for (const evt of events) {
          if (evt.type === 'goal' && evt.player) {
            const name = evt.player.trim();
            const teamName = evt.team === 'home' ? homeName : awayName;
            if (!scorerMap[name]) {
              scorerMap[name] = { name, goals: 0, team: evt.team || 'home', country: teamName };
            }
            scorerMap[name].goals++;
          }
        }
      } catch(e) { /* skip */ }
    }

    const scorers = Object.values(scorerMap).sort((a, b) => b.goals - a.goals).slice(0, 20);

    // Load player photos from fifaSquadData
    try {
      const fs = require('fs');
      const path = require('path');
      const fifaPath = path.join(__dirname, '..', 'data', 'fifaSquadData.json');
      if (fs.existsSync(fifaPath)) {
        const fifaData = JSON.parse(fs.readFileSync(fifaPath, 'utf8'));
        const teamGames = {};
        games.forEach(g => {
          if (g.homeTeam?.id) teamGames[g.homeTeam.id] = g.homeTeam;
          if (g.awayTeam?.id) teamGames[g.awayTeam.id] = g.awayTeam;
        });
        for (const s of scorers) {
          // Search for matching player by nameZh across all teams
          for (const tid of Object.keys(fifaData)) {
            const squad = fifaData[tid].players || [];
            const match = squad.find(p => p.nameZh === s.name || p.name === s.name);
            if (match && match.photo) {
              s.photo = match.photo;
              // Also add the flag from the team
              const teamId = tid;
              if (teamGames[teamId] && !s.flag) s.flag = teamGames[teamId].flag || '';
              break;
            }
          }
        }
      }
    } catch(e) { /* photo lookup optional */ }

    res.json({ success: true, data: scorers, total: scorers.length });
  } catch (error) {
    console.error('[API] /api/top-scorers 错误:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});


/**
 * GET /api/rankings
 * 球队FIFA世界排名
 */
const RANKINGS_PATH = require('path').join(__dirname, '..', 'static', 'static_rankings.json');
let rankingsCache = null;
function loadRankings() {
  if (!rankingsCache) {
    try {
      rankingsCache = JSON.parse(require('fs').readFileSync(RANKINGS_PATH, 'utf8'));
    } catch (e) {
      rankingsCache = {};
    }
  }
  return rankingsCache;
}

router.get('/rankings', (req, res) => {
  try {
    const rankings = loadRankings();
    res.json({
      success: true,
      data: rankings,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/rankings 错误:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

module.exports = router;
