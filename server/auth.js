// server/auth.js — 账号认证（零依赖：node:crypto）
// 密码：PBKDF2（16 字节盐 + 100000 次迭代 + SHA-256），存 salt$hash
// 会话：无状态 HMAC 签名 token（7 天有效），Authorization: Bearer <token>

const crypto = require('crypto');

const SERVER_SECRET = process.env.SERVER_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SERVER_SECRET) {
  console.warn('[auth] 未设置 SERVER_SECRET，服务重启后所有会话失效；生产环境请设置环境变量 SERVER_SECRET');
}

const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000; // 7 天

// ---------------- 密码哈希 ----------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 32, 'sha256').toString('hex');
  return salt + '$' + hash;
}

function verifyPassword(password, stored) {
  if (!stored || stored.indexOf('$') < 0) return false;
  const parts = String(stored).split('$');
  const hash = crypto.pbkdf2Sync(String(password), parts[0], 100000, 32, 'sha256');
  const expected = Buffer.from(parts[1], 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

// ---------------- 会话 token ----------------

// issuedAt 参数供单测构造过期 token
function issueToken(userId, issuedAt) {
  const payload = Buffer.from(userId + ':' + (issuedAt || Date.now())).toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}

// 校验通过返回 userId，失败返回 null
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', SERVER_SECRET).update(parts[0]).digest('base64url');
  const sigBuf = Buffer.from(parts[1]);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const decoded = Buffer.from(parts[0], 'base64url').toString();
    const seg = decoded.split(':');
    const userId = parseInt(seg[0], 10);
    const issuedAt = parseInt(seg[1], 10);
    if (!userId || !issuedAt) return null;
    if (Date.now() - issuedAt > TOKEN_TTL_MS) return null;
    return userId;
  } catch (e) {
    return null;
  }
}

// 从请求头解析 Bearer token
function getToken(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

module.exports = {
  SERVER_SECRET: SERVER_SECRET,
  TOKEN_TTL_MS: TOKEN_TTL_MS,
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  issueToken: issueToken,
  verifyToken: verifyToken,
  getToken: getToken
};
