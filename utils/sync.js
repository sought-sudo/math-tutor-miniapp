// 数据同步层：把练习记录和错题变化上报到后端，供家长端网页查看。
// 未开启时（config.sync.enabled = false）完全不影响本地使用；发送失败也静默忽略。

const config = require('./config');
const storage = require('./storage');

function send(type, data) {
  if (!config.sync.enabled || !config.sync.baseUrl) return;
  wx.request({
    url: config.sync.baseUrl.replace(/\/$/, '') + '/api/sync',
    method: 'POST',
    data: {
      code: storage.getSyncCode(),
      name: storage.getChildName(),
      type: type,
      data: data
    },
    timeout: 10000,
    success: () => storage.setLastSync(Date.now()),
    fail: () => {}
  });
}

function sendRecord(rec) {
  send('record', {
    ts: Date.now(),
    ok: !!rec.ok,
    seconds: rec.seconds || 0,
    attempts: rec.attempts || 1,
    knowledge: rec.knowledge || '',
    mode: rec.mode || 'practice'
  });
}

function sendWrong(item) {
  send('wrong', {
    problem: item.problem,
    myAnswer: item.myAnswer || '',
    rightAnswer: item.rightAnswer || '',
    knowledge: item.knowledge || '综合',
    times: item.times || 1
  });
}

function sendMaster(problem) {
  send('master', { problem: problem });
}

function sendDeleteWrong(problem) {
  send('deleteWrong', { problem: problem });
}

function sendClearMastered() {
  send('clearMastered', {});
}

function sendName(name) {
  send('name', { name: name });
}

module.exports = {
  send: send,
  sendRecord: sendRecord,
  sendWrong: sendWrong,
  sendMaster: sendMaster,
  sendDeleteWrong: sendDeleteWrong,
  sendClearMastered: sendClearMastered,
  sendName: sendName
};
