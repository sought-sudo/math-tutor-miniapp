// server/rateLimit.js — 内存滑动窗口限流（零依赖，单实例场景）
// 每 key 在 windowMs 内最多 limit 次；超限由调用方返回 429

const buckets = new Map(); // key -> { start, count }

function allow(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

// 惰性清理过期桶，防止内存无限增长
function sweep() {
  if (buckets.size < 500) return;
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now - b.start > 3600000) buckets.delete(k);
  }
}

module.exports = { allow: allow, sweep: sweep };
