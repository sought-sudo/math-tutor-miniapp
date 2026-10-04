// server/subjects/math/stateMachine.js — 数学 10 状态引导式对话状态机
// 阶段 1 策略：包装共享实现 server/tutor-engine.js（re-export），保证行为 100% 一致；
// 物理归位到学科目录留待阶段 2 评估（tutor-engine 被 server.js 与单测共同依赖）。

'use strict';

module.exports = require('../../tutor-engine');
