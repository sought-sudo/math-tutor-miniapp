/**
 * ===== AI 能力配置 =====
 *
 * 演示模式（默认）：小程序使用内置的本地解题引擎，完全离线可用，
 * 拍照识题后需手动输入题目文字。
 *
 * 真实 AI 模式：
 * 1. 启动可选后端：node server/server.js（需配置大模型密钥，见 README）
 * 2. 把下面 baseUrl 填成后端地址（如 http://127.0.0.1:8787），enabled 改为 true
 * 3. 微信开发者工具需勾选「详情 → 本地设置 → 不校验合法域名」
 *    真机调试需在公众平台把域名加入 request/uploadFile 合法域名（需 HTTPS）。
 */
module.exports = {
  llm: {
    enabled: false, // 是否调用大模型做分步讲解
    baseUrl: ''     // 例如 http://127.0.0.1:8787
  },
  ocr: {
    enabled: false, // 是否调用后端 OCR 识别题目
    baseUrl: ''     // 例如 http://127.0.0.1:8787
  }
};
