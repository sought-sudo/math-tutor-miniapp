// AI 调度层：优先调用后端大模型（配置后），否则回退到本地解题引擎

const config = require('./config');
const solver = require('./solver');

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
        data: { problem: problem },
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
                content: s.content || ''
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

module.exports = {
  solve: solve,
  generatePractice: generatePractice,
  sampleProblems: sampleProblems
};
