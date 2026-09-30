// AI 调度层：优先调用后端大模型（配置后），否则回退到本地解题引擎

const config = require('./config');
const solver = require('./solver');
const storage = require('./storage');

function solve(problem) {
  return new Promise((resolve) => {
    if (!problem) {
      resolve(null);
      return;
    }
    if (config.llm.enabled && config.llm.baseUrl) {
      wx.request({
        url: config.llm.baseUrl.replace(/\/$/, '') + '/tutor',
        method: 'POST',
        data: { problem: problem, code: storage.getSyncCode() },
        timeout: 20000,
        success: (res) => {
          const d = res.data || {};
          if (d && d.ok && d.answer !== undefined && d.answer !== null) {
            resolve({
              source: 'ai',
              problem: problem,
              knowledge: d.knowledge || '综合',
              answer: d.answer,
              displayAnswer: d.displayAnswer || String(d.answer),
              steps: (Array.isArray(d.steps) && d.steps.length ? d.steps : []).map((s, i) => ({
                title: s.title || '第' + (i + 1) + '步',
                content: s.content || '',
                tip: s.tip || '',
                ask: s.ask || ''
              })),
              note: ''
            });
          } else {
            resolveLocal();
          }
        },
        fail: () => resolveLocal()
      });
    } else {
      resolveLocal();
    }
  });

  function resolveLocal() {
    const r = solver.solveText(problem);
    resolve(r || solver.genericGuide(problem));
  }
}

function generatePractice() {
  return solver.generatePractice();
}

function sampleProblems(n) {
  return solver.sampleProblems(n);
}

// 错题 AI 讲解：结合学生答案先分析错因再分步讲解；未配置/失败返回 null（调用方回退本地步骤）
function explain(problem, myAnswer, rightAnswer) {
  return new Promise((resolve) => {
    if (!problem) {
      resolve(null);
      return;
    }
    if (config.llm.enabled && config.llm.baseUrl) {
      wx.request({
        url: config.llm.baseUrl.replace(/\/$/, '') + '/tutor',
        method: 'POST',
        data: {
          problem: problem,
          myAnswer: myAnswer,
          rightAnswer: rightAnswer,
          mode: 'wrong',
          code: storage.getSyncCode()
        },
        timeout: 20000,
        success: (res) => {
          const d = res.data || {};
          if (d && d.ok && Array.isArray(d.steps) && d.steps.length) {
            resolve({
              source: 'ai',
              knowledge: d.knowledge || '综合',
              steps: d.steps.map((s, i) => ({
                title: s.title || '第' + (i + 1) + '步',
                content: s.content || '',
                tip: s.tip || '',
                ask: s.ask || ''
              })),
              reason: d.reason || ''
            });
          } else {
            resolve(null);
          }
        },
        fail: () => resolve(null)
      });
    } else {
      resolve(null);
    }
  });
}

// 变形题生成（AI 优先，失败返回 null 由调用方走本地生成器）
function variant(problem, knowledge) {
  return new Promise((resolve) => {
    if (!problem) {
      resolve(null);
      return;
    }
    if (config.llm.enabled && config.llm.baseUrl) {
      wx.request({
        url: config.llm.baseUrl.replace(/\/$/, '') + '/variant',
        method: 'POST',
        data: { problem: problem, knowledge: knowledge || '', code: storage.getSyncCode() },
        timeout: 25000,
        success: (res) => {
          const d = res.data || {};
          if (d && d.ok && d.problem && Array.isArray(d.steps) && d.steps.length) {
            resolve({
              source: 'ai',
              problem: d.problem,
              knowledge: d.knowledge || knowledge || '综合',
              answer: d.answer,
              displayAnswer: d.displayAnswer || String(d.answer),
              steps: d.steps.map((s, i) => ({
                title: s.title || '第' + (i + 1) + '步',
                content: s.content || '',
                tip: s.tip || '',
                ask: s.ask || ''
              })),
              note: '',
              reason: ''
            });
          } else {
            resolve(null);
          }
        },
        fail: () => resolve(null)
      });
    } else {
      resolve(null);
    }
  });
}

module.exports = {
  solve: solve,
  generatePractice: generatePractice,
  sampleProblems: sampleProblems,
  explain: explain,
  variant: variant
};
