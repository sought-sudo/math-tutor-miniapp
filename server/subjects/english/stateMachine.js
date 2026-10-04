// server/subjects/english/stateMachine.js — 英语学习状态机（七状态）
// 流程：LISTEN 听音 → REPEAT 跟读 → PRONOUNCE_CHECK 发音确认（占位鼓励）→ PRACTICE 巩固 → DIALOGUE 对话 → SPELL 拼写 → REVIEW 复习
// 每状态定义：enter 进入条件 / goal AI 目标 / allowed 允许动作 / forbidden 禁止动作 / exit 退出条件。
// 附轻量确定性 step 引擎（前端驱动流程 / 未来对话服务共用），行为可单测。

'use strict';

const STATE_MACHINE = {
  LISTEN: {
    label: '听一听',
    enter: '会话开始，或换新词时',
    goal: '让孩子把目标词听清 2~3 遍，建立音与形的联系',
    allowed: ['朗读目标词', '播放例句', '提示猜词义'],
    forbidden: ['直接给中文翻译', '要求孩子跟读', '纠正发音'],
    exit: '孩子点了"开始跟读"'
  },
  REPEAT: {
    label: '跟着读',
    enter: 'LISTEN 完成，孩子主动开始跟读',
    goal: '鼓励孩子大声开口模仿，收集一次跟读（录音或文本）',
    allowed: ['播放示范音', '收到录音/文本', '给出鼓励'],
    forbidden: ['评判发音好坏', '直接纠错', '给中文翻译'],
    exit: '收到一次跟读提交'
  },
  PRONOUNCE_CHECK: {
    label: '发音确认',
    enter: '收到跟读提交',
    goal: '给温和的确认与鼓励；未接评测服务时不评分',
    allowed: ['说"再听一次，我们慢慢来"', '鼓励再试一次', '进入下一个词'],
    forbidden: ['评分或打分', '指出错在哪里', '与其他孩子比较'],
    exit: '孩子确认继续（PRACTICE）或跳过'
  },
  PRACTICE: {
    label: '玩一玩',
    enter: '跟读确认后',
    goal: '用小游戏巩固目标词（听音选词/看词选图式），达成 2 次正确',
    allowed: ['出选择题', '播放示范音', '鼓励'],
    forbidden: ['直接给答案', '批评答错'],
    exit: '连续答对 2 次，或孩子选择进入拼写'
  },
  DIALOGUE: {
    label: '聊一聊',
    enter: 'PRACTICE 完成',
    goal: '在场景对话中用上目标句型，孩子能开口应答一轮',
    allowed: ['按场景出对话', '扮演固定角色', '朗读对方台词'],
    forbidden: ['长篇讲解语法', '一次性给整段翻译'],
    exit: '完成一轮完整对话，或孩子点完成'
  },
  SPELL: {
    label: '拼一拼',
    enter: 'PRACTICE/DIALOGUE 完成',
    goal: '看中文或听音拼出目标词，判分并给提示（不直接给答案）',
    allowed: ['展示中文意思', '播放读音', '给出首字母/长度提示'],
    forbidden: ['直接展示完整拼写', '批评拼错'],
    exit: '拼写正确一次，或已提示 2 次'
  },
  REVIEW: {
    label: '复习收尾',
    enter: 'SPELL 完成',
    goal: '带娃回顾今天学的词，给明天的小约定',
    allowed: ['朗读今日词表', '总结鼓励', '预告下次内容'],
    forbidden: ['引入新词', '布置额外作业'],
    exit: '会话结束'
  }
};

const STATE_ORDER = ['LISTEN', 'REPEAT', 'PRONOUNCE_CHECK', 'PRACTICE', 'DIALOGUE', 'SPELL', 'REVIEW'];

const TRANSITIONS = {
  LISTEN: ['REPEAT'],
  REPEAT: ['PRONOUNCE_CHECK'],
  PRONOUNCE_CHECK: ['PRACTICE', 'REPEAT'], // 允许"再来一次"回到跟读
  PRACTICE: ['DIALOGUE', 'SPELL', 'PRACTICE'], // 巩固可重复
  DIALOGUE: ['SPELL', 'DIALOGUE'],
  SPELL: ['REVIEW', 'SPELL'],
  REVIEW: []
};

function isValidTransition(from, to) {
  const list = TRANSITIONS[from];
  return !!list && list.indexOf(to) > -1;
}

function createSession(ctx) {
  return {
    subject: 'english',
    state: 'LISTEN',
    words: [],          // 本次学过的目标词
    current: (ctx && ctx.word) || null,
    attempts: 0,        // 当前词尝试次数
    correct: 0,         // 本次会话正确数
    startedAt: new Date().toISOString()
  };
}

// 确定性推进：action = {type:'submit_repeat'|'next_word'|'quiz_result'|'dialogue_done'|'spell_result'|'finish', ...}
function step(session, action) {
  const s = session;
  const a = action || {};
  const from = s.state;
  let next = from;

  switch (a.type) {
    case 'start_repeat':
      next = 'REPEAT';
      break;
    case 'submit_repeat':
      s.attempts++;
      next = 'PRONOUNCE_CHECK';
      break;
    case 'continue_practice':
      next = 'PRACTICE';
      break;
    case 'try_again':
      next = 'REPEAT';
      break;
    case 'quiz_result':
      if (a.correct) s.correct++;
      next = 'PRACTICE';
      break;
    case 'dialogue_done':
      next = 'SPELL';
      break;
    case 'spell_result':
      if (a.correct) {
        s.correct++;
        next = 'REVIEW';
      } else {
        s.attempts++;
        next = s.attempts >= 2 ? 'REVIEW' : 'SPELL';
      }
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
  NOTE: '英语学习状态机：LISTEN→REPEAT→PRONOUNCE_CHECK→PRACTICE→DIALOGUE→SPELL→REVIEW',
  STATE_MACHINE: STATE_MACHINE,
  STATE_ORDER: STATE_ORDER,
  TRANSITIONS: TRANSITIONS,
  createSession: createSession,
  step: step,
  isValidTransition: isValidTransition
};
