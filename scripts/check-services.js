// 服务层单测：node scripts/check-services.js
// 覆盖：deformService（规则校验/过滤/兜底）、reportService（去焦虑/回退）、
// rateLimit（限流）、db.computeMastery（时间衰减掌握度）

const deform = require('../server/services/deformService');
const report = require('../server/services/reportService');
const rateLimit = require('../server/rateLimit');
const { computeMastery } = require('../server/db');

let fail = 0;
const assert = (c, m) => {
  if (!c) {
    fail++;
    console.log('✗ ' + m);
  }
};

(async () => {
  // ---------- deformService ----------
  assert(deform.validate('小明买了 3 支笔，每支 2 元，一共多少元？', 6, '购物·总价与找零', '小明买 5 支笔每支 2 元') === true, '合法变形题应通过');
  assert(deform.validate('有 999 个苹果', 999, '综合', '小明有 5 个苹果') === false, '数字超原题应拒绝');
  assert(deform.validate('有 3 个苹果', undefined, '综合', '小明有 5 个苹果') === false, '缺答案应拒绝');

  const fakeChat = async () => JSON.stringify([
    { stem: '小松鼠捡了 35 颗松果，又捡了 27 颗，一共几颗？', answer: 62, knowledge_point: '购物·总价与找零', difficulty: 'medium' },
    { stem: '小兔子有 999 根胡萝卜，又拔了 888 根，一共几根？', answer: 1887, knowledge_point: '购物·总价与找零', difficulty: 'medium' },
    { stem: '小猫钓了 12 条鱼，又钓了 9 条，一共几条？', answer: null, knowledge_point: '购物·总价与找零', difficulty: 'medium' },
    { stem: '小鹿采了 20 朵花，送人 15 朵，还剩几朵？', answer: 5, knowledge_point: '购物·总价与找零', difficulty: 'medium' }
  ]);
  const vs = await deform.generateVariants(fakeChat, { problem: '小明买了 35 个面包，又买了 27 个，一共几个？', knowledge: '购物·总价与找零' });
  assert(vs.length === 2, '变形题应过滤后剩 2 道，实际 ' + vs.length);
  assert(vs.every((v) => v.stem && v.answer !== null && v.knowledge_point && v.difficulty), '输出字段应齐全');

  const v2 = await deform.generateVariants(null, { problem: '计算：25×4+30 = ?', knowledge: '四则混合运算' });
  assert(v2.length >= 1 && v2[0].stem !== '计算：25×4+30 = ?', '无模型应本地兜底出新题');

  const v3 = await deform.generateVariants(async () => { throw new Error('boom'); }, { problem: '一块长方形菜地，长 17 米，宽 5 米。这块菜地的周长是多少米？', knowledge: '长方形周长' });
  assert(v3.length >= 1 && v3[0].knowledge_point === '长方形周长', '模型异常应回退本地生成器');

  // ---------- reportService ----------
  const facts = report.buildFacts('u1', '小明', [
    { event_type: 'answer_wrong', knowledge_point: '小数的加法' },
    { event_type: 'after_wrong_retry', knowledge_point: '小数的加法' },
    { event_type: 'answer_correct', knowledge_point: '小数的加法' },
    { event_type: 'deformation_correct', knowledge_point: '小数的加法' }
  ], [{ status: 'active', problem: '计算：3.6+2.75=?', myAnswer: '6.1', rightAnswer: '6.35', knowledge: '小数的加法' }]);
  assert(facts.retries === 1 && facts.wrongKnowledgeList.length === 1, '事实汇总应正确');
  assert(facts.periodLabel === '今天', '默认时间范围应为今天');

  const fb = await report.generateReport(null, facts);
  assert(fb.translated_report && fb.communication_script, '兜底报告字段齐全');
  assert(!/正确率|%/.test(fb.translated_report), '兜底报告不得含冷数据');
  assert(/不要问"做对了几道"/.test(fb.communication_script), '脚本应提醒不要问做对几道');

  const bad = async () => '今天天气不错。';
  const r3 = await report.generateReport(bad, facts);
  assert(r3.translated_report && r3.translated_report !== '今天天气不错。', '坏 JSON 应回退兜底');

  const none = await report.generateReport(null, report.buildFacts('u2', '小红', [], [], { periodLabel: '最近 7 天' }));
  assert(none.translated_report.indexOf('最近 7 天') > -1, '无记录报告应带时间段称呼');

  // ---------- rateLimit ----------
  let ok = 0;
  for (let i = 0; i < 25; i++) if (rateLimit.allow('unit|test', 3, 60000)) ok++;
  assert(ok === 3, '限流器 3 次/分钟 应放行 3 次，实际 ' + ok);

  // ---------- computeMastery ----------
  const now = new Date();
  const iso = (daysAgo) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
  const m1 = computeMastery([
    { event_type: 'answer_wrong', knowledge_point: '小数的加法', created_at: iso(0) },
    { event_type: 'answer_wrong', knowledge_point: '小数的加法', created_at: iso(0) }
  ]);
  assert(m1.length === 1 && m1[0].score < 50, '连错应拉低掌握度（<50），实际 ' + (m1[0] && m1[0].score));

  const m2 = computeMastery([
    { event_type: 'answer_wrong', knowledge_point: '小数的加法', created_at: iso(20) },
    { event_type: 'answer_correct', knowledge_point: '小数的加法', created_at: iso(0) },
    { event_type: 'answer_correct', knowledge_point: '小数的加法', created_at: iso(0) },
    { event_type: 'deformation_correct', knowledge_point: '小数的加法', created_at: iso(0) }
  ]);
  assert(m2.length === 1 && m2[0].score > 60, '近期连对应明显回升（>60），实际 ' + m2[0].score);
  assert(m2[0].attempts === 4, '尝试次数应统计正确');

  const m3 = computeMastery([
    { event_type: 'answer_wrong', knowledge_point: '长方形周长', created_at: iso(0) },
    { event_type: 'answer_correct', knowledge_point: '四则混合运算', created_at: iso(0) }
  ]);
  assert(m3.length === 2 && m3[0].knowledge_point === '长方形周长', '薄弱知识点应排在最前');

  console.log(fail ? '❌ 存在 ' + fail + ' 个问题' : '✅ 服务层单测全部通过');
  process.exit(fail ? 1 : 0);
})();
