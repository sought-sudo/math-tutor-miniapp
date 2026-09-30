// 内置"本地解题引擎"：覆盖小学四年级常见题型，支持四则混合运算的逐步脱式讲解。
// 未配置大模型接口时，小程序/网页学生端靠它完成分步引导（演示模式完全可用）。
// 本文件为纯 JS 且无依赖：微信小程序用 require() 加载，网页学生端直接以 <script> 引入，
// 也可在 Node 中运行 scripts/check-solver.js 自检。

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 数字格式化：四舍五入到 6 位小数，去掉多余的 0
function fmt(n) {
  if (n === null || n === undefined || !isFinite(n)) return '';
  return parseFloat(String(Math.round(n * 1e6) / 1e6)).toString();
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// ---------------- 表达式求值（带中间步骤） ----------------

function tokenize(src) {
  const s = String(src)
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/－/g, '-')
    .replace(/\s/g, '');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      tokens.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
      i = j;
      continue;
    }
    const last = tokens[tokens.length - 1];
    const isUnaryMinus = ch === '-' && (!last || last.t === 'op' || last.t === 'lp');
    if (isUnaryMinus) {
      let j = i + 1;
      let num = '';
      while (j < s.length && /[0-9.]/.test(s[j])) {
        num += s[j];
        j++;
      }
      if (num) {
        tokens.push({ t: 'num', v: -parseFloat(num) });
        i = j;
        continue;
      }
    }
    if (ch === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (ch === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    if ('+-*/'.indexOf(ch) > -1) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    i++;
  }
  return tokens;
}

function tokensToStr(tokens) {
  let s = '';
  tokens.forEach((tk) => {
    if (tk.t === 'num') {
      s += tk.v < 0 ? '(' + fmt(tk.v) + ')' : fmt(tk.v);
    } else if (tk.t === 'op') {
      s += ({ '+': ' + ', '-': ' - ', '*': ' × ', '/': ' ÷ ' })[tk.v];
    } else if (tk.t === 'lp') {
      s += '(';
    } else if (tk.t === 'rp') {
      s += ')';
    }
  });
  return s;
}

function findInnermostParens(tokens) {
  let best = null;
  const stack = [];
  tokens.forEach((tk, idx) => {
    if (tk.t === 'lp') {
      stack.push(idx);
    } else if (tk.t === 'rp' && stack.length) {
      const s = stack.pop();
      if (!best || s > best.start) best = { start: s, end: idx };
    }
  });
  return best;
}

// 按"先括号、再乘除、后加减"的顺序逐步计算，把每一步记录到 steps
function evalTokens(tokens, steps) {
  let cur = tokens.map((t) => Object.assign({}, t));
  let guard = 0;
  while (guard++ < 50) {
    if (cur.length === 1 && cur[0].t === 'num') return cur[0].v;

    const p = findInnermostParens(cur);
    if (p) {
      const inner = cur.slice(p.start + 1, p.end);
      const innerStr = tokensToStr(inner);
      const val = evalTokens(inner, steps);
      if (val === null) return null;
      const before = tokensToStr(cur);
      const next = cur.slice(0, p.start).concat([{ t: 'num', v: val }]).concat(cur.slice(p.end + 1));
      steps.push({
        before: before,
        action: '先算括号内：' + innerStr + ' = ' + fmt(val),
        after: tokensToStr(next)
      });
      cur = next;
      continue;
    }

    let opIdx = -1;
    for (let i = 0; i < cur.length; i++) {
      if (cur[i].t === 'op' && (cur[i].v === '*' || cur[i].v === '/')) {
        opIdx = i;
        break;
      }
    }
    if (opIdx === -1) {
      for (let i = 0; i < cur.length; i++) {
        if (cur[i].t === 'op' && (cur[i].v === '+' || cur[i].v === '-')) {
          opIdx = i;
          break;
        }
      }
    }
    if (opIdx === -1) return cur.length === 1 && cur[0].t === 'num' ? cur[0].v : null;

    const a = cur[opIdx - 1].v;
    const b = cur[opIdx + 1].v;
    const op = cur[opIdx].v;
    if (op === '/' && b === 0) return null;
    let val = op === '*' ? a * b : op === '/' ? a / b : op === '+' ? a + b : a - b;
    val = Math.round(val * 1e6) / 1e6;
    const opStr = op === '*' ? '×' : op === '/' ? '÷' : op;
    const before = tokensToStr(cur);
    const next = cur.slice(0, opIdx - 1).concat([{ t: 'num', v: val }]).concat(cur.slice(opIdx + 2));
    steps.push({
      before: before,
      action: fmt(a) + ' ' + opStr + ' ' + fmt(b) + ' = ' + fmt(val),
      after: tokensToStr(next)
    });
    cur = next;
  }
  return null;
}

// 对外暴露的简单求值：返回数字或 null
function evaluate(exprText) {
  const tokens = tokenize(exprText);
  if (!tokens.length || !tokens.some((t) => t.t === 'op')) return null;
  const steps = [];
  const v = evalTokens(tokens, steps);
  return v === null ? null : v;
}

// 尝试把文字解析成四则混合运算题，失败返回 null
function solveExpression(text) {
  const expr = String(text)
    .replace(/计算[:：]?/g, '')
    .replace(/[=＝?？。\s]/g, '');
  if (!/^[0-9+\-*×÷/()（）.]+$/.test(expr) || expr.length < 3) return null;
  const tokens = tokenize(expr);
  if (!tokens.length || !tokens.some((t) => t.t === 'op')) return null;
  const steps = [];
  const val = evalTokens(tokens, steps);
  if (val === null) return null;

  const build = [];
  build.push({
    title: '① 观察算式',
    content:
      '算式：' + tokensToStr(tokens) +
      '。\n先看运算顺序：有括号先算括号里的，没有括号就先乘除、后加减，同级运算从左到右。'
  });
  steps.forEach((s, i) => {
    build.push({
      title: '第 ' + (i + 2) + ' 步',
      content: '当前算式：' + s.before + '\n' + s.action + '\n得到：' + s.after
    });
  });
  build.push({ title: '写答案', content: '所以答案是：' + fmt(val) + '。' });
  build.push({
    title: '检查',
    content: '把答案代回算式验算一遍，再用估算看看数量级是否合理。✅'
  });

  return {
    source: 'local',
    problem: text,
    knowledge: '四则混合运算',
    answer: val,
    displayAnswer: fmt(val),
    steps: build,
    note: ''
  };
}

// ---------------- 题型库（本地生成器） ----------------

function genMul3x2() {
  const a = rand(132, 289);
  const b = rand(23, 48);
  const ones = b % 10;
  const tens = (b - ones) / 10;
  const p1 = a * ones;
  const p2 = a * tens;
  return {
    id: 'mul3x2',
    name: '三位数乘两位数',
    knowledge: '三位数乘两位数',
    problem: '计算：' + a + ' × ' + b + ' = ?',
    answer: a * b,
    displayAnswer: String(a * b),
    steps: [
      { title: '① 理解题意', content: '这是一道三位数乘两位数的乘法题，要计算 ' + a + ' × ' + b + ' 的积。' },
      { title: '② 拆分两位数', content: '把 ' + b + ' 拆成 ' + tens + '0 和 ' + ones + '：\n' + b + ' = ' + tens + '×10 + ' + ones + '。' },
      { title: '③ 分别相乘', content: '先算 ' + a + ' × ' + ones + ' = ' + p1 + '；\n再算 ' + a + ' × ' + tens + '0 = ' + p2 + '0。' },
      { title: '④ 合并相加', content: '最后把两部分加起来：\n' + p1 + ' + ' + p2 + '0 = ' + (a * b) + '。' },
      {
        title: '⑤ 检查',
        content:
          '估算验证：' + a + '≈' + (a - (a % 10)) + '，' + b + '≈' + (b - (b % 10)) + '，\n' +
          (a - (a % 10)) + ' × ' + (b - (b % 10)) + ' = ' + ((a - (a % 10)) * (b - (b % 10))) +
          '，与结果数量级接近，说明计算合理。✅'
      }
    ]
  };
}

function genDiv2() {
  const d = rand(12, 21);
  const q = rand(12, 45);
  const a = d * q; // 保证整除，被除数是三位数
  const firstGroup = Math.floor(a / 10);
  const q1 = Math.floor(firstGroup / d);
  const rem1 = firstGroup - q1 * d;
  const ones = a % 10;
  const secondGroup = rem1 * 10 + ones;
  const q2 = secondGroup / d;
  const steps = [];
  steps.push({ title: '① 理解题意', content: '计算 ' + a + ' ÷ ' + d + '。除数是两位数，从被除数的高位除起。' });
  if (q1 > 0) {
    steps.push({
      title: '② 试商',
      content:
        '看被除数的前两位 ' + firstGroup + '：\n' + d + ' × ' + q1 + ' = ' + (d * q1) +
        '，' + firstGroup + ' - ' + (d * q1) + ' = ' + rem1 + '，商 ' + q1 + '，余 ' + rem1 + '。'
    });
  } else {
    steps.push({
      title: '② 试商',
      content: '看被除数的前两位 ' + firstGroup + '：' + firstGroup + ' 比 ' + d + ' 小，不够商 1，商 0 占位。'
    });
  }
  steps.push({
    title: '③ 落位再除',
    content:
      '把个位的 ' + ones + ' 落下来，和余数组成 ' + secondGroup + '：\n' +
      d + ' × ' + q2 + ' = ' + secondGroup + '，正好除尽，商 ' + q2 + '。'
  });
  steps.push({ title: '④ 写商', content: '两次商的数字合起来：商是 ' + q + '。' });
  steps.push({
    title: '⑤ 检查',
    content: '验算：' + d + ' × ' + q + ' = ' + a + '，与被除数相同，说明计算正确。✅'
  });
  return {
    id: 'div2',
    name: '除数是两位数的除法',
    knowledge: '除数是两位数的除法',
    problem: '计算：' + a + ' ÷ ' + d + ' = ?',
    answer: q,
    displayAnswer: String(q),
    steps: steps
  };
}

function genMixed() {
  const tpls = [
    () => {
      const a = rand(21, 68);
      const b = rand(11, 29);
      return a * b + ' + ' + a + ' × ' + b;
    },
    () => {
      const a = rand(12, 49);
      const b = rand(11, 29);
      return a * b + rand(30, 500) + ' - ' + a + ' × ' + b;
    },
    () => {
      const a = rand(2, 9);
      const b = rand(21, 69);
      const c = rand(21, 69);
      return '(' + a * b + ' + ' + a * c + ') ÷ ' + a;
    },
    () => rand(2, 9) + ' × ' + rand(3, 9) + ' × ' + rand(2, 9),
    () => {
      const a = rand(120, 480);
      const b = rand(120, 480);
      return a + ' + ' + b + ' - ' + rand(50, a + b - 50);
    }
  ];
  const expr = pick(tpls)();
  const r = solveExpression('计算：' + expr + ' = ?');
  r.id = 'mixed';
  r.name = '四则混合运算';
  r.knowledge = '四则混合运算';
  return r;
}

function genLaw() {
  const kind = pick(['f25', 'f125', 'dist']);
  if (kind === 'f25') {
    const k = rand(3, 12);
    return {
      id: 'law25',
      name: '简便计算',
      knowledge: '运算定律·简算',
      problem: '用简便方法计算：25 × ' + 4 * k + ' = ?',
      answer: 100 * k,
      displayAnswer: String(100 * k),
      steps: [
        { title: '① 观察', content: '想一想：25 和哪个数相乘最方便？答案是 4，因为 25×4=100。' },
        { title: '② 拆数', content: '把 ' + 4 * k + ' 拆成 4×' + k + '：\n25 × ' + 4 * k + ' = 25 × 4 × ' + k + '。' },
        { title: '③ 先凑整', content: '先算 25 × 4 = 100。' },
        { title: '④ 再相乘', content: '100 × ' + k + ' = ' + 100 * k + '。' },
        { title: '⑤ 检查', content: '验算：25 × ' + 4 * k + ' = ' + 25 * 4 * k + '，与简算结果相同。✅' }
      ]
    };
  }
  if (kind === 'f125') {
    const k = rand(3, 11);
    return {
      id: 'law125',
      name: '简便计算',
      knowledge: '运算定律·简算',
      problem: '用简便方法计算：125 × ' + 8 * k + ' = ?',
      answer: 1000 * k,
      displayAnswer: String(1000 * k),
      steps: [
        { title: '① 观察', content: '想一想：125 和哪个数相乘最方便？答案是 8，因为 125×8=1000。' },
        { title: '② 拆数', content: '把 ' + 8 * k + ' 拆成 8×' + k + '：\n125 × ' + 8 * k + ' = 125 × 8 × ' + k + '。' },
        { title: '③ 先凑整', content: '先算 125 × 8 = 1000。' },
        { title: '④ 再相乘', content: '1000 × ' + k + ' = ' + 1000 * k + '。' },
        { title: '⑤ 检查', content: '验算：125 × ' + 8 * k + ' = ' + 125 * 8 * k + '，与简算结果相同。✅' }
      ]
    };
  }
  const b = rand(23, 77);
  const c = 100 - b;
  const a = rand(11, 69);
  return {
    id: 'lawDist',
    name: '简便计算',
    knowledge: '运算定律·简算',
    problem: '用简便方法计算：' + a + ' × ' + b + ' + ' + a + ' × ' + c + ' = ?',
    answer: a * 100,
    displayAnswer: String(a * 100),
    steps: [
      {
        title: '① 观察',
        content: '两个乘法算式里都有 ' + a + '，而且 ' + b + ' + ' + c + ' = 100，可以逆用乘法分配律。'
      },
      { title: '② 逆用分配律', content: a + '×' + b + ' + ' + a + '×' + c + '\n= ' + a + '×(' + b + '+' + c + ')' },
      { title: '③ 先算括号', content: b + ' + ' + c + ' = 100。' },
      { title: '④ 再相乘', content: a + ' × 100 = ' + a * 100 + '。' },
      {
        title: '⑤ 检查',
        content: '验算：' + a * b + ' + ' + a * c + ' = ' + a * 100 + '，结果相同。✅'
      }
    ]
  };
}

function genDecimal() {
  const add = Math.random() < 0.5;
  const ai = rand(2, 9);
  const af = rand(1, 99);
  const bi = rand(1, 8);
  const bf = rand(1, 99);
  const aCents = ai * 100 + af;
  const bCents = bi * 100 + bf;
  const aStr = ai + '.' + pad2(af);
  const bStr = bi + '.' + pad2(bf);

  if (add) {
    const sum = aCents + bCents;
    const sInt = Math.floor(sum / 100);
    const sFrac = sum % 100;
    const ans = sInt + sFrac / 100;
    const carry = af + bf >= 100;
    const calcText = carry
      ? '小数部分 ' + af + ' + ' + bf + ' = ' + (af + bf) + '，满 100 向整数部分进 1。\n整数部分：' + ai + ' + ' + bi + ' + 1 = ' + sInt + '。'
      : '小数部分：' + af + ' + ' + bf + ' = ' + (af + bf) + '。\n整数部分：' + ai + ' + ' + bi + ' = ' + sInt + '。';
    return {
      id: 'decAdd',
      name: '小数加法',
      knowledge: '小数的加法',
      problem: '计算：' + aStr + ' + ' + bStr + ' = ?',
      answer: ans,
      displayAnswer: String(ans),
      steps: [
        { title: '① 对齐', content: '列竖式时把小数点对齐：\n  ' + aStr + '\n+ ' + bStr + '\n（十分位、百分位分别对齐）' },
        { title: '② 逐位相加', content: calcText },
        { title: '③ 写结果', content: '整数部分和小数部分合起来：' + ans + '。' },
        {
          title: '④ 检查',
          content: '用估算验证：' + aStr + '≈' + ai + '，' + bStr + '≈' + bi + '，' + ai + '+' + bi + '=' + (ai + bi) + '，和结果接近。✅'
        }
      ]
    };
  }

  // 减法：保证被减数 > 减数
  let aC = aCents;
  let bC = bCents;
  let aS = aStr;
  let bS = bStr;
  if (aCents < bCents) {
    aC = bCents;
    bC = aCents;
    aS = bStr;
    bS = aStr;
  }
  const ai2 = Math.floor(aC / 100);
  const af2 = aC % 100;
  const bi2 = Math.floor(bC / 100);
  const bf2 = bC % 100;
  const diff = aC - bC;
  const dInt = Math.floor(diff / 100);
  const dFrac = diff % 100;
  const ans = dInt + dFrac / 100;
  const borrow = af2 < bf2;
  const calcText = borrow
    ? '小数部分不够减，向整数部分借 1：\n1.' + pad2(af2) + ' - 0.' + pad2(bf2) + ' = 0.' + pad2(100 + af2 - bf2) + '。\n整数部分：' + ai2 + ' - ' + bi2 + ' - 1 = ' + dInt + '。'
    : '小数部分：' + af2 + ' - ' + bf2 + ' = ' + (af2 - bf2) + '。\n整数部分：' + ai2 + ' - ' + bi2 + ' = ' + dInt + '。';
  return {
    id: 'decSub',
    name: '小数减法',
    knowledge: '小数的减法',
    problem: '计算：' + aS + ' - ' + bS + ' = ?',
    answer: ans,
    displayAnswer: String(ans),
    steps: [
      { title: '① 对齐', content: '列竖式时把小数点对齐：\n  ' + aS + '\n- ' + bS + '\n（十分位、百分位分别对齐）' },
      { title: '② 逐位相减', content: calcText },
      { title: '③ 写结果', content: '整数部分和小数部分合起来：' + ans + '。' },
      { title: '④ 检查', content: '用加法验算：' + bS + ' + ' + ans + ' = ' + aS + '，说明计算正确。✅' }
    ]
  };
}

function genTravel() {
  const v = pick([125, 140, 160, 180, 210, 240]);
  const t = pick([12, 15, 16, 18, 24, 36]);
  return {
    id: 'travel',
    name: '行程问题',
    knowledge: '行程问题·路程',
    problem: '小明骑自行车锻炼，每分钟行 ' + v + ' 米。照这样的速度，' + t + ' 分钟能行多少米？',
    answer: v * t,
    displayAnswer: v * t + ' 米',
    steps: [
      { title: '① 找信息', content: '已知：速度 = ' + v + ' 米/分钟，时间 = ' + t + ' 分钟。\n问题：一共行了多少米（路程）。' },
      { title: '② 想关系', content: '数量关系：路程 = 速度 × 时间。' },
      { title: '③ 列式', content: v + ' × ' + t + ' = ?（米）' },
      { title: '④ 计算', content: v + ' × ' + t + ' = ' + v * t + '（米）' },
      {
        title: '⑤ 检查作答',
        content: '验算：' + v * t + ' ÷ ' + t + ' = ' + v + '，与速度一致。✅\n答：' + t + ' 分钟能行 ' + v * t + ' 米。'
      }
    ]
  };
}

function genShopping() {
  const p = pick([8, 9, 12, 15]);
  const n = pick([4, 5, 6]);
  const total = p * n;
  const change = 100 - total;
  return {
    id: 'shop',
    name: '购物问题',
    knowledge: '购物·总价与找零',
    problem: '一本笔记本 ' + p + ' 元，小丽买了 ' + n + ' 本，付给售货员 100 元，应找回多少元？',
    answer: change,
    displayAnswer: change + ' 元',
    steps: [
      { title: '① 找信息', content: '单价 ' + p + ' 元，数量 ' + n + ' 本，付款 100 元。\n问题：找回多少元。' },
      { title: '② 先求总价', content: '总价 = 单价 × 数量\n' + p + ' × ' + n + ' = ' + total + '（元）' },
      { title: '③ 再求找回', content: '找回 = 付款 - 总价\n100 - ' + total + ' = ' + change + '（元）' },
      {
        title: '④ 检查作答',
        content: '验算：' + total + ' + ' + change + ' = 100，正好等于付款。✅\n答：应找回 ' + change + ' 元。'
      }
    ]
  };
}

function genNorm() {
  const m = pick([3, 4, 5, 6]);
  const t = pick([6, 8]);
  const k = pick([3, 4, 5, 6]);
  const total = m * t * k;
  const p1 = total / m;
  return {
    id: 'norm',
    name: '归一问题',
    knowledge: '归一问题',
    problem: m + ' 台机器 ' + t + ' 小时共加工零件 ' + total + ' 个。平均每台机器每小时加工多少个零件？',
    answer: k,
    displayAnswer: k + ' 个',
    steps: [
      { title: '① 找信息', content: '已知：' + m + ' 台机器，' + t + ' 小时，共 ' + total + ' 个零件。\n问题：1 台机器 1 小时加工多少个。' },
      { title: '② 先求一台机器', content: '1 台机器 ' + t + ' 小时加工：\n' + total + ' ÷ ' + m + ' = ' + p1 + '（个）' },
      { title: '③ 再求一小时', content: '1 台机器 1 小时加工：\n' + p1 + ' ÷ ' + t + ' = ' + k + '（个）' },
      { title: '④ 综合算式', content: '也可以直接写：' + total + ' ÷ ' + m + ' ÷ ' + t + ' = ' + k + '（个）' },
      {
        title: '⑤ 检查作答',
        content: '验算：' + k + ' × ' + t + ' × ' + m + ' = ' + total + '。✅\n答：平均每台机器每小时加工 ' + k + ' 个零件。'
      }
    ]
  };
}

function genAverage() {
  const a = pick([84, 87, 90, 93, 96]);
  const b = pick([84, 87, 90, 93, 96, 99]);
  const c = pick([84, 87, 90, 93, 96]);
  const s = a + b + c;
  const avg = s / 3;
  return {
    id: 'avg',
    name: '平均数',
    knowledge: '平均数',
    problem: '期末考试，小明的语文 ' + a + ' 分，数学 ' + b + ' 分，英语 ' + c + ' 分。三门功课的平均分是多少？',
    answer: avg,
    displayAnswer: avg + ' 分',
    steps: [
      { title: '① 找信息', content: '三科成绩：' + a + '、' + b + '、' + c + '。\n问题：平均分。' },
      { title: '② 想关系', content: '平均分 = 总成绩 ÷ 科目数。' },
      { title: '③ 求总成绩', content: a + ' + ' + b + ' + ' + c + ' = ' + s + '（分）' },
      { title: '④ 求平均', content: s + ' ÷ 3 = ' + avg + '（分）' },
      {
        title: '⑤ 检查作答',
        content: '验算：' + avg + ' × 3 = ' + s + '，正好等于总成绩。✅\n答：平均分是 ' + avg + ' 分。'
      }
    ]
  };
}

function genChickenRabbit() {
  const r = rand(2, 5);
  const h = rand(r + 1, 12);
  const f = 2 * h + 2 * r;
  return {
    id: 'cr',
    name: '鸡兔同笼',
    knowledge: '鸡兔同笼',
    problem: '笼子里有鸡和兔共 ' + h + ' 只，脚共有 ' + f + ' 只。鸡和兔各有多少只？',
    answer: null, // 答案含两个数，用"自我核对"方式
    displayAnswer: '兔 ' + r + ' 只，鸡 ' + (h - r) + ' 只',
    steps: [
      { title: '① 假设', content: '假设笼子里全是鸡，那么脚有：\n2 × ' + h + ' = ' + 2 * h + '（只）' },
      { title: '② 比较', content: '比实际少：' + f + ' - ' + 2 * h + ' = ' + (f - 2 * h) + '（只脚）。\n每只兔比鸡多 2 只脚。' },
      { title: '③ 求兔', content: '兔的只数 = ' + (f - 2 * h) + ' ÷ 2 = ' + r + '（只）' },
      { title: '④ 求鸡', content: '鸡的只数 = ' + h + ' - ' + r + ' = ' + (h - r) + '（只）' },
      {
        title: '⑤ 验算',
        content: '2 × ' + (h - r) + ' + 4 × ' + r + ' = ' + f + '，正好等于总脚数。✅\n答：鸡 ' + (h - r) + ' 只，兔 ' + r + ' 只。'
      }
    ]
  };
}

function genPerimeter() {
  const l = rand(8, 18);
  const w = rand(4, l - 2);
  return {
    id: 'peri',
    name: '长方形周长',
    knowledge: '长方形周长',
    problem: '一块长方形菜地，长 ' + l + ' 米，宽 ' + w + ' 米。这块菜地的周长是多少米？',
    answer: 2 * (l + w),
    displayAnswer: 2 * (l + w) + ' 米',
    steps: [
      { title: '① 想公式', content: '长方形周长 =（长 + 宽）× 2' },
      { title: '② 代入', content: '（' + l + ' + ' + w + '）× 2' },
      {
        title: '③ 计算',
        content: '先算括号：' + l + ' + ' + w + ' = ' + (l + w) + '\n再乘 2：' + (l + w) + ' × 2 = ' + 2 * (l + w) + '（米）'
      },
      {
        title: '④ 检查作答',
        content: '也可以用 长×2 + 宽×2 验算：\n' + 2 * l + ' + ' + 2 * w + ' = ' + (2 * l + 2 * w) + '。✅\n答：周长是 ' + 2 * (l + w) + ' 米。'
      }
    ]
  };
}

function genArea() {
  const l = rand(8, 18);
  const w = rand(4, l - 2);
  return {
    id: 'area',
    name: '长方形面积',
    knowledge: '长方形面积',
    problem: '一间教室地面是长方形，长 ' + l + ' 米，宽 ' + w + ' 米。它的面积是多少平方米？',
    answer: l * w,
    displayAnswer: l * w + ' 平方米',
    steps: [
      { title: '① 想公式', content: '长方形面积 = 长 × 宽' },
      { title: '② 代入', content: l + ' × ' + w + ' = ?（平方米）' },
      { title: '③ 计算', content: l + ' × ' + w + ' = ' + l * w + '（平方米）' },
      {
        title: '④ 检查作答',
        content: '验算：' + w + ' × ' + l + ' = ' + l * w + '，与结果相同。✅\n答：面积是 ' + l * w + ' 平方米。'
      }
    ]
  };
}

const generators = [
  { id: 'mul3x2', g: genMul3x2, w: 2 },
  { id: 'div2', g: genDiv2, w: 2 },
  { id: 'mixed', g: genMixed, w: 2 },
  { id: 'law', g: genLaw, w: 2 },
  { id: 'decimal', g: genDecimal, w: 2 },
  { id: 'travel', g: genTravel, w: 2 },
  { id: 'shop', g: genShopping, w: 1 },
  { id: 'norm', g: genNorm, w: 1 },
  { id: 'avg', g: genAverage, w: 1 },
  { id: 'cr', g: genChickenRabbit, w: 1 },
  { id: 'peri', g: genPerimeter, w: 1 },
  { id: 'area', g: genArea, w: 1 }
];

function generatePractice(excludeId) {
  const pool = excludeId ? generators.filter((x) => x.id !== excludeId) : generators;
  const total = pool.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  let chosen = pool[0];
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i].w;
    if (r <= 0) {
      chosen = pool[i];
      break;
    }
  }
  const p = chosen.g();
  p.source = 'local';
  return p;
}

function sampleProblems(n) {
  const list = [];
  let guard = 0;
  while (list.length < n && guard++ < 30) {
    const p = generatePractice();
    if (!list.some((x) => x.problem === p.problem)) {
      list.push({ problem: p.problem, knowledge: p.knowledge });
    }
  }
  return list;
}

// 通用引导：匹配不到内置题型时的兜底讲解
function genericGuide(text) {
  return {
    source: 'local',
    problem: text,
    knowledge: '综合',
    answer: null,
    displayAnswer: '',
    note: '这道题暂时没匹配到内置题型，可以跟着通用步骤思考，也可以请家长帮忙核对。',
    steps: [
      { title: '① 读题', content: '把题目大声读两遍，圈出数字和关键词语。' },
      { title: '② 找信息', content: '把已知条件写下来，再用波浪线画出题目问的是什么。' },
      { title: '③ 想思路', content: '想一想：这道题要用加法、减法、乘法还是除法？可以画图或画线段图帮忙。' },
      { title: '④ 列式计算', content: '把算式写在草稿纸上，一步一步算出来，注意别漏了单位。' },
      { title: '⑤ 作答检查', content: '把答案写完整，记得写"答"。再检查一遍计算和单位。✅' }
    ]
  };
}

// 根据题目文字求解（本地引擎入口）
function solveText(text) {
  if (!text) return null;
  const t = String(text).trim();

  const expr = solveExpression(t);
  if (expr) return expr;

  // 鸡兔同笼：题目里恰好有两个数字时按（只数、脚数）尝试
  if (/鸡|兔/.test(t) && /脚|腿|头/.test(t)) {
    const nums = t.match(/\d+(\.\d+)?/g);
    if (nums && nums.length === 2) {
      const n1 = parseInt(nums[0], 10);
      const n2 = parseInt(nums[1], 10);
      const h = Math.min(n1, n2);
      const f = Math.max(n1, n2);
      if (f >= 2 * h && (f - 2 * h) % 2 === 0) {
        const r = (f - 2 * h) / 2;
        if (r > 0 && h - r > 0) {
          return {
            source: 'local',
            problem: t,
            knowledge: '鸡兔同笼',
            answer: null,
            displayAnswer: '兔 ' + r + ' 只，鸡 ' + (h - r) + ' 只',
            note: '根据题目中的数字自动识别，请核对题意是否一致。',
            steps: [
              { title: '① 假设', content: '假设全是鸡：2 × ' + h + ' = ' + 2 * h + '（只脚）' },
              { title: '② 比较', content: '比实际少 ' + (f - 2 * h) + ' 只脚，每只兔比鸡多 2 只脚。' },
              { title: '③ 求兔', content: '兔：' + (f - 2 * h) + ' ÷ 2 = ' + r + '（只）' },
              { title: '④ 求鸡', content: '鸡：' + h + ' - ' + r + ' = ' + (h - r) + '（只）' },
              {
                title: '⑤ 验算',
                content: '2×' + (h - r) + ' + 4×' + r + ' = ' + f + ' ✅\n答：鸡 ' + (h - r) + ' 只，兔 ' + r + ' 只。'
              }
            ]
          };
        }
      }
    }
  }

  return genericGuide(t);
}

// ---------------- 变形题生成（本地兜底：同知识点换数字/情境） ----------------

const VARIANT_MAP = {
  '三位数乘两位数': genMul3x2,
  '除数是两位数的除法': genDiv2,
  '四则混合运算': genMixed,
  '运算定律·简算': genLaw,
  '小数的加法': genDecimal,
  '小数的减法': genDecimal,
  '行程问题·路程': genTravel,
  '购物·总价与找零': genShopping,
  '归一问题': genNorm,
  '平均数': genAverage,
  '鸡兔同笼': genChickenRabbit,
  '长方形周长': genPerimeter,
  '长方形面积': genArea
};

// 根据知识点生成一道变形题（换数字/情境，方法与结构不变）；失败返回 null
function variantByKnowledge(knowledge, originalProblem) {
  const gen = VARIANT_MAP[knowledge];
  if (gen) {
    for (let i = 0; i < 10; i++) {
      const p = gen();
      if (p.problem !== originalProblem) {
        p.source = 'local';
        p.variantOf = originalProblem;
        return p;
      }
    }
  }
  // 算式题：保持算式结构，把数字逐一换成邻近的
  const expr = String(originalProblem)
    .replace(/计算[:：]?/g, '')
    .replace(/[=＝?？。\s]/g, '');
  if (/^[0-9+\-*×÷/()（）.]+$/.test(expr)) {
    for (let j = 0; j < 6; j++) {
      const swapped = expr.replace(/(\d+(?:\.\d+)?)/g, (m) => {
        if (m.indexOf('.') > -1) {
          const n = Math.max(0.1, Math.round((parseFloat(m) + rand(1, 9) * 0.1) * 10) / 10);
          return String(n);
        }
        const delta = rand(1, 9) * (Math.random() < 0.5 ? 1 : -1);
        return String(Math.max(2, parseInt(m, 10) + delta));
      });
      if (swapped !== expr) {
        const r = solveExpression('计算：' + swapped + ' = ?');
        if (r) {
          r.source = 'local';
          r.variantOf = originalProblem;
          return r;
        }
      }
    }
  }
  return null;
}

// ---------------- 知识点库（错题重练小课堂的"知识点卡片"，离线可用） ----------------

const KNOWLEDGE_LIB = {
  '三位数乘两位数': {
    desc: '三位数乘两位数，就是把两位数拆成"整十数 + 个位数"，分别去乘，再把两个积加起来。',
    method: '拆 → 乘 → 加：先用个位去乘，再用十位去乘（十位乘出来的积末尾要补 0），最后把两部分加起来。',
    mistakes: '十位乘出来的积，末尾容易忘记补 0。'
  },
  '除数是两位数的除法': {
    desc: '除数是两位数时，先看被除数的前两位；够除就商在那一位上，不够除就多看一位。',
    method: '试商 → 相乘 → 相减 → 落位，这四步循环做，直到除完为止。',
    mistakes: '商的数字容易写错位置（该写在十位却写在个位）。'
  },
  '四则混合运算': {
    desc: '算式里加减乘除混在一起时，不能从左到右乱算，要按运算顺序来。',
    method: '先算括号，再算乘除，最后算加减；同级运算从左到右。',
    mistakes: '把"先乘除后加减"记反了。'
  },
  '运算定律·简算': {
    desc: '有些算式看起来难，但用运算定律"凑整"以后，一下子就能口算出答案。',
    method: '看到 25 就找 4（25×4=100），看到 125 就找 8（125×8=1000）；乘法分配律可以正着用，也可以倒着用。',
    mistakes: '拆数时把数拆错了，或者漏乘了某一项。'
  },
  '小数的加法': {
    desc: '小数加法就是"小数点对齐"的竖式加法，满十照样要进一。',
    method: '小数点对齐 → 从最低位加起 → 满十进一 → 最后点上小数点。',
    mistakes: '小数点没对齐，或者进位之后忘了加 1。'
  },
  '小数的减法': {
    desc: '小数减法同样是"小数点对齐"的竖式减法，不够减就向前借一。',
    method: '小数点对齐 → 从最低位减起 → 不够减向前借 1 → 最后点上小数点。',
    mistakes: '小数部分不够减时，忘了向整数部分借 1。'
  },
  '行程问题·路程': {
    desc: '知道"速度"和"时间"，就能求"路程"，它们之间有一个固定关系。',
    method: '路程 = 速度 × 时间。注意单位要对应：每分钟行多少米，就乘多少分钟。',
    mistakes: '速度和时间的单位没对应（比如每小时和分钟混在一起用）。'
  },
  '购物·总价与找零': {
    desc: '买东西分两步：先算出总价，再用付的钱减去总价，得到找回的钱。',
    method: '总价 = 单价 × 数量；找回 = 付款 − 总价。分两步走，先总价后找回。',
    mistakes: '直接用"付款 − 单价"，忘了先乘数量。'
  },
  '归一问题': {
    desc: '"归一"就是先求出"一份是多少"，再用这一份去求更多份。',
    method: '先用除法求出 1 份（1 台、1 小时），再用乘法求问题。先除后乘。',
    mistakes: '忘了连续除（先除以台数，再除以小时数）。'
  },
  '平均数': {
    desc: '平均数是把总数平均分给几份，让每份一样多。',
    method: '平均数 = 总数 ÷ 份数。先把所有数加起来，再除以一共有几个数。',
    mistakes: '加总时漏加了一个数，或者除错了份数。'
  },
  '鸡兔同笼': {
    desc: '鸡兔同笼用"假设法"：先假设全是鸡，再比较脚的差距，反推出兔的只数。',
    method: '假设全是鸡 → 算脚 → 比实际少几只 → 每只兔比鸡多 2 只脚 → 少的脚数 ÷ 2 = 兔的只数。',
    mistakes: '忘了"每只兔比鸡多 2 只脚"这个关键。'
  },
  '长方形周长': {
    desc: '周长就是围着图形走一圈的长度，长方形有两条长和两条宽。',
    method: '周长 =（长 + 宽）× 2，也可以写成 长×2 + 宽×2。',
    mistakes: '只加了一条长一条宽，忘了乘 2。'
  },
  '长方形面积': {
    desc: '面积是图形"占的地方有多大"，长方形的面积就是长乘宽。',
    method: '面积 = 长 × 宽。单位是"平方米"，记得写对。',
    mistakes: '把面积和周长搞混了；单位写错（"米"和"平方米"不一样）。'
  },
  '综合': {
    desc: '这道题需要把学过的知识综合起来用，一步一步来就能解决。',
    method: '读题找信息 → 想数量关系 → 列式 → 计算 → 检查作答。',
    mistakes: '急着列式，没看清题目问的是什么。'
  }
};

function getKnowledge(name) {
  return KNOWLEDGE_LIB[name] || KNOWLEDGE_LIB['综合'];
}

// 按知识点定向出题（掌握度薄弱优先练习用）；无匹配时退回随机题
function generateByKnowledge(knowledge) {
  const gen = VARIANT_MAP[knowledge];
  if (gen) {
    // 小数的加法/减法共用同一生成器，重试直到命中对应知识点
    for (let i = 0; i < 10; i++) {
      const p = gen();
      if (p.knowledge === knowledge) {
        p.source = 'local';
        return p;
      }
    }
    const p = gen();
    p.source = 'local';
    return p;
  }
  return generatePractice();
}

const solverApi = {
  solveText: solveText,
  generatePractice: generatePractice,
  generateByKnowledge: generateByKnowledge,
  sampleProblems: sampleProblems,
  evaluate: evaluate,
  genericGuide: genericGuide,
  variantByKnowledge: variantByKnowledge,
  getKnowledge: getKnowledge
};

// 通用导出：Node / 微信小程序用 require，浏览器 <script> 用 window.Solver
if (typeof module !== 'undefined' && module.exports) {
  module.exports = solverApi;
}
if (typeof window !== 'undefined') {
  window.Solver = solverApi;
}
