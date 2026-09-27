// 分步引导页：核心辅导交互
// 入口三种：1) 每日练习（随机出题）2) 拍照/输入题目 3) 错题本重练（wrongId）

const ai = require('../../utils/ai');
const storage = require('../../utils/storage');
const solver = require('../../utils/solver');
const util = require('../../utils/util');

Page({
  data: {
    loading: true,
    isRetry: false,
    problem: '',
    knowledge: '',
    note: '',
    steps: [],
    revealed: 0,
    allRevealed: false,
    checkMode: 'input', // input：数字作答；self：自我核对（答案含文字）
    phase: 'solving',   // solving | right | wrong
    wrongTimes: 0,
    userAnswer: '',
    rightAnswerText: '',
    praise: '',
    addedToWrong: false,
    seconds: 0
  },

  onLoad(options) {
    this.startTs = Date.now();
    this.wrongId = (options && options.wrongId) || '';

    if (this.wrongId) {
      const item = storage.getWrongById(this.wrongId);
      if (item) {
        this.setData({ isRetry: true });
        // 重练直接用错题本里存好的题目和步骤，保证讲解一致
        if (item.steps && item.steps.length) {
          this.applyResult({
            source: 'local',
            problem: item.problem,
            knowledge: item.knowledge,
            answer: item.rightNum,
            displayAnswer: item.rightAnswer,
            steps: item.steps,
            note: ''
          });
          return;
        }
        this.startSolve(item.problem);
        return;
      }
    }

    const app = getApp();
    const pending = app.globalData && app.globalData.pendingProblem;
    if (pending) {
      if (app.globalData) app.globalData.pendingProblem = '';
      this.startSolve(pending);
    } else {
      this.newPractice();
    }
  },

  newPractice() {
    this.startTs = Date.now();
    this.wrongId = '';
    this.applyResult(ai.generatePractice());
  },

  startSolve(problem) {
    this.setData({ loading: true });
    ai.solve(problem).then((res) => {
      this.applyResult(res || solver.genericGuide(problem));
    });
  },

  applyResult(res) {
    const steps = (res.steps && res.steps.length ? res.steps : []).map((s, i) => ({
      title: s.title || '第' + (i + 1) + '步',
      content: s.content || ''
    }));
    if (!steps.length) {
      steps.push({ title: '提示', content: '跟着老师教的思路自己列式算一算，再对答案。' });
    }
    this.rightNum =
      typeof res.answer === 'number'
        ? res.answer
        : util.extractNumber(res.answer === null || res.answer === undefined ? '' : String(res.answer));
    this.setData({
      loading: false,
      isRetry: !!this.wrongId,
      problem: res.problem,
      knowledge: res.knowledge || '综合',
      note: res.note || '',
      steps: steps,
      revealed: 0,
      allRevealed: false,
      checkMode: this.rightNum !== null && this.rightNum !== undefined ? 'input' : 'self',
      phase: 'solving',
      wrongTimes: 0,
      userAnswer: '',
      addedToWrong: false,
      seconds: 0,
      rightAnswerText:
        res.displayAnswer || (res.answer === null || res.answer === undefined ? '' : String(res.answer))
    });
  },

  onReveal() {
    const n = this.data.revealed + 1;
    this.setData({ revealed: n, allRevealed: n >= this.data.steps.length });
  },

  onInput(e) {
    this.setData({ userAnswer: e.detail.value });
  },

  // 支持直接输入算式（如 125×8+25×4），先尝试求值
  parseUserAnswer(s) {
    const t = String(s).trim();
    if (/^[0-9+\-*×÷/()（）.\s]+$/.test(t) && /[+\-*×÷/]/.test(t)) {
      const v = solver.evaluate(t);
      if (v !== null) return v;
    }
    return util.extractNumber(t);
  },

  onSubmit() {
    const user = this.data.userAnswer.trim();
    if (!user) {
      wx.showToast({ title: '先写上你的答案吧 ✍️', icon: 'none' });
      return;
    }
    const num = this.parseUserAnswer(user);
    const right =
      num !== null &&
      this.rightNum !== null &&
      this.rightNum !== undefined &&
      Math.abs(num - this.rightNum) < 0.011;
    if (right) {
      this.finish(true, user);
    } else {
      const wt = this.data.wrongTimes + 1;
      this.setData({ wrongTimes: wt, userAnswer: '' });
      if (wt < 2) {
        wx.showToast({ title: '再想想哦，可以回看上面的步骤 💪', icon: 'none', duration: 2000 });
      } else {
        this.finish(false, user);
      }
    }
  },

  onSelfCheck(e) {
    const ok = e.currentTarget.dataset.ok === '1';
    this.finish(ok, '');
  },

  finish(correct, userAnswer) {
    const seconds = Math.round((Date.now() - this.startTs) / 1000);
    storage.addRecord({
      ok: correct,
      seconds: seconds,
      knowledge: this.data.knowledge,
      problem: this.data.problem,
      mode: this.wrongId ? 'retry' : 'practice'
    });

    const praise = correct
      ? util.pick(['太棒了！🎉', '你真厉害！🌟', '算得又快又准！⚡', '小数学家，继续加油！🚀'])
      : '没关系，错题已经帮你记进错题本啦，下次一定能做对！💪';

    let addedToWrong = false;
    if (correct) {
      if (this.wrongId) storage.markMastered(this.wrongId);
    } else if (this.wrongId) {
      storage.bumpWrong(this.wrongId);
    } else {
      storage.addWrongBook({
        problem: this.data.problem,
        myAnswer: userAnswer || '未作答',
        rightAnswer: this.data.rightAnswerText || '见步骤',
        rightNum: this.rightNum,
        steps: this.data.steps,
        knowledge: this.data.knowledge
      });
      addedToWrong = true;
    }

    this.setData({
      phase: correct ? 'right' : 'wrong',
      praise: praise,
      addedToWrong: addedToWrong,
      seconds: seconds
    });
  },

  onAgain() {
    this.wrongId = '';
    this.setData({ isRetry: false });
    this.newPractice();
  },

  onHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
