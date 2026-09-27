const storage = require('../../utils/storage');

Page({
  data: {
    stats: null,
    bars: [],
    kbars: [],
    accuracyText: '--',
    advice: ''
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const s = storage.getStats();

    const max = Math.max.apply(null, [1].concat(s.last7.map((d) => d.count)));
    const bars = s.last7.map((d) => ({
      date: d.date,
      label: d.label,
      count: d.count,
      h: d.count === 0 ? 10 : Math.round(30 + (d.count / max) * 150)
    }));

    const kmax = Math.max.apply(null, [1].concat(s.knowledge.map((k) => k.count)));
    const kbars = s.knowledge.slice(0, 6).map((k) => ({
      name: k.name,
      count: k.count,
      w: Math.round(25 + (k.count / kmax) * 75)
    }));

    this.setData({
      stats: s,
      bars: bars,
      kbars: kbars,
      accuracyText: s.accuracy === null ? '--' : Math.round(s.accuracy * 100) + '%',
      advice: this.makeAdvice(s)
    });
  },

  makeAdvice(s) {
    if (s.total === 0) {
      return '孩子还没有开始练习。可以从首页的"每日练习"开始，每天 3~5 道题，坚持就有进步！';
    }
    const pct = Math.round(s.accuracy * 100) + '%';
    let text;
    if (s.accuracy >= 0.9) {
      text = '正确率很高（' + pct + '），基础扎实！可以适当挑战难题，或提前预习。';
    } else if (s.accuracy >= 0.7) {
      text = '正确率不错（' + pct + '）。建议每天把错题本里的题复习一遍，巩固薄弱点。';
    } else if (s.accuracy >= 0.5) {
      text = '正确率一般（' + pct + '）。建议家长陪着孩子重做错题，找到卡住的地方。';
    } else {
      text = '最近错误偏多（' + pct + '）。先别急着做新题，把错题一道道讲清楚更重要。';
    }
    if (s.knowledge.length) {
      text +=
        ' 错题主要集中在：' + s.knowledge.slice(0, 3).map((k) => k.name).join('、') + '。';
    }
    return text;
  },

  reset() {
    wx.showModal({
      title: '重置数据',
      content: '将清空所有练习记录和错题，确定吗？',
      confirmText: '重置',
      confirmColor: '#FF6B6B',
      success: (r) => {
        if (r.confirm) {
          storage.resetAll();
          this.refresh();
        }
      }
    });
  }
});
