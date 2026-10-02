// utils/mcq.js — 选择题题型库（零依赖，小程序 require / 网页 <script> 共用）
// 两部分：1) 四上/四下新概念题型（大数、单位、角、垂平、小数性质、三角形、对称）
//        2) 把现有填空题包装成选择题（答案 + 三个干扰项，随机打乱）
// 输出统一为：{ problem, options[], answerIndex, answerValue, displayAnswer, knowledge, steps, mcq:true }
// 注意：整体包在 IIFE 里，避免顶层 const 与 solver.js 等经典脚本的全局作用域冲突

(function () {
'use strict';

// 延迟解析 solver：mcq.js 可能先于 solver.js 加载（浏览器 script 顺序），
// 因此不能在加载期捕获 window.Solver，必须在调用时获取
function getSolver() {
  if (typeof module !== 'undefined' && module.exports) {
    return require('./solver');
  }
  return typeof window !== 'undefined' ? window.Solver : null;
}

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function round2(n) { return Math.round(n * 100) / 100; }

// 数字答案的干扰项（常见错误：±1、±10、×10、÷10）
function numericOptions(answer) {
  const set = new Set([round2(answer)]);
  const cands = [];
  [answer + 1, answer - 1, answer + 10, answer * 10, answer / 10, answer + 2]
    .forEach((v) => {
      const r = round2(v);
      if (r !== round2(answer) && !set.has(r) && r > 0) {
        set.add(r);
        cands.push(r);
      }
    });
  return cands.slice(0, 3);
}

// 把现有填空题包装成选择题
function wrapMcq(p) {
  let options;
  let answerIndex;
  if (p.answer !== null && p.answer !== undefined && typeof p.answer === 'number') {
    options = shuffle([round2(p.answer)].concat(numericOptions(p.answer)));
    answerIndex = options.indexOf(round2(p.answer));
  } else {
    const ans = p.displayAnswer || '见步骤';
    options = shuffle([ans, '无法确定', '答案不唯一', '以上都不对']);
    answerIndex = options.indexOf(ans);
  }
  return {
    problem: p.problem,
    options: options,
    answerIndex: answerIndex,
    answerValue: p.answer,
    displayAnswer: p.displayAnswer || String(p.answer),
    knowledge: p.knowledge,
    steps: p.steps || [],
    id: p.id || 'mcq',
    mcq: true
  };
}

// ---------------- 概念型新题型 ----------------

// 中文读数（0 ~ 1 亿以内）
function toChineseNum(n) {
  if (n === 0) return '零';
  const digits = '零一二三四五六七八九';
  const units = ['', '十', '百', '千'];
  const big = ['', '万', '亿'];
  const groups = [];
  let num = n;
  while (num > 0) {
    groups.push(num % 10000);
    num = Math.floor(num / 10000);
  }
  let s = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const v = groups[i];
    if (v === 0) continue;
    let part = '';
    let innerZero = false;
    for (let j = 3; j >= 0; j--) {
      const d = Math.floor(v / Math.pow(10, j)) % 10;
      if (d === 0) {
        if (part) innerZero = true; // 前导 0 不触发"零"
        continue;
      }
      if (innerZero) part += '零';
      innerZero = false;
      part += digits[d] + units[j];
    }
    // 组间补零：本组千位为 0 且前面已有内容时补零（如 10001 → 一万零一）
    if (s && v < 1000) part = '零' + part;
    s += part + big[i];
  }
  return s;
}

function mcq(knowledge, problem, options, answerIndex, steps, answerValue) {
  return {
    problem: problem,
    options: options,
    answerIndex: answerIndex,
    answerValue: answerValue !== undefined ? answerValue : null,
    displayAnswer: String(options[answerIndex]),
    knowledge: knowledge,
    steps: steps,
    id: 'mcq-concept',
    mcq: true
  };
}

const CONCEPT_STEPS_COMMON = [
  { title: '① 读题', content: '先读懂题目问的是什么，圈出关键信息。' }
];

function genBigNumber() {
  const kind = pick(['read', 'compare', 'round']);
  if (kind === 'read') {
    const a = rand(100, 999);
    const b = pick([4050, 3005, 8060, 5300, 2009, 6500, 709, 4006]);
    const n = a * 10000 + b;
    const right = toChineseNum(n);
    const wrongs = [];
    [n + 1000, n + 100, n + 1, n - 10].forEach((v) => {
      const r = toChineseNum(Math.max(0, v));
      if (r !== right && wrongs.indexOf(r) < 0) wrongs.push(r);
    });
    const options = shuffle([right].concat(wrongs.slice(0, 3)));
    return mcq('大数的认识',
      n + ' 读作什么？',
      options,
      options.indexOf(right),
      [
        { title: '① 分级', content: '从个位起每四位分一级：' + n + ' 分成"万级"和"个级"。' },
        { title: '② 读万级', content: '万级是 ' + a + '，读作"' + toChineseNum(a) + '万"。' },
        { title: '③ 读个级', content: '个级是 ' + b + '，读作"' + toChineseNum(b) + '"。' },
        { title: '④ 注意零', content: '每级末尾的 0 都不读；中间连续几个 0 只读一个"零"。' },
        { title: '⑤ 作答', content: '所以读作：' + right + '。' }
      ]);
  }
  if (kind === 'compare') {
    const a = rand(1000000, 9000000);
    const b = a + rand(1000, 9000) * pick([1, -1, 10, -10]);
    const bb = Math.max(100000, b);
    const cmp = a > bb ? '＞' : a < bb ? '＜' : '＝';
    const options = shuffle(['＞', '＜', '＝', '无法比较']);
    return mcq('大数的认识',
      '比较大小：' + a + ' ○ ' + bb,
      options,
      options.indexOf(cmp),
      [
        { title: '① 对齐数位', content: '两个数位数相同，从最高位比起。' },
        { title: '② 逐位比较', content: '最高位大的数就大；相同就看下一位。' },
        { title: '③ 作答', content: a + ' 和 ' + bb + ' 相比，结果是 ' + cmp + '。' }
      ]);
  }
  const n = rand(100000, 990000);
  const right = Math.round(n / 10000) * 10000;
  const options = shuffle([right].concat(numericOptions(right)));
  return mcq('大数的认识',
    '把 ' + n + ' 四舍五入到万位，约是多少？',
    options,
    options.indexOf(right),
    [
      { title: '① 找万位', content: n + ' 的万位是 ' + Math.floor(n / 10000) % 10 + '（从右往左第 5 位）。' },
      { title: '② 看下一位', content: '看千位上的数字：' + (Math.floor(n / 1000) % 10) + '，小于 5 舍去，大于等于 5 进一。' },
      { title: '③ 作答', content: '所以约等于 ' + right + '。' }
    ]);
}

function genAreaUnit() {
  const kind = pick(['ha', 'km2']);
  if (kind === 'ha') {
    const n = pick([2, 3, 5, 6, 8, 10, 12]);
    const right = n * 10000;
    return mcq('公顷和平方千米',
      n + ' 公顷 = （ ）平方米',
      shuffle([right].concat(numericOptions(right))),
      0,
      [
        { title: '① 想进率', content: '1 公顷 = 10000 平方米。' },
        { title: '② 计算', content: n + ' × 10000 = ' + right + '（平方米）。' },
        { title: '③ 作答', content: '所以 ' + n + ' 公顷 = ' + right + ' 平方米。' }
      ]);
  }
  const n = pick([2, 3, 4, 5, 7, 9]);
  const right = n * 100;
  return mcq('公顷和平方千米',
    n + ' 平方千米 = （ ）公顷',
    shuffle([right].concat(numericOptions(right))),
    0,
    [
      { title: '① 想进率', content: '1 平方千米 = 100 公顷。' },
      { title: '② 计算', content: n + ' × 100 = ' + right + '（公顷）。' },
      { title: '③ 作答', content: '所以 ' + n + ' 平方千米 = ' + right + ' 公顷。' }
    ]);
}

function genAngle() {
  const kind = pick(['classify', 'clock', 'straight']);
  if (kind === 'classify') {
    const deg = pick([30, 45, 60, 75, 88, 90, 91, 120, 150, 175, 180]);
    const ans = deg < 90 ? '锐角' : deg === 90 ? '直角' : deg === 180 ? '平角' : '钝角';
    const options = shuffle([ans, '锐角', '直角', '钝角'].filter((v, i, a) => a.indexOf(v) === i));
    return mcq('角的度量',
      deg + '° 的角是什么角？',
      options,
      options.indexOf(ans),
      [
        { title: '① 想分类', content: '小于 90° 是锐角；等于 90° 是直角；大于 90° 且小于 180° 是钝角。' },
        { title: '② 判断', content: deg + '°' + (deg < 90 ? ' 小于 90°' : deg === 90 ? ' 正好等于 90°' : deg === 180 ? ' 正好等于 180°' : ' 在 90° 和 180° 之间') + '。' },
        { title: '③ 作答', content: '所以是' + ans + '。' }
      ]);
  }
  if (kind === 'clock') {
    const h = pick([3, 6, 9, 12]);
    const ans = h === 3 || h === 9 ? '直角' : '平角';
    const options = shuffle([ans, '锐角', '钝角', '周角'].filter((v, i, a) => a.indexOf(v) === i));
    return mcq('角的度量',
      '钟面上 ' + h + ' 时整，时针和分针组成的角是什么角？',
      options,
      options.indexOf(ans),
      [
        { title: '① 想钟面', content: '钟面一圈 360°，分成 12 大格，每大格 30°。' },
        { title: '② 算角度', content: h + ' 时整，时针和分针相隔 ' + (h === 6 || h === 12 ? 6 : 3) + ' 大格，' + (h === 6 || h === 12 ? 6 : 3) + '×30°=' + (h === 6 || h === 12 ? 180 : 90) + '°。' },
        { title: '③ 作答', content: (h === 6 || h === 12 ? 180 : 90) + '° 是' + ans + '。' }
      ]);
  }
  const options = shuffle(['平角', '周角', '直角', '钝角'].filter((v, i, a) => a.indexOf(v) === i));
  return mcq('角的度量',
    '一条射线绕它的端点旋转一周，形成的角是什么角？',
    options,
    options.indexOf('周角'),
    [
      { title: '① 想定义', content: '射线旋转一周是 360°，这个角叫周角。' },
      { title: '② 对比', content: '180° 是平角，90° 是直角，360° 是周角。' },
      { title: '③ 作答', content: '旋转一周形成的是周角。' }
    ]);
}

function genPerpParallel() {
  const kind = pick(['board', 'cross']);
  if (kind === 'board') {
    const options = shuffle(['互相平行', '互相垂直', '相交成锐角', '无法确定']);
    return mcq('垂直与平行',
      '长方形黑板的两条对边是什么关系？',
      options,
      options.indexOf('互相平行'),
      [
        { title: '① 想定义', content: '同一平面内不相交的两条直线叫平行线。' },
        { title: '② 观察', content: '黑板的两条对边永远不相交，所以互相平行。' },
        { title: '③ 作答', content: '对边的关系是互相平行。' }
      ]);
  }
  const options = shuffle(['互相垂直', '互相平行', '相交成锐角', '重合']);
  return mcq('垂直与平行',
    '两条直线相交成直角，这两条直线是什么关系？',
    options,
    options.indexOf('互相垂直'),
    [
      { title: '① 想定义', content: '相交成直角的两条直线互相垂直。' },
      { title: '② 判断', content: '题目说相交成直角，正好符合垂直的定义。' },
      { title: '③ 作答', content: '它们是互相垂直的关系。' }
    ]);
}

function genDecimalConcept() {
  const kind = pick(['count', 'move', 'compare']);
  if (kind === 'count') {
    const n = pick([3, 4, 6, 7, 8, 9]);
    const right = n * 10;
    const options = shuffle([right].concat(numericOptions(right)));
    return mcq('小数的意义和性质',
      '0.' + n + ' 里面有（ ）个 0.01',
      options,
      options.indexOf(right),
      [
        { title: '① 想单位', content: '0.01 是百分之一，0.' + n + ' 就是百分之 ' + n + '0。' },
        { title: '② 计算', content: '百分之 ' + n + '0 ÷ 百分之一 = ' + right + '。' },
        { title: '③ 作答', content: '所以 0.' + n + ' 里有 ' + right + ' 个 0.01。' }
      ]);
  }
  if (kind === 'move') {
    const options = shuffle(['扩大到原来的 100 倍', '扩大到原来的 10 倍', '缩小到原来的 1/10', '大小不变']);
    return mcq('小数的意义和性质',
      '把 3.05 的小数点去掉，这个数就（ ）',
      options,
      options.indexOf('扩大到原来的 100 倍'),
      [
        { title: '① 观察', content: '3.05 去掉小数点变成 305。' },
        { title: '② 对比', content: '305 ÷ 3.05 = 100，所以扩大到原来的 100 倍。' },
        { title: '③ 作答', content: '小数点向右移动两位，扩大到 100 倍。' }
      ]);
  }
  const a = rand(1, 9) / 10 + rand(0, 9) / 100; // 如 0.35
  const b = rand(1, 9) / 10; // 如 0.4
  const aStr = String(round2(a));
  const bStr = String(round2(b));
  const cmp = a < b ? aStr + ' ＜ ' + bStr : a > b ? aStr + ' ＞ ' + bStr : aStr + ' ＝ ' + bStr;
  const options = shuffle([
    cmp,
    aStr + ' ＞ ' + bStr,
    aStr + ' ＝ ' + bStr,
    '无法比较'
  ].filter((v, i, arr) => arr.indexOf(v) === i));
  return mcq('小数的意义和性质',
    '比较大小：' + aStr + ' ○ ' + bStr,
    options,
    options.indexOf(cmp),
    [
      { title: '① 对齐比较', content: '先比较整数部分，都是 0；再看十分位：' + aStr + ' 的十分位是 ' + String(aStr)[2] + '，' + bStr + ' 的十分位是 ' + String(bStr)[2] + '。' },
      { title: '② 判断', content: '十分位大的那个数就大。' },
      { title: '③ 作答', content: '所以 ' + cmp + '。' }
    ]);
}

function genTriangle() {
  const kind = pick(['angle', 'sides']);
  if (kind === 'angle') {
    const a = pick([30, 40, 50, 60, 70, 80]);
    const b = pick([30, 40, 50, 60]);
    const right = 180 - a - b;
    const options = shuffle([right].concat(numericOptions(right)));
    return mcq('三角形',
      '一个三角形的两个内角分别是 ' + a + '° 和 ' + b + '°，第三个角是多少度？',
      options,
      options.indexOf(right),
      [
        { title: '① 想内角和', content: '三角形三个内角的和永远是 180°。' },
        { title: '② 计算', content: '180 - ' + a + ' - ' + b + ' = ' + right + '°。' },
        { title: '③ 作答', content: '第三个角是 ' + right + '°。' }
      ]);
  }
  const options = shuffle(['5cm、5cm、5cm', '3cm、4cm、8cm', '2cm、3cm、6cm', '1cm、4cm、6cm']);
  return mcq('三角形',
    '下面哪组小棒能围成一个三角形？',
    options,
    options.indexOf('5cm、5cm、5cm'),
    [
      { title: '① 想规则', content: '三角形任意两边之和要大于第三边。' },
      { title: '② 逐一检查', content: '3+4=7＜8 不行；2+3=5＜6 不行；1+4=5＜6 不行；5+5=10＞5 可以。' },
      { title: '③ 作答', content: '所以 5cm、5cm、5cm 能围成三角形。' }
    ]);
}

function genSymmetry() {
  const kind = pick(['figure', 'count']);
  if (kind === 'figure') {
    const options = shuffle(['等腰三角形', '平行四边形', '普通三角形', '普通梯形']);
    return mcq('图形的运动',
      '下面图形中，一定是轴对称图形的是？',
      options,
      options.indexOf('等腰三角形'),
      [
        { title: '① 想定义', content: '对折后两边能完全重合的图形是轴对称图形。' },
        { title: '② 逐一判断', content: '等腰三角形沿高对折能重合；普通三角形、普通梯形、平行四边形（一般）都不能。' },
        { title: '③ 作答', content: '一定是轴对称图形的是等腰三角形。' }
      ]);
  }
  const options = shuffle(['2 条', '1 条', '4 条', '无数条']);
  return mcq('图形的运动',
    '长方形有（ ）条对称轴',
    options,
    options.indexOf('2 条'),
    [
      { title: '① 想折法', content: '长方形可以沿"两条对边中点的连线"对折，横竖各一条。' },
      { title: '② 数一数', content: '横向一条、纵向一条，共 2 条。' },
      { title: '③ 作答', content: '长方形有 2 条对称轴。' }
    ]);
}

function genNegativeNumber() {
  const kind = pick(['record', 'compare']);
  if (kind === 'record') {
    const t = pick([2, 3, 5, 7, 8, 10, 12]);
    const options = shuffle(['-' + t + '℃', '+' + t + '℃', t + '℃', '0℃']);
    return mcq('正负数',
      '零上 ' + t + '℃ 记作 +' + t + '℃，那么零下 ' + t + '℃ 记作什么？',
      options,
      options.indexOf('-' + t + '℃'),
      [
        { title: '① 想规定', content: '我们规定：零上的温度用正数表示，零下的温度用负数表示。' },
        { title: '② 对应', content: '零上 ' + t + '℃ 是 +' + t + '℃，零下 ' + t + '℃ 就是 -' + t + '℃。' },
        { title: '③ 作答', content: '所以记作 -' + t + '℃。' }
      ]);
  }
  const a = pick([2, 3, 4, 5, 6, 8]);
  const b = pick([1, 2, 3, 5, 7, 9]);
  const cmp = (-a) < (-b) ? '-' + a + ' ＜ -' + b : '-' + a + ' ＞ -' + b;
  const options = shuffle([
    cmp,
    '-' + a + ' ＞ -' + b,
    '-' + a + ' ＝ -' + b,
    '无法比较'
  ].filter((v, i, arr) => arr.indexOf(v) === i));
  return mcq('正负数',
    '比较大小：-' + a + ' ○ -' + b,
    options,
    options.indexOf(cmp),
    [
      { title: '① 想数轴', content: '负数在 0 的左边，离 0 越远反而越小。' },
      { title: '② 比较', content: a + ' 比 ' + b + ' 离 0 更' + (a > b ? '远' : '近') + '，所以 -' + a + ' 更' + (a > b ? '小' : '大') + '。' },
      { title: '③ 作答', content: '所以 ' + cmp + '。' }
    ]);
}

function genDecimalMultiply() {
  const kind = pick(['move', 'multi']);
  if (kind === 'move') {
    const n = pick([12, 25, 36, 48, 57, 64]);
    const d = pick([10, 100]);
    const right = round2(n * d);
    const options = shuffle([right].concat(numericOptions(right)));
    return mcq('小数乘法',
      n + ' × ' + d + ' = （ ）',
      options,
      options.indexOf(right),
      [
        { title: '① 想规律', content: '乘 10，小数点向右移动一位；乘 100，向右移动两位。' },
        { title: '② 移动', content: n + ' × ' + d + '，小数点向右移动 ' + (d === 10 ? '一' : '两') + ' 位，得到 ' + right + '。' },
        { title: '③ 作答', content: '所以结果是 ' + right + '。' }
      ]);
  }
  const a = pick([2, 3, 4, 5]) / 10;
  const b = pick([2, 3, 4, 5, 6, 7]) / 10;
  const right = round2(a * b);
  const options = shuffle([right].concat(numericOptions(right)));
  return mcq('小数乘法',
    round2(a) + ' × ' + round2(b) + ' = （ ）',
    options,
    options.indexOf(right),
    [
      { title: '① 先当整数算', content: '把小数看成整数：' + (a * 10) + ' × ' + (b * 10) + ' = ' + round2(a * 10 * b * 10) + '。' },
      { title: '② 点小数点', content: '两个因数一共有两位小数，积也有两位小数：' + right + '。' },
      { title: '③ 作答', content: '所以结果是 ' + right + '。' }
    ]);
}

function genSimpleEquation() {
  const kind = pick(['add', 'sub', 'mul']);
  let problem;
  let right;
  let steps;
  if (kind === 'add') {
    const a = pick([12, 15, 18, 21, 24, 27]);
    const s = pick([30, 40, 45, 50, 60]);
    right = s - a;
    problem = '解方程：x + ' + a + ' = ' + s;
    steps = [
      { title: '① 想原理', content: '等式的两边同时减去同一个数，等式仍然成立。' },
      { title: '② 两边同减', content: 'x + ' + a + ' - ' + a + ' = ' + s + ' - ' + a },
      { title: '③ 作答', content: 'x = ' + right + '。' }
    ];
  } else if (kind === 'sub') {
    const a = pick([5, 7, 8, 9, 12]);
    const s = pick([20, 25, 30, 40, 50]);
    right = s + a;
    problem = '解方程：x - ' + a + ' = ' + s;
    steps = [
      { title: '① 想原理', content: '等式的两边同时加上同一个数，等式仍然成立。' },
      { title: '② 两边同加', content: 'x - ' + a + ' + ' + a + ' = ' + s + ' + ' + a },
      { title: '③ 作答', content: 'x = ' + right + '。' }
    ];
  } else {
    const m = pick([2, 3, 4, 5, 6]);
    const p = pick([5, 6, 7, 8, 9]);
    right = m * p;
    problem = '解方程：x ÷ ' + m + ' = ' + p;
    steps = [
      { title: '① 想原理', content: '等式的两边同时乘同一个数，等式仍然成立。' },
      { title: '② 两边同乘', content: 'x ÷ ' + m + ' × ' + m + ' = ' + p + ' × ' + m },
      { title: '③ 作答', content: 'x = ' + right + '。' }
    ];
  }
  const options = shuffle([right].concat(numericOptions(right)));
  return mcq('简易方程', problem, options, options.indexOf(right), steps);
}

const CONCEPT_BANK = {
  '大数的认识': genBigNumber,
  '公顷和平方千米': genAreaUnit,
  '角的度量': genAngle,
  '垂直与平行': genPerpParallel,
  '小数的意义和性质': genDecimalConcept,
  '三角形': genTriangle,
  '图形的运动': genSymmetry,
  '正负数': genNegativeNumber,
  '小数乘法': genDecimalMultiply,
  '简易方程': genSimpleEquation
};

// 随机出一题选择题：50% 概念新题型 + 50% 包装现有题型
function generateMcq(excludeId, difficulty) {
  if (Math.random() < 0.5) {
    const keys = Object.keys(CONCEPT_BANK);
    return CONCEPT_BANK[pick(keys)]();
  }
  const p = getSolver().generatePractice(excludeId, difficulty);
  return wrapMcq(p);
}

// 按知识点出选择题：概念库有则用概念题，否则包装现有题型
function generateMcqByKnowledge(knowledge, difficulty) {
  const gen = CONCEPT_BANK[knowledge];
  if (gen) return gen();
  const p = getSolver().generateByKnowledge(knowledge, difficulty);
  return wrapMcq(p);
}

const mcqApi = {
  generateMcq: generateMcq,
  generateMcqByKnowledge: generateMcqByKnowledge,
  wrapMcq: wrapMcq,
  toChineseNum: toChineseNum,
  CONCEPT_BANK: CONCEPT_BANK,
  // 该知识点是否只有概念选择题（无填空生成器，出题时必须用选择题）
  isConcept: function (knowledge) {
    return !!CONCEPT_BANK[knowledge];
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mcqApi;
}
if (typeof window !== 'undefined') {
  window.MCQ = mcqApi;
}

})();
