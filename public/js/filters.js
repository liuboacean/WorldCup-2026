/**
 * filters.js - 筛选器逻辑
 *
 * 提供筛选器相关功能，包括：
 * - 日期筛选器填充
 * - 筛选状态管理
 * - 重置筛选
 * - 局部高亮匹配结果
 */

const WorldCupFilters = (() => {
  'use strict';

  // ==== DOM 引用 ====
  let dom = {};

  function cacheDom() {
    dom = {
      filterDate: document.getElementById('filterDate'),
      filterGroup: document.getElementById('filterGroup'),
      filterStatus: document.getElementById('filterStatus'),
      searchInput: document.getElementById('searchInput')
    };
  }

  /**
   * 获取当前筛选条件
   */
  function getFilters() {
    return {
      date: dom.filterDate?.value || '',
      group: dom.filterGroup?.value || '',
      status: dom.filterStatus?.value || '',
      search: dom.searchInput?.value.trim().toLowerCase() || ''
    };
  }

  /**
   * 判断是否处于筛选状态
   */
  function isFiltering() {
    const f = getFilters();
    return !!(f.date || f.group || f.status || f.search);
  }

  /**
   * 重置所有筛选条件
   */
  function resetFilters() {
    if (dom.filterDate) dom.filterDate.value = '';
    if (dom.filterGroup) dom.filterGroup.value = '';
    if (dom.filterStatus) dom.filterStatus.value = '';
    if (dom.searchInput) dom.searchInput.value = '';
  }

  /**
   * 从 URL 参数恢复筛选状态
   */
  function restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (dom.filterDate && params.get('date')) dom.filterDate.value = params.get('date');
    if (dom.filterGroup && params.get('group')) dom.filterGroup.value = params.get('group');
    if (dom.filterStatus && params.get('status')) dom.filterStatus.value = params.get('status');
    if (dom.searchInput && params.get('search')) dom.searchInput.value = params.get('search');
  }

  /**
   * 将当前筛选条件保存到 URL
   */
  function saveToURL() {
    const f = getFilters();
    const params = new URLSearchParams();
    if (f.date) params.set('date', f.date);
    if (f.group) params.set('group', f.group);
    if (f.status) params.set('status', f.status);
    if (f.search) params.set('search', f.search);

    const newURL = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;

    history.replaceState(null, '', newURL);
  }

  /**
   * 对搜索结果中的球队名进行高亮
   */
  function highlightSearch(text, searchTerm) {
    if (!searchTerm || !text) return text;
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background:rgba(59,130,246,0.2);color:#93c5fd;padding:0 2px;border-radius:2px">$1</mark>');
  }

  // ==== 初始化 ====

  function init() {
    cacheDom();
    // 如果后续需要 URL 恢复，可启用
    // restoreFromURL();
  }

  init();

  return {
    getFilters,
    isFiltering,
    resetFilters,
    restoreFromURL,
    saveToURL,
    highlightSearch
  };

})();
