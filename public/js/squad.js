/**
 * squad.js - 球队阵容弹窗 (v3 - 显示球员完整数据)
 *
 * 功能：
 * - 点击球队图标打开阵容详情
 * - 按位置分组显示（门将、后卫、中场、前锋）
 * - 球员号码、头像、姓名、年龄、身价、俱乐部
 */

const SquadModal = (() => {
  'use strict';

  let activeModal = null;
  let isClosing = false;

  /**
   * 打开球队阵容弹窗
   * @param {string} teamId - worldcup26.ir 球队 ID
   * @param {string} teamName - 球队中文名
   */
  async function open(teamId, teamName) {
    close();

    try {
      const response = await fetch(`/api/teams/${teamId}/squad`);
      const result = await response.json();

      if (!result.success || !result.data) {
        renderError(result.error || '暂无阵容数据');
        return;
      }

      renderSquad(result.data, teamName);
      bindEvents();
    } catch (error) {
      console.error('[Squad] 加载阵容失败:', error);
      showToast('加载阵容失败');
    }
  }

  function renderSquad(squadData, teamName) {
    const container = document.getElementById('squadContainer');
    const players = squadData.players || [];

    // 按位置分组
    const posMap = {'GK':'Goalkeeper','DF':'Defender','MF':'Midfielder','FW':'Attacker'};
    const groups = {
      'Goalkeeper': { title: '🧤 门将', items: [] },
      'Defender': { title: '🛡️ 后卫', items: [] },
      'Midfielder': { title: '⚡ 中场', items: [] },
      'Attacker': { title: '⚽ 前锋', items: [] }
    };

    players.forEach(p => {
      var posKey = posMap[p.position] || p.position;
      if (groups[posKey]) {
        groups[posKey].items.push(p);
      } else {
        if (!groups['其他']) groups['其他'] = { title: '📋 其他', items: [] };
        groups['其他'].items.push(p);
      }
    });

    let squadHtml = '';
    for (const [key, group] of Object.entries(groups)) {
      if (group.items.length === 0) continue;
      squadHtml += `<div class="squad-group">
        <div class="squad-group-title">${group.title} <span class="squad-count">${group.items.length}人</span></div>
        <div class="squad-players">`;
      group.items.forEach(p => {
        // 构建详情行
        var details = [];
        if (p.age) details.push('<span class="pd-age">' + p.age + '岁</span>');
        if (p.value) details.push('<span class="pd-value">€' + p.value + '万</span>');
        if (p.club) details.push('<span class="pd-club" title="' + p.club + '">' + p.club + '</span>');

        squadHtml += '<div class="squad-player">'
          + '<div class="squad-player-photo">'
            + (p.photo ? '<img src="' + p.photo + '" alt="' + (p.nameZh || p.name) + '" loading="lazy" referrerpolicy="no-referrer">' : '<div class="squad-player-no-photo">' + (p.number || '?') + '</div>')
          + '</div>'
          + '<div class="squad-player-number">' + (p.isCaptain ? '<span class="captain-badge">C</span> ' : '') + (p.number || '-') + '</div>'
          + '<div class="squad-player-name" title="' + (p.nameEn || p.name) + '">' + (p.nameZh || p.name) + '</div>'
          + '<div class="squad-player-detail">' + details.join('') + '</div>'
          + '<div class="squad-player-position">' + (p.posCn || p.positionZh || p.position || '') + '</div>'
        + '</div>';
      });
      squadHtml += '</div></div>';
    }

    container.innerHTML = ''
      + '<div class="squad-overlay" id="squadOverlay">'
        + '<div class="squad-modal">'
          + '<div class="squad-header">'
            + '<h2>📋 ' + (teamName || squadData.teamName || '球队') + ' · 阵容名单</h2>'
            + (squadData.coach ? '<div style="font-size:13px;color:var(--text-muted,#9ca3af);font-weight:400;margin-top:4px;">👔 主教练: ' + squadData.coach + '</div>' : '')
            + '<button class="squad-close" id="squadClose">&times;</button>'
          + '</div>'
          + '<div class="squad-body">'
            + '<div class="squad-summary">'
              + '<span>共 ' + players.length + ' 名球员</span>'
              + '<span class="squad-summary-divider">|</span>'
              + '<span>🧤 ' + ((groups.Goalkeeper && groups.Goalkeeper.items) || []).length + ' 门将</span>'
              + '<span>🛡️ ' + ((groups.Defender && groups.Defender.items) || []).length + ' 后卫</span>'
              + '<span>⚡ ' + ((groups.Midfielder && groups.Midfielder.items) || []).length + ' 中场</span>'
              + '<span>⚽ ' + ((groups.Attacker && groups.Attacker.items) || []).length + ' 前锋</span>'
            + '</div>'
            + squadHtml
          + '</div>'
        + '</div>'
      + '</div>';

    activeModal = container.querySelector('#squadOverlay');
  }

  function bindEvents() {
    if (!activeModal) return;

    const closeBtn = activeModal.querySelector('#squadClose');
    if (closeBtn) closeBtn.addEventListener('click', close);

    activeModal.addEventListener('click', function(e) {
      if (e.target === activeModal) close();
    });

    document.addEventListener('keydown', handleEsc);

    const content = activeModal.querySelector('.squad-modal');
    if (content) content.addEventListener('click', function(e) { e.stopPropagation(); });
  }

  function handleEsc(e) {
    if (e.key === 'Escape') close();
  }

  function close() {
    if (isClosing || !activeModal) return;
    isClosing = true;
    activeModal.classList.add('closing');
    setTimeout(function() {
      const container = document.getElementById('squadContainer');
      if (activeModal && activeModal.parentNode) {
        activeModal.parentNode.innerHTML = '';
      }
      activeModal = null;
      isClosing = false;
      document.removeEventListener('keydown', handleEsc);
    }, 200);
  }

  function showToast(msg) {
    console.warn('[Squad]', msg);
  }

  function renderError(msg) {
    const container = document.getElementById('squadContainer');
    container.innerHTML = '<div class="squad-overlay" id="squadOverlay"><div class="squad-modal"><div class="squad-header"><h2>📋 阵容</h2><button class="squad-close" id="squadClose">&times;</button></div><div class="squad-body" style="text-align:center;padding:30px;color:var(--text-muted,#9ca3af);font-size:14px;"><div style="font-size:40px;margin-bottom:12px;">📭</div><div>' + msg + '</div></div></div></div>';
    const closeBtn = container.querySelector('#squadClose');
    if (closeBtn) closeBtn.onclick = function() {
      container.innerHTML = '';
      document.removeEventListener('keydown', handleEsc);
    };
    const overlay = container.querySelector('.squad-overlay');
    if (overlay) overlay.onclick = function(e) {
      if (e.target === this) {
        container.innerHTML = '';
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  return { open, close };
})();
window.SquadModal = SquadModal;
