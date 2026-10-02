// 检查选择题步骤是否泄露答案（临时回归脚本）
const M = require('../utils/mcq.js');
const S = require('../utils/solver.js');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let leak = 0;

Object.keys(M.CONCEPT_BANK).forEach((k) => {
  for (let i = 0; i < 15; i++) {
    const q = M.generateMcqByKnowledge(k);
    const disp = String(q.displayAnswer);
    const kept = q.steps;
    if (/作答/.test(kept[kept.length - 1].title)) { leak++; console.log('末步仍是作答:', k); }
    kept.slice(0, -1).forEach((s, idx) => {
      const c = s.content || '';
      if (/^-?\d+(\.\d+)?$/.test(disp)) {
        if (idx === 0) return; // 第①步概念陈述允许出现数字
        const re = new RegExp('(?<![0-9.÷×+\\-*/（(＝])' + esc(disp) + '(?![0-9.])');
        if (re.test(c)) { leak++; console.log('数字泄露:', k, '| 答案', disp, '| 步', s.title, '→', c.slice(0, 50)); }
      } else {
        if (c.includes(disp)) { leak++; console.log('汉字泄露:', k, '| 答案', disp, '| 步', s.title, '→', c.slice(0, 50)); }
      }
    });
  }
});

for (let i = 0; i < 80; i++) {
  const p = S.generatePractice(null, 'easy');
  if (typeof p.answer !== 'number') continue;
  const q = M.wrapMcq(p);
  q.steps.forEach((s) => {
    const re = new RegExp('(?<![0-9.÷×+\\-*/（(＝])' + esc(String(p.answer)) + '(?![0-9.])');
    if (re.test(s.content || '')) { leak++; console.log('包装泄露:', p.problem, '| 答案', p.answer, '| 步', s.title, '→', (s.content || '').slice(0, 50)); }
  });
}

console.log(leak === 0 ? '✅ 全部无答案泄露' : '❌ 泄露 ' + leak + ' 处');
process.exit(leak === 0 ? 0 : 1);
