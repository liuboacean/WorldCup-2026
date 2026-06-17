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
    const games = dataFetcher.getGames();
    const match = games.find(g => g.id === matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `比赛 ${matchId} 不存在`
      });
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
    let groups = dataFetcher.getGroups();
    const { group } = req.query;
    if (group) {
      groups = groups.filter(g => g.name?.toUpperCase() === group.toUpperCase());
    }
    res.json({
      success: true,
      count: groups.length,
      data: groups,
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
    const games = dataFetcher.getGames();
    const finished = games.filter(g => g.status === 'finished');
    const scorerMap = {};
    const teamMap = {};

    for (const game of finished.slice(0, 20)) {
      try {
        const enhanced = await dataFetcherAlt.getMatchEnhanced(game, game.id);
        const events = enhanced.events || [];
        for (const evt of events) {
          if (evt.type === 'goal' && evt.player) {
            const name = evt.player.trim();
            if (!scorerMap[name]) {
              scorerMap[name] = { name, goals: 0, team: evt.team || 'home' };
            }
            scorerMap[name].goals++;
          }
        }
      } catch(e) { /* skip */ }
    }

    const scorers = Object.values(scorerMap).sort((a, b) => b.goals - a.goals).slice(0, 20);
    res.json({ success: true, data: scorers, total: scorers.length });
  } catch (error) {
    console.error('[API] /api/top-scorers 错误:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

module.exports = router;
