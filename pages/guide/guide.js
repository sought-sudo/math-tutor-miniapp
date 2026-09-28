// 分步引导页：核心辅导交互
// 入口三种：1) 每日练习（随机出题）2) 拍照/输入题目 3) 错题本重练（wrongId）

const ai = require('../../utils/ai');
const storage = require('../../utils/storage');
const solver = require('../../utils/solver');
const util = require('../../utils/util');
const sync = require('../../utils/sync');

Page({
  data: {
    loading: true,
    isRetry: false,
    explainMode: false,
    explainReason: '',
    myAnswerText: '',
    kName: '',
    kDesc: '',
    kMethod: '',
    kMistakes: '',
    feedbackText: '',
    showVariant: false,
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
    this.explainMode = !!(options && options.mode === 'explain');
    this.practiceMode = 'practice'; // practice / retry / variant（行为数据记录用）
    this.variantOf = '';            // 变形题对应的原错题 id（做对后自动标记掌握）

    if (this.wrongId) {
      const item = storage.getWrongById(this.wrongId);
      if (item) {
        if (this.explainMode) {
          // AI 错题讲解模式
          this.setData({ isRetry: true, explainMode: true, myAnswerText: item.myAnswer || '未作答' });
          this.startExplain(item);
          return;
        }
        if (options && options.mode === 'variant') {
          // 变形题巩固：基于原错题生成一道新题
          this.variantOf = this.wrongId;
          this.wrongId = '';
          this.practiceMode = 'variant';
          this.loadVariant(item.problem, item.knowledge);
          return;
        }
        this.setData({ isRetry: true });
        this.practiceMode = 'retry';
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

  // 错题重练小课堂：错因 → 知识点卡片 → 老师逐步讲解 → 变形题挑战
  startExplain(item) {
    this.lessonItem = item;
    this.lessonKnowledge = item.knowledge;
    this.setData({
      loading: true,
      problem: item.problem,
      knowledge: item.knowledge,
      rightAnswerText: item.rightAnswer || '见步骤'
    });
    this.setKnowledgeCard(item.knowledge);
    ai.explain(item.problem, item.myAnswer, item.rightAnswer).then((res) => {
      if (res && res.steps && res.steps.length) {
        this.lessonKnowledge = res.knowledge || item.knowledge;
        this.setKnowledgeCard(this.lessonKnowledge);
        this.applyResult({
          source: 'ai',
          problem: item.problem,
          knowledge: this.lessonKnowledge,
          answer: item.rightNum,
          displayAnswer: item.rightAnswer,
          steps: this.buildLessonSteps(this.lessonKnowledge, res.steps, item.rightAnswer),
          note: ''
        });
        this.setData({ explainReason: res.reason || '' });
      } else if (item.steps && item.steps.length) {
        this.applyResult({
          source: 'local',
          problem: item.problem,
          knowledge: item.knowledge,
          answer: item.rightNum,
          displayAnswer: item.rightAnswer,
          steps: this.buildLessonSteps(item.knowledge, item.steps, item.rightAnswer),
          note: ''
        });
      } else {
        const r = solver.solveText(item.problem) || solver.genericGuide(item.problem);
        this.applyResult({
          source: 'local',
          problem: item.problem,
          knowledge: item.knowledge,
          answer: item.rightNum,
          displayAnswer: item.rightAnswer,
          steps: this.buildLessonSteps(item.knowledge, r.steps, item.rightAnswer),
          note: ''
        });
      }
    });
  },

  // 老师口吻的课堂步骤：开场白 + 讲解步骤 + 课堂小结（完整解答）
  buildLessonSteps(knowledge, steps, rightAnswerText) {
    const lib = solver.getKnowledge(knowledge);
    const arr = [{
      title: '开始上课',
      content: '别着急，老师陪你一起把这道题弄明白。先想一想：它考的是「' + knowledge + '」里的哪个方法？'
    }];
    (steps || []).forEach((s, i) => {
      arr.push({
        title: s.title || '第' + (i + 1) + '步',
        content: s.content || '',
        tip: s.tip || '',
        ask: s.ask || ''
      });
    });
    arr.push({
      title: '课堂小结',
      content: '我们一起整理一遍：\n这道题用的是「' + knowledge + '」的方法。' + lib.method +
        '\n完整解答：' + (rightAnswerText || '见上面步骤') + '。\n以后再遇到这类题，先回想这个方法，一步一步来，你一定行！'
    });
    return arr;
  },

  setKnowledgeCard(knowledge) {
    const lib = solver.getKnowledge(knowledge);
    this.setData({
      kName: knowledge,
      kDesc: lib.desc,
      kMethod: lib.method,
      kMistakes: lib.mistakes || ''
    });
  },

  // 生成变形题：AI 优先，失败用本地生成器，再失败退回随机练习
  loadVariant(problem, knowledge) {
    this.setData({ loading: true });
    ai.variant(problem, knowledge).then((res) => {
      if (res && res.problem) {
        this.applyResult(res);
        return;
      }
      const v = solver.variantByKnowledge(knowledge, problem);
      if (v) {
        this.applyResult(v);
        return;
      }
      wx.showToast({ title: '暂时没有合适的变形题，先做道同类练习吧', icon: 'none', duration: 2500 });
      this.newPractice();
    });
  },

  onVariant() {
    const originId = this.variantOf || this.wrongId || '';
    this.variantOf = originId;
    this.wrongId = '';
    this.practiceMode = 'variant';
    this.setData({ isRetry: false });
    wx.showLoading({ title: '生成变形题…' });
    ai.variant(this.data.problem, this.data.knowledge).then((res) => {
      wx.hideLoading();
      if (res && res.problem) {
        this.applyResult(res);
        return;
      }
      const v = solver.variantByKnowledge(this.data.knowledge, this.data.problem);
      if (v) {
        this.applyResult(v);
        return;
      }
      wx.showToast({ title: '暂时没有合适的变形题，先做道同类练习吧', icon: 'none', duration: 2500 });
      this.onAgain();
    });
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/wrongbook/wrongbook' })
    });
  },

  newPractice() {
    this.startTs = Date.now();
    this.wrongId = '';
    this.practiceMode = 'practice';
    this.variantOf = '';
    this.setData({ isRetry: false });
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
      feedbackText: '',
      showVariant: false,
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
        // 引导优先：给鼓励 + 指向具体步骤的提示，而不是直接判错
        const hint = util.pick([
          '差一点点！回看第 2 步，会有启发哦 💪',
          '再想想哦，把第 3 步重看一遍，你很接近了 ✨',
          '别着急！检查一下数字有没有抄错、单位有没有写 ✅',
          '思路不错！先回看上面的步骤，再试一次 👀'
        ]);
        this.setData({ feedbackText: hint });
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
    const attempts = this.data.wrongTimes + 1; // 第几次作答定结果（行为数据）
    const mode = this.practiceMode || 'practice';
    storage.addRecord({
      ok: correct,
      seconds: seconds,
      attempts: attempts,
      knowledge: this.data.knowledge,
      problem: this.data.problem,
      mode: mode
    });

    const praise = correct
      ? (this.data.wrongTimes > 0
          ? util.pick([
              '调整后答对了！你学会了检查，太棒了！🌟',
              '第二次就做对了，这个检查习惯真厉害！👏',
              '你停下来想了想就做对了，这就是进步！🚀'
            ])
          : util.pick(['太棒了！🎉', '你真厉害！🌟', '算得又快又准！⚡', '小数学家，继续加油！🚀']))
      : '没关系，错题已经帮你记进错题本啦，下次一定能做对！💪';

    let addedToWrong = false;
    if (correct) {
      if (this.wrongId) {
        storage.markMastered(this.wrongId);
        sync.sendMaster(this.data.problem);
      }
      // 变形题做对 → 原错题自动标记已掌握
      if (this.variantOf && this.variantOf !== this.wrongId) {
        const origin = storage.getWrongById(this.variantOf);
        if (origin) {
          storage.markMastered(this.variantOf);
          sync.sendMaster(origin.problem);
        }
      }
    } else if (this.wrongId) {
      storage.bumpWrong(this.wrongId);
      const item = storage.getWrongById(this.wrongId);
      if (item) sync.sendWrong(item);
    } else {
      storage.addWrongBook({
        problem: this.data.problem,
        myAnswer: userAnswer || '未作答',
        rightAnswer: this.data.rightAnswerText || '见步骤',
        rightNum: this.rightNum,
        steps: this.data.steps,
        knowledge: this.data.knowledge
      });
      const item = storage.getWrongBook().find((i) => i.problem === this.data.problem);
      if (item) sync.sendWrong(item);
      addedToWrong = true;
    }

    // 上报一条练习记录（家长端统计用）
    sync.sendRecord({
      ok: correct,
      seconds: seconds,
      attempts: attempts,
      knowledge: this.data.knowledge,
      mode: mode
    });

    this.setData({
      phase: correct ? 'right' : 'wrong',
      praise: praise,
      addedToWrong: addedToWrong,
      seconds: seconds,
      showVariant: !correct
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
