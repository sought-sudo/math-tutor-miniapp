const storage = require('../../utils/storage');
const util = require('../../utils/util');

Page({
  data: {
    greeting: '你好',
    stats: { today: 0, activeCount: 0 },
    accuracyText: '--',
    tip: ''
  },

  onShow() {
    const hour = new Date().getHours();
    const greeting =
      hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    const s = storage.getStats();
    this.setData({
      greeting: greeting,
      stats: { today: s.today, activeCount: s.activeCount },
      accuracyText: s.accuracy === null ? '--' : Math.round(s.accuracy * 100) + '%',
      tip: util.pick([
        '先算乘除，后算加减，有括号先算括号里的！',
        '计算完后记得验算，别忘了单位和"答"。',
        '错题多复习一遍，比做新题更有用哦！',
        '遇到应用题，先找"已知条件"和"问题"。',
        '每天练 3~5 道题，坚持就是胜利！'
      ])
    });
  },

  goCamera() {
    wx.navigateTo({ url: '/pages/camera/camera' });
  },
  goPractice() {
    wx.navigateTo({ url: '/pages/guide/guide' });
  },
  goWrong() {
    wx.reLaunch({ url: '/pages/wrongbook/wrongbook' });
  },
  goReport() {
    wx.reLaunch({ url: '/pages/report/report' });
  }
});
