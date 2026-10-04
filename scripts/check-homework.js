// scripts/check-homework.js — 拍照批改作业单测（判分解析/校验三态/坏输出兜底）+ 教材目录断言

'use strict';

const grader = require('../server/subjects/math/homeworkGrader');
const enCur = require('../server/subjects/english/curriculum');
const cnCur = require('../server/subjects/chinese/curriculum');
const enKG = require('../server/subjects/english/knowledgeGraph');
const cnKG = require('../server/subjects/chinese/knowledgeGraph');
const enSeedG4 = require('../server/subjects/english/vocabulary-seed-g4');
const cnChars = require('../server/subjects/chinese/characters-seed');
const cnPoems = require('../server/subjects/chinese/poems-seed');

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.error('  ✗ ' + msg); }
}

console.log('批改判分解析');
const good = grader.gradeParse('```json\n{"problems":[{"problem":"计算：125×8=？","myAnswer":"1000","rightAnswer":"1000","correct":"对","knowledge":"三位数乘一位数","errorType":""},{"problem":"37+58=？","myAnswer":"85","rightAnswer":"95","correct":"错","knowledge":"两位数加法","errorType":"calc_error"},{"problem":"看图写算式","correct":"看不清"}]}\n```');
assert(good.length === 3, '解析 3 题（实际 ' + good.length + '）');
assert(good[0].correct === true, '判对三态 true');
assert(good[1].correct === false && good[1].errorType === 'calc_error' && good[1].rightAnswer === '95', '判错带正确答案与错因');
assert(good[2].correct === null, '看不清 → null 不瞎判');
const bad = grader.gradeParse('模型胡说八道');
assert(bad.length === 0, '坏输出 → 空题单兜底');
const noProblem = grader.gradeParse('{"problems":[{"correct":"对","rightAnswer":"5"}]}');
assert(noProblem.length === 1 && noProblem[0].correct === null, '缺题干 → null 需人工核对');
const invErr = grader.gradeParse('{"problems":[{"problem":"1+1=?","correct":"错","errorType":"瞎写的"}]}');
assert(invErr[0].errorType === null, '非法错因归 null');

console.log('四年级教材目录');
assert(enCur.CURRICULUM.length === 12, '英语 12 单元（实际 ' + enCur.CURRICULUM.length + '）');
assert(cnCur.CURRICULUM.length === 16, '语文 16 单元（实际 ' + cnCur.CURRICULUM.length + '）');
const enKGSet = new Set(enKG.listKnowledge().map((k) => k.code));
enCur.CURRICULUM.forEach((u) => u.knowledge.forEach((k) => {
  assert(enKGSet.has(k), '英语单元 ' + u.id + ' 知识点码合法：' + k);
}));
const cnKGSet = new Set(cnKG.listKnowledge().map((k) => k.code));
cnCur.CURRICULUM.forEach((u) => u.knowledge.forEach((k) => {
  assert(cnKGSet.has(k), '语文单元 ' + u.id + ' 知识点码合法：' + k);
}));
assert(enCur.unitById('E4U1').title === 'My classroom', '英语单元查找');
assert(cnCur.unitById('C4U1').title === '自然之美', '语文单元查找');
assert(enCur.unitLabel('E4U1').indexOf('四上') > -1, '英语 unitLabel 带四上');
assert(enCur.unitLabel('E4U12').indexOf('四下') > -1, '英语 unitLabel 带四下');

console.log('四年级内容扩充');
assert(enSeedG4.length === 72, '四年级词 72（实际 ' + enSeedG4.length + '）');
assert(enSeedG4.every((w) => w.grade === 4 && w.unit), '每词 grade=4 且带单元');
assert(cnChars.filter((c) => c.grade === 4).length === 40, '四年级生字 40');
assert(cnPoems.listPoems(4).length === 8, '四年级古诗 8 首');
assert(cnPoems.listPoems(3).length === 6, '三年级古诗 6 首保留');

console.log(failed === 0 ? '\n✅ 批改与教材单测全部通过' : '\n❌ 失败 ' + failed + ' 项');
process.exit(failed === 0 ? 0 : 1);
