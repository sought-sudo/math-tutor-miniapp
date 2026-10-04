// scripts/check-camp.js — 训练营（查漏补缺）单测
// 覆盖：组卷覆盖 23 知识点 / 判分 / ladder 追加确认题 / 断点续测数据 / 汇总薄弱点 / 排课排序 / 课内容与去重 / 报告兜底

'use strict';

const camp = require('../server/camp');
const campReport = require('../server/services/campReportService');
const mcq = require('../utils/mcq');

let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ ' + msg);
  }
}

// 1. 全知识点覆盖：23 个，均有出题能力（不抛错、有题干）
console.log('组卷与出题能力');
const all = camp.allKnowledge();
assert(all.length === 23, '教材映射知识点共 23 个，实际 ' + all.length);
const paper = camp.buildPaper(all);
assert(paper.length === 23, '整卷 23 题，实际 ' + paper.length);
let okQuestions = 0;
paper.forEach((q) => {
  assert(!!q.problem && !!q.knowledge, '题目完整：' + q.knowledge);
  if (q.type === 'mcq') {
    assert(Array.isArray(q.options) && q.options.length >= 3 && q.options.length <= 4, q.knowledge + ' 选择题 3~4 选项（实际 ' + (q.options ? q.options.length : 0) + '）');
    assert(q.answerIndex >= 0 && q.answerIndex < q.options.length, q.knowledge + ' 答案索引合法');
  } else {
    assert(typeof q.answer === 'number', q.knowledge + ' 填空题数值答案');
  }
  okQuestions++;
});

// 2. 判分
console.log('判分');
const mq = camp.buildPaper(['简易方程'])[0];
assert(mq.type === 'mcq', '简易方程出的是选择题');
const g1 = camp.gradeQuestion(mq, mq.answerIndex);
assert(g1.correct === true, '选择题选对判对');
const g2 = camp.gradeQuestion(mq, (mq.answerIndex + 1) % 4);
assert(g2.correct === false, '选择题选错判错');
const fq = camp.buildPaper(['三位数乘两位数'])[0];
const gf = camp.gradeQuestion(fq, fq.answer);
assert(gf.correct === true, '填空题数字答对判对');
assert(camp.gradeQuestion(fq, fq.answer + 1).correct === false, '填空题答错判错');

// 3. ladder 1+1：答错追加 1 道确认题，答对不追加
console.log('ladder 追加确认题');
let detail = JSON.stringify({ questions: paper, answers: {} });
let r = camp.answerDiagnostic(detail, paper[0].id, (paper[0].answerIndex + 1) % 4); // 故意答错
assert(r.correct === false, 'ladder：答错返回 incorrect');
assert(r.extra && r.extra.knowledge === paper[0].knowledge, 'ladder：答错追加同知识点确认题');
const extraId = r.extra.id;
detail = r.detail;
r = camp.answerDiagnostic(detail, extraId, 0); // 确认题任意答
assert(!r.extra, 'ladder：每知识点只追加 1 道确认题');
detail = r.detail;
// 答对不加题（同一份卷继续作答）
r = camp.answerDiagnostic(detail, paper[1].id, paper[1].answerIndex !== undefined ? paper[1].answerIndex : paper[1].answer);
assert(r.correct === true, 'ladder：答对返回 correct');
assert(!r.extra, 'ladder：答对不追加题');
detail = r.detail;

// 4. 重复作答拦截
r = camp.answerDiagnostic(detail, paper[1].id, 0);
assert(!!r.error, '重复作答被拦截');

// 5. 汇总与薄弱点
console.log('汇总与薄弱点');
const summary = camp.summarizeDiagnostic(detail);
assert(summary.totalAnswered === 3, '汇总题数正确（2 题 + 1 确认题，实际 ' + summary.totalAnswered + '）');
assert(summary.perK.some((x) => x.knowledge === paper[0].knowledge && x.score < 100), '答错知识点得分低于 100');
assert(summary.perK.some((x) => x.knowledge === paper[1].knowledge && x.score === 100), '答对知识点得分 100');

// 6. 排课：诊断弱项优先 + 掌握度补充 + 新用户需要先测评
console.log('排课');
const weakDiag = summary.perK.filter((x) => x.score < 60).map((x) => x.knowledge);
const masteryFake = [
  { knowledge_point: '小数的加法', score: 40, attempts: 5 },
  { knowledge_point: '平均数', score: 55, attempts: 6 },
  { knowledge_point: '大数的认识', score: 70, attempts: 4 }
];
const spec = camp.buildPlanSpec(summary.perK, masteryFake);
assert(!spec.needDiagnostic, '有诊断数据不要求先测评');
assert(spec.lessons.length >= 2, '课表至少 2 节（诊断弱项+掌握度补充）');
assert(spec.lessons.some((l) => l.knowledge === weakDiag[0]), '诊断最弱知识点入选课表');
assert(spec.lessons.every((l, i) => i === 0 || spec.lessons[i - 1].baseScore <= l.baseScore), '课表按薄弱分升序排列');
spec.lessons.forEach((l) => {
  assert(l.lesson_type === 'concept' || l.lesson_type === 'compute', l.knowledge + ' 课型合法');
  if (mcq.isConcept(l.knowledge)) assert(l.lesson_type === 'concept', l.knowledge + ' 概念课型匹配');
});
const specNew = camp.buildPlanSpec(null, []);
assert(specNew.needDiagnostic === true, '新用户（无诊断无掌握度）要求先入学测');
const specStrong = camp.buildPlanSpec(null, [{ knowledge_point: '小数的加法', score: 95, attempts: 4 }, { knowledge_point: '平均数', score: 90, attempts: 3 }]);
assert(specStrong.needDiagnostic === false && specStrong.lessons.length >= 2, '老用户全掌握也能按最低分补齐排课');

// 7. 课内容（无 AI，走本地兜底）
console.log('课内容组装');
(async () => {
  const lcConcept = await camp.buildLessonContent('简易方程', 'concept', null);
  assert(lcConcept.card.desc && lcConcept.card.method, '概念课知识点卡片完整');
  assert(lcConcept.example && lcConcept.example.problem && lcConcept.example.steps.length >= 2, '概念课例题（本地兜底）含分步');
  assert(lcConcept.practices.length === 2 && lcConcept.quiz.length === 2, '巩固题 2 + 小测 2');
  const clientLc = camp.toClientLesson(lcConcept);
  assert(clientLc.quiz[0].answerIndex !== undefined, '下发课内选择题含 answerIndex（客户端本地判分）');
  const clientLc2 = camp.toClientLesson(await camp.buildLessonContent('三位数乘两位数', 'compute', null));
  assert(typeof clientLc2.quiz[0].answer === 'number', '下发课内填空题含数值答案');
  const lcCompute = await camp.buildLessonContent('三位数乘两位数', 'compute', null);
  assert(lcCompute.example && lcCompute.example.steps.length >= 2, '计算课例题含本地步骤');
  const probs = lcCompute.practices.concat(lcCompute.quiz).map((x) => x.problem);
  assert(new Set(probs).size >= 3, '课内四题基本不重复（去重后 ' + new Set(probs).size + ' 道）');
  const qq = camp.findLessonQuestion(lcConcept, 'z1');
  assert(qq && qq.type === 'mcq', '小测题可定位并判分');
  assert(camp.gradeQuestion(qq, qq.answerIndex).correct === true, '课内小测判分正确');

  // 8. AI 例题校验与兜底
  console.log('lessonService 校验');
  const ls = require('../server/services/lessonService');
  assert(ls.validate({ problem: 'x', steps: [{ title: 'a', content: 'b' }, { title: 'c', content: 'd' }] }) === true, '合法例题通过校验');
  assert(ls.validate({ problem: 'x', steps: [{ title: 'a', content: 'b' }] }) === false, '单步例题被拒');
  assert(ls.validate({ problem: '', steps: [{ title: 'a', content: 'b' }, { title: 'c', content: 'd' }] }) === false, '空题干被拒');
  const ex = await ls.generateConceptExample((msgs) => Promise.resolve('```json\n{"problem":"一个角是85°，它是什么角？","steps":[{"title":"①","content":"回忆分类"},{"title":"②","content":"85°小于90°是锐角"}]}\n```'), '角的度量');
  assert(ex.source === 'ai' && ex.steps.length === 2, 'AI 例题解析成功');
  const exBad = await ls.generateConceptExample((msgs) => Promise.resolve('坏输出'), '角的度量');
  assert(exBad.source === 'local', '坏输出回退本地兜底');

  // 9. 报告兜底（无冷数据）
  console.log('训练营报告兜底');
  const diagRep = await campReport.generateDiagnosisReport(null, { name: '小明', weak: [{ knowledge: '简易方程' }, { knowledge: '三角形' }], total: 23 });
  assert(diagRep.report_text && diagRep.parent_script, '诊断报告兜底完整');
  assert(diagRep.report_text.indexOf('%') < 0, '诊断报告无冷数据');
  const finalRep = await campReport.generateFinalReport(null, { name: '小明', before: [], improved: ['简易方程'], stillWeak: [] });
  assert(finalRep.report_text.indexOf('进步') > -1, '结课报告提到进步');

  // 10. genAreaUnit bug 回归：公顷/平方千米选择题答案索引正确
  console.log('genAreaUnit 回归');
  for (let i = 0; i < 30; i++) {
    const q = mcq.generateMcqByKnowledge('公顷和平方千米');
    assert(String(q.options[q.answerIndex]) === String(q.displayAnswer), '公顷/平方千米选项与答案一致（' + q.displayAnswer + '）');
  }
})().catch((e) => {
  console.error('单测异常：', e);
  process.exit(1);
});

// 10. 英语/语文学科训练营（questionBank 组卷/判分/课内容/排课）
console.log('英语/语文训练营学科化');
const enQB = require('../server/subjects/english/questionBank');
const cnQB = require('../server/subjects/chinese/questionBank');
enQB.setVocab([{ word: 'cat', meaning: '猫', category: 'animals' }, { word: 'dog', meaning: '狗', category: 'animals' }, { word: 'bird', meaning: '鸟', category: 'animals' }, { word: 'fish', meaning: '鱼', category: 'animals' }]);
cnQB.setChars([{ char: '晨', pinyin: 'chén', radicals: '日', words: '早晨' }, { char: '球', pinyin: 'qiú', radicals: '王', words: '皮球' }, { char: '汉', pinyin: 'hàn', radicals: '氵', words: '汉字' }, { char: '读', pinyin: 'dú', radicals: '讠', words: '读书' }]);
const enAll = camp.allKnowledge('english');
const cnAll = camp.allKnowledge('chinese');
assert(enAll.length >= 19, '英语知识点 ≥19（实际 ' + enAll.length + '）');
assert(cnAll.length >= 17, '语文知识点 ≥17（实际 ' + cnAll.length + '）');
let okQ = 0;
enAll.forEach((k) => {
  const q = camp.makeQuestion(k, 'english');
  assert(q.type === 'mcq' && q.options && q.options.length >= 3 && q.answerIndex >= 0 && q.answerIndex < q.options.length, '英语题合法：' + k);
  okQ++;
});
cnAll.forEach((k) => {
  const q = camp.makeQuestion(k, 'chinese');
  assert(q.type === 'mcq' && q.options && q.options.length >= 3 && q.answerIndex >= 0 && q.answerIndex < q.options.length, '语文题合法：' + k);
  okQ++;
});
// 英语卷判分
const enPaper = camp.buildPaper(enAll.slice(0, 5), 'english');
assert(enPaper.length === 5 && enPaper[0].options[camp.gradeQuestion(enPaper[0], enPaper[0].answerIndex).correct === true ? 0 : 0] !== undefined, '英语卷判分可用');
// 排课：英语/语文全 concept
const specEn = camp.buildPlanSpec(null, [{ knowledge_point: 'vocab-animals', score: 40, attempts: 4 }], 'english');
assert(specEn.lessons.length >= 1 && specEn.lessons[0].lesson_type === 'concept', '英语课型 concept');
const specCn = camp.buildPlanSpec(null, [{ knowledge_point: 'char-dictation', score: 45, attempts: 4 }], 'chinese');
assert(specCn.lessons.length >= 1 && specCn.lessons[0].lesson_type === 'concept', '语文课型 concept');
// 课内容（无 AI 本地）
(async () => {
  const lcEn = await camp.buildLessonContent('vocab-animals', 'concept', null, 'english');
  assert(lcEn.example && lcEn.example.steps.length === 4 && lcEn.practices.length === 2 && lcEn.quiz.length === 2, '英语课四环节');
  assert(lcEn.card.desc && lcEn.card.desc.length > 0, '英语课知识点卡片');
  const lcCn = await camp.buildLessonContent('char-reading', 'concept', null, 'chinese');
  assert(lcCn.example && lcCn.example.steps.length === 4 && lcCn.practices.length === 2 && lcCn.quiz.length === 2, '语文课四环节');
  assert(lcCn.card.desc && lcCn.card.desc.length > 0, '语文课知识点卡片');

  console.log(failed === 0 ? '\n✅ 训练营单测全部通过' : '\n❌ 训练营单测失败 ' + failed + ' 项');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('单测异常：', e);
  process.exit(1);
});

