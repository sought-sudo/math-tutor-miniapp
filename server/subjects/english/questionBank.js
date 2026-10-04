// server/subjects/english/questionBank.js — 英语选择题生成器（训练营/知识地图定向练习共用）
// 输出与数学 MCQ 同构：{ problem, options[], answerIndex, knowledge }（camp.gradeQuestion 零改动复用）
// 覆盖 english knowledgeGraph 全部知识点码（vocab-* / sentence-* / dialogue-* / grammar-* / reading-simple / english-repeat / english-spell）

'use strict';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 按类别抽词（词库由调用方注入，避免 db 依赖方便单测）
let VOCAB = [];
function setVocab(words) { VOCAB = (words || []).slice(); }
function sampleWords(category, n) {
  const pool = VOCAB.filter((w) => w.category === category);
  if (!pool.length) return [];
  return shuffle(pool).slice(0, n);
}

function build(problem, options, answerIndex, knowledge) {
  return { problem: problem, options: options, answerIndex: answerIndex, knowledge: knowledge };
}

// 看词选义：给定英文词，选正确中文
function qWordToMeaning(w) {
  const others = shuffle(VOCAB.filter((x) => x.word !== w.word)).slice(0, 3);
  const options = shuffle([w.meaning].concat(others.map((x) => x.meaning)));
  return build('"' + w.word + '" 的中文意思是？', options, options.indexOf(w.meaning), 'vocab-' + w.category);
}

// 看义选词：给定中文，选正确英文
function qMeaningToWord(w) {
  const others = shuffle(VOCAB.filter((x) => x.word !== w.word)).slice(0, 3);
  const options = shuffle([w.word].concat(others.map((x) => x.word)));
  return build('"' + w.meaning + '" 用英语怎么说？', options, options.indexOf(w.word), 'vocab-' + w.category);
}

// 选正确拼写：四个相近拼写
function qSpelling(w) {
  const wrongs = new Set([w.word]);
  const variants = [w.word + 'e', w.word.slice(0, -1), w.word[0] + w.word.slice(1) + 'e', 'e' + w.word];
  const opts = [w.word];
  variants.forEach((v) => { if (!wrongs.has(v) && opts.length < 4) { wrongs.add(v); opts.push(v); } });
  while (opts.length < 4) opts.push(w.word + 's');
  const options = shuffle(opts);
  return build('"' + w.meaning + '" 的正确拼写是？', options, options.indexOf(w.word), 'vocab-' + w.category);
}

const SENTENCE_Q = {
  'sentence-greeting': [
    { q: '早上见面说：', options: ['Good morning!', 'Good night!', 'Thank you!', 'I am fine.'], correct: 'Good morning!' },
    { q: '下午见面可以说：', options: ['Good evening!', 'Good afternoon!', 'Goodbye!', 'Hello!'], correct: 'Good afternoon!' }
  ],
  'sentence-introduce': [
    { q: '"我叫李明" 用英语说：', options: ['I am Li Ming.', 'You are Li Ming.', 'He is Li Ming.', 'Is it Li Ming?'], correct: 'I am Li Ming.' },
    { q: '"我八岁" 用英语说：', options: ['I am eight.', 'I have eight.', 'It is eight.', 'Eight am I.'], correct: 'I am eight.' }
  ],
  'sentence-what': [
    { q: '问"这是什么"：', options: ['What is this?', 'Who is this?', 'Where is it?', 'How is it?'], correct: 'What is this?' },
    { q: '"它是什么颜色？"：', options: ['What color is it?', 'What is color?', 'Color what is?', 'It is what color?'], correct: 'What color is it?' }
  ],
  'sentence-like': [
    { q: '"我喜欢苹果" 用英语说：', options: ['I like apples.', 'I am apples.', 'Apples like me.', 'I likes apple.'], correct: 'I like apples.' },
    { q: '问"你喜欢苹果吗？"：', options: ['Do you like apples?', 'Are you like apples?', 'You like apples?', 'Like you apples?'], correct: 'Do you like apples?' }
  ]
};

const GRAMMAR_Q = {
  'grammar-be': [
    { q: 'I ___ a student.', options: ['am', 'is', 'are', 'be'], correct: 'am' },
    { q: 'She ___ my sister.', options: ['is', 'am', 'are', 'be'], correct: 'is' },
    { q: 'They ___ happy.', options: ['are', 'is', 'am', 'be'], correct: 'are' }
  ],
  'grammar-plural': [
    { q: '"两个苹果" 用英语说：', options: ['two apples', 'two apple', 'two applees', 'apples two'], correct: 'two apples' },
    { q: '"three cats" 意思是：', options: ['三只猫', '三只狗', '一只猫', '三辆车'], correct: '三只猫' }
  ]
};

const DIALOGUE_Q = {
  'dialogue-greeting': [
    { q: '别人说 "Hello!" 你回答：', options: ['Hello!', 'Goodbye!', 'Yes.', 'Thanks.'], correct: 'Hello!' },
    { q: '别人说 "How are you?" 你回答：', options: ['I am fine, thank you.', 'Good morning!', 'My name is Tom.', 'Goodbye!'], correct: 'I am fine, thank you.' }
  ],
  'dialogue-daily': [
    { q: '别人说 "Nice to meet you!" 你回答：', options: ['Nice to meet you, too!', 'Thank you!', 'Goodbye!', 'Yes, I am.'], correct: 'Nice to meet you, too!' }
  ]
};

const READING_Q = {
  'reading-simple': [
    {
      q: '短文：This is my cat. It is small and cute. 小猫是：', options: ['小的可爱的', '大的凶的', '黑色的', '白色的'], correct: '小的可爱的'
    },
    {
      q: '短文：I like apples. Apples are sweet. 作者喜欢：', options: ['苹果', '香蕉', '梨', '橘子'], correct: '苹果'
    }
  ],
  'phonics-cvc': [
    { q: '哪个单词读 /kæt/（cat）？', options: ['cat', 'cot', 'cut', 'kit'], correct: 'cat' },
    { q: '"dog" 中间的音是：', options: ['o', 'a', 'e', 'i'], correct: 'o' }
  ],
  letters: [
    { q: '字母表第一个字母是：', options: ['A', 'B', 'C', 'D'], correct: 'A' }
  ]
};

// 跟读/拼写专项（对应落库码 english-repeat / english-spell）
function qRepeat(w) {
  const options = shuffle([w.word, w.word + 's', w.word.slice(0, -1), w.word + 'e']);
  return build('听录音，读的是哪个词？"' + w.word + '"', options, options.indexOf(w.word), 'english-repeat');
}
function qSpellGeneral(w) {
  return build('听音拼写：哪个是 "' + w.meaning + '" 的正确拼写？', shuffle([w.word, w.word + 'e', w.word.slice(0, -1), 'e' + w.word]), 0, 'english-spell');
}

function makeQuestion(knowledge) {
  const k = String(knowledge || '');
  const word = pick(VOCAB.length ? VOCAB : [{ word: 'cat', meaning: '猫', category: 'animals' }]);
  const category = k.indexOf('vocab-') === 0 ? k.slice(6) : word.category;
  const w = sampleWords(category, 1)[0] || word;

  if (k.indexOf('vocab-') === 0) {
    return pick([qWordToMeaning, qMeaningToWord, qSpelling])(w);
  }
  if (k.indexOf('sentence-') === 0) {
    const q = SENTENCE_Q[k] || SENTENCE_Q['sentence-greeting'];
    const item = pick(q);
    const options = shuffle(item.options);
    return build(item.q, options, options.indexOf(item.correct), k);
  }
  if (k.indexOf('grammar-') === 0) {
    const item = pick(GRAMMAR_Q[k] || GRAMMAR_Q['grammar-be']);
    return build(item.q, shuffle(item.options), 0, k);
  }
  if (k.indexOf('dialogue-') === 0) {
    const item = pick(DIALOGUE_Q[k] || DIALOGUE_Q['dialogue-greeting']);
    return build(item.q, shuffle(item.options), 0, k);
  }
  if (k === 'reading-simple' || k === 'phonics-cvc' || k === 'letters') {
    const item = pick(READING_Q[k] || READING_Q['reading-simple']);
    return build(item.q, shuffle(item.options), 0, k);
  }
  if (k === 'english-repeat') return qRepeat(w);
  if (k === 'english-spell') return qSpellGeneral(w);
  return qWordToMeaning(w); // 兜底
}

module.exports = {
  makeQuestion: makeQuestion,
  setVocab: setVocab,
  qWordToMeaning: qWordToMeaning,
  qMeaningToWord: qMeaningToWord,
  qSpelling: qSpelling
};
