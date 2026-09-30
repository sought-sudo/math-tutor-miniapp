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

  (events || []).forEach((ev) => {
    if (ev.knowledge_point) {
      knowledge.add(ev.knowledge_point);
      if (ev.event_type === 'answer_wrong') wrongKnowledge.add(ev.knowledge_point);
    }
    if (ev.event_type === 'after_wrong_retry') retries++;
    if (ev.event_type === 'deformation_attempt') deformTotal++;
    if (ev.event_type === 'deformation_correct') deformOk++;
    if (ev.event_type === 'question_attempt') attempts++;
    if (ev.session_id) sessions.add(ev.session_id);
    if (ev.duration_ms) duration += ev.duration_ms;
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
    durationMin: Math.max(1, Math.round(duration / 60000))
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
  return lines.join('\n');
}

// 本地温言兜底：不焦虑、无冷数据
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
  let report = facts.periodLabel + facts.name + '主动练习了数学，和「' +
    (facts.knowledgeList.join('、') || '不同题型') + '」打交道。';
  if (facts.wrongKnowledgeList.length) {
    report += '在「' + facts.wrongKnowledgeList.join('、') + '」上多花了一点时间，';
  }
  if (facts.retries > 0) {
    report += '有几道题第一次没做对，但他没有放弃，继续试了下去，最后自己找到了方法。这说明他正在慢慢建立"遇到困难先尝试"的习惯。';
  } else if (facts.wrongKnowledgeList.length) {
    report += '他按自己的节奏走了下来。';
  } else {
    report += '整个过程比较顺利。';
  }
  if (facts.deformTotal > 0) {
    report += facts.deformOk
      ? '他还挑战了变形题，并且拿了下来。'
      : '他还勇敢地挑战了变形题。';
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
        result = {
          translated_report: j.translated_report,
          communication_script: j.communication_script
        };
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
  SYSTEM_PROMPT: SYSTEM_PROMPT
};
