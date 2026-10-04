// server/services/reportService.js — 家长报告（翻译报告 + 沟通脚本）
// 输入：当天的行为事件与错题；输出 { translated_report, communication_script }
// 生成链路：DeepSeek（家庭教育沟通顾问）→ 解析校验 → 本地温言兜底。
// 输出要求：不焦虑、温暖、具体、可执行；禁止"正确率 65%"这类冷数据。

const SYSTEM_PROMPT =
  '你是家庭教育沟通顾问。根据孩子的学习记录，写一段不焦虑的翻译报告和一段具体沟通脚本。' +
  '语言温暖、具体、可执行，不要笼统说"多鼓励"。只输出 JSON，不要解释：' +
  '{"translated_report":"...","communication_script":"..."}';

function parseLoose(text) {
  const s = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    // 继续尝试截取
  }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch (e2) {
      // 忽略
    }
  }
  return null;
}

// 把行为事件与错题汇总成"事实"（供 LLM 或兜底模板使用）
// opts.periodLabel：报告时间范围的称呼（默认"今天"，周报传"最近 7 天"）
// bySubject：按学科分组统计（subject_id 缺省视为 math）
function buildFacts(userId, name, events, wrongs, opts) {
  const periodLabel = (opts && opts.periodLabel) || '今天';
  const knowledge = new Set();
  const wrongKnowledge = new Set();
  const sessions = new Set();
  let retries = 0;
  let deformOk = 0;
  let deformTotal = 0;
  let duration = 0;
  let attempts = 0;
  const bySubject = {};

  (events || []).forEach((ev) => {
    const sub = ev.subject_id || 'math';
    const m = bySubject[sub] || (bySubject[sub] = { attempts: 0, correct: 0, wrong: 0, minutes: 0, knowledge: new Set() });
    if (ev.knowledge_point) {
      knowledge.add(ev.knowledge_point);
      m.knowledge.add(ev.knowledge_point);
      if (ev.event_type === 'answer_wrong') wrongKnowledge.add(ev.knowledge_point);
    }
    if (ev.event_type === 'after_wrong_retry') retries++;
    if (ev.event_type === 'deformation_attempt') deformTotal++;
    if (ev.event_type === 'deformation_correct') deformOk++;
    if (ev.event_type === 'question_attempt') attempts++;
    if (ev.event_type === 'answer_correct') m.correct++;
    if (ev.event_type === 'answer_wrong') m.wrong++;
    if (ev.duration_ms) {
      duration += ev.duration_ms;
      m.minutes += ev.duration_ms;
    }
    if (ev.session_id) sessions.add(ev.session_id);
  });

  const wrongList = (wrongs || [])
    .filter((w) => w.status === 'active')
    .slice(0, 5)
    .map((w) => ({
      problem: w.problem,
      myAnswer: w.myAnswer,
      rightAnswer: w.rightAnswer,
      knowledge: w.knowledge
    }));

  // 学科汇总（Set 序列化 + 分钟取整）
  const SUBJECT_NAMES = { math: '数学', english: '英语', chinese: '语文' };
  const bySubjectOut = {};
  Object.keys(bySubject).forEach((sub) => {
    const m = bySubject[sub];
    bySubjectOut[sub] = {
      name: SUBJECT_NAMES[sub] || sub,
      attempts: m.attempts,
      correct: m.correct,
      wrong: m.wrong,
      minutes: Math.max(1, Math.round(m.minutes / 60000)),
      knowledge: Array.from(m.knowledge).slice(0, 5)
    };
  });

  return {
    userId: userId,
    name: name || '孩子',
    periodLabel: periodLabel,
    hasActivity: (events || []).length > 0,
    sessionCount: sessions.size,
    knowledgeList: Array.from(knowledge),
    wrongKnowledgeList: Array.from(wrongKnowledge),
    wrongList: wrongList,
    retries: retries,
    deformOk: deformOk,
    deformTotal: deformTotal,
    attempts: attempts,
    durationMin: Math.max(1, Math.round(duration / 60000)),
    bySubject: bySubjectOut
  };
}

function buildUserMessage(facts) {
  const lines = [];
  lines.push('孩子昵称：' + facts.name);
  lines.push('学习记录（' + facts.periodLabel + '）：');
  lines.push('- 学习次数：' + facts.sessionCount + ' 次');
  lines.push('- 作答次数：' + facts.attempts + ' 次');
  lines.push('- 练习的知识点：' + (facts.knowledgeList.join('、') || '无记录'));
  lines.push('- 做错后继续尝试：' + facts.retries + ' 次');
  lines.push('- 变形题：完成 ' + facts.deformOk + ' / ' + facts.deformTotal);
  lines.push('- 大约用时：' + facts.durationMin + ' 分钟');
  lines.push('错题（' + facts.periodLabel + '）：');
  if (facts.wrongList.length) {
    facts.wrongList.forEach((w) => {
      lines.push('· ' + w.problem + '（孩子写：' + w.myAnswer + '；正确答案：' + w.rightAnswer + '）');
    });
  } else {
    lines.push('（这段时间没有新错题）');
  }
  lines.push('要求：');
  lines.push('1. translated_report 用家长能理解、不焦虑的语言描述今天的学习，' +
    '例如"今天小明在退位减法上花了较长时间，但他没有放弃，最终自己找到了方法。这说明他在建立\'遇到困难先尝试\'的习惯。"');
  lines.push('2. 禁止出现"正确率 65%"这类冷数据。');
  lines.push('3. communication_script 给一段具体、可执行的饭后沟通建议，' +
    '例如"饭后可以问问孩子：今天小狐老师有没有给你出那种需要动脑筋的题？你是怎么想到的？注意不要问\'做对了几道\'。"');
  lines.push('4. 语言温暖、具体、可执行，不要笼统说"多鼓励"。');
  lines.push('5. 按学科分段描述（数学/英语/语文，只提有记录的学科），每科一两句话。');
  lines.push('6. 全文禁止出现百分号、百分比、正确率数字、"排名"或"第几名"。');
  return lines.join('\n');
}

// 输出硬校验：报告含百分比/排名字样即视为不合格（回退本地兜底）
function reportPassesRules(report) {
  if (!report) return false;
  const bad = /%|百分|正确率\s*\d|排名|第几名/;
  return !bad.test(String(report));
}

// 本地分科段（给兜底模板用）
function subjectLines(facts) {
  const lines = [];
  const subs = facts.bySubject || {};
  const order = ['math', 'english', 'chinese'];
  order.forEach((sub) => {
    const m = subs[sub];
    if (!m || (!m.attempts && !m.correct && !m.wrong)) return;
    let text;
    if (sub === 'math') {
      text = '数学：' + (m.wrong > m.correct
        ? '今天在「' + (m.knowledge[0] || '计算') + '」上遇到了一点困难，但一直在坚持尝试，这份不放弃的劲头很难得。'
        : '今天练得不错，「' + (m.knowledge[0] || '计算') + '」越做越顺，能看出方法掌握得更牢了。');
    } else if (sub === 'english') {
      text = '英语：跟读和拼写都在开口、动手' + (m.correct > 0 ? '，有好几个词拼得很准确，记得夸夸这份认真。' : '，肯开口就是最好的开始。');
    } else {
      text = '语文：练了生字和阅读' + (m.correct > 0 ? '，听写越写越有样子了，读书的耐心看得见。' : '，愿意一笔一画地写，慢慢来就好。');
    }
    lines.push(text);
  });
  if (!lines.length) lines.push('这段时间还没有学习记录，可以从数学每日练习开始，每天几分钟就很好。');
  return lines;
}

// 本地温言兜底：不焦虑、无冷数据、按学科分段
function localFallback(facts) {
  if (!facts.hasActivity) {
    return {
      translated_report:
        facts.periodLabel + '还没有留下练习记录。没关系，学习从什么时候开始都不晚，' +
        '也许明天从一道小题开始，就有了第一份成长记录。',
      communication_script:
        '饭后可以问问孩子：今天学校数学课上学了什么好玩的新知识？注意不要问"做对了几道"。'
    };
  }
  // 分科段（数学/英语/语文，只提有记录的学科）
  let report = facts.periodLabel + facts.name + '认认真真地练习了：\n' + subjectLines(facts).join('\n');
  if (facts.retries > 0) {
    report += '\n有 ' + facts.retries + ' 道题第一次没做对，但没有放弃继续试了下去——这份"遇到困难先尝试"的习惯，比做对更珍贵。';
  }
  if (facts.deformTotal > 0) {
    report += facts.deformOk
      ? '\n还挑战了变形题，并且拿了下来。'
      : '\n还勇敢地挑战了变形题。';
  }
  const script =
    '饭后可以问问孩子：今天小狐老师有没有给你出那种需要动脑筋的题？你是怎么想到的？' +
    (facts.wrongKnowledgeList.length ? '（比如「' + facts.wrongKnowledgeList[0] + '」那道题）' : '') +
    '注意不要问"做对了几道"。';
  return { translated_report: report, communication_script: script };
}

/**
 * 生成家长报告
 * @param {Function|null} chatFn (messages) => Promise<string>，为空时直接本地兜底
 * @param {Object} facts buildFacts 的产物
 * @returns {Promise<{translated_report, communication_script}>}
 */
async function generateReport(chatFn, facts) {
  let result = null;
  if (chatFn) {
    try {
      const content = await chatFn([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(facts) }
      ]);
      const j = parseLoose(content);
      if (j && j.translated_report && j.communication_script) {
        // 输出硬校验：含百分比/排名字样 → 不合格，回退本地分科兜底
        if (reportPassesRules(j.translated_report)) {
          result = {
            translated_report: j.translated_report,
            communication_script: j.communication_script
          };
        }
      }
    } catch (e) {
      // 模型失败 → 本地兜底
    }
  }
  return result || localFallback(facts);
}

module.exports = {
  generateReport: generateReport,
  buildFacts: buildFacts,
  localFallback: localFallback,
  reportPassesRules: reportPassesRules,
  subjectLines: subjectLines,
  SYSTEM_PROMPT: SYSTEM_PROMPT
};
