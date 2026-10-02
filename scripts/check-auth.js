// 账号认证单测：node scripts/check-auth.js
const auth = require('../server/auth');
const db = require('../server/db');

let fail = 0;
const assert = (c, m) => {
  if (!c) {
    fail++;
    console.log('✗ ' + m);
  }
};

// ---------- 密码哈希 ----------
{
  const h1 = auth.hashPassword('secret123');
  const h2 = auth.hashPassword('secret123');
  assert(h1 !== h2, '同密码两次哈希应不同（随机盐）');
  assert(h1.indexOf('$') > 0, '哈希应为 salt$hash 格式');
  assert(auth.verifyPassword('secret123', h1) === true, '正确密码应通过');
  assert(auth.verifyPassword('wrong', h1) === false, '错误密码应拒绝');
  assert(auth.verifyPassword('secret123', '') === false, '空存储应拒绝');
}

// ---------- token 签发与校验 ----------
{
  const token = auth.issueToken(42);
  assert(token.indexOf('.') > 0, 'token 应含签名分隔符');
  assert(auth.verifyToken(token) === 42, '有效 token 应返回 userId');
  assert(auth.verifyToken(token + 'x') === null, '篡改 token 应拒绝');
  assert(auth.verifyToken(token.slice(0, -4) + 'aaaa') === null, '篡改签名应拒绝');
  assert(auth.verifyToken('') === null, '空 token 应拒绝');
  assert(auth.verifyToken('abc') === null, '格式错误应拒绝');
  // 过期 token（7 天前签发）
  const expired = auth.issueToken(42, Date.now() - auth.TOKEN_TTL_MS - 1000);
  assert(auth.verifyToken(expired) === null, '过期 token 应拒绝');
  // 未过期（6 天前）
  const valid = auth.issueToken(42, Date.now() - 6 * 86400000);
  assert(auth.verifyToken(valid) === 42, '未过期 token 应通过');
}

// ---------- 用户与孩子档案 ----------
{
  db.init();
  const phone = '139' + String(Math.floor(10000000 + Math.random() * 89999999));
  const id = db.createUser(phone, auth.hashPassword('pass123'));
  assert(id !== null, '创建用户应成功');
  assert(db.createUser(phone, auth.hashPassword('pass123')) === null, '重复手机号应拒绝');
  const u = db.getUserByPhone(phone);
  assert(u && u.id === id && u.password_hash !== 'pass123', '用户应可查且密码为哈希');
  assert(auth.verifyPassword('pass123', u.password_hash) === true, '存储密码往返校验');

  const code = 'TEST' + String(Math.floor(100000 + Math.random() * 899999));
  assert(db.addChildProfile(id, '小宇', code) === true, '添加孩子应成功');
  assert(db.addChildProfile(id, '小宇2', code) === false, '重复孩子码应拒绝');
  assert(db.findChildByCode(code) !== null, '按码查孩子应命中');
  assert(db.listChildren(id).length === 1, '孩子列表应含 1 个');
  assert(db.childCountByUser(id) === 1, '孩子计数应为 1');

  // 清理测试数据
  db.deleteUserByPhone(phone);
  console.log('  （测试账号 ' + phone + ' 已清理）');
}

console.log(fail ? '❌ 存在 ' + fail + ' 个问题' : '✅ 账号认证单测全部通过');
process.exit(fail ? 1 : 0);
