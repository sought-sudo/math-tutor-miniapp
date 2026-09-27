const config = require('../../utils/config');
const ai = require('../../utils/ai');

Page({
  data: {
    imgPath: '',
    recognizing: false,
    recogText: '',
    demoNotice: false,
    samples: []
  },

  onLoad() {
    this.setData({ samples: ai.sampleProblems(3) });
  },

  takePhoto() {
    const ctx = wx.createCameraContext();
    ctx.takePhoto({
      quality: 'high',
      success: (res) => this.handleImage(res.tempImagePath),
      fail: () => wx.showToast({ title: '拍照失败，请重试', icon: 'none' })
    });
  },

  chooseAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0];
        if (f) this.handleImage(f.tempFilePath);
      },
      fail: () => {}
    });
  },

  onReset() {
    this.setData({ imgPath: '', recogText: '', demoNotice: false, recognizing: false });
  },

  handleImage(path) {
    this.setData({ imgPath: path, recognizing: true, recogText: '', demoNotice: false });
    if (config.ocr.enabled && config.ocr.baseUrl) {
      this.callOcr(path);
    } else {
      // 演示模式：模拟识别过程，提示手动输入
      setTimeout(() => {
        this.setData({ recognizing: false, demoNotice: true });
        wx.showToast({ title: '演示模式：请手动输入题目', icon: 'none' });
      }, 900);
    }
  },

  callOcr(path) {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: path,
      encoding: 'base64',
      success: (res) => {
        wx.request({
          url: config.ocr.baseUrl.replace(/\/$/, '') + '/ocr',
          method: 'POST',
          data: { image: res.data },
          timeout: 25000,
          success: (r) => {
            this.setData({ recognizing: false });
            const d = r.data || {};
            if (d && d.ok && d.text) {
              this.setData({ recogText: String(d.text).trim() });
            } else {
              this.setData({ demoNotice: true });
              wx.showToast({ title: '识别失败，请手动输入', icon: 'none' });
            }
          },
          fail: () => {
            this.setData({ recognizing: false, demoNotice: true });
            wx.showToast({ title: '网络异常，请手动输入', icon: 'none' });
          }
        });
      },
      fail: () => this.setData({ recognizing: false, demoNotice: true })
    });
  },

  onInput(e) {
    this.setData({ recogText: e.detail.value });
  },

  useSample(e) {
    const i = e.currentTarget.dataset.index;
    const p = this.data.samples[i];
    if (!p) return;
    getApp().globalData.pendingProblem = p.problem;
    wx.navigateTo({ url: '/pages/guide/guide' });
  },

  startGuide() {
    const t = (this.data.recogText || '').trim();
    if (!t) {
      wx.showToast({ title: '请先输入或识别题目', icon: 'none' });
      return;
    }
    getApp().globalData.pendingProblem = t;
    wx.navigateTo({ url: '/pages/guide/guide' });
  }
});
