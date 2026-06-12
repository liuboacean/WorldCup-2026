/**
 * predictionService.js - AI 比赛预测服务
 *
 * 调用 DeepSeek API 对比赛进行预测分析
 * 预测结果按时间线存储到 data/predictions/{matchId}.json
 * 每次预测都追加到历史数组，不覆盖
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const PREDICTIONS_DIR = path.join(__dirname, '..', 'data', 'predictions');
const MATCHES_DIR = path.join(__dirname, '..', 'data', 'matches');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getMatchData(matchId) {
  const filePath = path.join(MATCHES_DIR, `match_${matchId}.json`);
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * 获取比赛的所有预测历史
 */
function getPredictionHistory(matchId) {
  ensureDir(PREDICTIONS_DIR);
  const filePath = path.join(PREDICTIONS_DIR, `match_${matchId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return Array.isArray(data.history) ? data : { matchId, history: [data] };
    }
  } catch (e) { /* ignore */ }
  return { matchId, history: [] };
}

/**
 * 获取最新的预测结果
 */
function getLatestPrediction(matchId) {
  const data = getPredictionHistory(matchId);
  const history = data.history || [];
  if (history.length === 0) return null;
  return history[history.length - 1];
}

/**
 * 追加预测到历史
 */
function appendPrediction(matchId, newEntry) {
  ensureDir(PREDICTIONS_DIR);
  const filePath = path.join(PREDICTIONS_DIR, `match_${matchId}.json`);
  let all = { matchId, history: [] };
  try {
    if (fs.existsSync(filePath)) {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      all.history = Array.isArray(existing.history) ? existing.history : [existing];
    }
  } catch (e) { /* ignore */ }

  all.history.push(newEntry);
  // 最多保留20条历史
  if (all.history.length > 20) all.history = all.history.slice(-20);

  try {
    fs.writeFileSync(filePath, JSON.stringify(all, null, 2), 'utf8');
  } catch (e) {
    console.error('[Prediction] 保存预测失败:', e.message);
  }
}

function getTeamKeyPlayers(teamId, limit = 5) {
  try {
    const fifaPath = path.join(__dirname, '..', 'data', 'fifaSquadData.json');
    if (!fs.existsSync(fifaPath)) return [];
    const allData = JSON.parse(fs.readFileSync(fifaPath, 'utf8'));
    const teamData = allData[String(teamId)];
    if (!teamData || !teamData.players) return [];
    const sorted = [...teamData.players]
      .filter(p => p.nameZh)
      .sort((a, b) => (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0));
    return sorted.slice(0, limit).map(p => ({
      name: p.nameZh || p.name,
      position: p.posCn || p.position || '',
      age: p.age || '',
      club: p.club || '',
      value: p.value || ''
    }));
  } catch (e) { return []; }
}

function buildPrompt(matchData, homeSquad, awaySquad) {
  const homeName = matchData.homeTeam?.nameZh || matchData.homeTeam?.name || '主队';
  const awayName = matchData.awayTeam?.nameZh || matchData.awayTeam?.name || '客队';
  const group = matchData.group ? `${matchData.group}组` : '小组赛';
  const time = matchData.beijingTime?.full || matchData.matchDate || '待定';

  let prompt = `你是一个专业的足球比赛分析师。请对以下2026世界杯比赛进行预测分析，并以JSON格式返回结果。

## 比赛信息
- 对阵：${homeName} vs ${awayName}
- 赛事：${group}
- 时间：${time}
`;

  if (homeSquad.length > 0) {
    prompt += `\n## ${homeName} 关键球员\n`;
    homeSquad.forEach(p => {
      prompt += `- ${p.name}（${p.position}，${p.age}岁${p.club ? `，${p.club}` : ''}${p.value ? `，身价€${p.value}万` : ''}）\n`;
    });
  }

  if (awaySquad.length > 0) {
    prompt += `\n## ${awayName} 关键球员\n`;
    awaySquad.forEach(p => {
      prompt += `- ${p.name}（${p.position}，${p.age}岁${p.club ? `，${p.club}` : ''}${p.value ? `，身价€${p.value}万` : ''}）\n`;
    });
  }

  prompt += `\n请根据以上信息，以严格的JSON格式返回预测结果（不要markdown包裹，纯JSON对象）：
{
  "winner": "${homeName}/${awayName}/平局",
  "homeScore": 数字,
  "awayScore": 数字,
  "confidence": 0-100,
  "reasoning": "简要分析（50字以内）",
  "keyFactors": ["因素1（15字以内）", "因素2", "因素3"]
}`;

  return prompt;
}

async function callDeepSeek(prompt) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('未配置 DeepSeek API Key');
  }
  const response = await axios.post(DEEPSEEK_API_URL, {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一个专业的足球分析师，擅长基于球队数据预测比赛结果。始终以JSON格式返回。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 1000
  }, {
    headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    timeout: 30000
  });

  const content = response.data.choices[0].message.content.trim();
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const result = JSON.parse(jsonStr);

  return {
    winner: result.winner || '平局',
    homeScore: parseInt(result.homeScore) || 0,
    awayScore: parseInt(result.awayScore) || 0,
    confidence: parseInt(result.confidence) || 50,
    reasoning: result.reasoning || '',
    keyFactors: Array.isArray(result.keyFactors) ? result.keyFactors : []
  };
}

/**
 * 主入口：获取比赛预测（每次调用都重新生成）
 * 每次点击预测按钮都调用DeepSeek，结果追加到历史
 */
async function getPrediction(matchId, matchData) {
  if (!matchData) return { success: false, error: '比赛数据不存在' };

  const homeTeamId = matchData.homeTeam?.id;
  const awayTeamId = matchData.awayTeam?.id;
  const homeSquad = getTeamKeyPlayers(homeTeamId, 5);
  const awaySquad = getTeamKeyPlayers(awayTeamId, 5);

  const prompt = buildPrompt(matchData, homeSquad, awaySquad);
  const prediction = await callDeepSeek(prompt);

  const matchLabel = `${matchData.homeTeam?.nameZh || matchData.homeTeam?.name} vs ${matchData.awayTeam?.nameZh || matchData.awayTeam?.name}`;

  const entry = {
    matchId,
    match: matchLabel,
    predictedAt: new Date().toISOString(),
    prediction,
    analysis: {
      reasoning: prediction.reasoning,
      keyFactors: prediction.keyFactors,
      keyPlayers: {
        home: homeSquad.map(p => p.name).filter(Boolean),
        away: awaySquad.map(p => p.name).filter(Boolean)
      }
    },
    actualResult: matchData.status === 'finished' ? {
      homeScore: matchData.homeTeam?.score,
      awayScore: matchData.awayTeam?.score
    } : null
  };

  // 追加到历史记录
  appendPrediction(matchId, entry);

  return { success: true, data: entry };
}

/**
 * 获取预测历史
 */
async function getHistory(matchId) {
  const data = getPredictionHistory(matchId);
  const history = data.history || [];

  // 对已结束的比赛，计算每条的猜对/错
  for (const entry of history) {
    if (entry.actualResult) {
      const actual = entry.actualResult;
      entry.isCorrect = actual.homeScore === entry.prediction.homeScore && actual.awayScore === entry.prediction.awayScore;
      entry.isWinnerCorrect = (actual.homeScore > actual.awayScore && entry.prediction.homeScore > entry.prediction.awayScore) ||
                               (actual.homeScore < actual.awayScore && entry.prediction.homeScore < entry.prediction.awayScore) ||
                               (actual.homeScore === actual.awayScore && entry.prediction.homeScore === entry.prediction.awayScore);
    }
  }

  // 倒序（最新在前）
  history.reverse();

  return { success: true, data: { matchId, history } };
}

module.exports = { getPrediction, getHistory, getLatestPrediction, getPredictionHistory };
