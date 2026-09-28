// 状态机引擎单测：node scripts/check-tutor-engine.js
const engine = require('../server/tutor-engine');

let fail = 0;
const assert = (cond, msg) => {
  if (!cond) {
    fail++;
    console.log('✗ ' + msg);
  }
};

function newSession() {
  // 用本地引擎能解的题；文字题需显式传入答案（客户端从错题本 rightNum 传入）
  return engine.createSession({
    problem: '一块长方形菜地，长 17 米，宽 5 米。这块菜地的周长是多少米？',
    knowledge: '长方形周长',
    myAnswer: '999999',
    rightAnswer: '44 米',
    answer: 44
  });
}

// 进入 ATTEMPT 的通用前置：会话创建(GREETING 提问) → 应答 GREETING/READ/ACTIVATE
function enterAttempt(s, greetMsg) {
  engine.step(s, ''); // 会话创建：返回 GREETING 提问
  engine.step(s, greetMsg || '我准备好了');
  engine.step(s, '读懂了');
  engine.step(s, '记得');
}

function enterScaffold(s) {
  enterAttempt(s);
  engine.step(s, '先加');
  engine.step(s, '方法不知道'); // DIAGNOSE 应答 → SCAFFOLD（提示①）
}

// 1) 完整快乐路径：GREETING → ... → REVIEW
{
  const s = newSession();
  engine.step(s, ''); // 会话创建：返回 GREETING 提问
  let r = engine.step(s, '我准备好了'); // 应答 GREETING
  assert(r.state === 'READ_PROBLEM', 'GREETING 应转 READ_PROBLEM');
  r = engine.step(s, '长 17 宽 5，求周长'); // 应答 READ
  assert(r.state === 'ACTIVATE_KNOWLEDGE', 'READ 应转 ACTIVATE');
  assert(r.extra && r.extra.knowledgeCard, 'ACTIVATE 应带知识点卡片');
  r = engine.step(s, '我记得'); // 应答知识点卡片
  assert(r.state === 'STUDENT_ATTEMPT', 'ACTIVATE 应转 ATTEMPT');
  r = engine.step(s, '先算长加宽'); // 说思路
  assert(r.state === 'DIAGNOSE', 'ATTEMPT 应转 DIAGNOSE');
  r = engine.step(s, '计算算不对'); // 说卡点
  assert(r.state === 'SCAFFOLD', 'DIAGNOSE 应转 SCAFFOLD');
  r = engine.step(s, '44'); // 答对
  assert(r.state === 'VERIFY', '答对应转 VERIFY');
  r = engine.step(s, '我讲好了'); // 复述
  assert(r.state === 'REFLECT', 'VERIFY 应转 REFLECT');
  r = engine.step(s, '先想方法'); // 反思
  assert(r.state === 'DEFORM' && r.extra && r.extra.variant, 'REFLECT 应转 DEFORM 并出变形题');
  assert(r.extra.variant.problem !== s.problem, '变形题应不同于原题');
  r = engine.step(s, String(s.variantAnswer)); // 变形题答对
  assert(r.state === 'REVIEW' && s.masteredOriginal === true, '变形题答对应转 REVIEW 且标记掌握');
  assert(r.extra && r.extra.complete && r.extra.parentScript && r.extra.reviewDue, 'REVIEW 收尾应带家长脚本与复习提醒');
  r = engine.step(s, '谢谢老师'); // 告别
  assert(s.complete === true && r.tutorText.indexOf('复习') > -1, '会话完成后告别应带复习提示');
}

// 2) 核心规则：我不会 → 缩小问题
{
  const s = newSession();
  enterAttempt(s);
  let r = engine.step(s, '我不会'); // ATTEMPT 内第一次
  assert(r.tutorText.indexOf('第一步') > -1 && r.state === 'STUDENT_ATTEMPT', '"我不会"应缩小问题只问第一步');
}

// 3) 核心规则：直接告诉我答案
{
  const s = newSession();
  enterAttempt(s);
  let r = engine.step(s, '直接告诉我答案');
  assert(r.tutorText.indexOf('你先说第一步') > -1, '要答案时应回应"先帮你，但你先说第一步"');
}

// 4) 核心规则：连续 2 次错误 → 降难度换简单题
{
  const s = newSession();
  enterScaffold(s);
  let r = engine.step(s, '999'); // 错 1
  assert(r.state === 'SCAFFOLD', '错 1 次仍应留在 SCAFFOLD');
  r = engine.step(s, '888'); // 错 2
  assert(r.state === 'DEFORM' && s.easyMode === true, '连错 2 次应转 DEFORM 降难度');
}

// 5) 核心规则：提示用尽仍不会 → 答案兜底
{
  const s = newSession();
  enterScaffold(s);
  let r;
  for (let i = 0; i < 4; i++) {
    r = engine.step(s, '还是不会'); // ②③④ 后兜底
  }
  assert(s.answerRevealed === true && r.tutorText.indexOf('44') > -1, '提示用尽应兜底给出答案与完整讲解');
  assert(r.state === 'VERIFY', '兜底后应转 VERIFY');
}

// 6) 答案绝不提前出现
{
  const s = newSession();
  let leaked = false;
  const msgs = ['', '准备好了', '不知道', '不知道', '不知道', '不知道'];
  for (let i = 0; i < msgs.length; i++) {
    const r = engine.step(s, msgs[i]);
    if (r.tutorText.indexOf('44') > -1 && s.state !== 'VERIFY') leaked = true;
  }
  assert(!leaked, '兜底前任何消息不得包含答案');
}

console.log(fail ? '❌ 存在 ' + fail + ' 个问题' : '✅ 状态机引擎单测全部通过');
process.exit(fail ? 1 : 0);
