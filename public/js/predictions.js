/**
 * predictions.js - AI预测前端组件（v2）
 *
 * 功能：
 * - 🤖 AI预测按钮 → 调用DeepSeek生成预测
 * - 📊 历史按钮 → 查看所有预测记录
 * - 🏁 已结束比赛 → 显示猜对/猜错标记
 */

const WorldCupPrediction = (() => {
  'use strict';

  const API_BASE = '/api';

  /**
   * 渲染AI预测按钮
   */
  function renderPredictionButton(match) {
    if (!match) return '';
    const isFinished = match.status === 'finished';
    const btnClass = isFinished ? 'prediction-btn review-btn' : 'prediction-btn';
    const btnText = isFinished ? '📊 预测' : '🤖 AI预测';
    return `<span class="${btnClass}" data-match-id="${match.id}" onclick="event.stopPropagation();WorldCupPrediction.openPrediction('${match.id}')" title="${isFinished ? '预测回顾' : 'AI预测分析'}">${btnText}</span>`;
  }

  /**
   * 渲染历史按钮
   */
  function renderHistoryButton(match) {
    if (!match) return '';
    return `<span class="history-btn" data-match-id="${match.id}" onclick="event.stopPropagation();WorldCupPrediction.openHistory('${match.id}')" title="查看预测历史">📜</span>`;
  }

  /**
   * 获取预测（每次重新生成）
   */
  async function fetchPrediction(matchId) {
    const res = await fetch(`${API_BASE}/predict/${matchId}`);
    const json = await res.json();
    return json.success ? json.data : null;
  }

  /**
   * 获取预测历史
   */
  async function fetchHistory(matchId) {
    const res = await fetch(`${API_BASE}/predict/history/${matchId}`);
    const json = await res.json();
    return json.success && json.data?.data ? json.data.data : null;
  }

  /**
   * 打开AI预测
   */
  async function openPrediction(matchId) {
    showLoading('🤖 AI正在分析数据...', '正在调用 DeepSeek 生成预测');
    const result = await fetchPrediction(matchId);
    if (!result) {
      showModalContent(`<div class="prediction-error"><div class="prediction-error-icon">⚠️</div><div>预测生成失败</div><button class="prediction-close-btn" onclick="WorldCupPrediction.closeModal()">关闭</button></div>`);
      return;
    }
    showPredictionDetail(result.data || result);
  }

  /**
   * 打开预测历史
   */
  async function openHistory(matchId) {
    showLoading('📜 加载预测历史...', '');
    const data = await fetchHistory(matchId);
    if (!data || !data.history || data.history.length === 0) {
      showModalContent(`<div class="prediction-error"><div class="prediction-error-icon">📭</div><div>暂无预测记录</div><button class="prediction-close-btn" onclick="WorldCupPrediction.closeModal()">关闭</button></div>`);
      return;
    }
    showHistoryList(data);
  }

  /** 显示加载 */
  function showLoading(text, sub) {
    let overlay = getOrCreateOverlay();
    overlay.innerHTML = `
      <div class="prediction-modal">
        <div class="prediction-loading">
          <div class="prediction-spinner"></div>
          <div class="prediction-loading-text">${text}</div>
          ${sub ? `<div class="prediction-loading-sub">${sub}</div>` : ''}
        </div>
      </div>`;
    overlay.style.display = 'flex';
  }

  /** 显示模态内容 */
  function showModalContent(html) {
    let overlay = getOrCreateOverlay();
    overlay.innerHTML = `<div class="prediction-modal">${html}</div>`;
    overlay.style.display = 'flex';
  }

  /** 显示预测详情 */
  function showPredictionDetail(entry) {
    const pred = entry.prediction || {};
    const analysis = entry.analysis || {};
    const factorsHtml = (pred.keyFactors || []).map(f => `<li>${f}</li>`).join('');

    let resultBadge = '';
    if (entry.actualResult) {
      const a = entry.actualResult;
      if (entry.isCorrect) resultBadge = '<div class="prediction-badge correct">✅ 比分预测正确！</div>';
      else if (entry.isWinnerCorrect) resultBadge = '<div class="prediction-badge partial">🎯 胜负方向正确</div>';
      else resultBadge = '<div class="prediction-badge wrong">❌ 预测错误</div>';
    }

    // 格式化时间
    const timeStr = entry.predictedAt ? new Date(entry.predictedAt).toLocaleString('zh-CN') : '';

    showModalContent(`
      <button class="prediction-close" onclick="WorldCupPrediction.closeModal()">✕</button>
      <div class="prediction-header">
        <div class="prediction-title">🤖 AI 预测</div>
        <div class="prediction-match">${entry.match || ''}</div>
        <div class="prediction-cached">🕐 ${timeStr}</div>
        ${resultBadge}
        ${entry.actualResult ? `<div class="prediction-actual">实际比分：${entry.actualResult.homeScore} - ${entry.actualResult.awayScore}</div>` : ''}
      </div>
      <div class="prediction-body">
        <div class="prediction-score-card">
          <div class="prediction-team">${pred.winner || '--'}</div>
          <div class="prediction-score">${pred.homeScore ?? '?'} - ${pred.awayScore ?? '?'}</div>
          <div class="prediction-confidence">
            <div class="confidence-bar"><div class="confidence-fill" style="width:${pred.confidence || 50}%"></div></div>
            <span>可信度 ${pred.confidence || 50}%</span>
          </div>
        </div>
        <div class="prediction-section">
          <div class="prediction-section-title">📋 分析摘要</div>
          <div class="prediction-reasoning">${analysis.reasoning || pred.reasoning || ''}</div>
        </div>
        ${factorsHtml ? `<div class="prediction-section"><div class="prediction-section-title">🔑 关键因素</div><ul class="prediction-factors">${factorsHtml}</ul></div>` : ''}
      </div>
      <div class="prediction-footer">
        <button class="prediction-close-btn" onclick="WorldCupPrediction.closeModal()">关闭</button>
        <div class="prediction-footer-note">⚡ DeepSeek AI 生成</div>
      </div>
    `);
  }

  /** 显示历史列表 */
  function showHistoryList(data) {
    const matchLabel = data.match || (data.history[0]?.match || '比赛');
    let itemsHtml = '';
    data.history.forEach((entry, idx) => {
      const pred = entry.prediction || {};
      const timeStr = entry.predictedAt ? new Date(entry.predictedAt).toLocaleString('zh-CN') : '';
      let badge = '';
      if (entry.actualResult) {
        if (entry.isCorrect) badge = '✅';
        else if (entry.isWinnerCorrect) badge = '🎯';
        else badge = '❌';
      }
      itemsHtml += `
        <div class="history-item" onclick="WorldCupPrediction.showPredictionDetail(WorldCupPrediction._history[${idx}])">
          <div class="history-item-header">
            <span class="history-time">${timeStr}</span>
            <span class="history-badge">${badge}</span>
          </div>
          <div class="history-item-score">${pred.winner || '--'} ${pred.homeScore ?? '?'}-${pred.awayScore ?? '?'}</div>
          <div class="history-item-confidence">可信度 ${pred.confidence || 50}%</div>
        </div>`;
    });

    // 保存历史数据供点击查看
    window.WorldCupPrediction_history = data.history;

    showModalContent(`
      <button class="prediction-close" onclick="WorldCupPrediction.closeModal()">✕</button>
      <div class="prediction-header">
        <div class="prediction-title">📜 预测历史</div>
        <div class="prediction-match">${matchLabel}</div>
        <div class="prediction-cached">共 ${data.history.length} 次预测</div>
      </div>
      <div class="prediction-body history-list">
        ${itemsHtml || '<div class="prediction-error">暂无记录</div>'}
      </div>
      <div class="prediction-footer">
        <button class="prediction-close-btn" onclick="WorldCupPrediction.closeModal()">关闭</button>
      </div>
    `);
  }

  function getOrCreateOverlay() {
    let overlay = document.getElementById('predictionOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'predictionOverlay';
      overlay.className = 'prediction-overlay';
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function closeModal() {
    const overlay = document.getElementById('predictionOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  return {
    renderPredictionButton,
    renderHistoryButton,
    openPrediction,
    openHistory,
    closeModal,
    showPredictionDetail,
    _history: []  // 由showHistoryList填充
  };
})();
