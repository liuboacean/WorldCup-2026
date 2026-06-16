/**
 * modal.js - 比赛详情弹窗 (v2 - 直播吧数据源)
 *
 * 功能：
 * - 点击比赛卡片弹出详情
 * - 显示比赛事件时间线（进球/红黄牌/换人）
 * - 显示技术统计
 * - 显示首发阵容（足球场SVG）
 * - 显示战报
 * - 可关闭（点击遮罩层或关闭按钮）
 * - 键盘 ESC 关闭
 */

const WorldCupModal = (() => {
  'use strict';

  const API_BASE = '/api';
  let activeModal = null;
  let isClosing = false;

  async function open(matchId) {
    close();

    try {
      const response = await fetch(`${API_BASE}/matches/${matchId}`);
      const result = await response.json();
      const match = result.data;

      if (!match) {
        showToast('比赛数据加载失败');
        return;
      }

      renderModal(match);
      bindEvents();
    } catch (error) {
      console.error('[Modal] 加载比赛详情失败:', error);
      showToast('加载比赛详情失败');
    }
  }

  function renderModal(match) {
    let stadium = null;
    if (typeof WorldCupApp !== 'undefined' && WorldCupApp.getState) {
      const st = WorldCupApp.getState();
      stadium = (st.stadiums || []).find(s => String(s.id) === String(match.stadiumId));
    }
    const container = document.getElementById('modalContainer');

    const timeStr = match.beijingTime?.full || '--:--';
    const groupInfo = match.group ? `${match.group}组` : (match.type || '比赛');

    let scoreDisplay, statusDisplay;
    if (match.status === 'notstarted') {
      scoreDisplay = 'vs';
      statusDisplay = '⏳ 未开始';
    } else if (match.status === 'live') {
      scoreDisplay = `${match.homeTeam.score} - ${match.awayTeam.score}`;
      statusDisplay = `🟢 进行中 (${match.timeElapsed || ''})`;
    } else {
      scoreDisplay = `${match.homeTeam.score} - ${match.awayTeam.score}`;
      statusDisplay = '✅ 已结束';
    }

    container.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-content" style="max-width:680px">
          <div class="modal-header">
            <h2>⚽ 比赛详情</h2>
            <button class="modal-close" id="modalClose">&times;</button>
          </div>
          <div class="modal-body">
            <!-- 大比分 -->
            <div class="match-detail-score">
              <div class="teams-row">
                <span class="team-name-large team-clickable" onclick="event.stopPropagation();openTeamSquad('${match.homeTeam.id}','${match.homeTeam.nameZh || match.homeTeam.name}')">${match.homeTeam.flag ? '<img class="team-flag team-flag-large" src="' + match.homeTeam.flag + '" alt=""> ' : ''}${match.homeTeam.nameZh || match.homeTeam.name || 'TBD'}</span>
                <span class="big-score">${scoreDisplay}</span>
                <span class="team-name-large team-clickable" onclick="event.stopPropagation();openTeamSquad('${match.awayTeam.id}','${match.awayTeam.nameZh || match.awayTeam.name}')">${match.awayTeam.nameZh || match.awayTeam.name || 'TBD'}${match.awayTeam.flag ? ' <img class="team-flag team-flag-large" src="' + match.awayTeam.flag + '" alt="">' : ''}</span>
              </div>
              <div class="status-info">
                <span>${groupInfo} · ${timeStr} · ${statusDisplay}</span>${stadium ? '<div class="match-venue" style="margin-top:8px;font-size:0.85em">🏟️ ' + (stadium.nameZh || stadium.name) + ' · ' + (stadium.cityZh || stadium.city) + '</div>' : ''}
              </div>
            </div>

            <!-- 比赛事件时间线 -->
            <div id="matchEventsArea">${renderEvents(match)}</div>

            <!-- 技术统计 -->
            <div id="matchStatsArea">${renderStats(match)}</div>

            <!-- 首发阵容 -->
            <div id="lineupArea">${renderLineupsContainer(match)}</div>

            <!-- 战报 -->
            ${renderReport(match)}
          </div>
        </div>
      </div>`;

    activeModal = container.querySelector('#modalOverlay');

    // 异步加载阵容
    loadLineups(match);
  }

  function renderEvents(match) {
    const events = match.events || [];
    const cards = match.cards || [];
    const goalsExt = match.goals_ext || [];

    // 合并所有事件
    const allEvents = [];

    // 从本地zhibo8数据的事件
    events.forEach(e => {
      if (e.type === 'goal') {
        allEvents.push({ type: 'goal', minute: e.minute, text: `${e.player || ''}${e.event_cn && e.event_cn.includes('乌龙') ? ' (乌龙)' : ''}`, team: e.team || '' });
      } else if (e.type === 'yellow_card') {
        allEvents.push({ type: 'card-yellow', minute: e.minute, text: `${e.player || ''} 🟨`, team: e.team || '' });
      } else if (e.type === 'red_card') {
        allEvents.push({ type: 'card-red', minute: e.minute, text: `${e.player || ''} 🟥`, team: e.team || '' });
      } else if (e.type === 'substitution') {
        // 配对换人："换下"和"换上"配对
        if (e.event_cn === '换下' || e.info?.includes('换下')) {
          const sub = allEvents.find(a => a.type === 'sub' && a.minute === e.minute && !a.offPlayer);
          if (sub) { sub.offPlayer = e.player || ''; }
          else { allEvents.push({ type: 'sub', minute: e.minute, offPlayer: e.player || '', onPlayer: '', team: e.team || '' }); }
        } else if (e.event_cn === '换上' || e.info?.includes('换上')) {
          const sub = allEvents.find(a => a.type === 'sub' && a.minute === e.minute && !a.onPlayer);
          if (sub) { sub.onPlayer = e.player || ''; }
          else { allEvents.push({ type: 'sub', minute: e.minute, offPlayer: '', onPlayer: e.player || '', team: e.team || '' }); }
        }
      }
    });

    // 备用：从goals_ext和cards字段
    if (events.length === 0) {
      goalsExt.forEach(g => {
        allEvents.push({ type: 'goal', minute: g.minute || 0, text: `${g.player || ''}${g.info && g.info.includes('乌龙') ? ' (乌龙)' : ''}`, team: g.team || '' });
      });
      cards.forEach(c => {
        allEvents.push({ type: c.cardType === 'red' ? 'card-red' : 'card-yellow', minute: c.minute || 0, text: c.player || '', team: c.team || '' });
      });
    }

    // 备用：从主数据的scorers
    if (allEvents.length === 0) {
      if (match.homeTeam.scorers && match.homeTeam.scorers.length > 0) {
        match.homeTeam.scorers.forEach(s => {
          const mm = extractMinute(s);
          allEvents.push({ type: 'goal', minute: mm, text: s, team: match.homeTeam.nameZh || match.homeTeam.name });
        });
      }
      if (match.awayTeam.scorers && match.awayTeam.scorers.length > 0) {
        match.awayTeam.scorers.forEach(s => {
          const mm = extractMinute(s);
          allEvents.push({ type: 'goal', minute: mm, text: s, team: match.awayTeam.nameZh || match.awayTeam.name });
        });
      }
    }

    allEvents.sort((a, b) => ((a.minute != null ? parseInt(a.minute) : 999) - (b.minute != null ? parseInt(b.minute) : 999)));

    if (allEvents.length === 0) {
      if (match.status === 'notstarted') {
        return '<div class="detail-section"><div class="detail-section-title">⏳ 比赛事件</div><p style="color:var(--text-muted);font-size:13px">比赛尚未开始</p></div>';
      }
      return ''; // 没有事件不显示，避免占位
    }

    // 获取国旗HTML辅助
    function getGoalFlag(match, team) {
      if (!team) return '';
      if (team === 'home') return match.homeTeam?.flag || '';
      if (team === 'away') return match.awayTeam?.flag || '';
      // 处理team为球队名的情况（备用数据源）
      if (match.homeTeam && (team === match.homeTeam.nameZh || team === match.homeTeam.name)) return match.homeTeam?.flag || '';
      if (match.awayTeam && (team === match.awayTeam.nameZh || team === match.awayTeam.name)) return match.awayTeam?.flag || '';
      return '';
    }

    let html = '<div class="detail-section"><div class="detail-section-title">📊 比赛事件</div><div class="timeline">';
    allEvents.forEach(e => {
      const icons = { 'goal': '⚽', 'card-yellow': '🟨', 'card-red': '🟥', 'sub': '🔄' };
      const icon = icons[e.type] || '•';
      const cls = e.type.replace('card-', '');
      let text = e.text || '';
      if (e.type === 'sub') {
        const flagUrl = getGoalFlag(match, e.team);
        const flagImg = flagUrl ? `<img class="goal-flag" src="${flagUrl}" alt="">` : '';
        text = `${flagImg}${e.offPlayer || ''} <span class="sub-down">⬇</span>  ${e.onPlayer || ''} <span class="sub-up">⬆</span>`;
      } else if (e.type === 'goal') {
        const flagUrl = getGoalFlag(match, e.team);
        const flagImg = flagUrl ? `<img class="goal-flag" src="${flagUrl}" alt="">` : '';
        text = `${flagImg}<strong>${e.text || ''}</strong>`;
        e._isGoal = true;
      } else if (e.type === 'card-yellow' || e.type === 'card-red') {
        const flagUrl = getGoalFlag(match, e.team);
        const flagImg = flagUrl ? `<img class="goal-flag" src="${flagUrl}" alt="">` : '';
        text = `${flagImg}${e.text || e.player || ''}`;
      } else if (e.team) {
        text = `${e.team}: ${e.text || ''}`;
      } else {
        text = e.text || '';
      }
      // 红黄牌不显示分钟（阵容数据无准确时间）
      const showMinute = !(e.type === 'card-yellow' || e.type === 'card-red') && e.minute != null && parseInt(e.minute) > 0;
      const goalExtra = e._isGoal ? ' goal-highlight' : '';
      html += `<div class="timeline-item ${cls}${goalExtra}">
        <span class="minute">${showMinute ? e.minute + "'" : ''}</span>
        <span class="event-text">${icon} ${text}</span>
      </div>`;
    });
    html += '</div></div>';
    return html;
  }

  function renderStats(match) {
    const stats = match.stats;
    if (!stats || !stats.home || Object.keys(stats.home).length === 0) {
      return ''; // 无统计数据不显示
    }

    const h = stats.home;
    const a = stats.away;

    const rows = [];
    if (h.shots !== undefined) rows.push({ label: '射门', home: h.shots, away: a.shots });
    if (h.shotsOnTarget !== undefined) rows.push({ label: '射正', home: h.shotsOnTarget, away: a.shotsOnTarget });
    if (h.possession) rows.push({ label: '控球率', home: h.possession, away: a.possession });
    if (h.passAccuracy) rows.push({ label: '传球成功率', home: h.passAccuracy, away: a.passAccuracy });
    if (h.corners !== undefined) rows.push({ label: '角球', home: h.corners, away: a.corners });
    if (h.fouls !== undefined) rows.push({ label: '犯规', home: h.fouls, away: a.fouls });
    if (h.yellowCards !== undefined) rows.push({ label: '黄牌', home: h.yellowCards, away: a.yellowCards });
    if (h.redCards !== undefined) rows.push({ label: '红牌', home: h.redCards, away: a.redCards });

    if (rows.length === 0) return '';

    let html = '<div class="detail-section"><div class="detail-section-title">📈 技术统计</div>';
    html += '<div class="stats-table">';
    const homeFlag = match.homeTeam?.flag ? `<img class="goal-flag" src="${match.homeTeam.flag}" alt=""> ` : '';
    const awayFlag = match.awayTeam?.flag ? `<img class="goal-flag" src="${match.awayTeam.flag}" alt=""> ` : '';
    const homeName = match.homeTeam?.nameZh || match.homeTeam?.name || h.name || '主队';
    const awayName = match.awayTeam?.nameZh || match.awayTeam?.name || a.name || '客队';
    html += '<div class="stats-header"><span class="stats-team-name">' + homeFlag + homeName + '</span><span class="stats-label">指标</span><span class="stats-team-name">' + awayFlag + awayName + '</span></div>';
    rows.forEach(row => {
      // 计算比例条
      const hVal = parseInt(String(row.home).replace('%', '')) || 0;
      const aVal = parseInt(String(row.away).replace('%', '')) || 0;
      const total = hVal + aVal || 1;
      const hPct = (hVal / total * 100).toFixed(0);
      const aPct = (aVal / total * 100).toFixed(0);

      html += '<div class="stats-row">';
      html += '<span class="stats-val home-val" style="width:45%;text-align:right;padding-right:8px;font-weight:600">' + row.home + '</span>';
      html += '<span class="stats-bar-wrap" style="width:10%;display:flex;align-items:center;gap:2px;justify-content:center">';
      html += '<span class="stats-bar home-bar" style="height:4px;background:var(--accent-blue);border-radius:2px;width:' + hPct + 'px;min-width:2px"></span>';
      html += '<span class="stats-label" style="font-size:10px;color:var(--text-muted);white-space:nowrap;min-width:50px;text-align:center">' + row.label + '</span>';
      html += '<span class="stats-bar away-bar" style="height:4px;background:var(--accent-red);border-radius:2px;width:' + aPct + 'px;min-width:2px"></span>';
      html += '</span>';
      html += '<span class="stats-val away-val" style="width:45%;text-align:left;padding-left:8px;font-weight:600">' + row.away + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderLineupsContainer(match) {
    return '<div class="lineup-section" id="lineupSection"><div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">⏳ 加载首发阵容...</div></div>';
  }

  async function loadLineups(match) {
    const section = document.getElementById('lineupSection');
    if (!section) return;

    try {
      const resp = await fetch('/api/matches/' + match.id + '/lineups');
      const result = await resp.json();
      if (!result.success || !result.data) {
        section.innerHTML = '<div class="lineup-empty">⏳ 首发阵容尚未公布<br><small style="color:var(--text-muted)">通常开赛前1小时公布</small></div>';
        return;
      }
      renderLineupsInPlace(section, result.data);
    } catch (e) {
      section.innerHTML = '<div class="lineup-empty">首发阵容加载失败</div>';
    }
  }

  function renderLineupsInPlace(container, lineupData) {
    const lineups = lineupData.lineups || [];
    if (lineups.length === 0) {
      container.innerHTML = '<div class="lineup-empty">暂无首发阵容数据</div>';
      return;
    }

    let html = '<div class="detail-section-title" style="margin-bottom:8px">📋 首发阵容</div>';
    html += '<div class="lineup-tabs" id="lineupTabs">';
    lineups.forEach((l, i) => {
      const isActive = i === 0 ? ' active' : '';
      html += '<button class="lineup-tab' + isActive + '" data-idx="' + i + '">' + l.teamName + ' (' + l.formation + ')</button>';
    });
    html += '</div>';
    html += '<div id="lineupContent"></div>';
    container.innerHTML = html;

    renderSingleLineup(container.querySelector('#lineupContent'), lineups[0]);

    container.querySelector('#lineupTabs').addEventListener('click', function(e) {
      const tab = e.target.closest('.lineup-tab');
      if (!tab) return;
      container.querySelectorAll('.lineup-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const idx = parseInt(tab.dataset.idx);
      renderSingleLineup(container.querySelector('#lineupContent'), lineups[idx]);
    });
  }

  function renderSingleLineup(container, lineup) {
    const formation = lineup.formation || '4-3-3';
    const players = lineup.startXI || [];
    const subs = lineup.substitutes || [];
    const formationParts = formation.split('-').map(Number);

    const fieldW = 700;
    const fieldH = 520;
    const goalY = fieldH / 2;
    const startX = 50;
    const endX = fieldW - 50;
    const vGap = 68; // 球员垂直间距（放大以容纳更大名字）

    // 按阵型计算位置
    const positions = [];
    let playerIdx = 0;

    // 门将
    if (playerIdx < players.length) {
      positions.push({ x: startX + 12, y: goalY, player: players[playerIdx] });
      playerIdx++;
    }

    // 后卫
    const defCount = formationParts[0] || 4;
    for (let i = 0; i < defCount && playerIdx < players.length; i++) {
      const x = startX + (endX - startX) * 0.22;
      const y = goalY - (defCount - 1) * (vGap / 2) + i * vGap;
      positions.push({ x, y, player: players[playerIdx] });
      playerIdx++;
    }

    // 中场
    const midCount = formationParts[1] || 3;
    for (let i = 0; i < midCount && playerIdx < players.length; i++) {
      const x = startX + (endX - startX) * 0.45;
      const y = goalY - (midCount - 1) * (vGap / 2) + i * vGap;
      positions.push({ x, y, player: players[playerIdx] });
      playerIdx++;
    }

    // 前锋
    const fwdCount = formationParts[2] || 3;
    for (let i = 0; i < fwdCount && playerIdx < players.length; i++) {
      const x = startX + (endX - startX) * 0.7;
      const y = goalY - (fwdCount - 1) * (vGap / 2) + i * vGap;
      positions.push({ x, y, player: players[playerIdx] });
      playerIdx++;
    }

    // 剩余球员
    while (playerIdx < players.length) {
      positions.push({ x: endX - 30, y: fieldH - 20, player: players[playerIdx] });
      playerIdx++;
    }

    let resultHtml = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    resultHtml += '<span class="formation-badge">📋 ' + formation + '</span>';
    if (lineup.coach) {
      resultHtml += '<span class="formation-badge">👔 教练: ' + lineup.coach + '</span>';
    }
    resultHtml += '</div>';

    // SVG球场
    resultHtml += '<div class="pitch-container">';
    resultHtml += '<svg class="pitch-svg" viewBox="0 0 ' + fieldW + ' ' + fieldH + '" xmlns="http://www.w3.org/2000/svg">';
    resultHtml += '<rect width="' + fieldW + '" height="' + fieldH + '" fill="#2d5a27"/>';
    
    // 球场标记
    const cx = fieldW / 2, cy = fieldH / 2;
    resultHtml += '<line x1="' + cx + '" y1="0" x2="' + cx + '" y2="' + fieldH + '" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>';
    resultHtml += '<circle cx="' + cx + '" cy="' + cy + '" r="50" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>';
    resultHtml += '<rect x="0" y="' + (cy-100) + '" width="80" height="200" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>';
    resultHtml += '<rect x="' + (fieldW-80) + '" y="' + (cy-100) + '" width="80" height="200" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>';
    resultHtml += '<rect x="0" y="' + (cy-50) + '" width="35" height="100" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>';
    resultHtml += '<rect x="' + (fieldW-35) + '" y="' + (cy-50) + '" width="35" height="100" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>';
    
    // 草皮条纹
    for (let i = 0; i < 10; i++) {
      resultHtml += '<rect x="' + (i*68) + '" y="0" width="34" height="' + fieldH + '" fill="rgba(255,255,255,0.02)"/>';
    }

    // 球员
    positions.forEach(pos => {
      const p = pos.player;
      resultHtml += '<circle class="field-player" cx="' + pos.x + '" cy="' + pos.y + '" r="21"/>';
      resultHtml += '<text class="field-player-number" x="' + pos.x + '" y="' + pos.y + '">' + (p.number || '?') + '</text>';
      const name = p.name || '';
      resultHtml += '<text class="field-player-name" x="' + pos.x + '" y="' + (pos.y + 28) + '">' + name + '</text>';
    });

    resultHtml += '</svg></div>';

    // 替补
    if (subs.length > 0) {
      resultHtml += '<div class="subs-list"><div class="subs-title">🔄 替补 (' + subs.length + '人)</div>';
      subs.forEach(s => {
        resultHtml += '<span class="sub-player">' + (s.number || '-') + ' ' + (s.name || '') + '</span>';
      });
      resultHtml += '</div>';
    }

    container.innerHTML = resultHtml;
  }

  function renderReport(match) {
    if (!match.report) return '';
    return '<div class="detail-section" style="margin-top:16px"><div class="detail-section-title">📝 战报</div><p style="color:var(--text-secondary);font-size:13px;line-height:1.8">' + match.report + '</p></div>';
  }

  function extractMinute(scorerStr) {
    if (!scorerStr) return 0;
    const match = scorerStr.match(/(\d+)'?/);
    return match ? parseInt(match[1]) : 0;
  }

  function bindEvents() {
    if (!activeModal) return;

    const closeBtn = activeModal.querySelector('#modalClose');
    if (closeBtn) closeBtn.addEventListener('click', close);

    activeModal.addEventListener('click', (e) => {
      if (e.target === activeModal) close();
    });

    document.addEventListener('keydown', handleEsc);

    const content = activeModal.querySelector('.modal-content');
    if (content) content.addEventListener('click', (e) => e.stopPropagation());
  }

  function handleEsc(e) {
    if (e.key === 'Escape') close();
  }

  function close() {
    if (isClosing || !activeModal) return;
    isClosing = true;
    activeModal.classList.add('closing');
    setTimeout(() => {
      if (activeModal && activeModal.parentNode) {
        activeModal.parentNode.innerHTML = '';
      }
      activeModal = null;
      isClosing = false;
      document.removeEventListener('keydown', handleEsc);
    }, 200);
  }

  function showToast(message) {
    console.warn('[Modal]', message);
  }

  return { open, close };
})();
