// 通用工具函数

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 从用户输入中提取第一个数字（支持小数、负号），提取不到返回 null
function extractNumber(str) {
  const m = String(str).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function formatSeconds(sec) {
  if (sec < 60) return sec + '秒';
  return Math.floor(sec / 60) + '分' + (sec % 60) + '秒';
}

module.exports = {
  pick: pick,
  extractNumber: extractNumber,
  formatSeconds: formatSeconds
};
