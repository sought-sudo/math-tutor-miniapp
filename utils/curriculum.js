// utils/curriculum.js — 人教版四年级教材同步目录（纯数据，小程序 require / 网页 <script> 共用）
// 单元 → 本项目知识点映射，覆盖全部 12 类题型

const CURRICULUM = [
  {
    id: 'A4',
    book: '人教版四年级上册',
    unit: '第 4 单元',
    title: '三位数乘两位数',
    knowledge: ['三位数乘两位数', '行程问题·路程']
  },
  {
    id: 'A5',
    book: '人教版四年级上册',
    unit: '第 5 单元',
    title: '平行四边形和梯形',
    knowledge: ['长方形周长', '长方形面积']
  },
  {
    id: 'A6',
    book: '人教版四年级上册',
    unit: '第 6 单元',
    title: '除数是两位数的除法',
    knowledge: ['除数是两位数的除法']
  },
  {
    id: 'B1',
    book: '人教版四年级下册',
    unit: '第 1 单元',
    title: '四则运算',
    knowledge: ['四则混合运算', '购物·总价与找零', '归一问题']
  },
  {
    id: 'B3',
    book: '人教版四年级下册',
    unit: '第 3 单元',
    title: '运算定律',
    knowledge: ['运算定律·简算']
  },
  {
    id: 'B6',
    book: '人教版四年级下册',
    unit: '第 6 单元',
    title: '小数的加法和减法',
    knowledge: ['小数的加法', '小数的减法']
  },
  {
    id: 'B8',
    book: '人教版四年级下册',
    unit: '第 8 单元',
    title: '平均数与条形统计图',
    knowledge: ['平均数']
  },
  {
    id: 'B9',
    book: '人教版四年级下册',
    unit: '第 9 单元',
    title: '数学广角——鸡兔同笼',
    knowledge: ['鸡兔同笼']
  }
];

function unitById(id) {
  return CURRICULUM.find((u) => u.id === id) || null;
}

// 单元显示名，如"四上 · 第 4 单元 三位数乘两位数"
function unitLabel(id) {
  const u = unitById(id);
  if (!u) return '';
  return (u.book.indexOf('上册') > -1 ? '四上' : '四下') + ' · ' + u.unit + ' ' + u.title;
}

const curriculumApi = {
  CURRICULUM: CURRICULUM,
  unitById: unitById,
  unitLabel: unitLabel
};

// 通用导出：Node / 微信小程序 require，浏览器 <script> 用 window.Curriculum
if (typeof module !== 'undefined' && module.exports) {
  module.exports = curriculumApi;
}
if (typeof window !== 'undefined') {
  window.Curriculum = curriculumApi;
}
