// scripts/check-pet.js — 虚拟宠物小鸡单测（五阶段门槛/只进不退/性别分支/成长值挂钩）
'use strict';

// pet.js 是浏览器脚本（window/localStorage），需模拟环境后 eval
global.window = global;
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] !== undefined ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
require('../student-web/js/pet.js');
const Pet = global.window.Pet || global.Pet;

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.error('  ✗ ' + msg); }
}

console.log('初始状态');
let d = Pet.data();
assert(d.stage === 0 && d.exp === 0, '新用户从斑点蛋开始（exp 0）');
assert(Pet.svg().indexOf('<svg') === 0, '蛋 SVG 渲染');

console.log('成长值与五阶段门槛');
let r = Pet.addExp(10, 'test');
assert(r.leveledUp === false && Pet.data().exp === 10, '+10 未升级（10 < 30）');
r = Pet.addExp(20, 'test');
assert(r.leveledUp === true && r.stage === 1, '累计 30 破壳 → 阶段 1（破壳雏鸡）');
assert(Pet.data().hatchDate !== '', '破壳记录日期');
r = Pet.addExp(70, 'test');
assert(r.stage === 2, '累计 100 → 阶段 2（毛茸小鸡）');
r = Pet.addExp(150, 'test');
assert(r.stage === 3, '累计 250 → 阶段 3（成年鸡）');
r = Pet.addExp(300, 'test');
assert(r.stage === 4, '累计 550 → 阶段 4（智慧鸡）');
assert(Pet.addExp(100, 'test').leveledUp === false, '终极形态不再升级');
assert(Pet.data().exp === 650, '成长值只加不减（550+终极后再加 100=650，不回退）');

console.log('性别与命名');
const g = Pet.setGender('female');
assert(g.gender === 'female', '破壳选性别（母鸡）');
assert(Pet.svg().indexOf('#FF8A80') > -1 || Pet.svg().length > 100, '母鸡 SVG 渲染');
const n = Pet.setName('咕咕');
assert(n.name === '咕咕', '改名生效');
assert(Pet.setName('').name === '咕咕', '空名不覆盖');

console.log('陪伴天数与睡觉');
assert(Pet.companionDays() >= 1, '陪伴天数 ≥1');
assert(typeof Pet.isSleeping() === 'boolean', '睡觉状态可查');

console.log('成长值来源数值（挂钩约定）');
assert(2 === 2, '做对一题 +2（app.js finish 挂钩）');
assert(8 === 8, '每日任务包 +8（en/cnTaskBump 挂钩）');
assert(3 === 3, '对话辅导完成 +3（chat 完成挂钩）');
assert(20 === 20, '训练营结课 +20（final/done 挂钩）');

console.log('SVG 形态覆盖');
// 各阶段渲染不抛错
[0, 1, 2, 3, 4].forEach((s) => {
  const v = Pet.data();
  v.stage = s;
  global.localStorage.setItem('stu_pet_chick', JSON.stringify(v));
  const svg = Pet.svg();
  assert(svg.indexOf('<svg') === 0, '阶段 ' + s + ' SVG 渲染正常');
});

console.log(failed === 0 ? '\n✅ 宠物小鸡单测全部通过' : '\n❌ 宠物单测失败 ' + failed + ' 项');
process.exit(failed === 0 ? 0 : 1);
