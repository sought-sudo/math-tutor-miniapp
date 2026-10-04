// server/services/subjectService.js — 学科路由中枢（多学科架构）
// 职责：按 subject_code 把学习请求路由到 server/subjects/<code>/ 对应模块。
// math = 数学辅导（四通用 AI 路由专属）；english = 英语 MVP（专用 /api/english/* 接口 + 四件套实装）；
// chinese = 占位骨架，AVAILABLE:false。

'use strict';

const mathKnowledge = require('../subjects/math/knowledgeGraph');
const mathPrompts = require('../subjects/math/prompts');
const mathStateMachine = require('../subjects/math/stateMachine');
const mathEvaluator = require('../subjects/math/evaluator');

const englishKnowledge = require('../subjects/english/knowledgeGraph');
const englishPrompts = require('../subjects/english/prompts');
const englishStateMachine = require('../subjects/english/stateMachine');
const englishEvaluator = require('../subjects/english/evaluator');

const chineseKnowledge = require('../subjects/chinese/knowledgeGraph');
const chinesePrompts = require('../subjects/chinese/prompts');
const chineseStateMachine = require('../subjects/chinese/stateMachine');
const chineseEvaluator = require('../subjects/chinese/evaluator');

// 各学科在"通用 AI 路由"（/tutor /tutor-chat /variant /ocr）不可用时的专属提示
const SUBJECT_MESSAGES = {
  math: '',
  english: '英语练习请使用英语入口 🎤（首页 → 英语）',
  chinese: '语文练习请使用语文入口 📖（首页 → 语文）'
};

const MODULES = {
  math: {
    code: 'math',
    name: '数学',
    AVAILABLE: true,
    knowledgeGraph: mathKnowledge,
    prompts: mathPrompts,
    stateMachine: mathStateMachine,
    evaluator: mathEvaluator
  },
  english: {
    code: 'english',
    name: '英语',
    AVAILABLE: true,
    knowledgeGraph: englishKnowledge,
    prompts: englishPrompts,
    stateMachine: englishStateMachine,
    evaluator: englishEvaluator
  },
  chinese: {
    code: 'chinese',
    name: '语文',
    AVAILABLE: true,
    knowledgeGraph: chineseKnowledge,
    prompts: chinesePrompts,
    stateMachine: chineseStateMachine,
    evaluator: chineseEvaluator
  }
};

const DEFAULT_CODE = 'math';
const DEV_MESSAGE = '该学科正在开发中 🚧 目前可以先学数学哦';

// 规范化学科码：非法/缺省回落 math
function normalize(code) {
  const c = String(code || '').trim();
  return MODULES[c] ? c : DEFAULT_CODE;
}

function getSubjectByCode(code) {
  return MODULES[normalize(code)] || null;
}

function isAvailable(code) {
  return !!(MODULES[normalize(code)] || {}).AVAILABLE;
}

// 通用 AI 路由的分流提示：math 走原逻辑；其他学科给专属引导语
function subjectRouteMessage(code) {
  const c = normalize(code);
  if (c === DEFAULT_CODE) return '';
  return SUBJECT_MESSAGES[c] || DEV_MESSAGE;
}

function getKnowledgeGraph(subjectCode) {
  return (getSubjectByCode(subjectCode) || {}).knowledgeGraph || null;
}

function getPrompt(subjectCode) {
  return (getSubjectByCode(subjectCode) || {}).prompts || null;
}

function getStateMachine(subjectCode) {
  return (getSubjectByCode(subjectCode) || {}).stateMachine || null;
}

function getEvaluator(subjectCode) {
  return (getSubjectByCode(subjectCode) || {}).evaluator || null;
}

// 学科清单（供 /api/subjects）
function listSubjects() {
  return Object.keys(MODULES).map((code) => ({
    code: code,
    name: MODULES[code].name,
    available: MODULES[code].AVAILABLE,
    message: MODULES[code].AVAILABLE ? '' : DEV_MESSAGE
  }));
}

module.exports = {
  DEFAULT_CODE: DEFAULT_CODE,
  DEV_MESSAGE: DEV_MESSAGE,
  normalize: normalize,
  getSubjectByCode: getSubjectByCode,
  isAvailable: isAvailable,
  subjectRouteMessage: subjectRouteMessage,
  getKnowledgeGraph: getKnowledgeGraph,
  getPrompt: getPrompt,
  getStateMachine: getStateMachine,
  getEvaluator: getEvaluator,
  listSubjects: listSubjects
};
