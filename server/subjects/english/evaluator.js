// server/subjects/english/evaluator.js — 英语判分器
// 原则：拼写判分给提示不给答案；跟读 MVP 不评分只鼓励；发音评测走外部服务（SPEECH_* 配置），不用 DeepSeek。

'use strict';

const DIMENSIONS = ['listen', 'speak', 'read', 'write'];

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z']/g, '');
}

// 拼写判分：全对 / 大小写与空格宽松；错误给渐进提示（不直接给答案）
// 返回 { correct, hint, level }；level: ok | close(差1字符) | hint(首字母+长度) | miss
function spellCheck(target, answer) {
  const t = norm(target);
  const a = norm(answer);
  if (!t) return { correct: false, hint: '', level: 'miss' };
  if (a === t) return { correct: true, hint: '', level: 'ok' };
  // 差一个字符（漏/多/错位一个字母）
  if (Math.abs(t.length - a.length) <= 1 && isOneEditAway(t, a)) {
    const tip = t.length > a.length ? '少了一个字母哦' : '多了一个字母哦';
    return { correct: false, hint: tip + '，再想想：第一个字母是 ' + t[0].toUpperCase(), level: 'close' };
  }
  return {
    correct: false,
    hint: '提示：共 ' + t.length + ' 个字母，第一个字母是 ' + t[0].toUpperCase() + '，再听一次读音慢慢拼',
    level: 'hint'
  };
}

function isOneEditAway(t, a) {
  if (t === a) return true;
  // 替换一个字符
  if (t.length === a.length) {
    let diff = 0;
    for (let i = 0; i < t.length; i++) if (t[i] !== a[i]) diff++;
    return diff === 1;
  }
  // 插入/删除一个字符：短串跳过一位后与长串对齐
  const short = t.length < a.length ? t : a;
  const long = t.length < a.length ? a : t;
  if (long.length - short.length !== 1) return false;
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}

// 跟读文本判分（语音识别结果与目标词对比）：MVP 只鼓励不评分
// 返回 { match: 'exact'|'close'|'diff', line: 鼓励语（≤20字，不评判发音） }
function repeatTextCheck(target, heard) {
  const t = norm(target);
  const h = norm(heard);
  if (!h) {
    return { match: 'diff', line: '再听一次，我们慢慢来 🌱' };
  }
  if (h === t) return { match: 'exact', line: '说得真棒！✨' };
  if (isOneEditAway(t, h) || (t.length > 3 && h.indexOf(t) > -1)) {
    return { match: 'close', line: '很接近啦，再试一次 💪' };
  }
  return { match: 'diff', line: '再听一次，我们慢慢来 🌱' };
}

module.exports = {
  AVAILABLE: true,
  DIMENSIONS: DIMENSIONS,
  spellCheck: spellCheck,
  repeatTextCheck: repeatTextCheck,
  _isOneEditAway: isOneEditAway
};
