/**
 * squadFetcher.js - 球队阵容数据获取 (API-Football)
 *
 * 功能：
 * - 从 api-sports.io 获取球队阵容（球员号码、姓名、位置、头像）
 * - 内存缓存 + JSON 文件缓存
 * - 按需获取，节约 API 请求
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const API_KEY = '85e9ff553d943b4ce553ba5530d2c77c';
const CACHE_DIR = path.join(__dirname, '..', 'cache');
// 球员中文名映射 (部分，可逐步补充)
const PLAYER_NAME_ZH = {
  // England
  "19088": "亨德森",
  "2932": "皮克福德",
  "162489": "特拉福德",
  "18961": "伯恩",
  "67971": "格希",
  "19545": "里斯·詹姆斯",
  "19354": "孔萨",
  "158694": "利夫拉门托",
  "307123": "奥赖利",
  "158698": "宽萨",
  "19235": "斯彭斯",
  "626": "斯通斯",
  "138908": "安德森",
  "129718": "贝林厄姆",
  "19586": "埃泽",
  "292": "亨德森",
  "284322": "梅努",
  "2937": "赖斯",
  "19170": "罗杰斯",
  "138787": "戈登",
  "184": "凯恩",
  "136723": "马杜埃克",
  "909": "拉什福德",
  "1460": "萨卡",
  "19974": "托尼",
  "19366": "沃特金斯",
  // South Africa
  "330174": "马图卢迪",
  "474630": "恩达马内",
  "46334": "莫迪巴",
  "510799": "姆博卡齐",
  "430078": "卡比尼",
  "46458": "西比西",
  "46601": "穆道",
  "406752": "奥孔",
  "392387": "马汉亚",
  "163041": "克罗斯",
  "3287": "莫科纳",
  "194430": "姆巴塔",
  "295977": "莫雷米",
  "3289": "茨瓦内",
  "158433": "西托莱",
  "268710": "亚当斯",
  "359561": "塞贝莱莱",
  "179893": "阿波利斯",
  "98936": "福斯特",
  "414149": "莫福肯",
  "354831": "马塞科",
  "127429": "雷纳斯",
  "201354": "马科戈帕",
  "3275": "威廉姆斯",
  "46417": "沙内",
  "46245": "戈斯",
  // Mexico
  "2878": "桑切斯",
  "2873": "蒙特斯",
  "35544": "巴斯克斯",
  "127227": "雷耶斯",
  "390002": "查韦斯",
  "2881": "加利亚多",
  "2869": "阿尔瓦雷斯",
  "266345": "利拉",
  "35970": "罗莫",
  "750": "菲达尔戈",
  "35532": "基尼奥内斯",
  "35576": "皮内达",
  "313383": "巴尔加斯",
  "482605": "莫拉",
  "36111": "韦尔塔",
  "35690": "查韦斯",
  "2879": "阿尔瓦拉多",
  "212233": "古铁雷斯",
  "2887": "希门尼斯",
  "2889": "维加",
  "94562": "圣蒂亚戈·希门尼斯",
  "291713": "冈萨雷斯",
  "36088": "马丁内斯",
  "270774": "兰赫尔",
  "35769": "阿塞维多",
  "2098": "奥乔亚",
  // France
  "22221": "迈尼昂",
  "347211": "里塞尔",
  "21628": "桑巴",
  "2724": "迪涅",
  "161907": "古斯托",
  "33": "卢卡斯·埃尔南德斯",
  "47300": "特奥·埃尔南德斯",
  "1145": "科纳特",
  "1257": "孔德",
  "20995": "拉克罗瓦",
  "22090": "萨利巴",
  "1149": "于帕梅卡诺",
  "156477": "切尔基",
  "2290": "坎特",
  "22147": "科内",
  "272": "拉比奥",
  "1271": "楚阿梅尼",
  "336657": "扎伊尔-埃梅里",
  "274300": "阿克利乌什",
  "161904": "巴尔科拉",
  "25927": "马特塔",
  "153": "登贝莱",
  "343027": "杜埃",
  "278": "姆巴佩",
  "21509": "小图拉姆",
  "19617": "奥利斯",
  // Argentina
  "19599": "埃米利亚诺·马丁内斯",
  "2465": "穆索",
  "47296": "鲁利",
  "6": "巴莱尔迪",
  "2467": "利桑德罗·马丁内斯",
  "6231": "梅迪纳",
  "6503": "莫利纳",
  "2468": "蒙铁尔",
  "624": "奥塔门迪",
  "30776": "罗梅罗",
  "529": "塔利亚菲科",
  "319572": "巴尔科",
  "5996": "恩佐·费尔南德斯",
  "1578": "洛塞尔索",
  "6716": "麦卡利斯特",
  "6002": "帕拉西奥斯",
  "271": "帕雷德斯",
  "26315": "冈萨雷斯",
  "2472": "德保罗",
  "6067": "阿尔马达",
  "6009": "阿尔瓦雷斯",
  "350037": "帕斯",
  "295513": "洛佩斯",
  "217": "劳塔罗·马丁内斯",
  "154": "梅西",
  "323935": "西蒙尼",
  // Egypt
  "16804": "Yasser Ibrahim",
  "2654": "Mohamed Hany",
  "269621": "Hossam Abdelmaguid",
  "16805": "Rami Rabia",
  "196343": "Mohamed Abdelmonem",
  "2649": "Ahmed Fatouh",
  "16813": "Hamdi Fathy",
  "2656": "Karim Hafez",
  "550371": "T. Alaa",
  "2664": "Trézéguet",
  "17269": "Emam Ashour",
  "395075": "Mostafa Zico",
  "20844": "H. Hassan",
  "16841": "Mohanad Lasheen",
  "2660": "Nabil Emad Dunga",
  "190575": "Marwan Attia",
  "69196": "Mahmoud Saber",
  "550547": "H. Abdelkarim",
  "306": "Mohamed Salah",
  "70535": "Ibrahim Adel",
  "81573": "Omar Marmoush",
  "664079": "Ahmed Zizo",
  "16797": "Mohamed El Shenawy",
  "16831": "Al Mahdi Soliman",
  "269174": "Mostafa Shobeir",
  "550469": "M. Alaa",
  // Reading
  "194804": "J. Dorsett",
  "137300": "H. Roberts",
  "158696": "F. Burns",
  "20489": "P. O&apos;Connor",
  "301282": "Benn David Ward",
  "3427": "A. Yiadom",
  "284506": "Michael George Stickland",
  "19473": "D. Williams",
  "437566": "A. Ahmed",
  "284561": "K. Abrefa",
  "50815": "L. Fraser",
  "284323": "C. Savage",
  "19247": "L. Wing",
  "203037": "D. Kyerewaa",
  "19618": "A. Rinomhota",
  "298127": "Mamadi Camará",
  "18903": "M. Ritchie",
  "557366": "L. Howard",
  "19225": "J. Marriott",
  "284517": "K. Ehibhatiomhan",
  "340135": "Mark O’Mahony",
  "17619": "R. Williams",
  "290717": "P. Lane",
  "432395": "E. Osho",
  "383120": "S. Patton",
  "8522": "Joel Pereira",
  "20102": "J. Stevens",
  "313247": "H. Rhone",
  "288128": "Tom Norcott",
  // Brazil
  "349001": "韦斯利",
  "22224": "加布里埃尔",
  "257": "马尔基尼奥斯",
  "860": "桑德罗",
  "618": "达尼洛",
  "30497": "布雷默",
  "10124": "莱奥·佩雷拉",
  "24866": "道格拉斯·桑托斯",
  "30424": "伊巴涅斯",
  "747": "卡塞米罗",
  "10135": "吉马良斯",
  "1496": "拉菲尼亚",
  "299": "法比尼奥",
  "275170": "桑托斯",
  "1646": "帕奎塔",
  "762": "维尼修斯",
  "1165": "库尼亚",
  "276": "内马尔",
  "377122": "恩德里克",
  "265785": "路易斯·恩里克",
  "127769": "马丁内利",
  "196156": "蒂亚戈",
  "407806": "拉扬",
  "280": "阿利松",
  "2410": "维弗顿",
  "617": "埃德森",
  // Spain
  "182718": "霍安·加西亚",
  "19465": "拉亚",
  "47270": "乌奈·西蒙",
  "396623": "库巴西",
  "47380": "库库雷利亚",
  "619": "埃里克·加西亚",
  "563": "格里马尔多",
  "622": "拉波尔特",
  "753": "略伦特",
  "47519": "波罗",
  "295793": "普维尔",
  "296667": "加维",
  "47311": "梅里诺",
  "133609": "佩德里",
  "44": "罗德里",
  "328": "法比安·鲁伊斯",
  "47315": "苏维门迪",
  "182219": "巴埃纳",
  "1323": "奥尔莫",
  "47348": "伊格莱西亚斯",
  "386828": "亚马尔",
  "338751": "穆尼奥斯",
  "47323": "奥亚萨瓦尔",
  "184226": "皮诺",
  "931": "费兰·托雷斯",
  "183799": "尼科·威廉姆斯",
};
const CAPTAINS = {
  "44": true,
  "154": true,
  "184": true,
  "278": true,
  "280": true,
  "2098": true,
};
const POSITION_ZH = {
  'Goalkeeper': '门将',
  'Defender': '后卫',
  'Midfielder': '中场',
  'Attacker': '前锋'
};
// 内存缓存
let memoryCache = {
  squads: {}   // { teamId: { players: [...], fetchedAt: timestamp } }
};
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}
function getCachePath(apiTeamId) {
  return path.join(CACHE_DIR, `squad_${apiTeamId}.json`);
}
function loadTeamIdMapping() {
  try {
    const mappingPath = path.join(__dirname, '..', 'config', 'teamIdMapping.json');
    return JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  } catch (e) {
    console.error('[SquadFetcher] 无法加载球队映射:', e.message);
    return {};
  }
}
/**
 * 获取指定球队的阵容
 * @param {string} wcTeamId - worldcup26.ir 球队 ID
 * @returns {Promise<Object>} 阵容数据
 */
async function getSquad(wcTeamId) {
  // 1. Check FIFA official data first (primary source)
  try {
    const fifaPath = path.join(__dirname, '..', 'data', 'fifaSquadData.json');
    if (fs.existsSync(fifaPath)) {
      const fifaData = JSON.parse(fs.readFileSync(fifaPath, 'utf8'));
      const fifaSquad = fifaData[wcTeamId];
      if (fifaSquad && fifaSquad.players && fifaSquad.players.length > 0) {
        return { success: true, data: fifaSquad };
      }
    }
  } catch(e) {}

  const mapping = loadTeamIdMapping();
  const teamInfo = mapping[wcTeamId];
  
  if (!teamInfo || !teamInfo.apiId) {
    return { success: false, error: '该球队暂无阵容数据' };
  }


  const apiTeamId = teamInfo.apiId;
  
  // 1. 检查内存缓存（5分钟有效）
  if (memoryCache.squads[apiTeamId]) {
    const cache = memoryCache.squads[apiTeamId];
    if (Date.now() - cache.fetchedAt < 5 * 60 * 1000) {
    cache.players.forEach(function(p){var zh=PLAYER_NAME_ZH[String(p.id)];if(zh)p.nameZh=zh;if(CAPTAINS[String(p.id)])p.isCaptain=true;});
      return { success: true, data: cache };
    }
  }
  // 2. 检查文件缓存（1小时有效）
  const cachePath = getCachePath(apiTeamId);
  try {
    const fileCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Date.now() - fileCache.fetchedAt < 60 * 60 * 1000) {
    fileCache.players.forEach(function(p){var zh=PLAYER_NAME_ZH[String(p.id)];if(zh)p.nameZh=zh;if(CAPTAINS[String(p.id)])p.isCaptain=true;});
      memoryCache.squads[apiTeamId] = fileCache;
      return { success: true, data: fileCache };
    }
  } catch (e) { /* 无缓存或已过期 */ }
  // 3. 从 API 获取
  return new Promise((resolve) => {
    const url = `https://v3.football.api-sports.io/players/squads?team=${apiTeamId}`;
    
    https.get(url, { headers: { 'x-apisports-key': API_KEY } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const response = json.response || [];
          
          if (response.length === 0 || !response[0].players) {
            resolve({ success: false, error: '暂无阵容数据' });
            return;
          }
          const rawPlayers = response[0].players;
          const players = rawPlayers.map(p => ({
            id: p.id,
            name: p.name,
            nameZh: PLAYER_NAME_ZH[String(p.id)] || p.name,
            number: p.number || '-',
            position: p.position || '',
            positionZh: POSITION_ZH[p.position] || p.position || '',
            age: p.age,
            photo: p.photo || '',
            isCaptain: CAPTAINS[String(p.id)] || false
          }));

          // 按位置分组排序
          const positionOrder = { 'Goalkeeper': 0, 'Defender': 1, 'Midfielder': 2, 'Attacker': 3 };
          players.sort((a, b) => {
            const pa = positionOrder[a.position] || 99;
            const pb = positionOrder[b.position] || 99;
            if (pa !== pb) return pa - pb;
            return (a.number || 99) - (b.number || 99);
          });
          const squadData = {
            teamId: apiTeamId,
            teamName: response[0].team?.name || '',
            players,
            fetchedAt: Date.now()
          };
          // 写入缓存
          memoryCache.squads[apiTeamId] = squadData;
          ensureCacheDir();
          fs.writeFileSync(cachePath, JSON.stringify(squadData, null, 2));
          resolve({ success: true, data: squadData });
        } catch (e) {
          console.error('[SquadFetcher] 解析错误:', e.message);
          resolve({ success: false, error: '数据解析失败' });
        }
      });
    }).on('error', (e) => {
      console.error('[SquadFetcher] 请求错误:', e.message);
      resolve({ success: false, error: '网络请求失败' });
    });
  });
}

module.exports = { getSquad };
