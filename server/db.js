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
    // 兼容旧库：补充学科列（阶段1 起全部事件归属学科，默认 math）
    try {
      db.exec("ALTER TABLE learning_events ADD COLUMN subject_id TEXT DEFAULT 'math'");
    } catch (e) {
      // 列已存在
    }
    // 学科表（多学科架构）
    db.exec(
      'CREATE TABLE IF NOT EXISTS subjects (' +
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      '  code TEXT NOT NULL UNIQUE,' +
      '  name TEXT NOT NULL,' +
      '  sort_order INTEGER NOT NULL DEFAULT 0' +
      ')'
    );
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
    // 兼容旧库：训练营两表补学科列
    try {
      db.exec("ALTER TABLE plans ADD COLUMN subject_id TEXT DEFAULT 'math'");
    } catch (e) {}
    try {
      db.exec("ALTER TABLE lesson_progress ADD COLUMN subject_id TEXT DEFAULT 'math'");
    } catch (e) {}
    // 学科种子（已存在则跳过）
    const seedSubjects = [
      ['math', '数学', 1],
      ['english', '英语', 2],
      ['chinese', '语文', 3]
    ];
    seedSubjects.forEach((s) => {
      try {
        db.prepare('INSERT OR IGNORE INTO subjects (code, name, sort_order) VALUES (?, ?, ?)').run(s[0], s[1], s[2]);
      } catch (e) {
        // 种子失败不阻塞启动
      }
    });
    // 英语词汇表（阶段 2）
    db.exec(
      'CREATE TABLE IF NOT EXISTS english_vocabulary (' +
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      '  word TEXT NOT NULL UNIQUE,' +
      '  meaning TEXT NOT NULL,' +
      '  phonetic TEXT,' +
      '  category TEXT NOT NULL,' +
      '  grade INTEGER NOT NULL DEFAULT 3,' +
      '  audio_url TEXT' +
      ')'
    );
    db.exec('CREATE INDEX IF NOT EXISTS idx_envocab_category ON english_vocabulary(category)');
    try {
      const seed = require('./subjects/english/vocabulary-seed');
      const ins = db.prepare('INSERT OR IGNORE INTO english_vocabulary (word, meaning, phonetic, category, grade, audio_url) VALUES (?, ?, ?, ?, ?, ?)');
      seed.forEach((w) => {
        try { ins.run(w.word, w.meaning, w.phonetic, w.category, w.grade || 3, w.audio_url || ''); } catch (e) {}
      });
    } catch (e) {
      // 词库种子加载失败不阻塞启动
    }
    // 语文生字表（阶段 3）
    db.exec(
      'CREATE TABLE IF NOT EXISTS chinese_characters (' +
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      '  char TEXT NOT NULL UNIQUE,' +
      '  pinyin TEXT NOT NULL,' +
      '  strokes INTEGER,' +
      '  radicals TEXT,' +
      '  words TEXT,' +
      '  grade INTEGER NOT NULL DEFAULT 3,' +
      '  audio_url TEXT' +
      ')'
    );
    try {
      const cseed = require('./subjects/chinese/characters-seed');
      const cins = db.prepare('INSERT OR IGNORE INTO chinese_characters (char, pinyin, strokes, radicals, words, grade, audio_url) VALUES (?, ?, ?, ?, ?, ?, ?)');
      cseed.forEach((c) => {
        try { cins.run(c.char, c.pinyin, c.strokes, c.radicals, c.words, c.grade || 3, c.audio_url || ''); } catch (e) {}
      });
    } catch (e) {
      // 生字种子加载失败不阻塞启动
    }
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
      'INSERT INTO learning_events (user_id, session_id, event_type, question_id, knowledge_point, error_type, duration_ms, created_at, subject_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      ev.userId || null,
      ev.sessionId || null,
      type,
      ev.questionId || null,
      ev.knowledgePoint || null,
      ev.errorType || null,
      ev.durationMs || 0,
      new Date().toISOString(),
      ev.subjectId || 'math'
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

// 做错后继续尝试比例：after_wrong_retry / answer_wrong（subjectId 可选按学科过滤）
function getRetryRate(userId, subjectId) {
  let totalWrong = countBy(userId, 'answer_wrong');
  let retryAfterWrong = countBy(userId, 'after_wrong_retry');
  if (subjectId && db) {
    const w = db.prepare("SELECT COUNT(*) AS c FROM learning_events WHERE event_type = 'answer_wrong' AND user_id = ? AND subject_id = ?").get(userId, subjectId);
    const r = db.prepare("SELECT COUNT(*) AS c FROM learning_events WHERE event_type = 'after_wrong_retry' AND user_id = ? AND subject_id = ?").get(userId, subjectId);
    totalWrong = w ? w.c : 0;
    retryAfterWrong = r ? r.c : 0;
  }
  return {
    totalWrong: totalWrong,
    retryAfterWrong: retryAfterWrong,
    retryRate: totalWrong ? Math.round((retryAfterWrong / totalWrong) * 10000) / 10000 : 0
  };
}

// ---------------- 学科（subjects） ----------------

function listSubjects() {
  if (!db) return [];
  try {
    return db.prepare('SELECT id, code, name, sort_order FROM subjects ORDER BY sort_order').all() || [];
  } catch (e) {
    return [];
  }
}

function getSubjectByCode(code) {
  if (!db) return null;
  try {
    return db.prepare('SELECT id, code, name, sort_order FROM subjects WHERE code = ?').get(code) || null;
  } catch (e) {
    return null;
  }
}

// ---------------- 英语词汇（english_vocabulary） ----------------

function listEnglishVocabulary(category) {
  if (!db) return [];
  try {
    const rows = category
      ? db.prepare('SELECT word, meaning, phonetic, category, grade, audio_url FROM english_vocabulary WHERE category = ? ORDER BY id').all(category)
      : db.prepare('SELECT word, meaning, phonetic, category, grade, audio_url FROM english_vocabulary ORDER BY category, id').all();
    return rows || [];
  } catch (e) {
    return [];
  }
}

function getEnglishWordByWord(word) {
  if (!db) return null;
  try {
    return db.prepare('SELECT word, meaning, phonetic, category, grade, audio_url FROM english_vocabulary WHERE word = ? COLLATE NOCASE').get(String(word || '').trim()) || null;
  } catch (e) {
    return null;
  }
}

// ---------------- 语文生字（chinese_characters） ----------------

function listChineseCharacters(grade) {
  if (!db) return [];
  try {
    const rows = grade
      ? db.prepare('SELECT char, pinyin, strokes, radicals, words, grade, audio_url FROM chinese_characters WHERE grade = ? ORDER BY id').all(Number(grade))
      : db.prepare('SELECT char, pinyin, strokes, radicals, words, grade, audio_url FROM chinese_characters ORDER BY id').all();
    return rows || [];
  } catch (e) {
    return [];
  }
}

function getChineseCharByChar(ch) {
  if (!db) return null;
  try {
    return db.prepare('SELECT char, pinyin, strokes, radicals, words, grade, audio_url FROM chinese_characters WHERE char = ?').get(String(ch || '').trim()) || null;
  } catch (e) {
    return null;
  }
}

// 某用户当天（本地时区零点起）的行为事件，按时间升序
function getTodayEvents(userId) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return getEventsSince(userId, d.toISOString());
}

// 某用户自某个时间点以来的行为事件（subjectId 可选：按学科过滤，默认不过滤=全学科）
function getEventsSince(userId, sinceIso, subjectId) {
  if (!db) return [];
  try {
    let sql = 'SELECT event_type, session_id, question_id, knowledge_point, error_type, duration_ms, created_at, subject_id ' +
      'FROM learning_events WHERE user_id = ? AND created_at >= ?';
    const args = [userId, sinceIso];
    if (subjectId) {
      sql += ' AND subject_id = ?';
      args.push(subjectId);
    }
    sql += ' ORDER BY id';
    const rows = db.prepare(sql).all(...args);
    return rows || [];
  } catch (e) {
    return [];
  }
}

// ---------------- 掌握度计算 ----------------
// 纯函数（便于单测）：指数时间衰减（半衰期 7 天，近期表现权重高）+ 拉普拉斯平滑
// 输出按分数升序（薄弱在前）：[{ knowledge_point, score(0-100), attempts, lastAt }]
// nowMs：衰减基准时间（成长曲线按历史日期重放时传当天，默认当前时间）
function computeMastery(events, nowMs) {
  const now = nowMs || Date.now();
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

// 某用户各知识点掌握度（薄弱在前）；subjectId 可选按学科过滤（默认全部，数学行为不变）
function getMastery(userId, subjectId) {  if (!db) return [];
  try {
    let sql = "SELECT event_type, knowledge_point, created_at FROM learning_events " +
      "WHERE user_id = ? AND event_type IN ('answer_correct','answer_wrong','deformation_correct')";
    const args = [userId];
    if (subjectId) {
      sql += ' AND subject_id = ?';
      args.push(subjectId);
    }
    const rows = db.prepare(sql).all(...args);
    return computeMastery(rows || []);
  } catch (e) {
    return [];
  }
}

// 掌握度成长趋势：按天重放 computeMastery，得到每天"当时"的整体均分
// 返回 [{date:'MM-DD', avg(0-100|null), count(当日有效知识点数)}]，长度 = days（旧数据不足的天 avg 为 null）
function getMasteryTrend(userId, days, subjectId) {
  if (!db) return [];
  const n = Math.max(2, Math.min(60, days || 14));
  try {
    const pad = (x) => (x < 10 ? '0' : '') + x;
    const start = new Date(Date.now() - (n - 1) * 86400000);
    start.setHours(0, 0, 0, 0);
    let sql = "SELECT event_type, knowledge_point, created_at FROM learning_events " +
      "WHERE user_id = ? AND event_type IN ('answer_correct','answer_wrong','deformation_correct') " +
      "AND created_at >= ?";
    const args = [userId, start.toISOString()];
    if (subjectId) {
      sql += ' AND subject_id = ?';
      args.push(subjectId);
    }
    sql += ' ORDER BY created_at';
    const rows = db.prepare(sql).all(...args) || [];
    const out = [];
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const dayStart = new Date(start.getTime() + i * 86400000);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      while (idx < rows.length && new Date(rows[idx].created_at) < dayEnd) idx++;
      const m = idx > 0 ? computeMastery(rows.slice(0, idx), dayEnd.getTime()) : [];
      const avg = m.length ? Math.round(m.reduce((s, x) => s + x.score, 0) / m.length) : null;
      out.push({
        date: pad(dayStart.getMonth() + 1) + '-' + pad(dayStart.getDate()),
        avg: avg,
        count: m.length
      });
    }
    return out;
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

function createPlan(userId, lessonsJson, diagnosisId, subjectId) {
  if (!db) return null;
  try {
    // 同一孩子同一学科只保留一个进行中的计划：旧的置为 done
    db.prepare("UPDATE plans SET status = 'done' WHERE user_id = ? AND subject_id = ? AND status = 'active'").run(userId, subjectId || 'math');
    const r = db.prepare("INSERT INTO plans (user_id, status, lessons, diagnosis_id, subject_id, created_at) VALUES (?, 'active', ?, ?, ?, ?)")
      .run(userId, lessonsJson, diagnosisId || null, subjectId || 'math', new Date().toISOString());
    return Number(r.lastInsertRowid);
  } catch (e) {
    return null;
  }
}

function getActivePlan(userId, subjectId) {
  if (!db) return null;
  try {
    const r = subjectId
      ? db.prepare("SELECT * FROM plans WHERE user_id = ? AND subject_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(userId, subjectId)
      : db.prepare("SELECT * FROM plans WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(userId);
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

function upsertLesson(planId, userId, index, knowledge, lessonType, status, subjectId) {
  if (!db) return false;
  try {
    db.prepare(
      'INSERT INTO lesson_progress (plan_id, user_id, lesson_index, knowledge, lesson_type, status, subject_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(planId, userId, index, knowledge, lessonType, status, subjectId || 'math');
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
  getMasteryTrend: getMasteryTrend,
  computeMastery: computeMastery,
  listSubjects: listSubjects,
  getSubjectByCode: getSubjectByCode,
  listEnglishVocabulary: listEnglishVocabulary,
  getEnglishWordByWord: getEnglishWordByWord,
  listChineseCharacters: listChineseCharacters,
  getChineseCharByChar: getChineseCharByChar,
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
