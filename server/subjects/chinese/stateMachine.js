// server/subjects/chinese/stateMachine.js — 语文对话状态机（阶段 3 实装，当前为占位骨架）

'use strict';

module.exports = {
  AVAILABLE: false,
  STATE_MACHINE: null,
  STATE_ORDER: [],
  TRANSITIONS: {},
  createSession: null,
  step: null,
  checkAnswer: null,
  buildSystemPrompt: null,
  buildUserMessage: null,
  isValidTransition: null
};
