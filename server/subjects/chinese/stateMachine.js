// server/subjects/chinese/stateMachine.js — 语文学习状态机（七状态）
// 流程：READ_ALOUD 朗读 → WORD_PRACTICE 字词 → SENTENCE_PRACTICE 句子 → READING_GUIDE 阅读引导
//       → EXPRESSION 口语表达 → WRITING_SUGGEST 写作建议 → REVIEW 复习
// 每状态定义：enter 进入条件 / goal AI 目标 / allowed 允许动作 / forbidden 禁止动作 / exit 退出条件。

'use strict';

const STATE_MACHINE = {
  READ_ALOUD: {
    label: '读一读',
    enter: '会话开始，或有新材料（课文/古诗/短文）时',
    goal: '让孩子大声朗读，读准字音、读通句子',
    allowed: ['示范朗读', '播放读音', '提示难字拼音'],
    forbidden: ['直接讲解中心思想', '要求默写', '打断纠正每个字'],
    exit: '孩子读完一遍，进入字词练习'
  },
  WORD_PRACTICE: {
    label: '字词练一练',
    enter: 'READ_ALOUD 完成',
    goal: '通过看拼音写字/听写巩固生字，错了给笔画组词提示不给字',
    allowed: ['出示拼音', '判听写结果', '给部首笔画组词提示'],
    forbidden: ['直接展示正确写法', '批评写错'],
    exit: '听写正确一次，或提示 2 次后继续'
  },
  SENTENCE_PRACTICE: {
    label: '句子练一练',
    enter: 'WORD_PRACTICE 完成',
    goal: '把句子说完整/仿说一句，孩子开口即鼓励',
    allowed: ['出示例句', '请孩子仿说', '肯定完整表达'],
    forbidden: ['一次性讲语法术语', '批评表达不好'],
    exit: '孩子说出一句完整的话'
  },
  READING_GUIDE: {
    label: '阅读引导',
    enter: 'SENTENCE_PRACTICE 完成，或直接选阅读题',
    goal: '孩子自己回短文找依据；先问"你从哪句话看出来的？"',
    allowed: ['出示短文与问题', '追问依据', '提示回读相关句'],
    forbidden: ['直接给标准答案', '直接概括中心思想'],
    exit: '孩子说出依据句，或完成一轮引导'
  },
  EXPRESSION: {
    label: '说一说',
    enter: 'READING_GUIDE 完成',
    goal: '让孩子用自己的话复述/表达想法，练习口语',
    allowed: ['给表达框架', '鼓励完整表达'],
    forbidden: ['打断纠错', '替孩子说'],
    exit: '孩子完成一次完整表达'
  },
  WRITING_SUGGEST: {
    label: '写作小建议',
    enter: 'EXPRESSION 完成，或孩子主动提交作文',
    goal: '只检查结构/跑题/错别字/通顺，给 2~3 条建议，不评分',
    allowed: ['肯定一个优点', '给具体建议（每条≤30字）'],
    forbidden: ['打分', '排名或比较', '说"写得不好"'],
    exit: '建议给出并被查看'
  },
  REVIEW: {
    label: '复习收尾',
    enter: 'WRITING_SUGGEST 完成',
    goal: '回顾今天认的字/读的文章，给明天小约定',
    allowed: ['朗读今日生字', '总结鼓励', '预告下次'],
    forbidden: ['加新任务', '布置额外作业'],
    exit: '会话结束'
  }
};

const STATE_ORDER = ['READ_ALOUD', 'WORD_PRACTICE', 'SENTENCE_PRACTICE', 'READING_GUIDE', 'EXPRESSION', 'WRITING_SUGGEST', 'REVIEW'];

const TRANSITIONS = {
  READ_ALOUD: ['WORD_PRACTICE'],
  WORD_PRACTICE: ['SENTENCE_PRACTICE', 'WORD_PRACTICE'], // 听写可重复
  SENTENCE_PRACTICE: ['READING_GUIDE', 'SENTENCE_PRACTICE'],
  READING_GUIDE: ['EXPRESSION', 'READING_GUIDE'], // 引导可多轮追问
  EXPRESSION: ['WRITING_SUGGEST', 'EXPRESSION'],
  WRITING_SUGGEST: ['REVIEW', 'WRITING_SUGGEST'],
  REVIEW: []
};

function isValidTransition(from, to) {
  const list = TRANSITIONS[from];
  return !!list && list.indexOf(to) > -1;
}

function createSession(ctx) {
  return {
    subject: 'chinese',
    state: 'READ_ALOUD',
    chars: [],          // 本次学过的生字
    current: (ctx && ctx.char) || null,
    attempts: 0,
    correct: 0,
    startedAt: new Date().toISOString()
  };
}

// action = {type:'start_word'|'dictation_result'|'sentence_done'|'reading_answer'|'expression_done'|'writing_done'|'finish', correct?}
function step(session, action) {
  const s = session;
  const a = action || {};
  const from = s.state;
  let next = from;

  switch (a.type) {
    case 'start_word':
      next = 'WORD_PRACTICE';
      break;
    case 'dictation_result':
      if (a.correct) s.correct++;
      else s.attempts++;
      next = 'SENTENCE_PRACTICE';
      break;
    case 'try_word_again':
      next = 'WORD_PRACTICE';
      break;
    case 'start_reading':
      next = 'READING_GUIDE';
      break;
    case 'reading_answer':
      next = 'READING_GUIDE'; // 引导可多轮
      break;
    case 'start_expression':
      next = 'EXPRESSION';
      break;
    case 'expression_done':
      next = 'WRITING_SUGGEST';
      break;
    case 'writing_done':
      next = 'REVIEW';
      break;
    case 'finish':
      next = 'REVIEW';
      break;
    default:
      break;
  }
  if (next !== from && !isValidTransition(from, next)) next = from;
  s.state = next;
  return { state: s.state, changed: next !== from, correct: s.correct };
}

module.exports = {
  AVAILABLE: true,
  NOTE: '语文学习状态机：READ_ALOUD→WORD_PRACTICE→SENTENCE_PRACTICE→READING_GUIDE→EXPRESSION→WRITING_SUGGEST→REVIEW',
  STATE_MACHINE: STATE_MACHINE,
  STATE_ORDER: STATE_ORDER,
  TRANSITIONS: TRANSITIONS,
  createSession: createSession,
  step: step,
  isValidTransition: isValidTransition
};
