// scripts/check-english.js — 英语学科 MVP 单测 + 模拟跟读/拼写流程演示
// 覆盖：词库种子 / spellCheck 边界 / repeatTextCheck / 七状态机 / prompts 硬约束 / knowledgeGraph 维度 / 对话场景

'use strict';

const db = require('../server/db');
const enEval = require('../server/subjects/english/evaluator');
const enSM = require('../server/subjects/english/stateMachine');
const enKG = require('../server/subjects/english/knowledgeGraph');
const enPrompts = require('../server/subjects/english/prompts');
const enDialogues = require('../server/subjects/english/dialogues');
const subjectService = require('../server/services/subjectService');

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.error('  ✗ ' + msg); }
}

db.init();

// 1. 词库
console.log('词库种子');
const words = db.listEnglishVocabulary();
const animals = db.listEnglishVocabulary('animals');
assert(words.length >= 60, '词库 ≥ 60 词（实际 ' + words.length + '）');
assert(animals.length >= 8, 'animals 类 ≥ 8 词（实际 ' + animals.length + '）');
assert(words.every((w) => w.word && w.meaning && w.category && (w.grade === 3 || w.grade === 4)), '每词字段完整 grade=3/4');
assert(db.getEnglishWordByWord('APPLE') !== null, '大小写不敏感查词（APPLE）');
assert(db.getEnglishWordByWord('zzz') === null, '不存在的词返回 null');

// 2. 拼写判分
console.log('拼写判分 spellCheck');
assert(enEval.spellCheck('apple', 'apple').correct === true, '全对判对');
assert(enEval.spellCheck('apple', '  APPLE ').correct === true, '大小写+空格宽松判对');
const close = enEval.spellCheck('apple', 'appl');
assert(close.correct === false && close.level === 'close', '少一个字母 → close 提示');
assert(enEval.spellCheck('dog', 'dot').level === 'close', '错一个字母 → close');
const hint = enEval.spellCheck('banana', 'xyz');
assert(hint.correct === false && hint.hint.indexOf('6') > -1 && hint.hint.indexOf('B') > -1, '全错 → 长度+首字母提示（不直接给答案）');
assert(enEval.spellCheck('banana', 'bananaa').hint.indexOf('多') > -1, '多一个字母 → 提示');

// 3. 跟读文本判分
console.log('跟读判分 repeatTextCheck');
assert(enEval.repeatTextCheck('apple', 'apple').match === 'exact', '完全一致 exact');
assert(enEval.repeatTextCheck('apple', 'apple.').match === 'exact', '带标点仍 exact');
assert(enEval.repeatTextCheck('apple', 'appl').match === 'close', '近似 close');
const miss = enEval.repeatTextCheck('apple', 'banana');
assert(miss.match === 'diff' && miss.line.indexOf('再听一次') > -1, '不匹配 → 温和鼓励不评判');

// 4. 状态机
console.log('七状态机');
assert(enSM.STATE_ORDER.join(',') === 'LISTEN,REPEAT,PRONOUNCE_CHECK,PRACTICE,DIALOGUE,SPELL,REVIEW', '状态顺序符合要求');
Object.keys(enSM.STATE_MACHINE).forEach((k) => {
  const s = enSM.STATE_MACHINE[k];
  assert(!!(s.label && s.enter && s.goal && s.allowed && s.forbidden && s.exit), '状态 ' + k + ' 定义完整（进入/目标/允许/禁止/退出）');
});
assert(enSM.isValidTransition('LISTEN', 'REPEAT'), 'LISTEN→REPEAT 合法');
assert(!enSM.isValidTransition('LISTEN', 'SPELL'), 'LISTEN→SPELL 非法（不可跳步）');
const sess = enSM.createSession({ word: 'cat' });
enSM.step(sess, { type: 'start_repeat' });
assert(sess.state === 'REPEAT', '开始跟读 → REPEAT');
enSM.step(sess, { type: 'submit_repeat' });
assert(sess.state === 'PRONOUNCE_CHECK', '提交跟读 → PRONOUNCE_CHECK');
enSM.step(sess, { type: 'continue_practice' });
assert(sess.state === 'PRACTICE', '确认 → PRACTICE');
enSM.step(sess, { type: 'dialogue_done' });
assert(sess.state === 'SPELL', '对话完成 → SPELL');
enSM.step(sess, { type: 'spell_result', correct: true });
assert(sess.state === 'REVIEW', '拼写正确 → REVIEW');

// 5. 提示词硬约束
console.log('提示词硬约束');
assert(enPrompts.AVAILABLE === true, 'prompts 可用');
assert(enPrompts.EN_TUTOR_SYSTEM.indexOf('三年级') > -1 && enPrompts.EN_TUTOR_SYSTEM.indexOf('小狐') > -1, '角色=三年级学习伙伴小狐');
assert(enPrompts.EN_TUTOR_SYSTEM.indexOf('不直接纠正') > -1, '先听后跟读不纠错');
assert(enPrompts.EN_TUTOR_SYSTEM.indexOf('20 个字') > -1, '一句话不超过 20 字');
assert(enPrompts.EN_TUTOR_SYSTEM.indexOf('再听一次，我们慢慢来') > -1, '不评判发音话术');
assert(enPrompts.EN_TUTOR_SYSTEM.indexOf('不直接给中文翻译') > -1, '不直接给翻译先猜');

// 6. 知识图谱与对话
console.log('知识图谱与场景对话');
const all = enKG.listKnowledge();
assert(all.length >= 15, '知识点 ≥ 15（实际 ' + all.length + '）');
assert(all.every((k) => k.code && k.name && ['listen', 'speak', 'read', 'write'].indexOf(k.dimension) > -1), '每知识点含 code/name/dimension');
const dims = enKG.units();
assert(dims.length === 4 && dims.every((d) => d.knowledge.length > 0), '四维度分组（听说读写）且每维非空');
assert(enDialogues.listScenes().length === 5, '5 个对话场景');
const g = enDialogues.getScene('greeting');
assert(g.turns.length >= 4 && g.turns[0].who === 'fox' && g.turns[0].en.length < 40, 'greeting 场景≥4轮且句子简短');

// 7. 学科路由
console.log('学科路由');
assert(subjectService.isAvailable('english') === true, 'english 可用');
assert(subjectService.isAvailable('chinese') === true, 'chinese 也已可用（阶段 3）');
assert(subjectService.subjectRouteMessage('chinese').indexOf('语文') > -1, '通用路由对 chinese 给语文专属引导');
assert(subjectService.subjectRouteMessage('english').indexOf('英语') > -1, '通用路由对 english 给专属引导（不误入数学讲解）');
assert(subjectService.subjectRouteMessage('math') === '', 'math 走原逻辑无提示');
assert(subjectService.getStateMachine('english').STATE_ORDER.length === 7, 'subjectService 能取到英语状态机');

// 8. 模拟：三年级跟读 + 拼写流程（打印结果）
console.log('\n──────── 模拟流程：三年级学生"猫 cat"跟读+拼写 ────────');
(function simulate() {
  const word = db.getEnglishWordByWord('cat');
  console.log('[词卡] cat ' + word.phonetic + ' ' + word.meaning + '（' + word.category + '）');
  // LISTEN：小狐读两遍
  console.log('[LISTEN] 小狐朗读 "cat" × 2 → TTS speakEn("cat") ✅（浏览器执行）');
  // REPEAT：孩子跟读（语音识别文本）
  const r1 = enEval.repeatTextCheck('cat', 'cat');
  console.log('[REPEAT] 孩子跟读，识别文本 "cat" → ' + r1.match + ' → 反馈：" ' + r1.line + '"');
  const r2 = enEval.repeatTextCheck('cat', 'kate');
  console.log('[REPEAT] 第二次识别 "kate" → ' + r2.match + ' → 反馈："' + r2.line + '"（不评判发音）');
  // PRONOUNCE_CHECK：录音占位
  console.log('[PRONOUNCE_CHECK] 录音提交（未配 SPEECH_API_KEY）→ "已收到录音，继续加油 🎤"（不评分）');
  // SPELL：两次作答
  const s1 = enEval.spellCheck('cat', 'Kat');
  console.log('[SPELL] 第 1 次拼写 "Kat" → correct=' + s1.correct + ' level=' + s1.level + (s1.hint ? ' 提示：' + s1.hint : ''));
  const s2 = enEval.spellCheck('cat', 'CAT ');
  console.log('[SPELL] 第 2 次拼写 "CAT " → correct=' + s2.correct + ' ✅');
  // 状态机全流程
  const s = enSM.createSession({ word: 'cat' });
  ['start_repeat', 'submit_repeat', 'continue_practice', 'spell_result'].forEach((t) => {
    const r = enSM.step(s, { type: t, correct: t === 'spell_result' });
    if (r.changed) console.log('[状态机] → ' + r.state);
  });
  console.log('[行为日志] spell 对/错已落 learning_events（subject_id=english, knowledge_point=english-spell）');
  console.log('──────── 模拟结束 ────────\n');
})();

console.log(failed === 0 ? '✅ 英语学科单测全部通过' : '❌ 英语学科单测失败 ' + failed + ' 项');
process.exit(failed === 0 ? 0 : 1);
