// scripts/check-chinese.js — 语文学科 MVP 单测 + 模拟听写/阅读引导流程演示
// 覆盖：生字种子 / dictationCheck / readingGuide 永不含答案 / writingSuggestLocal / 七状态机 / prompts 硬约束 / 古诗 / 学科路由

'use strict';

const db = require('../server/db');
const cnEval = require('../server/subjects/chinese/evaluator');
const cnSM = require('../server/subjects/chinese/stateMachine');
const cnKG = require('../server/subjects/chinese/knowledgeGraph');
const cnPrompts = require('../server/subjects/chinese/prompts');
const cnPoems = require('../server/subjects/chinese/poems-seed');
const subjectService = require('../server/services/subjectService');

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.error('  ✗ ' + msg); }
}

db.init();

// 1. 生字种子
console.log('生字种子');
const chars = db.listChineseCharacters(3);
assert(chars.length >= 45, '生字 ≥ 45（实际 ' + chars.length + '）');
assert(chars.every((c) => c.char && c.pinyin && c.strokes > 0 && c.radicals && c.words), '每字字段完整（char/pinyin/strokes/radicals/words）');
assert(db.getChineseCharByChar('晨') !== null, '按字查（晨）');

// 2. 听写判分
console.log('听写判分 dictationCheck');
assert(cnEval.dictationCheck('晨', '晨').correct === true, '写对判对');
assert(cnEval.dictationCheck('晨', ' 晨 ').correct === true, '空格宽松判对');
const miss = cnEval.dictationCheck('晨', '尘');
assert(miss.correct === false && miss.feedback.indexOf('部首') > -1 && miss.feedback.indexOf('晨') < 0, '写错给部首提示且不直接给字');
const half = cnEval.dictationCheck('早晨', '早');
assert(half.level === 'close', '只写一半 → close 提示');

// 3. 阅读引导（核心硬约束：永不给标准答案）
console.log('阅读引导 readingGuide');
const g1 = cnEval.readingGuide('它叫来小伙伴一起抬');
assert(g1.hasAnswer === true && g1.guide.indexOf('哪句话') > -1, '有答案 → 追问"哪句话看出来的"');
const g2 = cnEval.readingGuide('');
assert(g2.hasAnswer === false && g2.guide.indexOf('读一读') > -1, '空答案 → 引导先读原文');
// 引导语里绝不出现"标准答案/正确答案是/中心思想是"
[g1, g2, cnEval.readingGuide('大家一起抬回来的')].forEach((g) => {
  assert(!/标准答案|正确答案是|中心思想是/.test(g.guide), '引导语不含标准答案字眼（' + g.guide + '）');
});

// 4. 写作建议（不打分，2~3 条，每条≤30字）
console.log('写作建议 writingSuggestLocal');
const w1 = cnEval.writingSuggestLocal('今天我和妈妈去公园放风筝。风筝飞得好高，我跑得满头大汗。妈妈夸我跑得快，我心里美滋滋的，希望下次还来放风筝。');
assert(w1.suggestions.length >= 2 && w1.suggestions.length <= 3, '建议 2~3 条（实际 ' + w1.suggestions.length + '）');
assert(w1.suggestions.every((s) => s.length <= 30), '每条 ≤30 字');
const w2 = cnEval.writingSuggestLocal('');
assert(w2.suggestions.length >= 2, '空作文也给出开始写的引导');
const allSuggestions = w1.suggestions.concat(w2.suggestions).join('');
assert(!/分数|打分|排名|写得不好/.test(allSuggestions), '建议不含评分/排名/负面判词');

// 5. 状态机
console.log('七状态机');
assert(cnSM.STATE_ORDER.join(',') === 'READ_ALOUD,WORD_PRACTICE,SENTENCE_PRACTICE,READING_GUIDE,EXPRESSION,WRITING_SUGGEST,REVIEW', '状态顺序符合要求');
Object.keys(cnSM.STATE_MACHINE).forEach((k) => {
  const s = cnSM.STATE_MACHINE[k];
  assert(!!(s.label && s.enter && s.goal && s.allowed && s.forbidden && s.exit), '状态 ' + k + ' 定义完整');
});
assert(cnSM.isValidTransition('READ_ALOUD', 'WORD_PRACTICE'), 'READ_ALOUD→WORD_PRACTICE 合法');
assert(!cnSM.isValidTransition('READ_ALOUD', 'REVIEW'), 'READ_ALOUD→REVIEW 非法（不可跳步）');
const sess = cnSM.createSession({ char: '晨' });
cnSM.step(sess, { type: 'start_word' });
cnSM.step(sess, { type: 'dictation_result', correct: true });
assert(sess.state === 'SENTENCE_PRACTICE', '听写完成 → SENTENCE_PRACTICE');
cnSM.step(sess, { type: 'start_reading' });
assert(sess.state === 'READING_GUIDE', '进入阅读引导 → READING_GUIDE');
cnSM.step(sess, { type: 'start_expression' });
assert(sess.state === 'EXPRESSION', '进入表达 → EXPRESSION');
cnSM.step(sess, { type: 'expression_done' });
assert(sess.state === 'WRITING_SUGGEST', '表达完成 → WRITING_SUGGEST');
cnSM.step(sess, { type: 'writing_done' });
assert(sess.state === 'REVIEW', '写作完成 → REVIEW');

// 6. 提示词硬约束
console.log('提示词硬约束');
assert(cnPrompts.AVAILABLE === true, 'prompts 可用');
assert(cnPrompts.CN_TUTOR_SYSTEM.indexOf('三年级') > -1 && cnPrompts.CN_TUTOR_SYSTEM.indexOf('小狐') > -1, '角色=三年级学习伙伴小狐');
assert(cnPrompts.CN_TUTOR_SYSTEM.indexOf('不直接说中心思想') > -1, '先朗读再理解不给中心思想');
assert(cnPrompts.CN_TUTOR_SYSTEM.indexOf('你从哪句话看出来的') > -1, '阅读先问"哪句话看出来的"');
assert(cnPrompts.CN_TUTOR_SYSTEM.indexOf('不打分') > -1 && cnPrompts.CN_TUTOR_SYSTEM.indexOf('写得不好') > -1, '作文不打分不说写得不好');
assert(cnPrompts.CN_TUTOR_SYSTEM.indexOf('25 个字') > -1, '一句话不超过 25 字');
assert(cnPrompts.CN_WRITING_SYSTEM.indexOf('不评分') > -1 && cnPrompts.CN_WRITING_SYSTEM.indexOf('2～3 条') > -1 && cnPrompts.CN_WRITING_SYSTEM.indexOf('30 字') > -1, '写作建议提示词符合第 7 条要求');

// 7. 知识图谱 / 古诗
console.log('知识图谱与古诗');
const all = cnKG.listKnowledge();
assert(all.length >= 15, '知识点 ≥ 15（实际 ' + all.length + '）');
assert(all.every((k) => k.code && k.name && ['word', 'sentence', 'reading', 'writing'].indexOf(k.dimension) > -1), '每知识点含 code/name/dimension');
const dims = cnKG.units();
assert(dims.length === 4 && dims.every((d) => d.knowledge.length > 0), '四维度（字词/句子/阅读/写作）每维非空');
const poems = cnPoems.listPoems(3);
assert(poems.length === 6, '古诗 6 首（实际 ' + poems.length + '）');
assert(poems.every((p) => p.title && p.dynasty && p.author && p.lines.length === 4 && p.lines.every((l) => l.length >= 7)), '每首四句且句子完整');

// 8. 学科路由
console.log('学科路由');
assert(subjectService.isAvailable('chinese') === true, 'chinese 可用');
assert(subjectService.isAvailable('math') && subjectService.isAvailable('english'), 'math/english 不受影响');
assert(subjectService.subjectRouteMessage('chinese').indexOf('语文') > -1, '通用路由对 chinese 给专属引导');
assert(subjectService.subjectRouteMessage('math') === '', 'math 走原逻辑无提示');

// 9. 模拟：字词听写 + 阅读引导流程（打印结果）
console.log('\n──────── 模拟流程：三年级学生"晨"字听写 + 阅读引导 ────────');
(function simulate() {
  const c = db.getChineseCharByChar('晨');
  console.log('[生字卡] 晨 ' + c.pinyin + '（' + c.strokes + ' 画，部首 ' + c.radicals + '，组词 ' + c.words + '）');
  console.log('[READ_ALOUD] 小狐示范朗读"晨"→ TTS speak ✅（浏览器执行）');
  // 听写两轮
  const d1 = cnEval.dictationCheck('晨', '尘');
  console.log('[听写 1] 孩子写"尘" → correct=' + d1.correct + ' → 反馈："' + d1.feedback + '"（不给字）');
  const d2 = cnEval.dictationCheck('晨', '晨');
  console.log('[听写 2] 孩子写"晨" → correct=' + d2.correct + ' → 反馈："' + d2.feedback + '"');
  // 状态机
  const s = cnSM.createSession({ char: '晨' });
  console.log('[状态机] 初始 → ' + s.state);
  cnSM.step(s, { type: 'start_word' });
  console.log('[状态机] → ' + s.state + '（听写）');
  cnSM.step(s, { type: 'dictation_result', correct: true });
  console.log('[状态机] → ' + s.state);
  cnSM.step(s, { type: 'start_reading' });
  console.log('[状态机] → ' + s.state + '（阅读引导）');
  cnSM.step(s, { type: 'start_expression' });
  console.log('[状态机] → ' + s.state);
  const r1 = cnEval.readingGuide('');
  console.log('[阅读引导] 孩子还没写 → "' + r1.guide + '"');
  const r2 = cnEval.readingGuide('大家一起抬');
  console.log('[阅读引导] 孩子写"大家一起抬" → "' + r2.guide + '"');
  // 写作建议
  const w = cnEval.writingSuggestLocal('今天我帮妈妈扫地。扫地很有意思。我扫得很干净。');
  console.log('[写作建议]（不打分）');
  w.suggestions.forEach((x, i) => console.log('  ' + (i + 1) + '. ' + x));
  console.log('──────── 模拟结束 ────────\n');
})();

console.log(failed === 0 ? '✅ 语文学科单测全部通过' : '❌ 语文学科单测失败 ' + failed + ' 项');
process.exit(failed === 0 ? 0 : 1);
