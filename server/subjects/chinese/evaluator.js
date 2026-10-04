// server/subjects/chinese/evaluator.js — 语文判分/引导器
// 原则：听写判分给提示不给字；阅读引导永不给标准答案；写作只建议不评分。

'use strict';

const DIMENSIONS = ['word', 'sentence', 'reading', 'writing'];

// 规范化：去空格/全角转半角/统一比较
function norm(s) {
  return String(s || '')
    .trim()
    .replace(/\u3000/g, '')
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/\s+/g, '');
}

// 听写判分：expected 为目标字（可多字词语），answer 为孩子写的
// 返回 { correct, feedback, level }；错误反馈不直接给字（给拼音/部首/组词线索由调用方拼）
function dictationCheck(expected, answer) {
  const t = norm(expected);
  const a = norm(answer);
  if (!t) return { correct: false, feedback: '先看清楚要听写哪个字哦', level: 'miss' };
  if (a === t) return { correct: true, feedback: '写对啦！字要写得工整哦 ✍️', level: 'ok' };
  if (a.length && t.indexOf(a) === 0 && a.length < t.length) {
    return { correct: false, feedback: '写对了一半，还差一点，再想想后面是什么', level: 'close' };
  }
  return { correct: false, feedback: '再看看拼音，注意这个字的部首和笔画', level: 'miss' };
}

// 阅读引导：任何答案都先追问依据，永不输出标准答案
// 返回 { guide, hasAnswer }；guide 是给孩子的下一句引导（≤25字）
function readingGuide(answer) {
  const a = String(answer || '').trim();
  if (!a) {
    return { guide: '先大声读一读短文，找找相关的那句话 📖', hasAnswer: false };
  }
  if (a.length < 6) {
    return { guide: '很好！你从哪句话看出来的？找出来读一读', hasAnswer: true };
  }
  return { guide: '说得有道理！是短文里哪句话让你这么想的？', hasAnswer: true };
}

// 写作建议（本地规则引擎兜底）：只查结构/长度/重复/错字提示，不评分
// 返回 { suggestions: [2~3 条，每条≤30字] }
function writingSuggestLocal(content) {
  const text = String(content || '').trim();
  const out = [];
  if (!text) {
    return { suggestions: ['先想一想：这件事的开头是什么？', '写三句话：做了什么、怎么样、你的心情'] };
  }
  const len = text.replace(/\s/g, '').length;
  // 优点先行
  if (len >= 30) out.push('写了 ' + len + ' 个字，内容很充实，先给自己点个赞！');
  else out.push('可以再把事情写长一点：加一个动作或一句心情试试');
  // 结构：开头/结尾
  const first = text.slice(0, 12);
  const last = text.slice(-12);
  if (len >= 20 && last.length) {
    out.push(text.indexOf('\n') > -1 || len > 40 ? '有开头有经过啦，结尾再加一句自己的感受会更完整' : '试着分三段：开头、经过、结尾，这样更清楚');
  } else {
    out.push('开头可以直接写"今天……"，让读的人一下子知道你在写什么');
  }
  // 重复词检测（相邻重复用词）
  const dup = text.match(/(.)\1{2,}/);
  if (dup) out.push('有几个字重复太多啦，换一个词或者删掉试试');
  // 明显错别字提示（常见同音误用，保守提示）
  if (/的地得/g.test(text) && text.match(/得的|地的|得得/)) out.push('注意"的、地、得"的用法，读一读顺不顺');
  return { suggestions: out.slice(0, 3).map((s) => (s.length > 30 ? s.slice(0, 29) + '…' : s)) };
}

module.exports = {
  AVAILABLE: true,
  DIMENSIONS: DIMENSIONS,
  dictationCheck: dictationCheck,
  readingGuide: readingGuide,
  writingSuggestLocal: writingSuggestLocal
};
