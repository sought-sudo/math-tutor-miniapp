// 本地数据层：错题本 + 练习记录（数据只保存在本机，不上传）

const KEY_WRONG = 'math_tutor_wrong_book_v1';
const KEY_RECORDS = 'math_tutor_records_v1';

function get(key, def) {
  try {
    const v = wx.getStorageSync(key);
    return v || def;
  } catch (e) {
    return def;
  }
}

function set(key, val) {
  try {
    wx.setStorageSync(key, val);
  } catch (e) {
    // 存储失败时静默忽略
  }
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function dateStr(ts) {
  const d = new Date(ts || Date.now());
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// ---------------- 错题本 ----------------

function getWrongBook() {
  return get(KEY_WRONG, []);
}

function saveWrongBook(list) {
  set(KEY_WRONG, list.slice(0, 100));
}

// 新增错题：同一道题（题目文字相同）自动合并，次数 +1
function addWrongBook(item) {
  const list = getWrongBook();
  const exist = list.find((i) => i.status === 'active' && i.problem === item.problem);
  let added = false;
  if (exist) {
    exist.times = (exist.times || 1) + 1;
    exist.myAnswer = item.myAnswer;
    exist.lastAt = dateStr();
    exist.steps = item.steps || exist.steps || [];
    exist.rightNum = item.rightNum !== undefined ? item.rightNum : exist.rightNum;
  } else {
    list.unshift({
      id: 'w' + Date.now() + Math.floor(Math.random() * 1000),
      problem: item.problem,
      myAnswer: item.myAnswer || '',
      rightAnswer: item.rightAnswer || '',
      rightNum: item.rightNum !== undefined ? item.rightNum : null,
      steps: item.steps || [],
      knowledge: item.knowledge || '综合',
      times: 1,
      createdAt: dateStr(),
      lastAt: dateStr(),
      status: 'active'
    });
    added = true;
  }
  saveWrongBook(list);
  return added;
}

function bumpWrong(id) {
  const list = getWrongBook();
  const it = list.find((i) => i.id === id);
  if (it) {
    it.times = (it.times || 1) + 1;
    it.lastAt = dateStr();
    saveWrongBook(list);
  }
}

function markMastered(id) {
  const list = getWrongBook();
  const it = list.find((i) => i.id === id);
  if (it) {
    it.status = 'mastered';
    it.masteredAt = dateStr();
    saveWrongBook(list);
  }
}

function removeWrong(id) {
  saveWrongBook(getWrongBook().filter((i) => i.id !== id));
}

function clearMastered() {
  saveWrongBook(getWrongBook().filter((i) => i.status !== 'mastered'));
}

function getWrongById(id) {
  return getWrongBook().find((i) => i.id === id) || null;
}

// ---------------- 练习记录 ----------------

function addRecord(rec) {
  const list = get(KEY_RECORDS, []);
  list.unshift({
    ts: Date.now(),
    date: dateStr(),
    ok: rec.ok, // true / false
    seconds: rec.seconds || 0,
    knowledge: rec.knowledge || '',
    mode: rec.mode || 'practice'
  });
  set(KEY_RECORDS, list.slice(0, 200));
}

// ---------------- 统计（家长报告用） ----------------

function getStats() {
  const records = get(KEY_RECORDS, []);
  const wrongs = getWrongBook();
  const today = dateStr();

  const judged = records.filter((r) => r.ok === true || r.ok === false);
  const correct = judged.filter((r) => r.ok === true).length;
  const total = judged.length;
  const accuracy = total ? correct / total : null;

  const todayCount = records.filter((r) => r.date === today).length;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekStartStr = dateStr(weekAgo.getTime());
  const weekCount = records.filter((r) => r.date >= weekStartStr).length;

  const timed = records.filter((r) => r.seconds > 0);
  const avgSeconds = timed.length
    ? Math.round(timed.reduce((s, r) => s + r.seconds, 0) / timed.length)
    : 0;

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = dateStr(d.getTime());
    last7.push({
      date: ds,
      label: ds.slice(5),
      count: records.filter((r) => r.date === ds).length
    });
  }

  const map = {};
  wrongs
    .filter((w) => w.status === 'active')
    .forEach((w) => {
      map[w.knowledge] = (map[w.knowledge] || 0) + 1;
    });
  const knowledge = Object.keys(map)
    .map((k) => ({ name: k, count: map[k] }))
    .sort((a, b) => b.count - a.count);

  const activeCount = wrongs.filter((w) => w.status === 'active').length;

  return {
    total: total,
    correct: correct,
    wrong: total - correct,
    accuracy: accuracy,
    today: todayCount,
    week: weekCount,
    avgSeconds: avgSeconds,
    last7: last7,
    knowledge: knowledge,
    activeCount: activeCount,
    masteredCount: wrongs.length - activeCount
  };
}

function resetAll() {
  try {
    wx.removeStorageSync(KEY_WRONG);
    wx.removeStorageSync(KEY_RECORDS);
  } catch (e) {
    // 忽略
  }
}

module.exports = {
  getWrongBook: getWrongBook,
  addWrongBook: addWrongBook,
  bumpWrong: bumpWrong,
  markMastered: markMastered,
  removeWrong: removeWrong,
  clearMastered: clearMastered,
  getWrongById: getWrongById,
  addRecord: addRecord,
  getStats: getStats,
  resetAll: resetAll
};
