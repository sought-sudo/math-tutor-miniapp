// server/subjects/chinese/knowledgeGraph.js — 三年级语文核心知识图谱
// 每个知识点：{ code, name, dimension(word|sentence|reading|writing), desc }

'use strict';

const KNOWLEDGE = [
  // 字词
  { code: 'char-reading', name: '识字认读', dimension: 'word', desc: '认识三年级常用生字，读准字音' },
  { code: 'char-writing', name: '写字姿势与笔顺', dimension: 'word', desc: '按笔顺规范书写，注意间架结构' },
  { code: 'char-dictation', name: '听写与默写', dimension: 'word', desc: '听音写字，课后词语表听写' },
  { code: 'char-dictionary', name: '查字典', dimension: 'word', desc: '音序查字法和部首查字法' },
  { code: 'char-words', name: '组词与近义词', dimension: 'word', desc: '一字组多词，近义词反义词' },
  // 句子
  { code: 'sentence-complete', name: '把句子写完整', dimension: 'sentence', desc: '谁+干什么/怎么样，句子说完整' },
  { code: 'sentence-rhetoric', name: '比喻与拟人', dimension: 'sentence', desc: '像……一样（比喻）；让事物像人一样（拟人）' },
  { code: 'sentence-modify', name: '修改病句', dimension: 'sentence', desc: '找出缺字、重复、前后矛盾的小毛病' },
  { code: 'sentence-oral', name: '口语交际', dimension: 'sentence', desc: '礼貌清楚地表达自己的想法' },
  // 古诗与阅读
  { code: 'reading-poem', name: '古诗诵读', dimension: 'reading', desc: '读准字音读出节奏，大致明白诗的意思' },
  { code: 'reading-comprehension', name: '阅读理解', dimension: 'reading', desc: '从短文里找信息，说出是从哪句话看出来的' },
  { code: 'reading-guess', name: '联系上下文猜词', dimension: 'reading', desc: '不认识的词，联系前后文想一想' },
  { code: 'reading-main', name: '说说主要内容', dimension: 'reading', desc: '用一两句话说说短文讲了什么' },
  // 写作
  { code: 'writing-diary', name: '写日记', dimension: 'writing', desc: '日期天气+今天做的一件事' },
  { code: 'writing-picture', name: '看图写话', dimension: 'writing', desc: '图上有谁、在哪里、在做什么' },
  { code: 'writing-begin-end', name: '开头和结尾', dimension: 'writing', desc: '开头引出事情，结尾说说感受' },
  { code: 'writing-detail', name: '把事情写具体', dimension: 'writing', desc: '加上动作、语言、心情，写生动' }
];

function listKnowledge() {
  return KNOWLEDGE.slice();
}

function units() {
  const dims = [
    { id: 'word', title: '字词 📝' },
    { id: 'sentence', title: '句子 🗣' },
    { id: 'reading', title: '阅读 📖' },
    { id: 'writing', title: '写作 ✍️' }
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
  NOTE: '三年级语文核心知识点',
  DIMENSIONS: ['word', 'sentence', 'reading', 'writing'],
  listKnowledge: listKnowledge,
  units: units,
  getKnowledge: getKnowledge
};
