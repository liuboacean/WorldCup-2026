/**
 * main.js - 核心逻辑：数据拉取、渲染、定时刷新
 *
 * 功能：
 * - 从后端 API 拉取比赛和积分榜数据
 * - 渲染比赛列表（按日期分组）
 * - 状态栏实时更新（时钟、比赛计数、数据源状态）
 * - 30秒自动刷新 + 手动刷新
 * - 深色主题比赛卡片渲染
 */

const WorldCupApp = (() => {
  'use strict';

  // ==== 配置 ====
  const CONFIG = {
    API_BASE: '/api',
    REFRESH_INTERVAL: 30000,     // 30秒自动刷新
    CACHE_KEY: 'worldcup_matches',
    CACHE_TTL: 15000              // 本地缓存 15 秒
  };

  // ==== 状态 ====
  let state = {
    matches: [],
    standings: [],
    stats: null,
    teams: [],
    stadiums: [],
    filteredMatches: [],
    isLiveMode: false,
    lastFetchTime: null,
    selectedMatchId: null,
    dataSourceStatus: 'green',  // green / yellow / red
    refreshTimerId: null
  };

  // ==== DOM 缓存 ====
  let dom = {};

  function cacheDom() {
    dom = {
      matchesContainer: document.getElementById('matchesContainer'),
      standingsGrid: document.getElementById('standingsGrid'),
      groupTeamsGrid: document.getElementById('groupTeamsGrid'),
      loadingIndicator: document.getElementById('loadingIndicator'),
      liveCountText: document.getElementById('liveCountText'),
      clockDisplay: document.getElementById('clockDisplay'),
      lastUpdate: document.getElementById('lastUpdate'),
      refreshBtn: document.getElementById('refreshBtn'),
      statusIndicator: document.getElementById('statusIndicator'),
      statusLabel: document.getElementById('statusLabel'),
      filterDate: document.getElementById('filterDate'),
      filterGroup: document.getElementById('filterGroup'),
      filterStatus: document.getElementById('filterStatus'),
      searchInput: document.getElementById('searchInput'),
      modalContainer: document.getElementById('modalContainer')
    };
  }

  // 打开球队阵容弹窗
  window.openTeamSquad = function(teamId, teamName) {
    var modal = window.SquadModal;
    if (modal) {
      modal.open(teamId, teamName);
    }
  };

  // ==== 网络请求 ====

  async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async function fetchMatches(params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `${CONFIG.API_BASE}/matches${query ? '?' + query : ''}`;
    const result = await fetchJSON(url);
    return result.data || [];
  }

  async function fetchStandings() {
    const result = await fetchJSON(`${CONFIG.API_BASE}/standings`);
    return result.data || [];
  }

  async function fetchStats() {
    const result = await fetchJSON(`${CONFIG.API_BASE}/stats`);
    return result.data || null;
  }

  async function fetchTeams() {
    const result = await fetchJSON(`${CONFIG.API_BASE}/teams`);
    return result.data || [];
  }

  async function fetchTopScorers() {
    try {
      const result = await fetchJSON(`${CONFIG.API_BASE}/top-scorers`);
      return result.data || [];
    } catch(e) { return []; }
  }

  function renderScorers(scorers) {
    const container = document.getElementById('scorersContainer');
    if (!container) return;
    if (!scorers.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">暂无进球数据</div>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    let h = '<div class="scorers-table">';
    scorers.slice(0,15).forEach((s, i) => {
      const rk = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const rh = i < 3 ? medals[i] : ('<span style="font-weight:700;font-size:15px;color:var(--text-muted)">' + (i+1) + '</span>');
      const avatar = s.photo ? '<img class="scorer-avatar" src="' + s.photo + '" alt="">' : '<div class="scorer-avatar no-photo">' + s.name.charAt(0) + '</div>';
      const flag = s.flag ? '<img class="scorer-flag" src="' + s.flag + '" alt=""> ' : '';
      h += '<div class="scorer-row">';
      h += '<div class="scorer-rank ' + rk + '">' + rh + '</div>';
      h += '<div class="scorer-info">' + avatar;
      h += '<div><div class="scorer-name">' + s.name + '</div><div class="scorer-team">' + flag + (s.country || '') + '</div></div></div>';
      h += '<div class="scorer-goals"><div class="scorer-goal-count">' + s.goals + '</div></div>';
      h += '</div>';
    });
    h += '</div>';
    container.innerHTML = h;
  }

  function updateStatsGrid() {
    const s = state.stats;
    ['totalGoals','avgGoals','finishedCount','liveCountStat'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const map = { totalGoals: s?.totalGoals || '0', avgGoals: s?.avgGoalsPerMatch || '0', finishedCount: s?.finishedMatches || '0', liveCountStat: s?.liveMatches || '0' };
      el.textContent = map[id];
    });
  }

  async function fetchStadiums() {
    const result = await fetchJSON(`${CONFIG.API_BASE}/stadiums`);
    return result.data || [];
  }

  // ==== 数据加载 ====

  async function loadAllData() {
    try {
      updateDataSourceStatus('yellow', '加载中...');

      const [matches, standings, stats, teams, stadiums] = await Promise.all([
        fetchMatches(),
        fetchStandings(),
        fetchStats(),
        fetchTeams(),
        fetchStadiums()
      ]);

      state.matches = matches;
      state.standings = standings;
      state.stats = stats;
      state.teams = teams;
      state.stadiums = stadiums;
      state.lastFetchTime = Date.now();

      updateDataSourceStatus('green', '数据源');
      updateLastUpdateTime();
      updateLiveCount();

      // 渲染
      render();
      populateDateFilter();

      // 渲染积分榜
      if (typeof WorldCupStandings !== 'undefined') {
        WorldCupStandings.render(standings);
      }

      // 渲染射手榜
      const scorers = await fetchTopScorers();
      renderScorers(scorers);

      // 更新赛事统计
      updateStatsGrid();

      // 渲染分组球队列表
      renderGroupTeams();

      return true;
    } catch (error) {
      console.error('[WorldCup] 数据加载失败:', error);
      updateDataSourceStatus('red', '连接失败');
      showError(`数据加载失败: ${error.message}`);
      return false;
    }
  }

  // ==== 状态栏更新 ====

  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    dom.clockDisplay.textContent = `${hours}:${minutes}:${seconds}`;
  }

  function updateDataSourceStatus(status, label) {
    state.dataSourceStatus = status;
    dom.statusIndicator.className = `status-indicator ${status}`;
    dom.statusLabel.textContent = label;
  }

  function updateLastUpdateTime() {
    if (state.lastFetchTime) {
      const now = new Date(state.lastFetchTime);
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      dom.lastUpdate.textContent = `最后更新: ${h}:${m}:${s}`;
    }
  }

  function updateLiveCount() {
    const liveMatches = state.matches.filter(m => m.status === 'live');
    const count = liveMatches.length;
    dom.liveCountText.textContent = `${count} 场进行中`;

    if (count > 0) {
      dom.liveCountText.parentElement.style.display = 'flex';
    } else {
      dom.liveCountText.parentElement.style.display = 'none';
    }
  }

  // ==== 分组球队列表渲染 ====

  function renderGroupTeams() {
    const container = dom.groupTeamsGrid;
    if (!container) return;
    const teams = state.teams || [];
    const standings = state.standings || [];

    // 按小组对球队分组
    const groups = {};
    standings.forEach(g => { groups[g.name] = []; });

    // 从比赛数据中补充小组信息
    state.matches.forEach(m => {
      if (m.group && m.homeTeam?.name) {
        if (!groups[m.group]) groups[m.group] = [];
        if (!groups[m.group].find(t => t.id === m.homeTeam.id)) {
          groups[m.group].push({ id: m.homeTeam.id, name: m.homeTeam.nameZh || m.homeTeam.name, flag: m.homeTeam.flag });
        }
        if (!groups[m.group].find(t => t.id === m.awayTeam.id)) {
          groups[m.group].push({ id: m.awayTeam.id, name: m.awayTeam.nameZh || m.awayTeam.name, flag: m.awayTeam.flag });
        }
      }
    });

    // 从球队列表补充（没有比赛的球队）
    teams.forEach(t => {
      const groupName = t.group || '';
      if (groupName && groups[groupName]) {
        if (!groups[groupName].find(x => String(x.id) === String(t.id))) {
          groups[groupName].push({ id: t.id, name: t.nameZh || t.name, flag: t.flag });
        }
      }
    });

    let html = '';
    Object.keys(groups).sort().forEach(gName => {
      const groupTeams = groups[gName];
      html += `<div class="group-team-card">
        <div class="gname">${gName}组</div>
        <div class="gteams">`;
      groupTeams.forEach(t => {
        html += `<span>${t.flag ? `<img src="${t.flag}" class="mini-flag">` : ''}${t.name}</span>`;
      });
      html += `</div></div>`;
    });

    container.innerHTML = html || '<div class="empty-state">暂无分组数据</div>';
  }

  // ==== 日期筛选填充 ====

  function populateDateFilter() {
    const dates = new Set();
    state.matches.forEach(m => {
      if (m.beijingTime && m.beijingTime.date) {
        dates.add(m.beijingTime.date);
      }
    });

    const sortedDates = Array.from(dates).sort((a, b) => {
      const [ma, da] = a.split('/');
      const [mb, db] = b.split('/');
      return parseInt(ma) - parseInt(mb) || parseInt(da) - parseInt(db);
    });

    // 保留 "全部日期" 选项
    dom.filterDate.innerHTML = '<option value="">全部日期</option>';
    sortedDates.forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = date;
      dom.filterDate.appendChild(option);
    });
  }

  // ==== 渲染 ====

  function render() {
    applyFilters();
  }

  function renderMatches(matches) {
    const container = dom.matchesContainer;

    if (matches.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚽</div>
          <div class="empty-state-text">暂无匹配的比赛</div>
        </div>`;
      return;
    }

    // 按日期分组
    const grouped = {};
    matches.forEach(match => {
      const date = match.beijingTime?.date || 'unknown';
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(match);
    });

    const sortedDates = Object.keys(grouped).sort((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      const [ma, da] = a.split('/');
      const [mb, db] = b.split('/');
      return parseInt(ma) - parseInt(mb) || parseInt(da) - parseInt(db);
    });

    let html = '';
    sortedDates.forEach(date => {
      const dateMatches = grouped[date];
      html += renderDateSection(date, dateMatches);
    });

    container.innerHTML = html;
  }

  function renderDateSection(date, matches) {
    let html = `<div class="date-section">`;
    html += `<div class="date-header">
      <span class="date-label">📅 ${state.matches.find(m => m.beijingTime?.date === date)?.beijingTime?.dateLabel || date}</span>
      <span class="date-badge">${matches.length} 场</span>
    </div>`;

    matches.forEach(match => {
      html += renderMatchCard(match);
    });

    html += `</div>`;
    return html;
  }

  function renderMatchCard(match) {
    const timeStr = match.beijingTime?.time || '--:--';
    const statusClass = `status-${match.status}`;

    // 比分显示
    let scoreHtml;
    if (match.status === 'notstarted') {
      scoreHtml = `<div class="match-score">vs</div>`;
    } else if (match.status === 'live') {
      const elapsed = match.timeElapsed !== 'notstarted' ? match.timeElapsed : '';
      scoreHtml = `
        <div class="match-score">${match.homeTeam.score}<span class="score-divider">-</span>${match.awayTeam.score}</div>
        <div class="match-status-badge">🟢 ${elapsed || "进行中"}</div>`;
    } else {
      scoreHtml = `
        <div class="match-score">${match.homeTeam.score}<span class="score-divider">-</span>${match.awayTeam.score}</div>
        <div class="match-status-badge">已结束</div>`;
    }

    // 进球和红黄牌
    let eventsHtml = '';
    if (match.status === 'finished') {
      const hasGoal = match.homeTeam.scorers?.length > 0 || match.awayTeam.scorers?.length > 0;
      if (hasGoal) {
        eventsHtml = '<div class="match-events">';
        match.homeTeam.scorers.forEach(() => {
          eventsHtml += '<span class="event-icon goal" title="进球">⚽</span>';
        });
        eventsHtml += '</div>';
      }
    }

    // 主队名（含淘汰赛标签）
    let homeName = match.homeTeam.nameZh || match.homeTeam.name || 'TBD';
    let awayName = match.awayTeam.nameZh || match.awayTeam.name || 'TBD';
    if (match.homeTeam.label) {
      homeName += `<span class="team-label">${match.homeTeam.label}</span>`;
    }
    if (match.awayTeam.label) {
      awayName += `<span class="team-label">${match.awayTeam.label}</span>`;
    }

    const groupLabel = match.group ? `${match.group}组` : match.type || '';

    // 球场名称
    const stadium = state.stadiums.find(s => String(s.id) === String(match.stadiumId));
    const venueName = stadium ? `${stadium.nameZh || stadium.name} · ${stadium.cityZh || stadium.city}` : '';

    return `
      <div class="match-card ${statusClass}" data-match-id="${match.id}" data-group="${match.group || ''}" data-status="${match.status}" data-date="${match.beijingTime?.date || ''}">
        <div class="match-time">
          <div class="time">${match.beijingTime?.dateLabel || ""} ${timeStr}</div>
          <div class="matchday">${groupLabel}</div>
        </div>
        <div class="match-teams">
          <div class="team-info home">
            ${match.homeTeam.flag ? `<img class="team-flag" src="${match.homeTeam.flag}" alt="${match.homeTeam.name}" loading="lazy">` : ''}
            <span class="team-name team-clickable" onclick="event.stopPropagation();openTeamSquad('${match.homeTeam.id}','${match.homeTeam.nameZh || match.homeTeam.name}')" title="查看阵容">${homeName}</span>
          </div>
          ${scoreHtml}
          <div class="team-info away">
            <span class="team-name team-clickable" onclick="event.stopPropagation();openTeamSquad('${match.awayTeam.id}','${match.awayTeam.nameZh || match.awayTeam.name}')" title="查看阵容">${awayName}</span>
            ${match.awayTeam.flag ? `<img class="team-flag" src="${match.awayTeam.flag}" alt="${match.awayTeam.name}" loading="lazy">` : ''}
          </div>
        </div>
        <div class="match-info">
          ${venueName ? `<span class="match-venue">🏟️ ${venueName}</span>` : ''}
          ${eventsHtml}
          ${typeof WorldCupPrediction !== "undefined" ? WorldCupPrediction.renderPredictionButton(match) : ""}
          ${typeof WorldCupPrediction !== "undefined" ? WorldCupPrediction.renderHistoryButton(match) : ""}
        </div>
      </div>`;
  }

  // ==== 筛选 ====

  function applyFilters() {
    let filtered = [...state.matches];

    const dateFilter = dom.filterDate.value;
    const groupFilter = dom.filterGroup.value;
    const statusFilter = dom.filterStatus.value;
    const searchText = dom.searchInput.value.trim().toLowerCase();

    if (dateFilter) {
      filtered = filtered.filter(m => m.beijingTime?.date === dateFilter);
    }
    if (groupFilter) {
      filtered = filtered.filter(m => m.group?.toUpperCase() === groupFilter.toUpperCase());
    }
    if (statusFilter) {
      filtered = filtered.filter(m => m.status === statusFilter);
    }
    if (searchText) {
      filtered = filtered.filter(m =>
        (m.homeTeam.nameZh || m.homeTeam.name || '').toLowerCase().includes(searchText) ||
        (m.awayTeam.nameZh || m.awayTeam.name || '').toLowerCase().includes(searchText)
      );
    }

    state.filteredMatches = filtered;

    // 移除 loading
    const loadingEl = dom.matchesContainer.querySelector('.loading');
    if (loadingEl) loadingEl.remove();

    renderMatches(filtered);
  }

  // ==== 错误显示 ====

  function showError(message) {
    const container = dom.matchesContainer;
    const loadingEl = container.querySelector('.loading');
    if (loadingEl) loadingEl.remove();

    container.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="WorldCupApp.refresh()" style="margin-top:16px">重试</button>
      </div>`;
  }

  // ==== 刷新 ====

  async function refresh() {
    dom.refreshBtn.disabled = true;
    dom.refreshBtn.textContent = '⏳ 刷新中...';
    await loadAllData();
    dom.refreshBtn.disabled = false;
    dom.refreshBtn.innerHTML = '🔄 刷新';
  }

  // ==== 初始化 ====

  async function init() {
    cacheDom();

    // 时钟
    updateClock();
    setInterval(updateClock, 1000);

    // 加载数据
    await loadAllData();

    // 绑定刷新按钮
    dom.refreshBtn.addEventListener('click', () => refresh());

    // 自动刷新
    state.refreshTimerId = setInterval(() => {
      loadAllData();
    }, CONFIG.REFRESH_INTERVAL);

    // 筛选器变更时重新渲染
    dom.filterDate.addEventListener('change', render);
    dom.filterGroup.addEventListener('change', render);
    dom.filterStatus.addEventListener('change', render);
    dom.searchInput.addEventListener('input', render);

    // 点击比赛卡片打开详情弹窗
    dom.matchesContainer.addEventListener('click', (e) => {
      const card = e.target.closest('.match-card');
      if (card) {
        const matchId = card.dataset.matchId;
        if (matchId && typeof WorldCupModal !== 'undefined') {
          WorldCupModal.open(matchId);
        }
      }
    });

    console.log('[WorldCup] 应用初始化完成');
    // 跳转到今日比赛
    dom.todayBtn = document.getElementById('todayBtn');
    if (dom.todayBtn) {
      dom.todayBtn.addEventListener('click', () => {
        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = mm + '月' + dd + '日';
        const dateSections = dom.matchesContainer.querySelectorAll('.date-section');
        let target = null;
        for (const sec of dateSections) {
          if (sec.querySelector('.date-label') && sec.textContent.includes(todayStr)) { target = sec; break; }
        }
        if (!target) { console.warn('今日无比赛, 已滚动到最早场次'); if (dateSections.length > 0) target = dateSections[0]; }
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // 跳转到直播比赛
    dom.liveBtn = document.getElementById('liveBtn');
    if (dom.liveBtn) {
      dom.liveBtn.addEventListener('click', () => {
        const firstLive = dom.matchesContainer.querySelector('.match-card.live');
        if (firstLive) {
          firstLive.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstLive.style.boxShadow = '0 0 0 2px #22c55e';
          setTimeout(function() { firstLive.style.boxShadow = ''; }, 3000);
        } else {
          console.warn('当前无直播比赛, 已滚动到今日赛程'); dom.todayBtn.click();
        }
      });
    }

  }

  // ==== 公开接口 ====

  return {
    init,
    refresh,
    getState: () => ({ ...state }),
    getMatchById: (id) => state.matches.find(m => m.id === id),
    getMatches: () => state.matches,
    getStats: () => state.stats
  };

})();
