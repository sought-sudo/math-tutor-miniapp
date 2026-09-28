// 家长端入口页：展示本机同步码与同步状态，指引家长在浏览器打开家长端网页
const config = require('../../utils/config');
const storage = require('../../utils/storage');
const sync = require('../../utils/sync');

Page({
  data: {
    syncCode: '',
    childName: '',
    nameInput: '',
    editing: false,
    syncOn: false,
    lastSyncText: '未同步',
    parentUrl: '',
    stats: { today: 0, activeCount: 0 },
    accuracyText: '--'
  },

  onShow() {
    const s = storage.getStats();
    const syncOn = !!(config.sync.enabled && config.sync.baseUrl);
    this.setData({
      syncCode: storage.getSyncCode(),
      childName: storage.getChildName(),
      nameInput: storage.getChildName(),
      syncOn: syncOn,
      lastSyncText: storage.getLastSync() ? this.fmtTime(storage.getLastSync()) : '未同步',
      parentUrl: syncOn ? config.sync.baseUrl.replace(/\/$/, '') + '/parent' : '',
      stats: { today: s.today, activeCount: s.activeCount },
      accuracyText: s.accuracy === null ? '--' : Math.round(s.accuracy * 100) + '%'
    });
  },

  fmtTime(ts) {
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' : '') + n;
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  },

  copyCode() {
    wx.setClipboardData({ data: this.data.syncCode });
  },

  startEdit() {
    this.setData({ editing: true, nameInput: this.data.childName });
  },

  onNameInput(e) {
    this.setData({ nameInput: e.detail.value });
  },

  saveName() {
    const name = (this.data.nameInput || '').trim() || '小朋友';
    storage.setChildName(name);
    this.setData({ childName: name, editing: false });
    sync.sendName(name);
    wx.showToast({ title: '已保存', icon: 'success' });
  }
});
