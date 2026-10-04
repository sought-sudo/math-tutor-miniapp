// server/camp.js — 训练营（查漏补缺）核心逻辑：组卷/判分/薄弱点/排课/课内容
// 纯逻辑模块（HTTP 粘合在 server.js），供 scripts/check-camp.js 直接单测。
// 依赖：utils/solver、utils/mcq、utils/curriculum、services/lessonService、services/campReportService

'use strict';

const solver = require('../utils/solver');
const mcq = require('../utils/mcq');
const curriculum = require('../utils/curriculum');
const lessonService = require('./services/lessonService');
const campReportService = require('./services/campReportService');
const enQuestionBank = require('./subjects/english/questionBank');
const cnQuestionBank = require('./subjects/chinese/questionBank');
const enKG = require('./subjects/english/knowledgeGraph');
const cnKG = require('./subjects/chinese/knowledgeGraph');

// 学科名（报告/课卡文案）
const SUBJECT_NAMES = { math: '数学', english: '英语', chinese: '语文' };
function normSubject(sub) {
  const s = String(sub || 'math').trim();
  return SUBJECT_NAMES[s] ? s : 'math';
}

// 全部知识点：math=教材目录并集；english/chinese=各自知识图谱
function allKnowledge(subject) {
  const sub = normSubject(subject);
  if (sub === 'english') return enKG.listKnowledge().map((k) => k.code);
  if (sub === 'chinese') return cnKG.listKnowledge().map((k) => k.code);
  const arr = [];
  (curriculum.CURRICULUM || []).forEach((u) => {
    (u.knowledge || []).forEach((k) => {
      if (arr.indexOf(k) < 0) arr.push(k);
    });
  });
  return arr;
}

// 学科知识点显示名（课表/地图）
function knowledgeName(subject, code) {
  const sub = normSubject(subject);
  if (sub === 'english') {
    const k = enKG.getKnowledge(code);
    return k ? k.name : code;
  }
  if (sub === 'chinese') {
    const k = cnKG.getKnowledge(code);
    return k ? k.name : code;
  }
  return code;
}

// 按知识点出一题（含答案；数学走原引擎，英语/语文走学科选择题库）
function makeQuestion(knowledge, subject) {
  const sub = normSubject(subject);
  if (sub === 'english') {
    const q = enQuestionBank.makeQuestion(knowledge);
    return {
      knowledge: q.knowledge,
      type: 'mcq',
      problem: q.problem,
      options: q.options,
      answerIndex: q.answerIndex,
      displayAnswer: q.options[q.answerIndex]
    };
  }
  if (sub === 'chinese') {
    const q = cnQuestionBank.makeQuestion(knowledge);
    return {
      knowledge: q.knowledge,
      type: 'mcq',
      problem: q.problem,
      options: q.options,
      answerIndex: q.answerIndex,
      displayAnswer: q.options[q.answerIndex]
    };
  }
  if (mcq.isConcept(knowledge)) {
    const q = mcq.generateMcqByKnowledge(knowledge);
    return {
      knowledge: knowledge,
      type: 'mcq',
      problem: q.problem,
      options: q.options,
      answerIndex: q.answerIndex,
      displayAnswer: q.displayAnswer
    };
  }
  const p = solver.generateByKnowledge(knowledge);
  if (typeof p.answer === 'number') {
    return {
      knowledge: knowledge,
      type: 'fillin',
      problem: p.problem,
      answer: p.answer,
      displayAnswer: p.displayAnswer || String(p.answer)
    };
  }
  const q = mcq.wrapMcq(p);
  return {
    knowledge: knowledge,
    type: 'mcq',
    problem: q.problem,
    options: q.options,
    answerIndex: q.answerIndex,
    displayAnswer: q.displayAnswer
  };
}

// 与已有题目去重地出一题（课程巩固/小测用），重试上限 8 次
function makeDistinctQuestion(knowledge, existingProblems, subject) {
  for (let i = 0; i < 8; i++) {
    const q = makeQuestion(knowledge, subject);
    if ((existingProblems || []).indexOf(q.problem) < 0) return q;
  }
  return makeQuestion(knowledge);
}

// 组卷：每知识点 1 题（诊断 ladder 首题）
function buildPaper(knowledges, subject) {
  const sub = normSubject(subject);
  return (knowledges || []).map((k, i) => {
    const q = makeQuestion(k, sub);
    q.id = 'd' + (i + 1);
    return q;
  });
}

// 判分：mcq 收选项下标，fillin 收数字文本（近似比较容差 0.01）
function gradeQuestion(q, value) {
  if (q.type === 'mcq') {
    const idx = typeof value === 'number' ? value : parseInt(value, 10);
    const correct = Number.isInteger(idx) && q.options && idx >= 0 && idx < q.options.length && idx === q.answerIndex;
    return { correct: correct, rightAnswer: q.options ? String(q.options[q.answerIndex]) : '' };
  }
  const v = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.\-]/g, ''));
  const a = q.answer;
  const correct = Number.isFinite(v) && typeof a === 'number' && Math.abs(v - a) < 0.01;
  return { correct: correct, rightAnswer: q.displayAnswer || String(a) };
}

// 客户端可见题面（剥离答案字段）
function toClientQuestion(q) {
  const out = { id: q.id, knowledge: q.knowledge, type: q.type, problem: q.problem };
  if (q.type === 'mcq') out.options = q.options;
  return out;
}

function parseDetail(detail) {
  try {
    const d = JSON.parse(detail || '{}');
    if (!d.questions) d.questions = [];
    if (!d.answers) d.answers = {};
    if (!d.extraByKnowledge) d.extraByKnowledge = {};
    return d;
  } catch (e) {
    return { questions: [], answers: {}, extraByKnowledge: {} };
  }
}

function findQuestion(detail, questionId) {
  const d = parseDetail(detail);
  return d.questions.find((x) => x.id === questionId) || null;
}

// 诊断作答：判分 + ladder 1+1（答错且该知识点尚无附加题 → 追加 1 道确认题）
// 返回 { error? , correct, rightAnswer, extra(客户端题面或 null), detail(新 JSON), answered, total }
function answerDiagnostic(detail, questionId, value) {
  const d = parseDetail(detail);
  const q = d.questions.find((x) => x.id === questionId);
  if (!q) return { error: '题目不存在' };
  if (d.answers[questionId]) return { error: '这道题已经答过了' };
  const g = gradeQuestion(q, value);
  d.answers[questionId] = { value: value, correct: g.correct, ts: new Date().toISOString() };
  let extra = null;
  if (!g.correct) {
    const baseCount = d.questions.filter((x) => x.knowledge === q.knowledge && x.id.indexOf('d') === 0).length;
    const totalCount = d.questions.filter((x) => x.knowledge === q.knowledge).length;
    if (totalCount < baseCount + 1 && !d.extraByKnowledge[q.knowledge]) {
      d.extraByKnowledge[q.knowledge] = true;
      const eq = makeQuestion(q.knowledge, d.subject || 'math');
      eq.id = 'e' + d.questions.length;
      d.questions.push(eq);
      extra = toClientQuestion(eq);
    }
  }
  return {
    correct: g.correct,
    rightAnswer: g.rightAnswer,
    extra: extra,
    detail: JSON.stringify(d),
    answered: Object.keys(d.answers).length,
    total: d.questions.length
  };
}

// 诊断汇总：总体分 + 每知识点 {knowledge, score, correct, total}（score 升序=薄弱在前）
function summarizeDiagnostic(detail) {
  const d = parseDetail(detail);
  const byK = {};
  let totalCorrect = 0;
  let totalAnswered = 0;
  Object.keys(d.answers).forEach((qid) => {
    const q = d.questions.find((x) => x.id === qid);
    const a = d.answers[qid];
    if (!q) return;
    totalAnswered++;
    if (a.correct) totalCorrect++;
    const m = byK[q.knowledge] || (byK[q.knowledge] = { correct: 0, total: 0 });
    m.total++;
    if (a.correct) m.correct++;
  });
  const perK = Object.keys(byK)
    .map((k) => {
      const m = byK[k];
      return { knowledge: k, score: Math.round((m.correct / m.total) * 100), correct: m.correct, total: m.total };
    })
    .sort((a, b) => a.score - b.score || b.total - a.total);
  const score = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  return { score: score, perK: perK, totalCorrect: totalCorrect, totalAnswered: totalAnswered };
}

// 排课：诊断弱项优先（score<60），掌握度（attempts>=3 且 score<60）补充，不足再按最低分补齐
// 返回 { needDiagnostic, allStrong, lessons:[{index,knowledge,lesson_type,baseScore}] }
function buildPlanSpec(diagPerK, mastery, subject) {
  const sub = normSubject(subject);
  const seen = {};
  const candidates = [];
  (diagPerK || []).forEach((x) => {
    if (x.score < 60 && !seen[x.knowledge]) {
      seen[x.knowledge] = 1;
      candidates.push({ knowledge: x.knowledge, score: x.score });
    }
  });
  (mastery || []).forEach((m) => {
    const k = m.knowledge_point || m.knowledge;
    if (!k) return;
    if (!seen[k] && m.attempts >= 3 && m.score < 60) {
      seen[k] = 1;
      candidates.push({ knowledge: k, score: m.score });
    }
  });
  const enoughData = (mastery || []).some((m) => m.attempts >= 3);
  if (!candidates.length && !enoughData) return { needDiagnostic: true, lessons: [] };
  if (candidates.length < 3) {
    (mastery || [])
      .slice()
      .sort((a, b) => a.score - b.score)
      .forEach((m) => {
        const k = m.knowledge_point || m.knowledge;
        if (!k) return;
        if (!seen[k] && candidates.length < 5) {
          seen[k] = 1;
          candidates.push({ knowledge: k, score: m.score });
        }
      });
  }
  candidates.sort((a, b) => a.score - b.score);
  const lessons = candidates.slice(0, 5).map((c, i) => ({
    index: i,
    knowledge: c.knowledge,
    lesson_type: sub === 'math' ? (mcq.isConcept(c.knowledge) ? 'concept' : 'compute') : 'concept',
    baseScore: c.score
  }));
  return { needDiagnostic: false, allStrong: !lessons.length, lessons: lessons };
}

// 组装一节完整课（含答案，服务端留存；下发前用 toClientLesson 剥离答案）
// 环节：知识点卡片 + 例题讲解（概念型 AI 生成例题，本地兜底）+ 巩固题 2 + 小测 2
async function buildLessonContent(knowledge, lessonType, chatFn, subject) {
  const sub = normSubject(subject);
  let card;
  let example;
  if (sub === 'english') {
    const kg = enKG.getKnowledge(knowledge) || { name: knowledge, desc: '英语小知识点' };
    card = { desc: kg.desc, method: '先听音，再跟读，最后试着拼一拼', mistakes: '' };
    example = {
      problem: '学一学：「' + kg.name + '」',
      steps: [
        { title: '① 看一看', content: '先看单词和图片，猜一猜它的意思。' },
        { title: '② 听一听', content: '点喇叭听发音，跟着小声读两遍。' },
        { title: '③ 猜一猜', content: '先自己猜中文意思，再看答案，印象更深。' },
        { title: '④ 用一用', content: '和小狐说一个带这个单词的句子吧。' }
      ]
    };
  } else if (sub === 'chinese') {
    const kg = cnKG.getKnowledge(knowledge) || { name: knowledge, desc: '语文小知识点' };
    card = { desc: kg.desc, method: '先读一读，再看结构，试着组个词写一写', mistakes: '' };
    example = {
      problem: '学一学：「' + kg.name + '」',
      steps: [
        { title: '① 读一读', content: '看拼音把字音读准，大声读两遍。' },
        { title: '② 看结构', content: '注意部首和笔画，观察这个字怎么搭起来的。' },
        { title: '③ 组一组', content: '用这个字组一个词，说说意思。' },
        { title: '④ 写一写', content: '在心里按笔顺写一遍，再下笔。' }
      ]
    };
  } else {
    card = solver.getKnowledge(knowledge);
    if (lessonType === 'concept') {
      example = await lessonService.generateConceptExample(chatFn, knowledge);
    } else {
      const p = solver.generateByKnowledge(knowledge);
      example = {
        problem: p.problem,
        steps: (p.steps || []).map((s) => ({ title: s.title, content: s.content, tip: s.tip, ask: s.ask }))
      };
    }
  }
  const problems = [example.problem];
  const practices = [];
  const quiz = [];
  for (let i = 0; i < 2; i++) {
    const q = makeDistinctQuestion(knowledge, problems, sub);
    q.id = 'p' + (i + 1);
    problems.push(q.problem);
    practices.push(q);
  }
  for (let i = 0; i < 2; i++) {
    const q = makeDistinctQuestion(knowledge, problems, sub);
    q.id = 'z' + (i + 1);
    problems.push(q.problem);
    quiz.push(q);
  }
  return {
    knowledge: knowledge,
    subject: sub,
    lessonType: lessonType,
    card: card,
    example: example,
    practices: practices,
    quiz: quiz
  };
}

// 课程题面（含答案，供学生端本地即时判分；服务端在 answer 接口独立判分留档）
function toClientLessonQuestion(q) {
  const out = { id: q.id, type: q.type, problem: q.problem };
  if (q.type === 'mcq') {
    out.options = q.options;
    out.answerIndex = q.answerIndex;
  } else {
    out.answer = q.answer;
    out.displayAnswer = q.displayAnswer;
  }
  return out;
}

function toClientLesson(lc) {
  return {
    knowledge: lc.knowledge,
    lessonType: lc.lessonType,
    card: lc.card,
    example: lc.example,
    practices: lc.practices.map(toClientLessonQuestion),
    quiz: lc.quiz.map(toClientLessonQuestion)
  };
}

// 在课内容里找题（巩固 + 小测）
function findLessonQuestion(lc, questionId) {
  return lc.practices.find((x) => x.id === questionId) || lc.quiz.find((x) => x.id === questionId) || null;
}

// 计划视图（plan 行 + lesson 行 → 给客户端的 JSON）
function planView(planRow, lessons) {
  if (!planRow) return null;
  let result = null;
  if (planRow.result) {
    try { result = JSON.parse(planRow.result); } catch (e) { result = null; }
  }
  return {
    id: planRow.id,
    status: planRow.status,
    lessons: (lessons || []).map((l) => ({
      index: l.lesson_index,
      knowledge: l.knowledge,
      lesson_type: l.lesson_type,
      status: l.status,
      correct: l.correct,
      attempts: l.attempts,
      score: l.score
    })),
    result: result
  };
}

// 结课验收报告事实：期初（排课 baseScore）/结课（复测 perK + 当前掌握度）
function buildFinalFacts(planLessons, finalPerK, mastery) {
  const before = planLessons.map((l) => ({ knowledge: l.knowledge, score: l.baseScore }));
  const after = (finalPerK || []).map((x) => ({ knowledge: x.knowledge, score: x.score }));
  const improved = after.filter((a) => {
    const b = before.find((x) => x.knowledge === a.knowledge);
    return b ? a.score > b.score : false;
  }).map((a) => a.knowledge);
  const stillWeak = after.filter((a) => a.score < 60).map((a) => a.knowledge);
  return { before: before, after: after, improved: improved, stillWeak: stillWeak, mastery: mastery || [] };
}

// 启动时注入学科题库素材（词库/生字）
function initSubjects(database) {
  try {
    enQuestionBank.setVocab(database.listEnglishVocabulary());
    cnQuestionBank.setChars(database.listChineseCharacters(3));
  } catch (e) {
    // 题库注入失败不阻塞启动（题库有内置兜底词）
  }
}

module.exports = {
  allKnowledge: allKnowledge,
  normSubject: normSubject,
  knowledgeName: knowledgeName,
  SUBJECT_NAMES: SUBJECT_NAMES,
  initSubjects: initSubjects,
  makeQuestion: makeQuestion,
  buildPaper: buildPaper,
  gradeQuestion: gradeQuestion,
  toClientQuestion: toClientQuestion,
  parseDetail: parseDetail,
  findQuestion: findQuestion,
  answerDiagnostic: answerDiagnostic,
  summarizeDiagnostic: summarizeDiagnostic,
  buildPlanSpec: buildPlanSpec,
  buildLessonContent: buildLessonContent,
  toClientLesson: toClientLesson,
  toClientLessonQuestion: toClientLessonQuestion,
  findLessonQuestion: findLessonQuestion,
  planView: planView,
  buildFinalFacts: buildFinalFacts,
  reportService: campReportService
};
