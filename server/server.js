/**
 * 数学辅导小程序 · 可选后端（Node >= 18，零依赖）
 *
 * 作用：把小程序里的"拍照识题 / 分步讲解"接到真实大模型。
 * 不启动它时，小程序使用内置本地引擎（演示模式）也能完整运行。
 *
 * 启动（Windows CMD）：
 *   set LLM_BASE_URL=https://api.deepseek.com
 *   set LLM_API_KEY=sk-xxxx
 *   node server.js
 *
 * 环境变量：
 *   PORT         端口，默认 8787
 *   LLM_BASE_URL OpenAI 兼容接口地址（DeepSeek / Qwen / GLM / OpenAI 均可）
 *   LLM_API_KEY  接口密钥
 *   LLM_MODEL    分步讲解用模型，默认 deepseek-chat
 *   OCR_MODEL    识图用模型（需支持视觉输入），如 qwen-vl-plus / glm-4v / gpt-4o
 *                未设置时用 LLM_MODEL（需该模型支持视觉）
 *
 * 接口：
 *   POST /tutor  body: { problem: "题目文字" }   返回分步讲解 JSON
 *   POST /ocr    body: { image: "<base64图片>" } 返回 { text: "识别出的题目" }
 */
const http = require('http');

const PORT = Number(process.env.PORT) || 8787;
const LLM_BASE_URL = (process.env.LLM_BASE_URL || '').replace(/\/$/, '');
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const OCR_MODEL = process.env.OCR_MODEL || LLM_MODEL;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > (limit || 6 * 1024 * 1024)) reject(new Error('请求体过大'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function chat(messages, model) {
  if (!LLM_BASE_URL || !LLM_API_KEY) {
    throw new Error('后端未配置 LLM_BASE_URL / LLM_API_KEY');
  }
  const resp = await fetch(LLM_BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + LLM_API_KEY
    },
    body: JSON.stringify({
      model: model || LLM_MODEL,
      messages: messages,
      temperature: 0.3
    })
  });
  if (!resp.ok) throw new Error('大模型接口返回 HTTP ' + resp.status);
  const j = await resp.json();
  const content =
    j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!content) throw new Error('大模型返回为空');
  return content;
}

function parseJson(text) {
  const s = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (e2) {
        // 忽略，走下方 null
      }
    }
    return null;
  }
}

const TUTOR_SYSTEM =
  '你是小学四年级数学辅导老师。请分步讲解题目，并只返回 JSON：' +
  '{"answer": 数值, "displayAnswer": "带单位的完整答案", "knowledge": "知识点名称", ' +
  '"steps": [{"title": "第1步", "content": "讲解内容"}]}。' +
  '要求：步骤 4~6 步，每步只讲一个要点，语言亲切易懂、适合小学生；answer 尽量是纯数字；不要输出 JSON 以外的内容。';

const OCR_SYSTEM =
  '你是 OCR 识别助手。识别图片中的数学题，只输出题目文字本身，不要任何解释。如果图中没有数学题，输出：未识别到题目。';

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/tutor') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.problem) throw new Error('缺少参数 problem');
      const content = await chat(
        [
          { role: 'system', content: TUTOR_SYSTEM },
          { role: 'user', content: body.problem }
        ],
        LLM_MODEL
      );
      const j = parseJson(content);
      if (!j || !Array.isArray(j.steps) || !j.steps.length) {
        throw new Error('解析讲解失败：' + String(content).slice(0, 200));
      }
      send(res, 200, Object.assign({ ok: true }, j));
      return;
    }

    if (req.method === 'POST' && req.url === '/ocr') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body.image) throw new Error('缺少参数 image(base64)');
      const content = await chat(
        [
          { role: 'system', content: OCR_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请识别这张图片里的数学题：' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/jpeg;base64,' + body.image }
              }
            ]
          }
        ],
        OCR_MODEL
      );
      send(res, 200, { ok: true, text: content.trim() });
      return;
    }

    send(res, 404, { ok: false, error: '接口不存在' });
  } catch (e) {
    send(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
});

server.listen(PORT, () => {
  console.log('数学辅导后端已启动：http://127.0.0.1:' + PORT);
  console.log('接口：POST /tutor（分步讲解）、POST /ocr（拍照识题）');
});
