// server/subjects/math/evaluator.js — 数学判分器（包装共享实现）
// checkAnswer：对话状态机的答案判定（容差 0.011）；evaluate：四则表达式求值。
// 阶段 2 各学科 evaluator 将定义自己的判分维度（如英语 listen/speak/read/write）。

'use strict';

const tutorEngine = require('../../tutor-engine');
const solver = require('../../../utils/solver');

module.exports = {
  checkAnswer: tutorEngine.checkAnswer,
  evaluate: solver.evaluate,
  rankProblem: solver.rankProblem
};
