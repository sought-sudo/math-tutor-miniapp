// server/services/campReportService.js — 训练营报告（入学诊断报告 + 结课验收报告）
// 输出：{ report_text, parent_script }；风格与 reportService 一致：不焦虑、无冷数据、具体可执行。
// 生成链路：DeepSeek → 解析校验 → 本地温言兜底。

const DIAG_SYSTEM_PROMPT =
  '你是小学辅导班的数学老师，负责给家长写"入学诊断报告"。根据孩子的摸底测评结果，' +
  '写一段给家长看的报告和一段可以照着做的沟通建议。要求：1) 语言温暖、不焦虑，禁止出现"正确率 65%"这类冷数据；' +
  '2) 指出孩子最需要补的 1~3 个知识点（用家长听得懂的话，不要只堆知识点名词）；' +
  '3) 沟通建议具体可执行，不要笼统说"多鼓励"。只输出 JSON，不要解释：' +
  '{"report_text":"...","parent_script":"..."}';

const FINAL_SYSTEM_PROMPT =
  '你是小学辅导班的数学老师，负责给家长写"结课验收报告"。孩子完成了一期查漏补缺课程，' +
  '根据期初与结课两次测评的对比，写一段给家长看的报告和一段可以照着做的沟通建议。' +
  '要求：1) 语言温暖、不焦虑，禁止出现"正确率 65%"这类冷数据；2) 先说进步（哪怕一点点），' +
  '再温和指出仍然需要巩固的地方；3) 沟通建议具体可执行。只输出 JSON，不要解释：' +
  '{"report_text":"...","parent_script":"..."}';

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

// ---------------- 入学诊断报告 ----------------

function diagFallback(facts) {
  const weak = (facts.weak || []).slice(0, 3);
  let report;
  let script;
  if (!weak.length) {
    report = facts.name + ' 的摸底测评已经完成，基础很扎实，大部分知识点都掌握得不错。接下来不用刻意补课，保持每天练几道题的好习惯就行。';
    script = '今天可以问问孩子：你觉得自己哪类题最拿手？以后遇到没见过的题，你会先做什么？';
  } else {
    const names = weak.map((w) => w.knowledge).join('、');
    report = facts.name + ' 完成了入学摸底测评，我们帮 TA 找出了几个需要重点巩固的地方：' + names + '。' +
      '这些问题在四年级很常见，孩子不是不会，是方法还没完全理顺。小狐老师已经按这几个地方排好了课程，一节一节来，很快就能补上。';
    script = '今天可以问问孩子：训练营里第一节课学的是什么？你觉得和学校里老师讲的一样吗？听懂的地方，请 TA 讲给你听一遍。';
  }
  return { report_text: report, parent_script: script };
}

async function generateDiagnosisReport(chatFn, facts) {
  if (chatFn) {
    try {
      const userMsg = '孩子昵称：' + (facts.name || '孩子') +
        '\n最需要巩固的知识点（按薄弱排序）：' + ((facts.weak || []).map((w) => w.knowledge + '（薄弱）').join('、') || '无明显薄弱') +
        '\n测评完成题量：' + (facts.total || 0);
      const text = await chatFn([
        { role: 'system', content: DIAG_SYSTEM_PROMPT },
        { role: 'user', content: userMsg }
      ]);
      const o = parseLoose(text);
      if (o && o.report_text && o.parent_script) {
        return { report_text: o.report_text, parent_script: o.parent_script };
      }
    } catch (e) {
      // LLM 失败走本地兜底
    }
  }
  return diagFallback(facts);
}

// ---------------- 结课验收报告 ----------------

function finalFallback(facts) {
  const improved = facts.improved || [];
  const stillWeak = facts.stillWeak || [];
  let report;
  let script;
  if (improved.length) {
    report = '这一期查漏补缺课程完成啦！' + facts.name + ' 在「' + improved.join('、') + '」上的进步特别明显，' +
      '结课测评比期初稳了不少。说明只要方法理顺了，孩子完全能学好。';
    if (stillWeak.length) {
      report += '「' + stillWeak.join('、') + '」还需要再磨一磨，别着急，可以再开一期训练营巩固。';
    } else {
      report += '这一期补过的知识点都过关了，继续保持每天练习的好习惯就行。';
    }
    script = '今天可以让孩子当一回小老师，把训练营里最有把握的一课讲给你听。讲完你再说："听你这么一讲，我都学会了！"';
  } else if (stillWeak.length) {
    report = '这一期课程上完了，' + facts.name + ' 认真学完了每一节课。「' + stillWeak.join('、') + '」还需要一点时间消化，' +
      '这是正常的，数学学习本来就是螺旋上升的。';
    script = '今天问问孩子：训练营里哪节课你觉得最难？我们一起看看是卡在哪一步，明天再练一遍就会好很多。';
  } else {
    report = '这一期查漏补缺课程顺利结课啦！' + facts.name + ' 把薄弱的地方都补上了，值得一个大大的表扬。';
    script = '今天可以问问孩子：训练营里你最喜欢哪节课？为什么喜欢？';
  }
  return { report_text: report, parent_script: script };
}

async function generateFinalReport(chatFn, facts) {
  if (chatFn) {
    try {
      const userMsg = '孩子昵称：' + (facts.name || '孩子') +
        '\n期初薄弱知识点：' + ((facts.before || []).map((x) => x.knowledge).join('、') || '无') +
        '\n进步的知识点：' + ((facts.improved || []).join('、') || '暂无') +
        '\n仍需巩固的知识点：' + ((facts.stillWeak || []).join('、') || '无');
      const text = await chatFn([
        { role: 'system', content: FINAL_SYSTEM_PROMPT },
        { role: 'user', content: userMsg }
      ]);
      const o = parseLoose(text);
      if (o && o.report_text && o.parent_script) {
        return { report_text: o.report_text, parent_script: o.parent_script };
      }
    } catch (e) {
      // LLM 失败走本地兜底
    }
  }
  return finalFallback(facts);
}

module.exports = {
  generateDiagnosisReport: generateDiagnosisReport,
  generateFinalReport: generateFinalReport,
  diagFallback: diagFallback,
  finalFallback: finalFallback
};
