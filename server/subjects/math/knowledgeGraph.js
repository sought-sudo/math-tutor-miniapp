// server/subjects/math/knowledgeGraph.js — 数学知识图谱（包装共享 utils，不复制数据）
// utils/solver.js 与 utils/curriculum.js 是"小程序 require + 浏览器 script + Node 后端"三方共享文件，
// 这里只做服务端视角的聚合导出；知识数据单一来源仍是 utils/。

'use strict';

const solver = require('../../../utils/solver');
const curriculum = require('../../../utils/curriculum');

// 全部知识点名（教材目录映射的去重并集，即 KNOWLEDGE_LIB 的真实知识点）
function listKnowledge() {
  const arr = [];
  (curriculum.CURRICULUM || []).forEach((u) => {
    (u.knowledge || []).forEach((k) => {
      if (arr.indexOf(k) < 0) arr.push(k);
    });
  });
  return arr;
}

// 知识点卡片 {desc, method, mistakes}；未知知识点回落"综合"
function getKnowledge(name) {
  return solver.getKnowledge(name);
}

// 单元 → 知识点映射（含人教/北师大两个版本）
function units() {
  return curriculum.CURRICULUM || [];
}

module.exports = {
  listKnowledge: listKnowledge,
  getKnowledge: getKnowledge,
  units: units,
  CURRICULUM: curriculum.CURRICULUM,
  unitById: curriculum.unitById,
  unitLabel: curriculum.unitLabel
};
