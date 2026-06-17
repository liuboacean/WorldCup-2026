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

  // 打开球队阵容弹窗
  window.openTeamSquad = function(teamId, teamName) {
    var modal = window.SquadModal;
    if (modal) {
      modal.open(teamId, teamName);
    }
  };

  // ==== 数据加载 ====

  async function loadAllData() {
    try {
      updateDataSourceStatus('yellow', '加载中...');

      const [matches, standings, stats, teams] = await Promise.all([
        fetchMatches(),
        fetchStandings(),
        fetchStats(),
        fetchTeams()
      ]);

      state.matches = matches;
      state.standings = standings;
      state.stats = stats;
      state.teams = teams;
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

      // 更新 Hero 统计
      updateHeroStats(stats);

      // 更新赛事统计
      updateStatsGrid(stats);

      // 加载射手榜
      fetchAndRenderScorers();

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
      <span class="date-label">📅 ${date}</span>
      <span class="match-count">${matches.length} 场</span>
    </div>
    <div class="matches-grid">`;

    matches.forEach(match => {
      html += renderMatchCard(match);
    });

    html += `</div>`;
    return html;
  }

  function renderMatchCard(match) {
    const timeStr = match.beijingTime?.time || '--:--';
    const isLive = match.status === 'live';
    const isFinished = match.status === 'finished';
    const isNotStarted = match.status === 'notstarted';
    const scoreClass = isLive ? 'live' : isFinished ? 'finished' : 'notstarted';
    const statusLabel = isLive ? '🟢 进行中' : isFinished ? '✅ 已结束' : '⏳ 未开始';
    const statusElClass = isLive ? 'live' : isFinished ? 'finished' : 'notstarted';

    // 比分
    let scoreHtml;
    if (isNotStarted) {
      scoreHtml = `<div class="match-score ${scoreClass}">vs</div>`;
    } else {
      scoreHtml = `<div class="match-score ${scoreClass}">${match.homeTeam.score || 0}<span class="score-divider">-</span>${match.awayTeam.score || 0}</div>`;
    }

    // 比赛详情行（实时时间/进球球员）
    let metaHtml = `<div class="match-status ${statusElClass}">${isLive ? '🟢 ' + (match.timeElapsed || '进行中') : statusLabel}</div>`;

    // 进球球员 - 优先使用events数据中的中文名
    let scorersHtml = '';
    if (isFinished || isLive) {
      const allScorers = [];
      if (match.homeTeam.scorers && match.homeTeam.scorers.length) {
        match.homeTeam.scorers.forEach(s => allScorers.push({ team: 'home', text: s }));
      }
      if (match.awayTeam.scorers && match.awayTeam.scorers.length) {
        match.awayTeam.scorers.forEach(s => allScorers.push({ team: 'away', text: s }));
      }
      if (allScorers.length) {
        const display = allScorers.slice(0, 4).map(s => {
          const minute = String(s.text).match(/(\d+)/);
          const raw = String(s.text);
          // 尝试提取中文名（阿拉伯语/波斯语名字跳过）
          const playerName = raw.replace(/\s*\d+['"]?\s*$/, '').replace(/[{}""""]/g, '').trim();
          const hasChinese = /[\u4e00-\u9fff]/.test(playerName);
          const showName = hasChinese ? playerName : `⚽`;
          const minStr = minute ? minute[1] + "'" : '';
          return `<span class="scorer-item">${showName} <span class="scorer-minute">${minStr}</span></span>`;
        }).join(' ');
        scorersHtml = `<div class="match-scorers">${display}</div>`;
      }
    }

    let homeName = match.homeTeam.nameZh || match.homeTeam.name || 'TBD';
    let awayName = match.awayTeam.nameZh || match.awayTeam.name || 'TBD';
    const groupLabel = match.group ? `${match.group}组` : match.type || '';
    const mid = match.id;

    return `
      <div class="match-card ${isLive ? 'live' : isFinished ? 'finished' : ''}" data-match-id="${mid}" data-group="${match.group || ''}" data-status="${match.status}" data-date="${match.beijingTime?.date || ''}">
        <div class="match-info">
          <span class="match-group">${groupLabel}</span>
          <span>🕐 ${timeStr}</span>
          <span class="match-status ${statusElClass}">${statusLabel}</span>
        </div>
        <div class="match-teams">
          <div class="match-team home" onclick="event.stopPropagation();var s=window.SquadModal;if(s)s.open('${match.homeTeam.id}','${match.homeTeam.nameZh || match.homeTeam.name}')">
            ${match.homeTeam.flag ? `<img class="team-flag" src="${match.homeTeam.flag}" alt="${match.homeTeam.name}" loading="lazy">` : ''}
            <span class="team-name team-clickable">${homeName}</span>
          </div>
          <div class="match-score-display">
            ${scoreHtml}
            <div class="match-detail">
              ${metaHtml}
            </div>
          </div>
          <div class="match-team away" onclick="event.stopPropagation();var s=window.SquadModal;if(s)s.open('${match.awayTeam.id}','${match.awayTeam.nameZh || match.awayTeam.name}')">
            <span class="team-name team-clickable">${awayName}</span>
            ${match.awayTeam.flag ? `<img class="team-flag" src="${match.awayTeam.flag}" alt="${match.awayTeam.name}" loading="lazy">` : ''}
          </div>
        </div>
        ${scorersHtml ? `<div class="match-info">${scorersHtml}</div>` : ''}
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
        (m.homeTeam.name || '').toLowerCase().includes(searchText) ||
        (m.awayTeam.name || '').toLowerCase().includes(searchText)
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

  // ==== Hero 统计数据 ====

  function updateHeroStats(stats) {
    const elTeams = document.getElementById('statTeams');
    const elCities = document.getElementById('statCities');
    const elMatches = document.getElementById('statMatches');
    if (elTeams) elTeams.textContent = stats?.totalTeams || '48';
    if (elCities) elCities.textContent = '16';
    if (elMatches) elMatches.textContent = stats?.totalMatches || '104';
  }

  // ==== 赛事统计网格 ====

  function updateStatsGrid(stats) {
    const totalEl = document.getElementById('totalGoals');
    const avgEl = document.getElementById('avgGoals');
    const finishedEl = document.getElementById('finishedCount');
    const liveEl = document.getElementById('liveCountStat');
    if (totalEl) totalEl.textContent = stats?.totalGoals || '0';
    if (avgEl) avgEl.textContent = stats?.avgGoalsPerMatch || '0';
    if (finishedEl) finishedEl.textContent = stats?.finishedMatches || '0';
    if (liveEl) liveEl.textContent = stats?.liveMatches || '0';
  }

  // ==== 射手榜 ====

  async function fetchAndRenderScorers() {
    try {
      const res = await fetchJSON(`${CONFIG.API_BASE}/top-scorers`);
      if (res.success) renderScorers(res.data);
    } catch (e) {
      console.error('[WorldCup] 射手榜加载失败:', e);
    }
  }

  function renderScorers(scorers) {
    const container = document.getElementById('scorersContainer');
    if (!container || !scorers.length) {
      if (container) container.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state-text">暂无进球数据</div></div>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    let html = '<div class="scorers-table">';
    scorers.slice(0,15).forEach((s, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const rankHtml = i < 3 ? `<span class="scorer-medal">${medals[i]}</span>` : `<span class="scorer-rank ${rankClass}">${i+1}</span>`;
      html += `<div class="scorer-row">
        <div class="scorer-rank ${rankClass}">${rankHtml}</div>
        <div class="scorer-info">
          <div class="scorer-avatar">⚽</div>
          <div>
            <div class="scorer-name">${s.name}</div>
            <div class="scorer-team">${s.country || ''}</div>
          </div>
        </div>
        <div class="scorer-goals">
          <div class="scorer-goal-count">${s.goals}</div>
          <span class="scorer-goal-label">进球</span>
        </div>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
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

  function updateNavHighlight() {
    const sections = ['matches', 'standings', 'scorers', 'stats'];
    let current = 'matches';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 200) current = id;
      }
    });
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.section === current);
    });
  }

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

    // 点击比赛卡片打开详情弹窗（通过事件委托，不受stopPropagation影响）
    dom.matchesContainer.addEventListener('click', (e) => {
      const card = e.target.closest('.match-card');
      if (card && !e._squadClick) {
        const matchId = card.dataset.matchId;
        if (matchId && window.WorldCupModal) {
          window.WorldCupModal.open(matchId);
        }
      }
    });

    // 导航菜单滚动
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const target = document.getElementById(section);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // 滚动时高亮导航
    window.addEventListener('scroll', () => { updateNavHighlight(); });

    console.log('[WorldCup] 应用初始化完成');
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
