// server/subjects/english/knowledgeGraph.js — 三年级英语核心知识图谱
// 每个知识点：{ code, name, dimension(listen|speak|read|write), desc }
// 数据即代码（零依赖），subjectService.getKnowledgeGraph('english') 路由到本文件。

'use strict';

const KNOWLEDGE = [
  // 字母与自然拼读
  { code: 'letters', name: '字母与发音', dimension: 'listen', desc: '26 个字母的认读与发音' },
  { code: 'phonics-cvc', name: '自然拼读 CVC', dimension: 'read', desc: '辅音+元音+辅音的拼读规律，如 cat / dog' },
  // 核心词汇（8 大类，与词库 category 对应）
  { code: 'vocab-animals', name: '动物单词', dimension: 'speak', desc: '常见动物的听说读' },
  { code: 'vocab-colors', name: '颜色单词', dimension: 'speak', desc: '常见颜色的听说读' },
  { code: 'vocab-numbers', name: '数字单词', dimension: 'listen', desc: '1~12 的听说读' },
  { code: 'vocab-fruits', name: '水果单词', dimension: 'speak', desc: '常见水果的听说读' },
  { code: 'vocab-body', name: '身体部位', dimension: 'listen', desc: '身体部位的听说读' },
  { code: 'vocab-school', name: '学习用品', dimension: 'read', desc: '学校常见物品的认读' },
  { code: 'vocab-food', name: '食物单词', dimension: 'speak', desc: '常见食物的听说读' },
  { code: 'vocab-toys', name: '玩具单词', dimension: 'speak', desc: '常见玩具的听说读' },
  // 句型
  { code: 'sentence-greeting', name: '打招呼句型', dimension: 'speak', desc: 'Hello! / Hi! / Good morning! 等' },
  { code: 'sentence-introduce', name: '自我介绍', dimension: 'speak', desc: 'I am... / My name is... / I am ... years old' },
  { code: 'sentence-what', name: '这是什么句型', dimension: 'read', desc: 'What is this? It is a... / What color is it?' },
  { code: 'sentence-like', name: '喜欢句型', dimension: 'speak', desc: 'I like... / Do you like...? Yes, I do.' },
  // 语法初步
  { code: 'grammar-be', name: 'be 动词 am/is/are', dimension: 'read', desc: 'I am / You are / It is 的用法' },
  { code: 'grammar-plural', name: '名词复数 -s', dimension: 'read', desc: '两个以上加 s：two cats / three dogs' },
  // 书写
  { code: 'spell-words', name: '单词拼写', dimension: 'write', desc: '看中文或听音，拼出学过的单词' },
  // 日常对话
  { code: 'dialogue-greeting', name: '打招呼对话', dimension: 'speak', desc: '见面问候的一问一答' },
  { code: 'dialogue-daily', name: '日常小对话', dimension: 'speak', desc: '询问物品/喜欢事物的简单对话' },
  // 阅读
  { code: 'reading-simple', name: '简单小短文', dimension: 'read', desc: '3~5 句的小短文阅读理解' }
];

function listKnowledge() {
  return KNOWLEDGE.slice();
}

function units() {
  // 按维度分组（对应 mastery.dimension 规划）
  const dims = [
    { id: 'listen', title: '听一听 👂' },
    { id: 'speak', title: '说一说 🗣' },
    { id: 'read', title: '读一读 📖' },
    { id: 'write', title: '写一写 ✏️' }
  ];
  return dims.map((d) => ({
    id: d.id,
    title: d.title,
    knowledge: KNOWLEDGE.filter((k) => k.dimension === d.id).map((k) => k.code)
  }));
}

function getKnowledge(code) {
  return KNOWLEDGE.find((k) => k.code === code) || null;
}

module.exports = {
  AVAILABLE: true,
  NOTE: '三年级英语核心知识点',
  DIMENSIONS: ['listen', 'speak', 'read', 'write'],
  listKnowledge: listKnowledge,
  units: units,
  getKnowledge: getKnowledge
};
