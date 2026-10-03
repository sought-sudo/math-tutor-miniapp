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
  'parent_script_viewed',
  // 训练营（查漏补缺）
  'diagnostic_attempt',
  'diagnostic_complete',
  'plan_start',
  'lesson_start',
  'lesson_complete',
  'plan_complete'
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
    // 账号表
    db.exec(
      'CREATE TABLE IF NOT EXISTS users (' +
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      '  phone TEXT NOT NULL UNIQUE,' +
      '  password_hash TEXT NOT NULL,' +
      '  created_at TEXT NOT NULL' +
      ')'
    );
    db.exec(
      'CREATE TABLE IF NOT EXISTS child_profiles (' +
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      '  user_id INTEGER NOT NULL,' +
      '  name TEXT NOT NULL DEFAULT \'小朋友\',' +
      '  code TEXT NOT NULL UNIQUE,' +
      '  created_at TEXT NOT NULL' +
      ')'
    );
    // 训练营（查漏补缺）：入学诊断 / 课程计划 / 课时进度
    db.exec(
      'CREATE TABLE IF NOT EXISTS diagnostics (' +
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      '  user_id TEXT NOT NULL,' +
      '  status TEXT NOT NULL DEFAULT \'active\',' + // active | done
      '  score REAL,' +
      '  detail TEXT,' +  // JSON：整卷题目（含答案）与逐题作答记录
      '  report TEXT,' +  // JSON：诊断报告 {report_text, parent_script}
      '  created_at TEXT NOT NULL' +
      ')'
    );
    // 兼容旧库：补充 report 列
    try {
      db.exec('ALTER TABLE diagnostics ADD COLUMN report TEXT');
    } catch (e) {
      // 列已存在
    }
    db.exec(
      'CREATE TABLE IF NOT EXISTS plans (' +
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      '  user_id TEXT NOT NULL,' +
      '  status TEXT NOT NULL DEFAULT \'active\',' + // active | done
      '  lessons TEXT NOT NULL,' + // JSON [{index,knowledge,lesson_type}]
      '  diagnosis_id INTEGER,' +
      '  result TEXT,' +           // 结课验收快照 JSON {before,after,report,...}
      '  created_at TEXT NOT NULL' +
      ')'
    );
    db.exec(
      'CREATE TABLE IF NOT EXISTS lesson_progress (' +
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      '  plan_id INTEGER NOT NULL,' +
      '  user_id TEXT NOT NULL,' +
      '  lesson_index INTEGER NOT NULL,' +
      '  knowledge TEXT NOT NULL,' +
      '  lesson_type TEXT NOT NULL,' + // concept | compute
      '  status TEXT NOT NULL DEFAULT \'locked\',' + // locked | active | done
      '  correct INTEGER NOT NULL DEFAULT 0,' +
      '  attempts INTEGER NOT NULL DEFAULT 0,' +
      '  score REAL NOT NULL DEFAULT 0,' +
      '  content TEXT,' +   // 课内容缓存（例题+巩固题+小测题含答案）
      '  started_at TEXT,' +
      '  finished_at TEXT' +
      ')'
    );
    db.exec('CREATE INDEX IF NOT EXISTS idx_diag_user ON diagnostics(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_lp_plan ON lesson_progress(plan_id)');
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
function getMastery(userId) {  if (!db) return [];
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

// ---------------- 账号（users / child_profiles） ----------------

function createUser(phone, passwordHash) {
  if (!db) return null;
  try {
    const r = db.prepare('INSERT INTO users (phone, password_hash, created_at) VALUES (?, ?, ?)')
      .run(phone, passwordHash, new Date().toISOString());
    return Number(r.lastInsertRowid);
  } catch (e) {
    return null; // 手机号重复
  }
}

function getUserByPhone(phone) {
  if (!db) return null;
  const r = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  return r || null;
}

function getUserById(id) {
  if (!db) return null;
  const r = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return r || null;
}

function deleteUserByPhone(phone) {
  if (!db) return;
  try { db.prepare('DELETE FROM users WHERE phone = ?').run(phone); } catch (e) {}
}

// 新增孩子档案；code 重复返回 false
function addChildProfile(userId, name, code) {
  if (!db) return false;
  try {
    db.prepare('INSERT INTO child_profiles (user_id, name, code, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, name, code, new Date().toISOString());
    return true;
  } catch (e) {
    return false;
  }
}

function listChildren(userId) {
  if (!db) return [];
  const rows = db.prepare('SELECT id, name, code, created_at FROM child_profiles WHERE user_id = ? ORDER BY id').all(userId);
  return rows || [];
}

function findChildByCode(code) {
  if (!db) return null;
  const r = db.prepare('SELECT * FROM child_profiles WHERE code = ?').get(code);
  return r || null;
}

function childCountByUser(userId) {
  if (!db) return 0;
  const r = db.prepare('SELECT COUNT(*) AS c FROM child_profiles WHERE user_id = ?').get(userId);
  return r ? r.c : 0;
}

// ---------------- 训练营：诊断 / 计划 / 课时 ----------------

function createDiagnostic(userId) {
  if (!db) return null;
  try {
    const r = db.prepare("INSERT INTO diagnostics (user_id, status, created_at) VALUES (?, 'active', ?)")
      .run(userId, new Date().toISOString());
    return Number(r.lastInsertRowid);
  } catch (e) {
    return null;
  }
}

function getDiagnostic(id, userId) {
  if (!db) return null;
  try {
    const r = db.prepare('SELECT * FROM diagnostics WHERE id = ? AND user_id = ?').get(id, userId);
    return r || null;
  } catch (e) {
    return null;
  }
}

// 最近一次未完成的诊断（断点续测）
function getLatestActiveDiagnostic(userId) {
  if (!db) return null;
  try {
    const r = db.prepare("SELECT * FROM diagnostics WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(userId);
    return r || null;
  } catch (e) {
    return null;
  }
}

// 最近一次已完成的诊断（排课/家长报告用）
function getLatestDiagnostic(userId) {
  if (!db) return null;
  try {
    const r = db.prepare("SELECT * FROM diagnostics WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId);
    return r || null;
  } catch (e) {
    return null;
  }
}

function saveDiagnostic(id, userId, status, score, detail, report) {
  if (!db) return false;
  try {
    db.prepare('UPDATE diagnostics SET status = ?, score = ?, detail = ?, report = ? WHERE id = ? AND user_id = ?')
      .run(
        status,
        score === undefined ? null : score,
        detail === undefined ? null : detail,
        report === undefined ? null : report,
        id,
        userId
      );
    return true;
  } catch (e) {
    return false;
  }
}

function createPlan(userId, lessonsJson, diagnosisId) {
  if (!db) return null;
  try {
    // 同一孩子只保留一个进行中的计划：旧的置为 done
    db.prepare("UPDATE plans SET status = 'done' WHERE user_id = ? AND status = 'active'").run(userId);
    const r = db.prepare("INSERT INTO plans (user_id, status, lessons, diagnosis_id, created_at) VALUES (?, 'active', ?, ?, ?)")
      .run(userId, lessonsJson, diagnosisId || null, new Date().toISOString());
    return Number(r.lastInsertRowid);
  } catch (e) {
    return null;
  }
}

function getActivePlan(userId) {
  if (!db) return null;
  try {
    const r = db.prepare("SELECT * FROM plans WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(userId);
    return r || null;
  } catch (e) {
    return null;
  }
}

// 最近一个计划（含已结课归档的，家长端查看结课报告用）
function getLatestPlan(userId) {
  if (!db) return null;
  try {
    const r = db.prepare('SELECT * FROM plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
    return r || null;
  } catch (e) {
    return null;
  }
}

function getPlanById(id) {
  if (!db) return null;
  try {
    const r = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    return r || null;
  } catch (e) {
    return null;
  }
}

function savePlan(id, fields) {
  if (!db || !fields) return false;
  try {
    const keys = Object.keys(fields).filter(function (k) { return ['status', 'result'].indexOf(k) > -1; });
    if (!keys.length) return false;
    const sets = keys.map(function (k) { return k + ' = ?'; }).join(', ');
    const vals = keys.map(function (k) { return fields[k]; }).concat([id]);
    const stmt = db.prepare('UPDATE plans SET ' + sets + ' WHERE id = ?');
    stmt.run(...vals);
    return true;
  } catch (e) {
    return false;
  }
}

function upsertLesson(planId, userId, index, knowledge, lessonType, status) {
  if (!db) return false;
  try {
    db.prepare(
      'INSERT INTO lesson_progress (plan_id, user_id, lesson_index, knowledge, lesson_type, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(planId, userId, index, knowledge, lessonType, status);
    return true;
  } catch (e) {
    return false;
  }
}

function getLesson(planId, index) {
  if (!db) return null;
  try {
    const r = db.prepare('SELECT * FROM lesson_progress WHERE plan_id = ? AND lesson_index = ?').get(planId, index);
    return r || null;
  } catch (e) {
    return null;
  }
}

function listLessons(planId) {
  if (!db) return [];
  try {
    return db.prepare('SELECT * FROM lesson_progress WHERE plan_id = ? ORDER BY lesson_index').all(planId) || [];
  } catch (e) {
    return [];
  }
}

function updateLesson(planId, index, fields) {
  if (!db || !fields) return false;
  try {
    const keys = Object.keys(fields).filter(function (k) {
      return ['status', 'correct', 'attempts', 'score', 'content', 'started_at', 'finished_at'].indexOf(k) > -1;
    });
    if (!keys.length) return false;
    const sets = keys.map(function (k) { return k + ' = ?'; }).join(', ');
    const vals = keys.map(function (k) { return fields[k]; }).concat([planId, index]);
    const stmt = db.prepare('UPDATE lesson_progress SET ' + sets + ' WHERE plan_id = ? AND lesson_index = ?');
    stmt.run(...vals);
    return true;
  } catch (e) {
    return false;
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
  createUser: createUser,
  getUserByPhone: getUserByPhone,
  getUserById: getUserById,
  deleteUserByPhone: deleteUserByPhone,
  addChildProfile: addChildProfile,
  listChildren: listChildren,
  findChildByCode: findChildByCode,
  childCountByUser: childCountByUser,
  createDiagnostic: createDiagnostic,
  getDiagnostic: getDiagnostic,
  getLatestActiveDiagnostic: getLatestActiveDiagnostic,
  getLatestDiagnostic: getLatestDiagnostic,
  saveDiagnostic: saveDiagnostic,
  createPlan: createPlan,
  getActivePlan: getActivePlan,
  getLatestPlan: getLatestPlan,
  getPlanById: getPlanById,
  savePlan: savePlan,
  upsertLesson: upsertLesson,
  getLesson: getLesson,
  listLessons: listLessons,
  updateLesson: updateLesson,
  EVENT_TYPES: EVENT_TYPES
};
