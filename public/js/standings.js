/**
 * standings.js - 积分榜渲染
 *
 * 从后端 API 获取小组积分榜数据并渲染为卡片表格。
 */

const WorldCupStandings = (() => {
  'use strict';

  let standingsGrid = null;

  function cacheDom() {
    standingsGrid = document.getElementById('standingsGrid');
  }

  /**
   * 渲染所有小组积分榜
   * @param {Array} groups - 小组数据数组
   */
  function render(groups) {
    if (!standingsGrid) cacheDom();

    if (!groups || groups.length === 0) {
      standingsGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state-text">暂无积分榜数据</div>
        </div>`;
      return;
    }

    let html = '';
    groups.forEach(group => {
      html += renderGroupCard(group);
    });

    standingsGrid.innerHTML = html;
  }

  /**
   * 渲染单个小组卡片
   * @param {Object} group - 小组数据
   */
  function renderGroupCard(group) {
    const teams = group.teams || [];
    const groupName = group.name || 'Group ?';

    let rowsHtml = '';
    teams.forEach((team, index) => {
      const isQualify = index < 2; // 前两名晋级
      const gd = parseInt(team.goalDiff || team.goalsFor - team.goalsAgainst || 0);
      const gdClass = gd > 0 ? 'positive' : (gd < 0 ? 'negative' : '');

      rowsHtml += `
        <tr class="${isQualify ? 'qualify-zone' : ''}">
          <td>
            <div class="team-cell">
              <span class="rank">${index + 1}</span>
              ${team.flag ? `<img src="${team.flag}" alt="${team.name}" loading="lazy">` : ''}
              <span class="name">${team.shortName || team.name}</span>
            </div>
          </td>
          <td>${team.played || 0}</td>
          <td>${team.won || 0}</td>
          <td>${team.drawn || 0}</td>
          <td>${team.lost || 0}</td>
          <td>${team.goalsFor || 0}:${team.goalsAgainst || 0}</td>
          <td class="gd ${gdClass}">${gd > 0 ? '+' : ''}${gd}</td>
          <td class="pts">${team.points || 0}</td>
        </tr>`;
    });

    return `
      <div class="group-card">
        <div class="group-card-header">
          📋 ${groupName}组
          <span style="float:right;font-weight:400;font-size:12px;color:var(--text-muted)">
            <span style="color:var(--accent-green)">●</span> 晋级区
          </span>
        </div>
        <table class="standings-table">
          <thead>
            <tr>
              <th>球队</th>
              <th>赛</th>
              <th>胜</th>
              <th>平</th>
              <th>负</th>
              <th>进:失</th>
              <th>净</th>
              <th>分</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>`;
  }

  /**
   * 手动计算小组积分榜（从比赛数据推导）
   * 当 API 未提供积分榜时使用
   */
  function calculateStandings(matches, teams) {
    const groups = {};

    // 收集小组赛
    const groupMatches = matches.filter(m => m.type === 'group' && m.group);

    if (groupMatches.length === 0) {
      return [];
    }

    // 初始化小组
    groupMatches.forEach(match => {
      const groupName = match.group;
      if (!groups[groupName]) {
        groups[groupName] = { name: groupName, teams: {} };
      }
    });

    // 累计积分
    groupMatches.forEach(match => {
      const groupName = match.group;
      const homeId = match.homeTeam.id;
      const awayId = match.awayTeam.id;

      if (!groups[groupName].teams[homeId]) {
        groups[groupName].teams[homeId] = {
          id: homeId,
          name: match.homeTeam.name,
          shortName: match.homeTeam.name.substring(0, 3),
          flag: match.homeTeam.flag || '',
          played: 0, won: 0, drawn: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, points: 0
        };
      }
      if (!groups[groupName].teams[awayId]) {
        groups[groupName].teams[awayId] = {
          id: awayId,
          name: match.awayTeam.name,
          shortName: match.awayTeam.name.substring(0, 3),
          flag: match.awayTeam.flag || '',
          played: 0, won: 0, drawn: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, points: 0
        };
      }

      if (match.status === 'finished') {
        const home = groups[groupName].teams[homeId];
        const away = groups[groupName].teams[awayId];

        home.played++;
        away.played++;
        home.goalsFor += match.homeTeam.score;
        home.goalsAgainst += match.awayTeam.score;
        away.goalsFor += match.awayTeam.score;
        away.goalsAgainst += match.homeTeam.score;

        if (match.homeTeam.score > match.awayTeam.score) {
          home.won++; home.points += 3;
          away.lost++;
        } else if (match.homeTeam.score < match.awayTeam.score) {
          away.won++; away.points += 3;
          home.lost++;
        } else {
          home.drawn++; home.points++;
          away.drawn++; away.points++;
        }
      }
    });

    // 转换为数组并排序
    return Object.values(groups).map(g => ({
      name: g.name,
      teams: Object.values(g.teams).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goalsFor - a.goalsAgainst;
        const gdB = b.goalsFor - b.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        return (b.goalsFor || 0) - (a.goalsFor || 0);
      }).map(t => ({
        ...t,
        goalDiff: t.goalsFor - t.goalsAgainst
      }))
    }));
  }

  // ==== 初始化 ====

  function init() {
    cacheDom();
  }

  init();

  return {
    render,
    calculateStandings
  };

})();
