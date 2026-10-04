// server/subjects/chinese/questionBank.js — 语文选择题生成器（训练营/知识地图定向练习共用）
// 输出与数学 MCQ 同构：{ problem, options[], answerIndex, knowledge }（camp.gradeQuestion 零改动复用）
// 覆盖 chinese knowledgeGraph 全部知识点码（char-* / sentence-* / reading-* / writing-*）

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

let CHARS = []; // 生字注入（char/pinyin/radicals/words）
function setChars(chars) { CHARS = (chars || []).slice(); }
function sampleChars(n) { return shuffle(CHARS).slice(0, n); }

function build(problem, options, answerIndex, knowledge) {
  return { problem: problem, options: options, answerIndex: answerIndex, knowledge: knowledge };
}

// 看拼音选字
function qPinyinToChar(c) {
  const others = shuffle(CHARS.filter((x) => x.char !== c.char)).slice(0, 3);
  const options = shuffle([c.char].concat(others.map((x) => x.char)));
  return build('拼音 "chén" 是下面哪个字？', options, options.indexOf(c.char), 'char-reading');
}
// 看字选拼音
function qCharToPinyin(c) {
  const others = shuffle(CHARS.filter((x) => x.char !== c.char)).slice(0, 3);
  const options = shuffle([c.pinyin].concat(others.map((x) => x.pinyin)));
  return build('"' + c.char + '" 的读音是？', options, options.indexOf(c.pinyin), 'char-reading');
}
// 部首匹配
function qRadical(c) {
  const others = shuffle(CHARS.filter((x) => x.char !== c.char)).slice(0, 3);
  const options = shuffle([c.radicals].concat(others.map((x) => x.radicals)));
  return build('"' + c.char + '" 的部首是？', options, options.indexOf(c.radicals), 'char-dictionary');
}
// 组词选择
function qWords(c) {
  const w = String(c.words || '').split('、')[0];
  const others = shuffle(CHARS.filter((x) => x.char !== c.char)).slice(0, 3).map((x) => String(x.words || '').split('、')[0]);
  const options = shuffle([w].concat(others));
  return build('下面哪个词里有 "' + c.char + '"？', options, options.indexOf(w), 'char-words');
}

const SENTENCE_Q = {
  'sentence-complete': [
    { q: '哪一句是完整的句子？', options: ['我在操场跑步。', '在操场跑步。', '跑步在操场。', '操场。'], correct: '我在操场跑步。' },
    { q: '缺了谁："___ 在教室里读书。"', options: ['小明', '的教室', '读书', '很认真'], correct: '小明' }
  ],
  'sentence-rhetoric': [
    { q: '"弯弯的月亮像小船" 用了什么？', options: ['比喻', '夸张', '反问', '设问'], correct: '比喻' },
    { q: '"小鸟在枝头唱歌" 用了什么？', options: ['拟人', '比喻', '排比', '对偶'], correct: '拟人' }
  ],
  'sentence-modify': [
    { q: '哪一句有毛病？', options: ['我大约用了十分钟左右。', '我用了十分钟。', '我跑步十分钟。', '我写完作业了。'], correct: '我大约用了十分钟左右。' },
    { q: '"我们要养成认真学习的好习惯" 有没有毛病？', options: ['没有，很通顺', '缺主语', '前后矛盾', '用词重复'], correct: '没有，很通顺' }
  ],
  'sentence-oral': [
    { q: '向老师提问，最有礼貌的是：', options: ['老师，这道题我不会，能教教我吗？', '喂，这题怎么做？', '你告诉我答案。', '我不会！'], correct: '老师，这道题我不会，能教教我吗？' }
  ]
};

const READING_Q = {
  'reading-poem': [
    { q: '《咏柳》的作者是：', options: ['贺知章', '李白', '杜甫', '王维'], correct: '贺知章' },
    { q: '"二月春风似剪刀" 出自：', options: ['《咏柳》', '《春日》', '《嫦娥》', '《乞巧》'], correct: '《咏柳》' },
    { q: '《望天门山》的作者是：', options: ['李白', '苏轼', '朱熹', '林杰'], correct: '李白' }
  ],
  'reading-comprehension': [
    {
      q: '短文：小蚂蚁搬不动大米，就回家叫来许多小伙伴，大家一起把大米搬回了家。小蚂蚁的办法是：',
      options: ['叫小伙伴一起搬', '自己慢慢挪', '放弃大米', '把大米切小'],
      correct: '叫小伙伴一起搬'
    },
    {
      q: '短文：妈妈夸我跑得快，我心里美滋滋的。"美滋滋"的意思是：',
      options: ['很开心', '很好吃', '很生气', '很累'],
      correct: '很开心'
    }
  ],
  'reading-guess': [
    { q: '"太阳像一个大火球，烤得大地发烫" 说明天气：', options: ['很热', '很冷', '下雨了', '起风了'], correct: '很热' }
  ],
  'reading-main': [
    { q: '概括主要内容，最合适的一句是：', options: ['写谁在什么时间什么地方做了什么', '只写开头一句', '只写最后一句', '写所有细节'], correct: '写谁在什么时间什么地方做了什么' }
  ]
};

const WRITING_Q = {
  'writing-diary': [
    { q: '日记开头一般先写：', options: ['日期和天气', '题目', '姓名', '结尾'], correct: '日期和天气' }
  ],
  'writing-picture': [
    { q: '看图写话，最先要看清：', options: ['图上是谁、在哪里、在做什么', '字写多大', '纸的颜色', '用不用橡皮'], correct: '图上是谁、在哪里、在做什么' }
  ],
  'writing-begin-end': [
    { q: '作文结尾写什么最好？', options: ['自己的感受', '重复题目', '抄开头', '突然结束'], correct: '自己的感受' }
  ],
  'writing-detail': [
    { q: '让作文更生动，可以加上：', options: ['动作和心情', '更多标点', '更长的句子', '更多题目'], correct: '动作和心情' }
  ],
  'char-writing': [
    { q: '写字时要注意：', options: ['按笔顺、间架结构匀称', '写得越快越好', '连笔草书', '用力越大越好'], correct: '按笔顺、间架结构匀称' }
  ],
  'char-dictation': [
    { q: '听写时想不起怎么写，最好：', options: ['看拼音想部首笔画', '随便写一个', '空着不写', '抄别人的'], correct: '看拼音想部首笔画' }
  ]
};

function makeQuestion(knowledge) {
  const k = String(knowledge || '');
  const c = sampleChars(1)[0] || { char: '晨', pinyin: 'chén', radicals: '日', words: '早晨' };

  if (k.indexOf('char-') === 0) {
    const fn = k === 'char-reading' ? pick([qPinyinToChar, qCharToPinyin])
      : k === 'char-dictionary' ? qRadical
      : k === 'char-words' ? qWords
      : k === 'char-dictation' ? qPinyinToChar
      : k === 'char-writing' ? null
      : qCharToPinyin;
    if (fn) return fn(c);
    const item = pick(WRITING_Q['char-writing']);
    const options = shuffle(item.options);
    return build(item.q, options, options.indexOf(item.correct), k);
  }
  if (k.indexOf('sentence-') === 0) {
    const item = pick(SENTENCE_Q[k] || SENTENCE_Q['sentence-complete']);
    const options = shuffle(item.options);
    return build(item.q, options, options.indexOf(item.correct), k);
  }
  if (k.indexOf('reading-') === 0) {
    const item = pick(READING_Q[k] || READING_Q['reading-comprehension']);
    const options = shuffle(item.options);
    return build(item.q, options, options.indexOf(item.correct), k);
  }
  if (k.indexOf('writing-') === 0) {
    const item = pick(WRITING_Q[k] || WRITING_Q['writing-diary']);
    const options = shuffle(item.options);
    return build(item.q, options, options.indexOf(item.correct), k);
  }
  return qPinyinToChar(c);
}

module.exports = {
  makeQuestion: makeQuestion,
  setChars: setChars
};
