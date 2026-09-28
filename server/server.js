/**
 * 数学辅导 · 后端（Node >= 18，零依赖）
 *
 * 功能：
 *   1) AI 讲解 / 拍照识题（可选，接大模型，见下方环境变量）
 *   2) 学生端 ↔ 家长端数据同步 API（练习记录、错题变化）
 *   3) 托管家长端网页：浏览器打开 http://127.0.0.1:8787/parent 即可
 *
 * 启动（Windows CMD）：
 *   node server.js
 *   （AI 功能需要：set LLM_BASE_URL=... && set LLM_API_KEY=...）
 *
 * 环境变量：
 *   PORT         端口，默认 8787
 *   LLM_BASE_URL OpenAI 兼容接口地址（DeepSeek / Qwen / GLM / OpenAI 均可）
 *   LLM_API_KEY  接口密钥
 *   LLM_MODEL    分步讲解用模型，默认 deepseek-chat
 *   OCR_MODEL    识图用模型（需支持视觉输入），如 qwen-vl-plus / glm-4v / gpt-4o
 *
 * 接口：
 *   POST /tutor                body: { problem }          分步讲解
 *   POST /ocr                  body: { image: base64 }    题目识别
 *   POST /api/sync             body: { code,name,type,data }  学生端上报
 *   GET  /api/child/<同步码>    家长端拉取孩子数据
 *   GET  /parent[/...]         家长端网页（静态托管）
 *
 * 数据保存在 server/data.json（已加入 .gitignore，不会提交到仓库）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8787;
const LLM_BASE_URL = (process.env.LLM_BASE_URL || '').replace(/\/$/, '');
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const OCR_MODEL = process.env.OCR_MODEL || LLM_MODEL;

const DATA_FILE = path.join(__dirname, 'data.json');
const PARENT_DIR = path.join(__dirname, '..', 'parent-web');
const STUDENT_DIR = path.join(__dirname, '..', 'student-web');
const SOLVER_FILE = path.join(__dirname, '..', 'utils', 'solver.js');

// ---------------- 数据存储（JSON 文件） ----------------

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { children: {} };
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('数据保存失败：' + e.message);
  }
}

function nowStr() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
  );
}

// ---------------- 同步处理 ----------------

function handleSync(body) {
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim() || '小朋友';
  const type = body.type;
  const data = body.data || {};
  if (!code) throw new Error('缺少同步码');

  let child = db.children[code];
  if (!child) {
    child = { name: name, records: [], wrongs: {} };
    db.children[code] = child;
  }
  child.name = name;

  if (type === 'record') {
    child.records.push({
      ts: data.ts || Date.now(),
      ok: !!data.ok,
      seconds: data.seconds || 0,
      knowledge: data.knowledge || '',
      mode: data.mode || 'practice'
    });
    if (child.records.length > 300) child.records = child.records.slice(-300);
  } else if (type === 'wrong') {
    const key = data.problem;
    if (!key) throw new Error('缺少题目');
    const old = child.wrongs[key];
    child.wrongs[key] = {
      problem: key,
      myAnswer: data.myAnswer || '',
      rightAnswer: data.rightAnswer || '',
      knowledge: data.knowledge || '综合',
      times: data.times || 1,
      status: 'active',
      lastAt: nowStr(),
      masteredAt: old && old.masteredAt ? old.masteredAt : ''
    };
  } else if (type === 'master') {
    const w = child.wrongs[data.problem];
    if (w) {
      w.status = 'mastered';
      w.masteredAt = nowStr();
    }
  } else if (type === 'deleteWrong') {
    delete child.wrongs[data.problem];
  } else if (type === 'clearMastered') {
    Object.keys(child.wrongs).forEach((k) => {
      if (child.wrongs[k].status === 'mastered') delete child.wrongs[k];
    });
  } else if (type === 'name') {
    child.name = data.name || child.name;
  } else {
    throw new Error('未知同步类型：' + type);
  }
  saveData();
}

// ---------------- 基础工具 ----------------

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > (limit || 6 * 1024 * 1024)) reject(new Error('请求体过大'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function send(res, status, obj) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
  res.end(JSON.stringify(obj));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

function serveStatic(res, urlPath, dir, prefix) {
  let rel = decodeURIComponent(urlPath.replace(prefix, ''));
  if (!rel) rel = 'index.html';
  rel = rel.split('?')[0].split('#')[0];
  const file = path.normalize(path.join(dir, rel));
  if (file !== dir && !file.startsWith(dir + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(buf);
  });
}

const LANDING = [
  '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '<title>数学小助手</title><style>',
  'body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#FFF8EC;margin:0;color:#333}',
  '.wrap{max-width:520px;margin:8vh auto;padding:0 20px}',
  'h1{text-align:center;font-size:26px;color:#FF8A00}',
  'p{text-align:center;color:#999;font-size:14px}',
  'a{display:block;text-decoration:none;background:#fff;border-radius:16px;padding:20px;margin:14px 0;',
  'box-shadow:0 3px 14px rgba(255,159,28,.12);font-weight:700;font-size:18px;color:#333}',
  'a .i{font-size:30px;margin-right:10px}',
  'a .s{display:block;font-size:12px;color:#999;font-weight:400;margin-top:4px}',
  '</style></head><body><div class="wrap">',
  '<h1>🦁 数学小助手</h1><p>请选择入口</p>',
  '<a href="/student/"><span class="i">🧮</span>学生端<span class="s">练习、拍照识题、错题本（孩子用）</span></a>',
  '<a href="/parent/"><span class="i">📊</span>家长端<span class="s">查看孩子学习进度（家长用）</span></a>',
  '<p>两个入口都是纯网页，浏览器直接打开即可，不需要微信开发者工具。</p>',
  '</div></body></html>'
].join('');

// ---------------- AI（可选） ----------------

async function chat(messages, model) {
  if (!LLM_BASE_URL || !LLM_API_KEY) {
    throw new Error('后端未配置 LLM_BASE_URL / LLM_API_KEY');
  }
  const resp = await fetch(LLM_BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + LLM_API_KEY
    },
    body: JSON.stringify({
      model: model || LLM_MODEL,
      messages: messages,
      temperature: 0.3
    })
  });
  if (!resp.ok) throw new Error('大模型接口返回 HTTP ' + resp.status);
  const j = await resp.json();
  const content =
    j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!content) throw new Error('大模型返回为空');
  return content;
}

function parseJson(text) {
  const s = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (e2) {
        // 忽略，走下方 null
      }
    }
    return null;
  }
}

const TUTOR_SYSTEM =
  '你是小学四年级数学辅导老师。请分步讲解题目，并只返回 JSON：' +
  '{"answer": 数值, "displayAnswer": "带单位的完整答案", "knowledge": "知识点名称", ' +
  '"steps": [{"title": "第1步", "content": "讲解内容"}]}。' +
  '要求：步骤 4~6 步，每步只讲一个要点，语言亲切易懂、适合小学生；answer 尽量是纯数字；不要输出 JSON 以外的内容。';

const TUTOR_WRONG_SYSTEM =
  '你是小学四年级数学辅导老师。学生这道题做错了，请先分析错因、再分步讲解。只返回 JSON：' +
  '{"answer": 数值, "displayAnswer": "带单位的完整答案", "knowledge": "知识点名称", ' +
  '"reason": "一句话指出学生可能错在哪里", ' +
  '"steps": [{"title": "第1步", "content": "讲解内容"}]}。' +
  '要求：reason 要具体、温和（结合学生写的答案分析，如抄错数、运算顺序错、单位遗漏等）；' +
  '步骤 4~6 步，每步只讲一个要点，语言亲切易懂、适合小学生；不要输出 JSON 以外的内容。';

const OCR_SYSTEM =
  '你是 OCR 识别助手。识别图片中的数学题，只输出题目文字本身，不要任何解释。如果图中没有数学题，输出：未识别到题目。';

// ---------------- 服务器 ----------------

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    // 学生端上报
    if (req.method === 'POST' && req.url === '/api/sync') {
      const body = JSON.parse((await readBody(req)) || '{}');
      handleSync(body);
      send(res, 200, { ok: true });
      return;
    }

    // 家长端拉取
    if (req.method === 'GET' && req.url.indexOf('/api/child/') === 0) {
      const code = decodeURIComponent((req.url.split('/').pop() || '').split('?')[0]);
      const child = db.children[code];
      if (!child) {
        send(res, 404, { ok: false, error: '未找到该同步码，请确认输入正确' });
        return;
      }
      send(res, 200, {
        ok: true,
        child: {
          name: child.name,
          records: child.records.slice(-200),
          wrongs: Object.keys(child.wrongs).map((k) => child.wrongs[k])
        }
      });
      return;
    }

    // 静态页面（/parent、/student 重定向到带斜杠地址，保证页面内相对路径正确）
    if (req.url === '/parent') {
      res.writeHead(301, { Location: '/parent/' });
      res.end();
      return;
    }
    if (req.url.indexOf('/parent/') === 0) {
      serveStatic(res, req.url, PARENT_DIR, /^\/parent\//);
      return;
    }
    if (req.url === '/student') {
      res.writeHead(301, { Location: '/student/' });
      res.end();
      return;
    }
    // 学生端共用 utils/solver.js 解题引擎
    if (req.url === '/student/solver.js') {
      fs.readFile(SOLVER_FILE, (err, buf) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(buf);
      });
      return;
    }
    if (req.url.indexOf('/student/') === 0) {
      serveStatic(res, req.url, STUDENT_DIR, /^\/student\//);
      return;
    }
    if (req.url === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(LANDING);
      return;
    }

    // 能力探测（学生端网页据此决定走 AI 还是本地引擎）
    if (req.method === 'GET' && req.url === '/api/status') {
      const llmReady = !!(LLM_BASE_URL && LLM_API_KEY);
      send(res, 200, { ok: true, llm: llmReady, ocr: llmReady });
      return;
    }

    // AI 分步讲解（mode: 'wrong' 时结合学生的错误答案先分析错因）
    if (req.method === 'POST' && req.url === '/tutor') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.problem) throw new Error('缺少参数 problem');
      const wrongMode = body.mode === 'wrong';
      const userMsg = wrongMode
        ? '题目：' + body.problem + '\n学生写的答案：' + (body.myAnswer || '未作答') +
          '\n正确答案：' + (body.rightAnswer || '未知') +
          '\n请先指出学生可能错在哪里（reason 字段），再分步讲解正确做法。'
        : body.problem;
      const content = await chat(
        [
          { role: 'system', content: wrongMode ? TUTOR_WRONG_SYSTEM : TUTOR_SYSTEM },
          { role: 'user', content: userMsg }
        ],
        LLM_MODEL
      );
      const j = parseJson(content);
      if (!j || !Array.isArray(j.steps) || !j.steps.length) {
        throw new Error('解析讲解失败：' + String(content).slice(0, 200));
      }
      send(res, 200, Object.assign({ ok: true }, j));
      return;
    }

    // 拍照识题
    if (req.method === 'POST' && req.url === '/ocr') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.image) throw new Error('缺少参数 image(base64)');
      const content = await chat(
        [
          { role: 'system', content: OCR_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请识别这张图片里的数学题：' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/jpeg;base64,' + body.image }
              }
            ]
          }
        ],
        OCR_MODEL
      );
      send(res, 200, { ok: true, text: content.trim() });
      return;
    }

    send(res, 404, { ok: false, error: '接口不存在' });
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
});

server.listen(PORT, () => {
  console.log('数学辅导后端已启动：http://127.0.0.1:' + PORT);
  console.log('学生端网页：http://127.0.0.1:' + PORT + '/student');
  console.log('家长端网页：http://127.0.0.1:' + PORT + '/parent');
  console.log('接口：POST /api/sync（学生端上报）、GET /api/child/<同步码>（家长端拉取）');
});
