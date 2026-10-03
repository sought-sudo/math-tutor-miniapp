// server/services/lessonService.js — 训练营概念课例题生成
// 输入：知识点；输出 { problem, steps:[{title,content}] }（老师讲解式，最后一步可给完整解答）
// 生成链路：DeepSeek（小狐老师角色）→ 解析校验 → 本地概念选择题组兜底。
// 概念型知识点本地只有选择题、没有例题，这里补上"讲解"素材。

const mcq = require('../../utils/mcq');

const SYSTEM_PROMPT =
  '你是小学数学辅导班老师"小狐老师"，负责给四年级"查漏补缺训练营"的概念课出一道例题。' +
  '要求：1) 围绕知识点出 1 道概念例题，只用四年级已学知识（不要用到补角、余角等超前概念）；2) 给出 2~4 步的分步讲解，每步含 title 与 content，' +
  '最后一步可以给出完整解答（这是老师讲解环节，不是考学生）；3) 语言适合小学生，每步不超过 60 字。' +
  '只输出 JSON，不要解释：{"problem":"...","steps":[{"title":"...","content":"..."}]}';

function parseLoose(text) {
  const s = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    // 继续尝试截取
  }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch (e2) {
      // 忽略
    }
  }
  return null;
}

function validate(o) {
  if (!o || typeof o.problem !== 'string') return false;
  if (!o.problem.trim() || o.problem.length > 120) return false;
  if (!Array.isArray(o.steps) || o.steps.length < 2) return false;
  return o.steps.every((s) => s && s.title && String(s.content || '').length > 0 && String(s.content).length <= 150);
}

// 本地兜底：概念选择题本身带讲解步骤（末步为"想一想"引导），可直接当例题页
function localFallback(knowledge) {
  const q = mcq.generateMcqByKnowledge(knowledge);
  return {
    problem: q.problem,
    steps: (q.steps || []).map((s) => ({ title: s.title, content: s.content })),
    source: 'local'
  };
}

async function generateConceptExample(chatFn, knowledge) {
  if (chatFn) {
    try {
      const userMsg = '知识点：' + knowledge + '。请出例题并分步讲解。';
      const text = await chatFn([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg }
      ]);
      const o = parseLoose(text);
      if (validate(o)) {
        return { problem: o.problem, steps: o.steps, source: 'ai' };
      }
    } catch (e) {
      // LLM 失败走本地兜底
    }
  }
  return localFallback(knowledge);
}

module.exports = {
  generateConceptExample: generateConceptExample,
  validate: validate,
  localFallback: localFallback,
  SYSTEM_PROMPT: SYSTEM_PROMPT
};
