Component({
  properties: {
    current: {
      type: String,
      value: 'home'
    }
  },
  data: {
    items: [
      { key: 'home', label: '首页', icon: '🏠', url: '/pages/index/index' },
      { key: 'camera', label: '拍照识题', icon: '📷', url: '/pages/camera/camera' },
      { key: 'wrong', label: '错题本', icon: '📕', url: '/pages/wrongbook/wrongbook' },
      { key: 'report', label: '家长报告', icon: '📊', url: '/pages/report/report' }
    ]
  },
  methods: {
    go(e) {
      const url = e.currentTarget.dataset.url;
      if (!url) return;
      wx.reLaunch({ url: url });
    }
  }
});
