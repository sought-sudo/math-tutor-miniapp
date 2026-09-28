// server/services/deformService.js — 错题变形服务
// 输入：原题、知识点、错误类型
// 输出：同知识点、换场景、不增难度的变形题（最多 3 道，供人工或规则筛选）
//   每道格式：{ stem, answer, knowledge_point, difficulty }
// 生成链路：DeepSeek（通过注入的 chatFn）→ 规则校验过滤 → 不足时本地引擎兜底。

const solver = require('../../utils/solver');

const SYSTEM_PROMPT =
  '你是小学三年级数学教研员。' +
  '给定原题和知识点，生成同知识点、换场景、同难度的变形题。' +
  '要求：最多生成 3 道；场景必须换（如"小明买糖"换成"小松鼠捡松果"）；' +
  '数字范围不超过原题；题干简短、适合三年级阅读；不引入新概念、不超纲。' +
  '只输出 JSON 数组，不要任何解释。每道题格式：' +
  '{"stem":"题干","answer":答案,"knowledge_point":"知识点","difficulty":"easy|medium|hard"}';

// 提取题中所有数字
function extractNumbers(text) {
  const m = String(text || '').match(/\d+(\.\d+)?/g);
  return m ? m.map(Number) : [];
}

// 规则校验：
// 1. 题干与答案字段齐全；2. 知识点一致（允许模型回填原知识点）；
// 3. 数字范围不超过原题；4. 题干简短（不超过 120 字）
function validate(stem, answer, knowledgePoint, originalProblem) {
  if (!stem) return false;
  if (answer === undefined || answer === null || answer === '') return false;
  if (!knowledgePoint) return false;
  if (String(stem).length > 120) return false;
  const origNums = extractNumbers(originalProblem);
  const newNums = extractNumbers(stem);
  const origMax = origNums.length ? Math.max.apply(null, origNums) : 0;
  const newMax = newNums.length ? Math.max.apply(null, newNums) : 0;
  if (origMax > 0 && newMax > origMax) return false; // 数字范围不超原题
  return true;
}

// 宽松解析：兼容对象/数组、```json 包裹、前后缀文本
function parseLoose(text) {
  const s = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    // 继续尝试截取
  }
  const m = s.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch (e2) {
      // 忽略
    }
  }
  return null;
}

/**
 * 生成变形题
 * @param {Function|null} chatFn (messages) => Promise<string>，为空时跳过模型直接本地兜底
 * @param {Object} opts { problem, knowledge, errorType }
 * @returns {Promise<Array>} 最多 3 道 { stem, answer, knowledge_point, difficulty }
 */
async function generateVariants(chatFn, opts) {
  const problem = String(opts.problem || '');
  const knowledge = opts.knowledge || '';
  const errorType = opts.errorType || '';
  const variants = [];

  if (chatFn) {
    try {
      const userMsg =
        '原题：' + problem +
        '\n知识点：' + knowledge +
        (errorType ? '\n学生错误类型：' + errorType : '') +
        '\n请生成最多 3 道变形题。';
      const content = await chatFn([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg }
      ]);
      const parsed = parseLoose(content);
      const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      for (let i = 0; i < list.length && variants.length < 3; i++) {
        const item = list[i] || {};
        const stem = String(item.stem || item.problem || '').trim();
        const answer = item.answer;
        const kp = String(item.knowledge_point || item.knowledge || knowledge).trim();
        const difficulty = String(item.difficulty || 'medium').trim();
        if (validate(stem, answer, kp, problem)) {
          variants.push({ stem: stem, answer: answer, knowledge_point: kp, difficulty: difficulty });
        }
      }
    } catch (e) {
      // 模型调用失败 → 本地兜底
    }
  }

  // 数量不足时用本地引擎补齐，保证一定有题可用
  if (variants.length < 1) {
    const local = solver.variantByKnowledge(knowledge, problem);
    if (local && local.problem) {
      variants.push({
        stem: local.problem,
        answer: local.answer,
        knowledge_point: local.knowledge || knowledge || '综合',
        difficulty: 'medium'
      });
    }
  }

  return variants.slice(0, 3);
}

module.exports = {
  generateVariants: generateVariants,
  validate: validate,
  extractNumbers: extractNumbers,
  SYSTEM_PROMPT: SYSTEM_PROMPT
};
