/**
 * dataFetcherAlt.js - 增强数据服务 (直播吧API实时数据源 v2)
 *
 * 功能：
 * - 通过 zhiboFetcher 获取实时比赛事件（进球/红黄牌/换人）
 * - 获取实时技术统计
 * - 获取战报
 * - 完全免费，实时更新
 * - 合并 worldcup26.ir 的进球数据补全直播吧缺失的进球事件
 */

const zhiboFetcher = require('./zhiboFetcher');

/**
 * 从worldcup26.ir的scorers文本中提取分钟数
 * 如 "{"محمد هانی 66'"}" → 66, "L. Messi 23'" → 23
 */
function extractGoalMinute(scorerText) {
  if (!scorerText) return 0;
  const m = String(scorerText).match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

/**
 * 从worldcup26.ir的scorers文本中提取球员名
 * 如 "{"محمد هانی 66'"}" → "محمد هانی"
 */
function extractGoalPlayer(scorerText) {
  if (!scorerText) return '';
  // Remove braces, quotes, smart quotes
  let text = String(scorerText).replace(/^[\u007b\u0022\u0027\u201c\u201d]+/, '').replace(/[\u007d\u0022\u0027\u201c\u201d]+$/, '');
  // Remove minute patterns like "12'(p)", "45+5'", "67'"
  text = text.replace(/\s*\d+[+']*\d*'?\s*(?:\([^)]*\))?\s*$/, '');
  // Remove leading "H. " or "J. " style initials  
  text = text.replace(/^[A-Z]\.\s*/, '');
  return text.trim();
}

/**
 * 合并 worldcup26.ir 的进球数据到 events 中
 * 用于补全直播吧API缺失的进球事件
 */
function isNearExistingGoal(minute, existingMinutes, tolerance) {
  tolerance = tolerance || 2;
  for (const em of existingMinutes) {
    if (Math.abs(em - minute) <= tolerance) return true;
  }
  return false;
}

function mergeScorersIntoEvents(match, events) {
  if (!match || !events) return events;

  const existingGoalMinutes = new Set();
  for (const evt of events) {
    if (evt.type === 'goal') {
      existingGoalMinutes.add(parseInt(evt.minute) || 0);
    }
  }

  if (match.homeTeam && match.homeTeam.scorers) {
    for (const s of match.homeTeam.scorers) {
      const mm = extractGoalMinute(s);
      if (mm > 0 && !isNearExistingGoal(mm, existingGoalMinutes)) {
        const player = extractGoalPlayer(s);
        events.push({
          minute: mm,
          type: 'goal',
          event_code: 1,
          event_cn: '\u8fdb\u7403',
          info: s,
          team: 'home',
          player: player || s
        });
        existingGoalMinutes.add(mm);
        console.log('[DataFetcherAlt] \u8865\u5168\u7f3a\u5931\u8fdb\u7403: ' + (match.homeTeam.nameZh || match.homeTeam.name) + ' ' + player + ' ' + mm + '"');
      }
    }
  }

  if (match.awayTeam && match.awayTeam.scorers) {
    for (const s of match.awayTeam.scorers) {
      const mm = extractGoalMinute(s);
      if (mm > 0 && !isNearExistingGoal(mm, existingGoalMinutes)) {
        const player = extractGoalPlayer(s);
        events.push({
          minute: mm,
          type: 'goal',
          event_code: 1,
          event_cn: '\u8fdb\u7403',
          info: s,
          team: 'away',
          player: player || s
        });
        existingGoalMinutes.add(mm);
        console.log('[DataFetcherAlt] \u8865\u5168\u7f3a\u5931\u8fdb\u7403: ' + (match.awayTeam.nameZh || match.awayTeam.name) + ' ' + player + ' ' + mm + '"');
      }
    }
  }

  // Fix player names: when match scorers have a goal at same minute, prefer their name
  // This fixes cases where zhibo8 has wrong player names (e.g., Korean GK "赵贤祐" instead of Jonathan Tah)
  const fixPlayerNames = (teamKey) => {
    if (!match[teamKey] || !match[teamKey].scorers) return;
    for (const s of match[teamKey].scorers) {
      const mm = extractGoalMinute(s);
      const matchPlayer = extractGoalPlayer(s);
      if (!mm || !matchPlayer) continue;
      for (const evt of events) {
        if (evt.type === 'goal' && evt.team === (teamKey === 'homeTeam' ? 'home' : 'away')) {
          const evtMinute = parseInt(evt.minute) || 0;
          if (Math.abs(evtMinute - mm) <= 2 && evt.player !== matchPlayer) {
            console.log('[DataFetcherAlt] 修正球员名: ' + evt.player + ' -> ' + matchPlayer + ' (' + mm + '")');
            evt.player = matchPlayer;
          }
        }
      }
    }
  };
  fixPlayerNames('homeTeam');
  fixPlayerNames('awayTeam');

  events.sort((a, b) => (a.minute || 0) - (b.minute || 0));

  // Fix team field for existing events with empty team
  // Match by minute against worldcup26.ir scorers
  for (const evt of events) {
    if (evt.type === 'goal' && (!evt.team || evt.team === '' || evt.team === '0')) {
      const mm = parseInt(evt.minute) || 0;
      if (match.homeTeam && match.homeTeam.scorers) {
        for (const s of match.homeTeam.scorers) {
          if (extractGoalMinute(s) === mm) { evt.team = 'home'; break; }
        }
      }
      if ((!evt.team || evt.team === '' || evt.team === '0') && match.awayTeam && match.awayTeam.scorers) {
        for (const s of match.awayTeam.scorers) {
          if (extractGoalMinute(s) === mm) { evt.team = 'away'; break; }
        }
      }
      if (evt.team && evt.team !== '' && evt.team !== '0') {
        console.log('[DataFetcherAlt] fixed team: ' + evt.minute + " " + evt.player + " -> " + evt.team);
      }
    }
  }

  return events;
}

/**
 * 获取比赛的增强数据（合并事件+统计+战报）
 */
async function getMatchEnhanced(match, matchId) {
  const id = matchId || (match && match.id);

  const result = Object.assign({}, match, {
    cards: [],
    goals_ext: [],
    events: [],
    stats: null,
    report: null,
    dataSource: 'zhibo8',
    liveScore: null
  });

  try {
    const data = await zhiboFetcher.getMatchData(id);
    // If no zhibo data, or zhibo returned empty events for a finished match,
    // fall back to generating events from worldcup26.ir scorers
    const zhiboEvents = (data && data.events) || [];
    if (!data || (zhiboEvents.length === 0 && data.status === 'finished')) {
      // 当直播吧没有数据时，从worldcup26.ir的进球数据生成基础事件
      const fallbackEvents = [];
      const extractMinute = (s) => {
        const m = String(s).match(/(\d+)/);
        return m ? parseInt(m[1]) : 0;
      };
      const extractPlayer = (s) => {
        let text = String(s).replace(/^[\u007b\u0022\u0027\u201c\u201d]+/, '').replace(/[\u007d\u0022\u0027\u201c\u201d]+$/, '');
        text = text.replace(/\s*\d+[+']*\d*'?\s*(?:\([^)]*\))?\s*$/, '');
        text = text.replace(/^[A-Z]\.\s*/, '');
        return text.trim();
      };
      // Load fifa squad data for Chinese name lookup
      const fs = require('fs');
      const path = require('path');
      let playerNameZhMap = {};
      try {
        const fifaPath = path.join(__dirname, '..', 'data', 'fifaSquadData.json');
        if (fs.existsSync(fifaPath)) {
          const fifaData = JSON.parse(fs.readFileSync(fifaPath, 'utf8'));
          for (const tid of Object.keys(fifaData)) {
            for (const pl of (fifaData[tid].players || [])) {
              if (pl.name) {
                const key = pl.name.toLowerCase().trim();
                playerNameZhMap[key] = pl.nameZh || pl.name;
              }
            }
          }
        }
      } catch (e) { /* ignore */ }
      const lookupChineseName = (name) => {
        const key = name.toLowerCase().trim();
        // Try exact match first
        if (playerNameZhMap[key]) return playerNameZhMap[key];
        // Normalize accents: é→e, ü→u, etc.
        const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normKey = normalize(key);
        // Try contains match: scorer name might contain the fifa name or vice versa
        // Only for names longer than 3 chars - short names (LA, JO, DA) cause false matches
        for (const [fifaKey, zhName] of Object.entries(playerNameZhMap)) {
          if (fifaKey.length > 3) {
            const normFifa = normalize(fifaKey);
            if (normKey.includes(normFifa) || normFifa.includes(normKey)) {
              return zhName;
            }
          }
        }
        return name;
      };
      if (match.homeTeam && match.homeTeam.scorers) {
        (match.homeTeam.scorers || []).forEach(s => {
          if (s && s.trim()) {
            const pn = extractPlayer(s);
            fallbackEvents.push({
              minute: extractMinute(s),
              type: 'goal',
              player: lookupChineseName(pn),
              team: 'home',
              event_cn: '进球'
            });
          }
        });
      }
      if (match.awayTeam && match.awayTeam.scorers) {
        (match.awayTeam.scorers || []).forEach(s => {
          if (s && s.trim()) {
            const pn = extractPlayer(s);
            fallbackEvents.push({
              minute: extractMinute(s),
              type: 'goal',
              player: lookupChineseName(pn),
              team: 'away',
              event_cn: '进球'
            });
          }
        });
      }
      result.events = fallbackEvents;
      // Also copy zhibo stats/lineups if available (even when events are empty)
      if (data && data.stats) result.stats = data.stats;
      if (data && data.lineups) result.lineups = data.lineups;
      if (data && data.liveScore) result.liveScore = data.liveScore;
      if (fallbackEvents.length > 0) {
        result.goals_ext = fallbackEvents.map(e => ({ player: e.player, team: e.team, minute: e.minute }));
      }
      return result;
    }

    result.liveScore = data.score || null;
    // Only use zhibo status if it's more meaningful than the source data
    if (data.status === 'finished') {
      result.status = 'finished';
    } else if (data.status === 'live') {
      result.status = 'live';
    }
    // else keep result.status from the original match object (more reliable)
    result.periodCn = data.periodCn || '';

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
          detail: '\u9ec4\u724c'
        });
      } else if (evt.type === 'red_card') {
        cards.push({
          player: evt.player || '',
          team: evt.team || '',
          minute: parseInt(evt.minute) || 0,
          cardType: 'red',
          detail: '\u7ea2\u724c'
        });
      }
    }

    // ==== Key fix: merge missing goals from worldcup26.ir scorers ====
    mergeScorersIntoEvents(match, events);

    // Rebuild goals array (including merged ones)
    goals.length = 0;
    for (const evt of events) {
      if (evt.type === 'goal') {
        goals.push({
          player: evt.player || '',
          team: evt.team || '',
          minute: parseInt(evt.minute) || 0,
          info: evt.info || '',
          assist: evt.assist || ''
        });
      }
    }

    // ==== Validate goals against actual score (filter out disallowed goals) ====
    // Use zhibo score if available, otherwise fall back to match.score from the main data source
    let homeScore, awayScore;
    if (data.score && (parseInt(data.score.home) > 0 || parseInt(data.score.away) > 0)) {
      homeScore = parseInt(data.score.home) || 0;
      awayScore = parseInt(data.score.away) || 0;
    } else {
      // Fall back to match score from worldcup26.ir (more reliable for finished matches)
      homeScore = parseInt(result.homeTeam?.score) || 0;
      awayScore = parseInt(result.awayTeam?.score) || 0;
    }
    let homeGoalsInEvents = 0, awayGoalsInEvents = 0;
    for (const g of goals) {
      if (g.team === 'home') homeGoalsInEvents++;
      else if (g.team === 'away') awayGoalsInEvents++;
    }
    const totalGoalsInEvents = homeGoalsInEvents + awayGoalsInEvents;
    const totalScore = homeScore + awayScore;
    // Only filter when total goals exceed total score (disallowed goals)
    if (totalGoalsInEvents > totalScore) {
      // Remove extra goals (oldest first) from whichever team has excess
      while (homeGoalsInEvents > homeScore) {
        const idx = goals.findIndex(g => g.team === 'home');
        if (idx >= 0) { goals.splice(idx, 1); homeGoalsInEvents--; }
        else break;
      }
      while (awayGoalsInEvents > awayScore) {
        const idx = goals.findIndex(g => g.team === 'away');
        if (idx >= 0) { goals.splice(idx, 1); awayGoalsInEvents--; }
        else break;
      }
    }
    // Also filter the events array to remove disallowed goals
    result.events = events.filter(evt => {
      if (evt.type !== 'goal') return true;
      // Keep only goals that are in the validated goals array
      return goals.some(g => g.minute === parseInt(evt.minute) && g.team === evt.team);
    });

    result.cards = cards;
    result.goals_ext = goals;
    
    // Lookup Chinese player names from fifa squad data for events and goals_ext
    try {
      const fs = require('fs');
      const path = require('path');
      const fifaPath = path.join(__dirname, '..', 'data', 'fifaSquadData.json');
      if (fs.existsSync(fifaPath)) {
        const fifaData = JSON.parse(fs.readFileSync(fifaPath, 'utf8'));
        const nameZhMap = {};
        for (const tid of Object.keys(fifaData)) {
          for (const pl of (fifaData[tid].players || [])) {
            if (pl.name && pl.nameZh) {
              nameZhMap[pl.name.toLowerCase().trim()] = pl.nameZh;
            }
          }
        }
        const lookupZh = (name) => {
          const key = name.toLowerCase().trim();
          if (nameZhMap[key]) return nameZhMap[key];
          // Normalize accents: é→e, ü→u, etc. so "Kylian Mbappé" matches "mbappe"
          const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const normKey = normalize(key);
          // Only contains match for names > 3 chars to avoid false positives from short names (LA, JO, DA, etc.)
          for (const [fifaKey, zh] of Object.entries(nameZhMap)) {
            if (fifaKey.length > 3) {
              const normFifa = normalize(fifaKey);
              if (normKey.includes(normFifa) || normFifa.includes(normKey)) return zh;
            }
          }
          return name;
        };
        for (const evt of result.events || []) {
          if (evt.type === 'goal' && evt.player) evt.player = lookupZh(evt.player);
        }
        for (const g of result.goals_ext || []) {
          if (g.player) g.player = lookupZh(g.player);
        }
      }
    } catch (e) { /* optional */ }
    
    result.stats = data.stats || null;
    result.report = data.report || null;
    result.penalty = data.penalty || null;

    if (data.score && result.homeTeam) {
      result.homeTeam.score = data.score.home;
      result.awayTeam.score = data.score.away;
      result.homeScore = data.score.home;
      result.awayScore = data.score.away;
    }
  } catch (e) {
    console.error('[DataFetcherAlt] getMatchEnhanced\u5931\u8d25 ' + id + ': ' + e.message);
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
  } catch (e) {
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
  } catch (e) {
    return null;
  }
}

/**
 * 获取实时比分摘要
 */
async function getMatchLiveScore(matchId) {
  try {
    return await zhiboFetcher.getLiveScore(matchId);
  } catch (e) {
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
  } catch (e) {
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
          detail: evt.type === 'red_card' ? '\u7ea2\u724c' : '\u9ec4\u724c'
        });
      }
    }

    return {
      matchId: matchId,
      cards: cards,
      goals: (data.events || []).filter(function(e) { return e.type === 'goal'; }).map(function(e) {
        return { player: e.player, team: e.team, minute: parseInt(e.minute) || 0 };
      }),
      fetchedAt: data.fetchedAt
    };
  } catch (e) {
    return null;
  }
}

/**
 * 获取附带红黄牌的比赛详情（兼容旧接口）
 */
async function getMatchWithCards(match, matchId) {
  const cardsData = await getCardsForMatch(matchId || (match && match.id));
  if (!cardsData) {
    return Object.assign({}, match, { cards: [], goals_ext: [] });
  }
  return Object.assign({}, match, {
    cards: cardsData.cards || [],
    goals_ext: cardsData.goals || []
  });
}

/**
 * 检查并更新已结束比赛的数据（仅日志）
 */
async function checkAndFetchFinished(games) {
  const finishedGames = (games || []).filter(function(g) { return g.status === 'finished'; });
  if (finishedGames.length > 0) {
    console.log('[DataFetcherAlt] \u5b8c\u8d5b\u6bd4\u8d5b: ' + finishedGames.length + '\u573a');
  }
}

module.exports = {
  getMatchEnhanced: getMatchEnhanced,
  getMatchEvents: getMatchEvents,
  getMatchStats: getMatchStats,
  getMatchReport: getMatchReport,
  getMatchLiveScore: getMatchLiveScore,
  getCardsForMatch: getCardsForMatch,
  getMatchWithCards: getMatchWithCards,
  checkAndFetchFinished: checkAndFetchFinished
};
