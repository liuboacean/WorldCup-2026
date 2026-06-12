/**
 * dataRelay.js - 离线中继服务
 * 
 * 当服务器无法直接访问 worldcup26.ir 时，通过 Mac 跳板机中转。
 * 在当前实现中，尝试直连，失败时返回缓存数据。
 */

const axios = require('axios');

const RELAY_ENABLED = process.env.RELAY_ENABLED === 'true' || false;
const RELAY_BASE_URL = process.env.RELAY_BASE_URL || 'http://localhost:3128';

/**
 * 通过中继或直连获取数据
 * @param {string} url - 目标 URL
 * @returns {Promise<Object>} 响应数据
 */
async function fetchWithRelay(url) {
  if (RELAY_ENABLED) {
    try {
      const relayUrl = `${RELAY_BASE_URL}/fetch?url=${encodeURIComponent(url)}`;
      const response = await axios.get(relayUrl, { timeout: 15000 });
      return response.data;
    } catch (relayErr) {
      console.warn(`[Relay] 中继请求失败: ${relayErr.message}, 尝试直连...`);
    }
  }

  // 直连
  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  });
  return response.data;
}

module.exports = { fetchWithRelay, RELAY_ENABLED };
