// server/subjects/math/homeworkGrader.js — 拍照批改作业：判分 JSON 解析与校验（纯函数，可单测）
// 输入视觉模型返回的文本；输出标准化题单。原则：看不清/字段不合法 → correct=null（不瞎判）。

'use strict';

const ERROR_TYPES = ['read_error', 'calc_error', 'method_unknown'];

function parseLoose(text) {
  const s = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    // 继续尝试截取
  }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch (e2) {
      // 忽略
    }
  }
  return null;
}

function normBool(v) {
  if (v === true || v === '对' || v === '正确' || v === '√') return true;
  if (v === false || v === '错' || v === '错误' || v === '×') return false;
  return null; // 看不清/未给出
}

// 逐题校验：problem 必填；correct 三态；不合格项标 null（需人工核对）
function validateProblems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => {
    if (!p || typeof p.problem !== 'string' || !p.problem.trim() || p.problem.length > 120) {
      return { problem: (p && typeof p.problem === 'string' && p.problem) || '（有一道题没识别清楚）', myAnswer: '', rightAnswer: '', correct: null, knowledge: '', errorType: null };
    }
    const correct = normBool(p.correct);
    const errorType = ERROR_TYPES.indexOf(p.errorType) > -1 ? p.errorType : null;
    return {
      problem: p.problem.trim(),
      myAnswer: typeof p.myAnswer === 'string' ? p.myAnswer.trim() : '',
      rightAnswer: (typeof p.rightAnswer === 'string' ? p.rightAnswer : (typeof p.rightAnswer === 'number' ? String(p.rightAnswer) : '')).trim(),
      correct: correct,
      knowledge: typeof p.knowledge === 'string' ? p.knowledge.trim() : '',
      errorType: errorType
    };
  });
}

// 用本地数学引擎判分：视觉模型只负责读题与学生答案，对错由引擎权威计算
// 引擎解不出的题（非算式/应用题）correct=null → 请人工核对
const solver = require('../../../utils/solver');

function extractNum(s) {
  const m = String(s || '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function gradeByEngine(problems) {
  return (problems || []).map((p) => {
    if (!p || p.correct !== null && p.correct !== undefined) {
      // 模型已给三态判定且不是"看不清"的也统一走引擎复核（更可靠）
    }
    let solved = null;
    try { solved = solver.solveText(p.problem); } catch (e) { solved = null; }
    if (solved && typeof solved.answer === 'number' && p.problem) {
      const mine = extractNum(p.myAnswer);
      const correct = mine !== null && Math.abs(mine - solved.answer) < 0.011;
      return {
        problem: p.problem,
        myAnswer: p.myAnswer,
        rightAnswer: solved.displayAnswer || String(solved.answer),
        correct: correct,
        knowledge: solved.knowledge || p.knowledge || '',
        errorType: correct ? null : (p.errorType || null)
      };
    }
    // 引擎解不出：AI 读题保留，判分交人工核对
    return {
      problem: p.problem,
      myAnswer: p.myAnswer,
      rightAnswer: p.rightAnswer || '',
      correct: null,
      knowledge: p.knowledge || '',
      errorType: p.errorType
    };
  });
}

// 解析模型输出 → 读题结果（不做判分；判分由 gradeByEngine 用本地引擎完成）
function gradeParse(text) {
  const j = parseLoose(text);
  if (!j) return [];
  const raw = Array.isArray(j) ? j : j.problems;
  if (!Array.isArray(raw)) return [];
  return validateProblems(raw);
}

module.exports = {
  gradeParse: gradeParse,
  gradeByEngine: gradeByEngine,
  validateProblems: validateProblems,
  ERROR_TYPES: ERROR_TYPES,
  HOMEWORK_GRADE_SYSTEM:
    '你是作业图片的读题助手。把图片中每道数学作业题读出来，只输出 JSON，不要解释，也不要判断对错：' +
    '{"problems":[{"problem":"题目文字","myAnswer":"学生在答：后面写的答案"}]}。' +
    '要求：1) 作业里题目和答案分行写，答案前有"答："字样，把"答："后面的内容读进 myAnswer；' +
    '2) 看不清的题，problem 写"（有一道题没识别清楚）"，myAnswer 写"看不清"；' +
    '3) 每题一个对象，有几道题就输出几个对象；4) 图片里没有作业题时 problems 输出空数组。'
};
