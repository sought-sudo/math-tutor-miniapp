// 开发自检：node scripts/check-solver.js
// 批量生成题目，检查本地解题引擎的答案与分步讲解是否正确
const solver = require('../utils/solver');

let fail = 0;
const assert = (cond, msg) => {
  if (!cond) {
    fail++;
    console.log('✗ ' + msg);
  }
};

// 1) 各题型批量生成，检查答案类型与步骤数量
for (let i = 0; i < 500; i++) {
  const p = solver.generatePractice();
  assert(p && p.problem, '题目为空');
  assert(Array.isArray(p.steps) && p.steps.length >= 3, '步骤不足：' + p.problem);
  if (p.answer !== null && p.answer !== undefined) {
    assert(typeof p.answer === 'number' && isFinite(p.answer), '答案非法：' + p.problem + ' -> ' + p.answer);
  }
}

// 2) 四则混合运算逐步脱式计算
const cases = ['125×8+25×4', '(360-24×6)÷18', '3.6+2.75', '100-45×2', '25×4×7', '8×(5+2)-12'];
cases.forEach((c) => {
  const r = solver.solveText('计算：' + c + ' = ?');
  assert(r && r.answer !== null, '表达式未解出：' + c);
  if (r && r.answer !== null) console.log('  ' + c + ' = ' + r.answer);
});

// 3) 答案正确性抽查：除法整除、小数、行程
for (let i = 0; i < 200; i++) {
  const p = solver.generatePractice();
  if (p.id === 'div2') {
    const m = p.problem.match(/(\d+) ÷ (\d+)/);
    assert(Number(m[1]) / Number(m[2]) === p.answer, '除法题答案错误：' + p.problem);
  }
  if (p.id === 'cr') {
    assert(p.answer === null && p.displayAnswer, '鸡兔同笼答案缺失：' + p.problem);
  }
  if (p.id === 'travel') {
    const m = p.problem.match(/每分钟行 (\d+) 米[^0-9]*(\d+) 分钟/);
    assert(Number(m[1]) * Number(m[2]) === p.answer, '行程题答案错误：' + p.problem);
  }
}

console.log(fail ? '❌ 存在 ' + fail + ' 个问题' : '✅ 本地引擎自检全部通过');
process.exit(fail ? 1 : 0);
