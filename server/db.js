// server/db.js — SQLite 行为日志（零依赖，使用 Node 内置 node:sqlite，需 Node >= 22.13）
// 旧版 Node 无法加载时自动降级：日志功能静默关闭，服务其余功能不受影响。
// 数据文件：server/math_tutor.db（已加入 .gitignore）

const path = require('path');

let DatabaseSync = null;
let db = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  // 旧版 Node：降级关闭日志
}

const EVENT_TYPES = [
  'session_start',
  'session_end',
  'question_attempt',
  'answer_wrong',
  'answer_correct',
  'after_wrong_retry',
  'deformation_attempt',
  'deformation_correct',
  'parent_script_viewed'
];

let warned = false;

function init() {
  if (!DatabaseSync) {
    if (!warned) {
      warned = true;
      console.warn('[db] 当前 Node 不支持内置 SQLite（需 >= 22.13），行为日志已关闭');
    }
    return;
  }
  try {
    db = new DatabaseSync(path.join(__dirname, 'math_tutor.db'));
    db.exec(
      'CREATE TABLE IF NOT EXISTS learning_events (' +
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      '  user_id TEXT,' +
      '  session_id TEXT,' +
      '  event_type TEXT NOT NULL,' +
      '  question_id TEXT,' +
      '  knowledge_point TEXT,' +
      '  error_type TEXT,' +
      '  duration_ms INTEGER,' +
      '  created_at TEXT NOT NULL' +
      ')'
    );
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_type ON learning_events(event_type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_user ON learning_events(user_id)');
    console.log('[db] 行为日志已就绪：server/math_tutor.db');
  } catch (e) {
    console.error('[db] 初始化失败：' + e.message);
    db = null;
  }
}

// 写入一条行为日志；eventType 不在枚举内或数据库不可用时静默忽略
function logEvent(ev) {
  if (!db) return;
  const type = EVENT_TYPES.indexOf(ev.eventType) > -1 ? ev.eventType : null;
  if (!type) return;
  try {
    db.prepare(
      'INSERT INTO learning_events (user_id, session_id, event_type, question_id, knowledge_point, error_type, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      ev.userId || null,
      ev.sessionId || null,
      type,
      ev.questionId || null,
      ev.knowledgePoint || null,
      ev.errorType || null,
      ev.durationMs || 0,
      new Date().toISOString()
    );
  } catch (e) {
    console.error('[db] 写日志失败：' + e.message);
  }
}

function countBy(userId, eventType) {
  if (!db) return 0;
  const row = userId
    ? db.prepare("SELECT COUNT(*) AS c FROM learning_events WHERE event_type = ? AND user_id = ?").get(eventType, userId)
    : db.prepare("SELECT COUNT(*) AS c FROM learning_events WHERE event_type = ?").get(eventType);
  return row ? row.c : 0;
}

// 做错后继续尝试比例：after_wrong_retry / answer_wrong
function getRetryRate(userId) {
  const totalWrong = countBy(userId, 'answer_wrong');
  const retryAfterWrong = countBy(userId, 'after_wrong_retry');
  return {
    totalWrong: totalWrong,
    retryAfterWrong: retryAfterWrong,
    retryRate: totalWrong ? Math.round((retryAfterWrong / totalWrong) * 10000) / 10000 : 0
  };
}

// 某用户当天（本地时区零点起）的行为事件，按时间升序
function getTodayEvents(userId) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return getEventsSince(userId, d.toISOString());
}

// 某用户自某个时间点以来的行为事件
function getEventsSince(userId, sinceIso) {
  if (!db) return [];
  try {
    const rows = db.prepare(
      'SELECT event_type, session_id, question_id, knowledge_point, error_type, duration_ms, created_at ' +
      'FROM learning_events WHERE user_id = ? AND created_at >= ? ORDER BY id'
    ).all(userId, sinceIso);
    return rows || [];
  } catch (e) {
    return [];
  }
}

// ---------------- 掌握度计算 ----------------
// 纯函数（便于单测）：指数时间衰减（半衰期 7 天，近期表现权重高）+ 拉普拉斯平滑
// 输出按分数升序（薄弱在前）：[{ knowledge_point, score(0-100), attempts, lastAt }]
function computeMastery(events) {
  const now = Date.now();
  const map = {};
  (events || []).forEach((ev) => {
    const k = ev.knowledge_point;
    if (!k) return;
    const isCorrect = ev.event_type === 'answer_correct' || ev.event_type === 'deformation_correct';
    const isWrong = ev.event_type === 'answer_wrong';
    if (!isCorrect && !isWrong) return;
    const ageDays = Math.max(0, (now - new Date(ev.created_at).getTime()) / 86400000);
    const w = Math.exp(-ageDays / 7);
    const m = map[k] || (map[k] = { correctSum: 0, wrongSum: 0, attempts: 0, lastTs: 0 });
    m.attempts++;
    if (isCorrect) m.correctSum += w;
    else m.wrongSum += w;
    const ts = new Date(ev.created_at).getTime();
    if (ts > m.lastTs) m.lastTs = ts;
  });
  return Object.keys(map)
    .map((k) => {
      const m = map[k];
      const rate = (m.correctSum + 1) / (m.correctSum + m.wrongSum + 2);
      return {
        knowledge_point: k,
        score: Math.round(rate * 100),
        attempts: m.attempts,
        lastAt: new Date(m.lastTs).toISOString()
      };
    })
    .sort((a, b) => a.score - b.score);
}

// 某用户各知识点掌握度（薄弱在前）
function getMastery(userId) {
  if (!db) return [];
  try {
    const rows = db.prepare(
      "SELECT event_type, knowledge_point, created_at FROM learning_events " +
      "WHERE user_id = ? AND event_type IN ('answer_correct','answer_wrong','deformation_correct')"
    ).all(userId);
    return computeMastery(rows || []);
  } catch (e) {
    return [];
  }
}

// 由题目文本生成稳定的 question_id
function questionIdOf(problem) {
  if (!problem) return null;
  let h = 0;
  for (let i = 0; i < problem.length; i++) {
    h = (h * 31 + problem.charCodeAt(i)) % 1000000007;
  }
  return 'q' + h.toString(36);
}

module.exports = {
  init: init,
  logEvent: logEvent,
  getRetryRate: getRetryRate,
  getTodayEvents: getTodayEvents,
  getEventsSince: getEventsSince,
  getMastery: getMastery,
  computeMastery: computeMastery,
  questionIdOf: questionIdOf,
  EVENT_TYPES: EVENT_TYPES
};
