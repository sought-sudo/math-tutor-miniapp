const storage = require('../../utils/storage');
const sync = require('../../utils/sync');

Page({
  data: {
    tab: 'active',
    actives: [],
    mastered: []
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const all = storage.getWrongBook();
    this.setData({
      actives: all.filter((i) => i.status === 'active'),
      mastered: all.filter((i) => i.status === 'mastered')
    });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  retry(e) {
    wx.navigateTo({ url: '/pages/guide/guide?wrongId=' + e.currentTarget.dataset.id });
  },

  explain(e) {
    wx.navigateTo({ url: '/pages/guide/guide?mode=explain&wrongId=' + e.currentTarget.dataset.id });
  },

  variant(e) {
    wx.navigateTo({ url: '/pages/guide/guide?mode=variant&wrongId=' + e.currentTarget.dataset.id });
  },

  master(e) {
    const id = e.currentTarget.dataset.id;
    const item = storage.getWrongBook().find((i) => i.id === id);
    wx.showModal({
      title: '标记已掌握',
      content: '确认这道题已经会做了吗？',
      success: (r) => {
        if (r.confirm) {
          storage.markMastered(id);
          if (item) sync.sendMaster(item.problem);
          this.refresh();
        }
      }
    });
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    const item = storage.getWrongBook().find((i) => i.id === id);
    wx.showModal({
      title: '删除错题',
      content: '删除后无法恢复，确定删除这道错题吗？',
      success: (r) => {
        if (r.confirm) {
          storage.removeWrong(id);
          if (item) sync.sendDeleteWrong(item.problem);
          this.refresh();
        }
      }
    });
  },

  clearMastered() {
    wx.showModal({
      title: '清空已掌握',
      content: '把"已掌握"的错题全部清空？',
      success: (r) => {
        if (r.confirm) {
          storage.clearMastered();
          sync.sendClearMastered();
          this.refresh();
        }
      }
    });
  }
});
