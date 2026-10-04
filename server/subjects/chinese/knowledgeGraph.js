// server/subjects/chinese/knowledgeGraph.js — 语文知识图谱（阶段 3 实装，当前为占位骨架）
// 实装时替换占位导出：listKnowledge 给出语文知识点（含 word/sentence/reading/writing 维度归属），
// subjectService.getKnowledgeGraph('chinese') 会自动路由到本文件。

'use strict';

module.exports = {
  AVAILABLE: false,
  NOTE: '语文学科正在开发中',
  DIMENSIONS: ['word', 'sentence', 'reading', 'writing'],
  listKnowledge: function () { return []; },
  getKnowledge: function () { return null; },
  units: function () { return []; }
};
