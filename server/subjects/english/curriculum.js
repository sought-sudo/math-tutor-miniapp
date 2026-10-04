// server/subjects/english/curriculum.js — 人教版（PEP 三起）四年级英语教材目录
// 结构对齐 utils/curriculum.js（数学）：{ id, book, unit, title, knowledge[] }
// 单元 → 知识图谱码映射（knowledge 数组引用 knowledgeGraph 的 code）

'use strict';

const CURRICULUM = [
  // 四年级上册（6 单元）
  { id: 'E4U1', book: '人教版（PEP 三起）四年级上册', unit: 'Unit 1', title: 'My classroom', knowledge: ['vocab-school', 'sentence-what'] },
  { id: 'E4U2', book: '人教版（PEP 三起）四年级上册', unit: 'Unit 2', title: 'My schoolbag', knowledge: ['vocab-school', 'sentence-what'] },
  { id: 'E4U3', book: '人教版（PEP 三起）四年级上册', unit: 'Unit 3', title: 'My friends', knowledge: ['sentence-introduce', 'grammar-be'] },
  { id: 'E4U4', book: '人教版（PEP 三起）四年级上册', unit: 'Unit 4', title: 'My home', knowledge: ['vocab-home', 'sentence-what'] },
  { id: 'E4U5', book: '人教版（PEP 三起）四年级上册', unit: 'Unit 5', title: "Dinner's ready", knowledge: ['vocab-food', 'sentence-like'] },
  { id: 'E4U6', book: '人教版（PEP 三起）四年级上册', unit: 'Unit 6', title: 'Meet my family', knowledge: ['vocab-family', 'sentence-introduce'] },
  // 四年级下册（6 单元）
  { id: 'E4U7', book: '人教版（PEP 三起）四年级下册', unit: 'Unit 1', title: 'My school', knowledge: ['vocab-school', 'sentence-what'] },
  { id: 'E4U8', book: '人教版（PEP 三起）四年级下册', unit: 'Unit 2', title: 'What time is it?', knowledge: ['vocab-numbers', 'sentence-what'] },
  { id: 'E4U9', book: '人教版（PEP 三起）四年级下册', unit: 'Unit 3', title: 'Weather', knowledge: ['vocab-weather', 'sentence-what'] },
  { id: 'E4U10', book: '人教版（PEP 三起）四年级下册', unit: 'Unit 4', title: 'At the farm', knowledge: ['vocab-animals', 'grammar-plural'] },
  { id: 'E4U11', book: '人教版（PEP 三起）四年级下册', unit: 'Unit 5', title: 'My clothes', knowledge: ['vocab-clothes', 'sentence-what'] },
  { id: 'E4U12', book: '人教版（PEP 三起）四年级下册', unit: 'Unit 6', title: 'Shopping', knowledge: ['vocab-clothes', 'sentence-like'] }
];

function unitById(id) {
  return CURRICULUM.find((u) => u.id === id) || null;
}

function unitLabel(id) {
  const u = unitById(id);
  if (!u) return '';
  const book = u.book.indexOf('上册') > -1 ? '四上' : '四下';
  return '英语 ' + book + ' · ' + u.unit + ' ' + u.title;
}

module.exports = {
  CURRICULUM: CURRICULUM,
  unitById: unitById,
  unitLabel: unitLabel
};
