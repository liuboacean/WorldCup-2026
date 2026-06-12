/**
 * lineupFetcher.js - 比赛首发阵容获取 (本地数据优先)
 *
 * 数据源: zhiboFetcher (直播吧 + 本地缓存)
 * 备选: 直接读取本地 matches/ 目录
 */

const zhiboFetcher = require('./zhiboFetcher');
const fs = require('fs');
const path = require('path');

/**
 * 获取比赛首发阵容
 * @param {string} matchId - worldcup26.ir 比赛ID
 */
async function getLineups(matchId) {
  try {
    // 1. 尝试 zhiboFetcher（本地缓存优先）
    const result = await zhiboFetcher.getLineups(matchId);
    if (result.success && result.data && result.data.lineups && result.data.lineups.length > 0) {
      return result;
    }

    // 2. 尝试直接读取本地已注入数据
    const localData = zhiboFetcher.getMatchData ? 
      await zhiboFetcher.getMatchData(matchId) : null;
    
    if (localData && localData.lineups) {
      // 手动构造返回格式（兼容旧的lineupFetcher接口）
      const lineups = [];
      if (localData.lineups.home && localData.lineups.home.name) {
        lineups.push({
          teamName: localData.lineups.home.name,
          formation: localData.lineups.home.formation || '',
          coach: localData.lineups.home.coach || '',
          startXI: (localData.lineups.home.starters || []).map(p => ({
            number: p.number,
            name: p.name,
            pos: p.position || ''
          })),
          substitutes: (localData.lineups.home.substitutes || []).map(p => ({
            number: p.number || '',
            name: p.name,
            pos: p.position || ''
          }))
        });
      }
      if (localData.lineups.away && localData.lineups.away.name) {
        lineups.push({
          teamName: localData.lineups.away.name,
          formation: localData.lineups.away.formation || '',
          coach: localData.lineups.away.coach || '',
          startXI: (localData.lineups.away.starters || []).map(p => ({
            number: p.number,
            name: p.name,
            pos: p.position || ''
          })),
          substitutes: (localData.lineups.away.substitutes || []).map(p => ({
            number: p.number || '',
            name: p.name,
            pos: p.position || ''
          }))
        });
      }

      if (lineups.length > 0) {
        return {
          success: true,
          data: {
            fixtureId: localData.zhiboId || null,
            lineups,
            fetchedAt: localData.fetchedAt
          }
        };
      }
    }

    return { success: false, error: '暂无首发阵容数据', data: null };
  } catch (e) {
    console.error('[LineupFetcher] 获取阵容失败:', e.message);
    return { success: false, error: '服务异常', data: null };
  }
}

module.exports = { getLineups };
