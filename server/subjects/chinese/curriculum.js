// server/subjects/chinese/curriculum.js — 统编版四年级语文教材目录
// 结构对齐 utils/curriculum.js（数学）：{ id, book, unit, title, knowledge[] }
// 单元 → 知识图谱码映射（knowledge 数组引用 knowledgeGraph 的 code）

'use strict';

const CURRICULUM = [
  // 四年级上册（8 单元）
  { id: 'C4U1', book: '统编版四年级上册', unit: '第 1 单元', title: '自然之美', knowledge: ['reading-comprehension', 'char-reading'] },
  { id: 'C4U2', book: '统编版四年级上册', unit: '第 2 单元', title: '阅读策略', knowledge: ['reading-guess', 'reading-main'] },
  { id: 'C4U3', book: '统编版四年级上册', unit: '第 3 单元', title: '连续观察', knowledge: ['reading-poem', 'writing-detail'] },
  { id: 'C4U4', book: '统编版四年级上册', unit: '第 4 单元', title: '神话故事', knowledge: ['reading-comprehension', 'sentence-rhetoric'] },
  { id: 'C4U5', book: '统编版四年级上册', unit: '第 5 单元', title: '习作：生活万花筒', knowledge: ['writing-detail', 'writing-diary'] },
  { id: 'C4U6', book: '统编版四年级上册', unit: '第 6 单元', title: '成长故事', knowledge: ['reading-main', 'writing-begin-end'] },
  { id: 'C4U7', book: '统编版四年级上册', unit: '第 7 单元', title: '家国情怀', knowledge: ['reading-poem', 'reading-comprehension'] },
  { id: 'C4U8', book: '统编版四年级上册', unit: '第 8 单元', title: '历史传说', knowledge: ['reading-comprehension', 'sentence-oral'] },
  // 四年级下册（8 单元）
  { id: 'C4U9', book: '统编版四年级下册', unit: '第 1 单元', title: '田园生活', knowledge: ['reading-poem'] },
  { id: 'C4U10', book: '统编版四年级下册', unit: '第 2 单元', title: '科普知识', knowledge: ['reading-comprehension'] },
  { id: 'C4U11', book: '统编版四年级下册', unit: '第 3 单元', title: '现代诗歌', knowledge: ['sentence-rhetoric', 'reading-poem'] },
  { id: 'C4U12', book: '统编版四年级下册', unit: '第 4 单元', title: '动物朋友', knowledge: ['writing-detail', 'reading-main'] },
  { id: 'C4U13', book: '统编版四年级下册', unit: '第 5 单元', title: '习作：游历见闻', knowledge: ['writing-detail', 'sentence-complete'] },
  { id: 'C4U14', book: '统编版四年级下册', unit: '第 6 单元', title: '成长足迹', knowledge: ['reading-main'] },
  { id: 'C4U15', book: '统编版四年级下册', unit: '第 7 单元', title: '人物品质', knowledge: ['reading-poem', 'reading-comprehension'] },
  { id: 'C4U16', book: '统编版四年级下册', unit: '第 8 单元', title: '童话世界', knowledge: ['reading-comprehension', 'writing-diary'] }
];

function unitById(id) {
  return CURRICULUM.find((u) => u.id === id) || null;
}

function unitLabel(id) {
  const u = unitById(id);
  if (!u) return '';
  const book = u.book.indexOf('上册') > -1 ? '四上' : '四下';
  return '语文 ' + book + ' · ' + u.unit + ' ' + u.title;
}

module.exports = {
  CURRICULUM: CURRICULUM,
  unitById: unitById,
  unitLabel: unitLabel
};
