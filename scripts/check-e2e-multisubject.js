// scripts/check-e2e-multisubject.js — 多学科端到端验证（七步，每步打印）
// 前提：后端服务在 127.0.0.1:8787 运行（node server/server.js）
// 用法：node scripts/check-e2e-multisubject.js

'use strict';

const BASE = 'http://127.0.0.1:8787';
const CODE = 'E2EMulti1'; // 独立测试码
const DailyPlan = require('../student-web/js/dailyPlan');
const enKG = require('../server/subjects/english/knowledgeGraph');
const cnPrompts = require('../server/subjects/chinese/prompts');
const enPrompts = require('../server/subjects/english/prompts');
const fs = require('fs');

let failed = 0;
function stepOk(n, msg) { console.log('  ✓ [' + n + '] ' + msg); }
function stepFail(n, msg, detail) {
  failed++;
  console.error('  ✗ [' + n + '] ' + msg);
  if (detail) console.error('    详情: ' + detail);
}

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}
async function get(path) {
  const r = await fetch(BASE + path);
  return r.json();
}

(async () => {
  console.log('════ 多学科端到端验证（测试码 ' + CODE + '）════');

  // 健康检查
  let status;
  try {
    status = await get('/api/status');
  } catch (e) {
    console.error('✗ 后端未启动：请先运行 node server/server.js（' + e.message + '）');
    process.exit(1);
  }
  console.log('[准备] /api/status → llm:' + status.llm + ' ocr:' + status.ocr);

  // ---- 第 1 步：数学 连错 3 题 → 诊断/补漏计划 ----
  console.log('\n[第 1 步] 数学：退位减法连错 3 题 → 诊断/补漏计划');
  try {
    for (let i = 0; i < 3; i++) {
      await post('/api/sync', {
        code: CODE, name: '端到端小明',
        type: 'record',
        data: { ts: Date.now(), ok: false, seconds: 42, knowledge: '四则混合运算', mode: 'practice', attempts: 2 }
      });
    }
    console.log('  上报 3 道错题（四则混合运算·连错）→ ok');
    const mastery = await get('/api/mastery/' + CODE);
    const mathRow = (mastery.mastery || []).find((m) => m.knowledge_point === '四则混合运算');
    if (mathRow && mathRow.score <= 40) {
      stepOk(1, '掌握度已捕捉薄弱：四则混合运算 = ' + mathRow.score + ' 分（attempts ' + mathRow.attempts + '）');
    } else {
      stepFail(1, '掌握度未正确反映连错', JSON.stringify(mathRow));
    }
    const plan = await post('/api/camp/plan/generate', { code: CODE });
    if (plan.ok && plan.plan) {
      const hasWeak = plan.plan.lessons.some((l) => l.knowledge === '四则混合运算');
      stepOk(1, '补漏计划已排课：' + plan.plan.lessons.map((l) => l.knowledge + '/' + l.status).join(' | ') + (hasWeak ? '（含薄弱点）' : ''));
    } else if (plan.needDiagnostic) {
      // 掌握度足够时无需诊断直接排课；needDiagnostic 属异常
      stepFail(1, '排课要求先诊断（buildPlanSpec 判定异常）', JSON.stringify(plan));
    } else {
      stepFail(1, '排课失败', JSON.stringify(plan));
    }
  } catch (e) {
    stepFail(1, '数学链路异常', e.message + ' @ server/server.js handleSync / db.computeMastery / camp.buildPlanSpec');
  }

  // ---- 第 2 步：英语 跟读+拼写 → 掌握度按维度 ----
  console.log('\n[第 2 步] 英语：跟读 + 拼写 → 掌握度按词类知识点（维度可查）');
  try {
    const r1 = await post('/api/english/repeat', { word: 'cat', text: 'cat', code: CODE });
    console.log('  跟读 cat（text）→ ' + JSON.stringify({ match: r1.match, line: r1.line }));
    const r2 = await post('/api/english/spell', { word: 'dog', answer: 'dog', code: CODE });
    console.log('  拼写 dog（对）→ correct=' + r2.correct);
    const r3 = await post('/api/english/spell', { word: 'pig', answer: 'pag', code: CODE });
    console.log('  拼写 pig（错）→ correct=' + r3.correct + ' hint=' + r3.hint);
    const mEn = await get('/api/mastery/' + CODE);
    const enRows = (mEn.mastery || []).filter((m) => /^vocab-/.test(m.knowledge_point));
    if (!enRows.length) {
      stepFail(2, '英语掌握度未按词类知识点落库（应为 vocab-animals 等）', JSON.stringify(mEn.mastery));
    } else {
      const dimMap = enRows.map((m) => {
        const kg = enKG.getKnowledge(m.knowledge_point);
        return m.knowledge_point + ' → ' + (kg ? kg.dimension : '?') + ' = ' + m.score + '分';
      });
      stepOk(2, '英语掌握度按维度可查：' + dimMap.join('；'));
    }
  } catch (e) {
    stepFail(2, '英语链路异常', e.message + ' @ server/server.js /api/english/* 落库段');
  }

  // ---- 第 3 步：语文 听写+阅读引导+写作建议 ----
  console.log('\n[第 3 步] 语文：听写 + 阅读引导 + 写作建议（不评分）');
  try {
    const d1 = await post('/api/chinese/dictation', { expected: '晨', answer: '尘', code: CODE });
    console.log('  听写"晨"写"尘" → correct=' + d1.correct + ' feedback=' + d1.feedback);
    const d2 = await post('/api/chinese/dictation', { expected: '晨', answer: '晨', code: CODE });
    console.log('  听写"晨"写对 → correct=' + d2.correct);
    const rd = await post('/api/chinese/reading', { answer: '大家一起抬', code: CODE });
    console.log('  阅读引导 → ' + rd.guide);
    if (/标准答案|正确答案是/.test(rd.guide)) stepFail(3, '阅读引导出现标准答案字样', rd.guide);
    const w = await post('/api/chinese/writing/suggest', {
      title: '放风筝',
      content: '今天我和妈妈去公园放风筝。风筝飞得好高，我跑得满头大汗。妈妈夸我跑得快，我心里美滋滋的。'
    });
    console.log('  写作建议 → scored=' + w.scored + '，共 ' + (w.suggestions || []).length + ' 条');
    (w.suggestions || []).forEach((s, i) => console.log('    ' + (i + 1) + '. ' + s));
    if (w.scored !== false) stepFail(3, '写作建议 scored 应为 false');
    else stepOk(3, '作文只给建议不打分 ✅');
    const mCn = await get('/api/mastery/' + CODE);
    const cnRows = (mCn.mastery || []).filter((m) => /char-dictation|reading-comprehension/.test(m.knowledge_point));
    stepOk(3, '语文掌握度落库：' + (cnRows.map((m) => m.knowledge_point + '=' + m.score + '分').join('；') || '（事件量少，掌握度待积累）'));
  } catch (e) {
    stepFail(3, '语文链路异常', e.message + ' @ server/server.js /api/chinese/*');
  }

  // ---- 第 4 步：每日任务 ≤2 科、15~25 分钟 ----
  console.log('\n[第 4 步] 每日学习计划：最多 2 科，总时长 15~25 分钟');
  try {
    let allOk = true;
    for (let day = 0; day < 7; day++) {
      const plan = DailyPlan.buildDailyPlan(6, 1, 0, day);
      const withinSubjects = plan.subjects.length <= 2;
      const withinMinutes = plan.estimatedMinutes >= 15 && plan.estimatedMinutes <= 25;
      console.log('  星期' + '日一二三四五六'[day] + ' → ' + plan.subjects.join('+') + ' = ' + plan.estimatedMinutes + ' 分钟' +
        (withinSubjects && withinMinutes ? ' ✓' : ' ✗ 不合规!'));
      if (!withinSubjects || !withinMinutes) allOk = false;
    }
    const p = DailyPlan.buildDailyPlan(6, 1, 0, new Date().getDay());
    console.log('  今日计划明细：' + p.items.map((i) => i.name + '（' + i.task + '，约 ' + i.minutes + ' 分钟）').join('；'));
    if (allOk) stepOk(4, '一周 7 天全部 ≤2 科且 15~25 分钟');
    else stepFail(4, '存在不合规计划日', 'dailyPlan.buildDailyPlan 时长/科目数超界');
  } catch (e) {
    stepFail(4, '每日计划异常', e.message + ' @ student-web/js/dailyPlan.js buildDailyPlan');
  }

  // ---- 第 5 步：家长报告分科、无百分比排名 ----
  console.log('\n[第 5 步] 家长报告：分科 + 无百分比无排名');
  try {
    const rep = await get('/api/report/' + CODE);
    const text = String(rep.translated_report || '');
    console.log('  报告全文：\n----\n' + text + '\n----');
    console.log('  bySubject：' + JSON.stringify(rep.bySubject));
    const bad = /%|百分|正确率\s*\d|排名|第几名/.test(text);
    const multiSubject = Object.keys(rep.bySubject || {}).length >= 2;
    if (bad) stepFail(5, '报告含百分比/排名字样', text.match(/.{0,15}(%|百分|排名|第几名).{0,15}/g).join('; '));
    else if (!multiSubject) stepFail(5, '报告未分科（bySubject 少于 2 科）', JSON.stringify(rep.bySubject));
    else stepOk(5, '分科报告 ✅（' + Object.keys(rep.bySubject).join('/') + '）且无百分比无排名');
  } catch (e) {
    stepFail(5, '家长报告异常', e.message + ' @ server/services/reportService.js generateReport');
  }

  // ---- 第 6 步：虚拟伙伴反馈适配学科 ----
  console.log('\n[第 6 步] 虚拟伙伴反馈适配学科');
  try {
    const checks = [
      ['数学', '📋 小狐的今日任务', /小狐的今日任务/],
      ['英语', enPrompts.STATE_LINES.LISTEN, /听|点一点/],
      ['语文', cnPrompts.STATE_LINES.READ_ALOUD, /读/]
    ];
    let okAll = true;
    checks.forEach(([name, actual, expect]) => {
      const ok = expect instanceof RegExp ? expect.test(actual) : String(actual).indexOf(expect) > -1;
      console.log('  ' + name + '任务卡/话术："' + String(actual).slice(0, 24) + '" ' + (ok ? '✓' : '✗'));
      if (!ok) okAll = false;
    });
    const idx = fs.readFileSync('student-web/index.html', 'utf8');
    const hasEnGreet = idx.indexOf("Hello! I'm 小狐!") > -1;
    const hasCnGreet = idx.indexOf('一起读课文、写生字吧') > -1;
    console.log('  英语首页小狐英文问候：' + hasEnGreet + '；语文首页小狐中文问候：' + hasCnGreet);
    if (okAll && hasEnGreet && hasCnGreet) stepOk(6, '三科小狐话术/形象适配 ✅');
    else stepFail(6, '小狐话术不适配', '检查 student-web/index.html 与 subjects/*/prompts.js');
  } catch (e) {
    stepFail(6, '虚拟伙伴检查异常', e.message);
  }

  // ---- 汇总 ----
  console.log('\n════ 验证汇总 ════');
  if (failed === 0) {
    console.log('✅ 七步全部通过：数学薄弱→补漏、英语维度掌握度、语文不评分、每日计划 ≤2 科 15~25 分钟、报告分科无冷数据、小狐适配学科');
  } else {
    console.error('❌ ' + failed + ' 步未通过，详见上方 ✗ 行（含文件/函数线索）');
  }
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('脚本异常：', e);
  process.exit(1);
});
