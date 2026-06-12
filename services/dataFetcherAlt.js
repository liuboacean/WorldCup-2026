/**
 * dataFetcherAlt.js - 增强数据服务 (直播吧API实时数据源 v2)
 *
 * 功能：
 * - 通过 zhiboFetcher 获取实时比赛事件（进球/红黄牌/换人）
 * - 获取实时技术统计
 * - 获取战报
 * - 完全免费，实时更新
 */

const zhiboFetcher = require('./zhiboFetcher');

/**
 * 获取比赛的增强数据（合并事件+统计+战报）
 */
async function getMatchEnhanced(match, matchId) {
  const id = matchId || match?.id;
  
  const result = {
    ...match,
    cards: [],
    goals_ext: [],
    events: [],
    stats: null,
    report: null,
    dataSource: 'zhibo8',
    liveScore: null
  };

  try {
    const data = await zhiboFetcher.getMatchData(id);
    if (!data) return result;

    // 实时比分
    result.liveScore = data.score || null;
    result.status = data.status || result.status;
    result.periodCn = data.periodCn || '';

    // 转换事件格式
    const events = data.events || [];
    const cards = [];
    const goals = [];

    for (const evt of events) {
      if (evt.type === 'goal') {
        goals.push({
          player: evt.player || '',
          team: evt.team || '',
          minute: parseInt(evt.minute) || 0,
          info: evt.info || '',
          assist: evt.assist || ''
        });
      } else if (evt.type === 'yellow_card') {
        cards.push({
          player: evt.player || '',
          team: evt.team || '',
          minute: parseInt(evt.minute) || 0,
          cardType: 'yellow',
          detail: '黄牌'
        });
      } else if (evt.type === 'red_card') {
        cards.push({
          player: evt.player || '',
          team: evt.team || '',
          minute: parseInt(evt.minute) || 0,
          cardType: 'red',
          detail: '红牌'
        });
      }
    }

    result.cards = cards;
    result.goals_ext = goals;
    result.events = events;
    result.stats = data.stats || null;
    result.report = data.report || null;

    // 更新比分到match对象
    if (data.score && result.homeTeam) {
      result.homeTeam.score = data.score.home;
      result.awayTeam.score = data.score.away;
      result.homeScore = data.score.home;
      result.awayScore = data.score.away;
    }
  } catch (e) {
    console.error(`[DataFetcherAlt] getMatchEnhanced失败 ${id}:`, e.message);
  }

  return result;
}

/**
 * 获取比赛事件
 */
async function getMatchEvents(matchId) {
  try {
    const data = await zhiboFetcher.getMatchData(matchId);
    return data ? (data.events || []) : [];
  } catch {
    return [];
  }
}

/**
 * 获取技术统计
 */
async function getMatchStats(matchId) {
  try {
    const data = await zhiboFetcher.getMatchData(matchId);
    return data ? (data.stats || null) : null;
  } catch {
    return null;
  }
}

/**
 * 获取实时比分摘要
 */
async function getMatchLiveScore(matchId) {
  try {
    return await zhiboFetcher.getLiveScore(matchId);
  } catch {
    return null;
  }
}

/**
 * 获取战报
 */
async function getMatchReport(matchId) {
  try {
    const data = await zhiboFetcher.getMatchData(matchId);
    return data ? (data.report || null) : null;
  } catch {
    return null;
  }
}

/**
 * 获取红黄牌（兼容旧接口）
 */
async function getCardsForMatch(matchId) {
  try {
    const data = await zhiboFetcher.getMatchData(matchId);
    if (!data || !data.events) return null;

    const cards = [];
    for (const evt of data.events) {
      if (evt.type === 'yellow_card' || evt.type === 'red_card') {
        cards.push({
          player: evt.player || '',
          team: evt.team || '',
          minute: parseInt(evt.minute) || 0,
          cardType: evt.type === 'red_card' ? 'red' : 'yellow',
          detail: evt.type === 'red_card' ? '红牌' : '黄牌'
        });
      }
    }

    return {
      matchId,
      cards,
      goals: (data.events || []).filter(e => e.type === 'goal').map(e => ({
        player: e.player, team: e.team, minute: parseInt(e.minute) || 0
      })),
      fetchedAt: data.fetchedAt
    };
  } catch {
    return null;
  }
}

/**
 * 获取附带红黄牌的比赛详情（兼容旧接口）
 */
async function getMatchWithCards(match, matchId) {
  const cardsData = await getCardsForMatch(matchId || match?.id);
  if (!cardsData) {
    return { ...match, cards: [], goals_ext: [] };
  }
  return {
    ...match,
    cards: cardsData.cards || [],
    goals_ext: cardsData.goals || []
  };
}

/**
 * 检查并更新已结束比赛的数据（仅日志）
 */
async function checkAndFetchFinished(games) {
  const finishedGames = (games || []).filter(g => g.status === 'finished');
  if (finishedGames.length > 0) {
    console.log(`[DataFetcherAlt] 完赛比赛: ${finishedGames.length}场`);
  }
}

module.exports = {
  getMatchEnhanced,
  getMatchEvents,
  getMatchStats,
  getMatchReport,
  getMatchLiveScore,
  getCardsForMatch,
  getMatchWithCards,
  checkAndFetchFinished
};
