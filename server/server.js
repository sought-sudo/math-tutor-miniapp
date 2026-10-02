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
const tutorEngine = require('./tutor-engine');
const db = require('./db');
const auth = require('./auth');
const solver = require('../utils/solver');
const curriculum = require('../utils/curriculum');
const deformService = require('./services/deformService');
const reportService = require('./services/reportService');
const rateLimit = require('./rateLimit');

const PORT = Number(process.env.PORT) || 8787;
const LLM_BASE_URL = (process.env.LLM_BASE_URL || '').replace(/\/$/, '');
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const OCR_MODEL = process.env.OCR_MODEL || LLM_MODEL;

const DATA_FILE = path.join(__dirname, 'data.json');
const PARENT_DIR = path.join(__dirname, '..', 'parent-web');
const STUDENT_DIR = path.join(__dirname, '..', 'student-web');
const SOLVER_FILE = path.join(__dirname, '..', 'utils', 'solver.js');
const CURRICULUM_FILE = path.join(__dirname, '..', 'utils', 'curriculum.js');
const MCQ_FILE = path.join(__dirname, '..', 'utils', 'mcq.js');

// ---------------- 数据存储（JSON 文件） ----------------

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { children: {} };
  }
}

let store = loadData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
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

// 同步码格式：旧版 6 位数字，新版 12 位字母数字 token，两者都兼容
function isValidCode(c) {
  return typeof c === 'string' && /^[A-Za-z0-9]{6,32}$/.test(c);
}

// LLM 接口限流：按用户同步码（无码时按来源兜底），每分钟 N 次（可用环境变量覆盖）
function llmRateLimit(res, kind, code) {
  const limits = {
    chat: Number(process.env.RATE_CHAT) || 30,
    tutor: Number(process.env.RATE_TUTOR) || 10,
    variant: Number(process.env.RATE_VARIANT) || 10,
    ocr: Number(process.env.RATE_OCR) || 5
  };
  const key = kind + ':' + (code || 'anon');
  if (!rateLimit.allow(key, limits[kind] || 10, 60000)) {
    send(res, 429, { ok: false, error: '节奏太快啦，休息一分钟再继续吧 🌱' });
    return false;
  }
  return true;
}

// 登录失败计数与锁定（内存）
const loginFails = new Map();
const loginLocks = new Map();

// 孩子码生成：与学生端同一字符集（去掉易混淆字符）
const CHILD_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genChildCode() {
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += CHILD_CODE_CHARS[Math.floor(Math.random() * CHILD_CODE_CHARS.length)];
  }
  return s;
}

function handleSync(body) {
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim() || '小朋友';
  const type = body.type;
  const data = body.data || {};
  if (!code) throw new Error('缺少同步码');

  let child = store.children[code];
  if (!child) {
    child = { name: name, records: [], wrongs: {} };
    store.children[code] = child;
  }
  child.name = name;

  if (type === 'record') {
    child.records.push({
      ts: data.ts || Date.now(),
      ok: !!data.ok,
      seconds: data.seconds || 0,
      knowledge: data.knowledge || '',
      mode: data.mode || 'practice',
      attempts: data.attempts || 1
    });
    if (child.records.length > 300) child.records = child.records.slice(-300);
    // 行为日志：从同步的练习记录推导（避免客户端重复上报）
    const isVariant = data.mode === 'variant';
    if (isVariant) {
      db.logEvent({ userId: code, sessionId: null, eventType: 'deformation_attempt', knowledgePoint: data.knowledge || null });
    }
    db.logEvent({ userId: code, sessionId: null, eventType: 'question_attempt', knowledgePoint: data.knowledge || null });
    if (data.ok) {
      db.logEvent({ userId: code, sessionId: null, eventType: 'answer_correct', knowledgePoint: data.knowledge || null });
      if (isVariant) {
        db.logEvent({ userId: code, sessionId: null, eventType: 'deformation_correct', knowledgePoint: data.knowledge || null });
      }
    } else {
      db.logEvent({ userId: code, sessionId: null, eventType: 'answer_wrong', knowledgePoint: data.knowledge || null });
      if ((data.attempts || 1) > 1) {
        db.logEvent({ userId: code, sessionId: null, eventType: 'after_wrong_retry', knowledgePoint: data.knowledge || null });
      }
    }
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
      errorType: data.errorType || '',
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
  } else if (type === 'reward') {
    child.stars = data.stars || 0;
    child.streak = data.streak || 0;
  } else if (type === 'unit') {
    child.unit = data.unit || '';
  } else if (type === 'companion') {
    child.companion = { bond: data.bond || 0, streak: data.streak || 0 };
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

// 提供 utils 目录下的共享 JS（学生端浏览器直接引用）
function serveUtilFile(res, file) {
  fs.readFile(file, (err, buf) => {
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
}

function serveStatic(res, urlPath, dir, prefix) {  let rel = decodeURIComponent(urlPath.replace(prefix, ''));
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
  try {
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
      }),
      signal: AbortSignal.timeout(20000) // 20 秒超时，避免请求无限悬挂
    });
    if (!resp.ok) throw new Error('大模型接口返回 HTTP ' + resp.status);
    const j = await resp.json();
    const content =
      j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!content) throw new Error('大模型返回为空');
    return content;
  } catch (e) {
    if (e && e.name === 'TimeoutError') {
      throw new Error('大模型响应超时（20 秒）');
    }
    throw e;
  }
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
  '你是小学四年级数学辅导老师。请像在教室里上课一样分步讲解题目，只返回 JSON：' +
  '{"answer": 数值, "displayAnswer": "带单位的完整答案", "knowledge": "知识点名称", ' +
  '"steps": [{"title": "第1步", "content": "讲解内容", "tip": "一句小口诀或提醒，可空", "ask": "一个引导孩子思考的问题，可空"}]}。' +
  '讲解要求（重要）：1) 共 4~6 步，每步先讲"为什么这么做"，再演示"怎么做"，像老师讲课一样有引导、有停顿；' +
  '2) content 用完整的口语化句子（2~4 句），称呼孩子为"你"，语气亲切鼓励，例如"先别急着算，我们来看看题里告诉了我们什么"；' +
  '3) 不要只罗列算式，要解释每一步的道理，可用生活化的比喻；4) 最后一步教孩子如何检查验算；5) 只返回 JSON，不要输出其他内容。';

const TUTOR_WRONG_SYSTEM =
  '你是小学四年级数学辅导老师。学生这道题做错了，请先安慰和肯定他敢于尝试，再像上课一样讲解。只返回 JSON：' +
  '{"answer": 数值, "displayAnswer": "带单位的完整答案", "knowledge": "知识点名称", ' +
  '"reason": "温和地指出学生可能错在哪里（结合他写的答案，如抄错数、运算顺序错、进位遗漏、单位没写等）", ' +
  '"steps": [{"title": "第1步", "content": "讲解内容", "tip": "一句小口诀或提醒，可空", "ask": "一个引导孩子思考的问题，可空"}]}。' +
  '讲解要求（重要）：1) reason 要具体、温和，先肯定"你已经很接近了"，再点出问题；' +
  '2) 共 4~6 步，每步先讲"为什么"再演示"怎么做"，content 用完整的口语化句子（2~4 句），称呼孩子为"你"；' +
  '3) 不要只罗列算式，要解释每一步的道理；4) 最后一步教孩子如何检查验算；5) 只返回 JSON。';

const TUTOR_VARIANT_SYSTEM =
  '你是小学四年级数学辅导老师。请根据原题生成一道同类型、同难度的变形题（换数字或换情境，知识点和解题方法不变），并分步讲解。只返回 JSON：' +
  '{"problem": "变形后的完整题目文字", "answer": 数值, "displayAnswer": "带单位的完整答案", "knowledge": "知识点名称", ' +
  '"steps": [{"title": "第1步", "content": "讲解内容", "tip": "一句小口诀或提醒，可空", "ask": "一个引导孩子思考的问题，可空"}]}。' +
  '要求：1) problem 必须是与原题不同数字/情境的新题目，适合用来巩固；2) 步骤 4~6 步，content 用完整口语化句子（2~4 句），先讲"为什么"再演示"怎么做"，称呼孩子为"你"；3) 最后一步教孩子检查验算；4) 只返回 JSON。';

const OCR_SYSTEM =
  '你是 OCR 识别助手。识别图片中的数学题，只输出题目文字本身，不要任何解释。如果图中没有数学题，输出：未识别到题目。';

// ---------------- 引导式对话辅导（状态机） ----------------

const chatSessions = new Map(); // sessionId -> 会话（2 小时过期）

function getChatSession(id) {
  const sess = chatSessions.get(id);
  if (!sess) return null;
  if (Date.now() - sess.createdAt > 2 * 3600 * 1000) {
    chatSessions.delete(id);
    return null;
  }
  return sess;
}

async function tutorChatStep(body) {
  let sess = body.sessionId ? getChatSession(body.sessionId) : null;
  const isNew = !sess;
  if (!sess) {
    sess = tutorEngine.createSession({
      problem: body.problem,
      knowledge: body.knowledge,
      myAnswer: body.myAnswer,
      rightAnswer: body.rightAnswer,
      answer: body.answer,
      steps: body.steps
    });
    sess.createdAt = Date.now();
    chatSessions.set(sess.id, sess);
  }
  const preState = sess.state;
  const preStreak = sess.wrongStreak;
  const studentText = String(body.message || '');
  const check = tutorEngine.checkAnswer(sess.state === 'DEFORM' ? sess.variantAnswer : sess.answer, studentText);

  let out = null;
  if (LLM_BASE_URL && LLM_API_KEY) {
    try {
      const content = await chat(
        [
          { role: 'system', content: tutorEngine.buildSystemPrompt(sess, check) },
          { role: 'user', content: tutorEngine.buildUserMessage(sess, studentText, check) }
        ],
        LLM_MODEL
      );
      const j = parseJson(content);
      if (j && j.state && j.tutorText && tutorEngine.isValidTransition(sess.state, j.state)) {
        if (studentText) sess.history.push({ role: 'student', text: studentText });
        sess.history.push({ role: 'tutor', text: j.tutorText });
        sess.state = j.state;
        out = {
          state: sess.state,
          tutorText: j.tutorText,
          quickReplies: (j.quickReplies || []).slice(0, 4),
          // 结构化卡片由服务端确定性生成，不依赖模型输出
          extra: buildExtraForState(sess, j.state, check, preState)
        };
      }
    } catch (e) {
      // 大模型失败 → 走确定性引擎
    }
  }
  if (!out) {
    out = tutorEngine.step(sess, studentText, check);
  }
  logTutorEvents(sess, body, isNew, preState, preStreak, check, out);
  return Object.assign({ sessionId: sess.id }, out);
}

// 按转移后的状态，服务端确定性生成结构化内容与维护会话状态（LLM 模式与确定性模式一致）
function buildExtraForState(sess, nextState, check, preState) {
  const lib = solver.getKnowledge(sess.knowledge);

  // 会话内部状态维护（与确定性引擎的 step 保持一致）
  if (preState === 'SCAFFOLD' && check && check.correct === false) {
    sess.wrongStreak++;
  }
  if (preState === 'DEFORM' && check && check.correct === true) {
    sess.masteredOriginal = true;
  }

  if (nextState === 'ACTIVATE_KNOWLEDGE') {
    return {
      knowledgeCard: { name: sess.knowledge, desc: lib.desc, method: lib.method, mistakes: lib.mistakes }
    };
  }
  if (nextState === 'DEFORM') {
    if (!sess.variant) {
      const v = solver.variantByKnowledge(sess.knowledge, sess.problem) || solver.generatePractice();
      sess.variant = v.problem;
      sess.variantAnswer = v.answer;
      sess.variantDisplay = v.displayAnswer || String(v.answer);
    }
    return { variant: { problem: sess.variant } };
  }
  if (nextState === 'REVIEW') {
    sess.complete = true;
    const days = sess.masteredOriginal ? 2 : 1;
    return {
      complete: true,
      masteredOriginal: sess.masteredOriginal,
      reviewDue: days + ' 天后',
      errorType: sess.errorType || '',
      parentScript: {
        problem: sess.problem,
        question: '可以问问孩子：这道「' + sess.knowledge + '」题，第一步你是从哪里开始的？',
        closing: '多听孩子讲思路，少直接给答案。'
      }
    };
  }
  return null;
}

// 聊天状态机的行为日志
function logTutorEvents(sess, body, isNew, preState, preStreak, check, out) {
  const userId = body.code || '';
  const qid = db.questionIdOf(sess.problem);
  const now = Date.now();
  const dur = now - (sess.lastEventTs || sess.createdAt);
  sess.lastEventTs = now;

  if (isNew) {
    db.logEvent({ userId: userId, sessionId: sess.id, eventType: 'session_start', questionId: qid, knowledgePoint: sess.knowledge });
  }
  if (check && check.value !== null && check.value !== undefined) {
    if (preState === 'SCAFFOLD') {
      db.logEvent({ userId: userId, sessionId: sess.id, eventType: 'question_attempt', questionId: qid, knowledgePoint: sess.knowledge, durationMs: dur });
      if (preStreak >= 1) {
        // 做错后继续尝试（无论这次结果如何）
        db.logEvent({ userId: userId, sessionId: sess.id, eventType: 'after_wrong_retry', questionId: qid, knowledgePoint: sess.knowledge, durationMs: dur });
      }
      if (check.correct) {
        db.logEvent({ userId: userId, sessionId: sess.id, eventType: 'answer_correct', questionId: qid, knowledgePoint: sess.knowledge, durationMs: dur });
      } else {
        db.logEvent({ userId: userId, sessionId: sess.id, eventType: 'answer_wrong', questionId: qid, knowledgePoint: sess.knowledge, errorType: sess.errorType || null, durationMs: dur });
      }
    } else if (preState === 'DEFORM') {
      db.logEvent({ userId: userId, sessionId: sess.id, eventType: 'deformation_attempt', questionId: qid, knowledgePoint: sess.knowledge, durationMs: dur });
      if (check.correct) {
        db.logEvent({ userId: userId, sessionId: sess.id, eventType: 'deformation_correct', questionId: qid, knowledgePoint: sess.knowledge, durationMs: dur });
      }
    }
  }
  if (out.state === 'REVIEW' && out.extra && out.extra.complete && !sess.ended) {
    sess.ended = true;
    db.logEvent({ userId: userId, sessionId: sess.id, eventType: 'session_end', questionId: qid, knowledgePoint: sess.knowledge, durationMs: now - sess.createdAt });
  }
}

// ---------------- 服务器 ----------------

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    // ================= 账号认证 =================
    if (req.method === 'POST' && req.url === '/api/auth/register') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const ip = req.socket.remoteAddress || 'ip';
      if (!rateLimit.allow('auth-reg:' + ip, 5, 3600000)) {
        send(res, 429, { ok: false, code: 'RATE_LIMITED', error: '注册太频繁，请稍后再试' });
        return;
      }
      const phone = String(body.phone || '').trim();
      const password = String(body.password || '');
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        send(res, 400, { ok: false, error: '手机号格式不正确' });
        return;
      }
      if (password.length < 6) {
        send(res, 400, { ok: false, error: '密码至少 6 位' });
        return;
      }
      const userId = db.createUser(phone, auth.hashPassword(password));
      if (!userId) {
        send(res, 409, { ok: false, error: '该手机号已注册，请直接登录' });
        return;
      }
      send(res, 200, { ok: true, token: auth.issueToken(userId), user: { id: userId, phone: phone } });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/auth/login') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const ip = req.socket.remoteAddress || 'ip';
      const phone = String(body.phone || '').trim();
      const password = String(body.password || '');
      const lockKey = 'auth-lock:' + phone;
      if (loginLocks.get(lockKey) && Date.now() < loginLocks.get(lockKey)) {
        send(res, 429, { ok: false, error: '失败次数过多，请 15 分钟后再试' });
        return;
      }
      if (!rateLimit.allow('auth-login:' + ip, 10, 900000)) {
        send(res, 429, { ok: false, code: 'RATE_LIMITED', error: '登录太频繁，请稍后再试' });
        return;
      }
      const user = db.getUserByPhone(phone);
      if (!user || !auth.verifyPassword(password, user.password_hash)) {
        const fails = (loginFails.get(phone) || 0) + 1;
        loginFails.set(phone, fails);
        if (fails >= 5) {
          loginLocks.set(lockKey, Date.now() + 15 * 60000);
          loginFails.set(phone, 0);
          send(res, 429, { ok: false, error: '失败次数过多，请 15 分钟后再试' });
          return;
        }
        send(res, 401, { ok: false, error: '手机号或密码不正确' });
        return;
      }
      loginFails.set(phone, 0);
      send(res, 200, { ok: true, token: auth.issueToken(user.id), user: { id: user.id, phone: user.phone } });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/my/children') {
      const userId = auth.verifyToken(auth.getToken(req));
      if (!userId) {
        send(res, 401, { ok: false, error: '请先登录' });
        return;
      }
      send(res, 200, {
        ok: true,
        children: db.listChildren(userId).map((c) => ({ name: c.name, code: c.code }))
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/my/children') {
      const userId = auth.verifyToken(auth.getToken(req));
      if (!userId) {
        send(res, 401, { ok: false, error: '请先登录' });
        return;
      }
      const body = JSON.parse((await readBody(req)) || '{}');
      if (db.childCountByUser(userId) >= 5) {
        send(res, 400, { ok: false, error: '最多创建 5 个孩子档案' });
        return;
      }
      const name = String(body.name || '小朋友').trim().slice(0, 12) || '小朋友';
      let code = genChildCode();
      let guard = 0;
      while (db.findChildByCode(code) && guard++ < 10) code = genChildCode();
      if (!db.addChildProfile(userId, name, code)) {
        send(res, 500, { ok: false, error: '创建失败，请重试' });
        return;
      }
      send(res, 200, { ok: true, child: { name: name, code: code } });
      return;
    }

    // 绑定已有同步码到账号（孩子端显示的码）
    if (req.method === 'POST' && req.url.indexOf('/api/children/') === 0 && req.url.indexOf('/bind') > 0) {
      const userId = auth.verifyToken(auth.getToken(req));
      if (!userId) {
        send(res, 401, { ok: false, error: '请先登录' });
        return;
      }
      const code = decodeURIComponent(req.url.split('/api/children/')[1].split('/')[0]);
      if (!isValidCode(code)) {
        send(res, 400, { ok: false, error: '同步码格式不正确' });
        return;
      }
      const body = JSON.parse((await readBody(req)) || '{}');
      if (db.findChildByCode(code)) {
        send(res, 409, { ok: false, error: '该同步码已被绑定' });
        return;
      }
      const child = store.children[code];
      const name = String(body.name || (child && child.name) || '小朋友').trim().slice(0, 12) || '小朋友';
      if (!db.addChildProfile(userId, name, code)) {
        send(res, 409, { ok: false, error: '绑定失败，请重试' });
        return;
      }
      send(res, 200, { ok: true, child: { name: name, code: code } });
      return;
    }

    // 学生端上报
    if (req.method === 'POST' && req.url === '/api/sync') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!isValidCode(body.code)) {
        send(res, 400, { ok: false, error: '同步码格式不正确' });
        return;
      }
      handleSync(body);
      send(res, 200, { ok: true });
      return;
    }

    // 通用行为事件上报（session_start/session_end/parent_script_viewed 等）
    if (req.method === 'POST' && req.url === '/api/event') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.eventType) throw new Error('缺少 eventType');
      db.logEvent({
        userId: body.code,
        sessionId: body.sessionId,
        eventType: body.eventType,
        questionId: body.questionId,
        knowledgePoint: body.knowledgePoint,
        errorType: body.errorType,
        durationMs: body.durationMs
      });
      send(res, 200, { ok: true });
      return;
    }

    // 指标：做错后继续尝试比例（支持 ?code=同步码 按孩子过滤）
    if (req.method === 'GET' && req.url.indexOf('/api/metrics/retry-rate') === 0) {
      let code = '';
      try {
        code = new URL(req.url, 'http://x').searchParams.get('code') || '';
      } catch (e) {
        // 忽略参数解析失败
      }
      const m = db.getRetryRate(code);
      send(res, 200, { ok: true, totalWrong: m.totalWrong, retryAfterWrong: m.retryAfterWrong, retryRate: m.retryRate });
      return;
    }

    // 家长报告：翻译报告 + 沟通脚本（period=week 为最近 7 天，默认当天）
    if (req.method === 'GET' && req.url.indexOf('/api/report/') === 0) {
      const urlParts = req.url.split('?');
      const userId = decodeURIComponent((urlParts[0].split('/').pop() || '').split('?')[0]);
      if (!userId) throw new Error('缺少用户 id');
      let period = 'day';
      try {
        period = new URL(req.url, 'http://x').searchParams.get('period') || 'day';
      } catch (e) {
        // 忽略参数解析失败
      }
      let events;
      let periodLabel = '今天';
      if (period === 'week') {
        const since = new Date(Date.now() - 6 * 86400000);
        since.setHours(0, 0, 0, 0);
        events = db.getEventsSince(userId, since.toISOString());
        periodLabel = '最近 7 天';
      } else {
        events = db.getTodayEvents(userId);
      }
      const child = store.children[userId];
      const facts = reportService.buildFacts(
        userId,
        child ? child.name : '孩子',
        events,
        child ? Object.keys(child.wrongs).map((k) => child.wrongs[k]) : [],
        { periodLabel: periodLabel }
      );
      const chatFn = LLM_BASE_URL && LLM_API_KEY ? (msgs) => chat(msgs, LLM_MODEL) : null;
      const r = await reportService.generateReport(chatFn, facts);
      send(res, 200, { ok: true, userId: userId, period: period, translated_report: r.translated_report, communication_script: r.communication_script });
      return;
    }

    // 掌握度：各知识点分数（薄弱在前）
    if (req.method === 'GET' && req.url.indexOf('/api/mastery/') === 0) {
      const userId = decodeURIComponent((req.url.split('/').pop() || '').split('?')[0]);
      if (!userId) throw new Error('缺少用户 id');
      send(res, 200, { ok: true, userId: userId, mastery: db.getMastery(userId) });
      return;
    }

    // 家长端拉取
    if (req.method === 'GET' && req.url.indexOf('/api/child/') === 0) {
      const code = decodeURIComponent((req.url.split('/').pop() || '').split('?')[0]);
      if (!isValidCode(code)) {
        send(res, 404, { ok: false, error: '未找到该同步码，请确认输入正确' });
        return;
      }
      const child = store.children[code];
      if (!child) {
        send(res, 404, { ok: false, error: '未找到该同步码，请确认输入正确' });
        return;
      }
      send(res, 200, {
        ok: true,
        child: {
          name: child.name,
          records: child.records.slice(-200),
          wrongs: Object.keys(child.wrongs).map((k) => child.wrongs[k]),
          stars: child.stars || 0,
          streak: child.streak || 0,
          unit: child.unit || '',
          unitLabel: child.unit ? curriculum.unitLabel(child.unit) : '',
          companion: child.companion || { bond: 0, streak: 0 }
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
      serveUtilFile(res, SOLVER_FILE);
      return;
    }
    // 学生端共用 utils/curriculum.js 教材目录
    if (req.url === '/student/curriculum.js') {
      serveUtilFile(res, CURRICULUM_FILE);
      return;
    }
    // 学生端共用 utils/mcq.js 选择题题型库
    if (req.url === '/student/mcq.js') {
      serveUtilFile(res, MCQ_FILE);
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

    // 引导式对话辅导（状态机）：sessionId 为空时创建新会话并返回开场白
    if (req.method === 'POST' && req.url === '/tutor-chat') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.problem && !body.sessionId) throw new Error('缺少题目或会话 id');
      if (!llmRateLimit(res, 'chat', body.code)) return;
      const out = await tutorChatStep(body);
      send(res, 200, Object.assign({ ok: true }, out));
      return;
    }

    // AI 分步讲解（mode: 'wrong' 时结合学生的错误答案先分析错因）
    if (req.method === 'POST' && req.url === '/tutor') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.problem) throw new Error('缺少参数 problem');
      if (!llmRateLimit(res, 'tutor', body.code)) return;
      const wrongMode = body.mode === 'wrong';

      // 判错模式：讲解失败也保证有输出，并自动生成一道变形题作为下一题返回
      if (wrongMode) {
        const userMsg =
          '题目：' + body.problem + '\n学生写的答案：' + (body.myAnswer || '未作答') +
          '\n正确答案：' + (body.rightAnswer || '未知') +
          '\n请先指出学生可能错在哪里（reason 字段），再分步讲解正确做法。';
        let result = null;
        if (LLM_BASE_URL && LLM_API_KEY) {
          try {
            const content = await chat(
              [
                { role: 'system', content: TUTOR_WRONG_SYSTEM },
                { role: 'user', content: userMsg }
              ],
              LLM_MODEL
            );
            const j = parseJson(content);
            if (j && Array.isArray(j.steps) && j.steps.length) {
              result = Object.assign({ ok: true }, j);
            }
          } catch (e) {
            // 模型失败 → 本地讲解
          }
        }
        if (!result) {
          const local = solver.solveText(body.problem) || solver.genericGuide(body.problem);
          result = {
            ok: true,
            source: 'local',
            answer: local.answer,
            displayAnswer: local.displayAnswer || body.rightAnswer || '',
            knowledge: body.knowledge || local.knowledge || '综合',
            reason: '',
            steps: local.steps || []
          };
        }
        // 做错后：自动生成变形题，作为下一题返回
        const chatFn = LLM_BASE_URL && LLM_API_KEY ? (msgs) => chat(msgs, LLM_MODEL) : null;
        const variants = await deformService.generateVariants(chatFn, {
          problem: body.problem,
          knowledge: result.knowledge || body.knowledge || '',
          errorType: body.errorType || ''
        });
        if (variants.length) {
          result.nextProblem = variants[0];
        }
        send(res, 200, result);
        return;
      }

      const content = await chat(
        [
          { role: 'system', content: TUTOR_SYSTEM },
          { role: 'user', content: body.problem }
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

    // 变形题生成（巩固练习用）
    if (req.method === 'POST' && req.url === '/variant') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.problem) throw new Error('缺少参数 problem');
      if (!llmRateLimit(res, 'variant', body.code)) return;
      const userMsg =
        '原题：' + body.problem + '\n知识点：' + (body.knowledge || '未知') +
        '\n请生成一道换过数字/情境的变形题（难度相同），并分步讲解。';
      const content = await chat(
        [
          { role: 'system', content: TUTOR_VARIANT_SYSTEM },
          { role: 'user', content: userMsg }
        ],
        LLM_MODEL
      );
      const j = parseJson(content);
      if (!j || !j.problem || !Array.isArray(j.steps) || !j.steps.length) {
        throw new Error('解析变形题失败：' + String(content).slice(0, 200));
      }
      send(res, 200, Object.assign({ ok: true }, j));
      return;
    }

    // 拍照识题
    if (req.method === 'POST' && req.url === '/ocr') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.image) throw new Error('缺少参数 image(base64)');
      if (!llmRateLimit(res, 'ocr', body.code)) return;
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
  db.init();
  setInterval(() => rateLimit.sweep(), 5 * 60 * 1000).unref();
  console.log('数学辅导后端已启动：http://127.0.0.1:' + PORT);
  console.log('学生端网页：http://127.0.0.1:' + PORT + '/student');
  console.log('家长端网页：http://127.0.0.1:' + PORT + '/parent');
  console.log('接口：POST /api/sync（学生端上报）、GET /api/child/<同步码>（家长端拉取）、GET /api/metrics/retry-rate（行为指标）');
});
