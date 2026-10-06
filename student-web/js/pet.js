// student-web/js/pet.js — 学习养成虚拟宠物「小鸡」（纯 SVG，零依赖）
// 五阶段：0 斑点蛋 → 1 破壳雏鸡(30) → 2 毛茸小鸡(100) → 3 成年鸡(250，破壳时选性别) → 4 智慧鸡(500)
// 只成长不退化；Exp 来源：做题/每日任务/对话/结课（挂钩在 app.js）。
// 状态：localStorage stu_pet_chick = { exp, stage, gender, name, hatchDate, lastActiveDate, feedLog }

(function () {
  'use strict';

  var KEY = 'stu_pet_chick';
  var STAGES = [
    { min: 0, name: '斑点蛋', emoji: '🥚' },
    { min: 30, name: '破壳雏鸡', emoji: '🐣' },
    { min: 100, name: '毛茸小鸡', emoji: '🐤' },
    { min: 250, name: '成年鸡', emoji: '🐔' },
    { min: 500, name: '智慧鸡', emoji: '🐔‍🎓' }
  ];

  function today() {
    var d = new Date();
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function daysBetween(a, b) {
    if (!a || !b) return 0;
    return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
  }

  function get() {
    var v = null;
    try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!v) {
      v = { exp: 0, stage: 0, gender: '', name: '蛋蛋', hatchDate: '', lastActiveDate: today(), feedLog: {} };
      save(v);
    }
    // 阶段只进不退
    var stage = stageOf(v.exp);
    if (stage > v.stage) { v.stage = stage; if (stage >= 1 && !v.hatchDate) v.hatchDate = today(); save(v); }
    return v;
  }

  function save(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
  }

  function stageOf(exp) {
    var s = 0;
    STAGES.forEach(function (st, i) { if (exp >= st.min) s = i; });
    return s;
  }

  // 当前阶段区间 [min, next) 与下一阶段信息
  function stageInfo(v) {
    var idx = v.stage;
    var cur = STAGES[idx];
    var next = STAGES[idx + 1] || null;
    return {
      index: idx,
      name: cur.name,
      emoji: cur.emoji,
      min: cur.min,
      next: next,
      progress: next ? Math.min(100, Math.round(((v.exp - cur.min) / (next.min - cur.min)) * 100)) : 100
    };
  }

  function addExp(n, reason) {
    var v = get();
    var before = v.stage;
    v.exp += n;
    var t = today();
    v.feedLog[t] = (v.feedLog[t] || 0) + n;
    v.lastActiveDate = t;
    var stage = stageOf(v.exp);
    if (stage > v.stage) {
      v.stage = stage;
      if (stage >= 1 && !v.hatchDate) v.hatchDate = t;
      save(v);
      if (typeof Pet.onLevelUp === 'function') Pet.onLevelUp(v, stage, reason);
      return { leveledUp: true, stage: stage, pet: v };
    }
    save(v);
    return { leveledUp: false, stage: stage, pet: v };
  }

  // 破壳时选性别（决定成年鸡形态）
  function setGender(g) {
    var v = get();
    if (v.stage >= 1 && !v.gender) v.gender = (g === 'male') ? 'male' : 'female';
    save(v);
    return v;
  }

  function setName(name) {
    var v = get();
    v.name = String(name || '').trim().slice(0, 8) || v.name;
    save(v);
    return v;
  }

  // 陪伴天数（从孵化或首次使用算起）
  function companionDays() {
    var v = get();
    var start = v.hatchDate || v.lastActiveDate;
    return 1 + daysBetween(start, today());
  }

  // 是否在睡觉（今天没学习过）
  function isSleeping() {
    var v = get();
    return v.lastActiveDate !== today();
  }

  // ---------------- SVG 形象（viewBox 0 0 120 120，延续 mascot 风格） ----------------

  function crackLines(progress) {
    // 蛋壳裂纹随孵化进度增多
    var lines = '';
    if (progress > 25) lines += '<path d="M48 62 L56 72 L50 82" stroke="#B8860B" stroke-width="2" fill="none"/>';
    if (progress > 50) lines += '<path d="M74 58 L66 70 L76 78" stroke="#B8860B" stroke-width="2" fill="none"/>';
    if (progress > 75) lines += '<path d="M58 88 L64 96 L56 104 M66 92 L72 100" stroke="#B8860B" stroke-width="2" fill="none"/>';
    return lines;
  }

  function svgEgg() {
    var v = get();
    var info = stageInfo(v);
    var progress = info.progress;
    var spots = '<circle cx="46" cy="58" r="4" fill="#E8C89A"/><circle cx="70" cy="50" r="3.5" fill="#E8C89A"/>' +
      '<circle cx="62" cy="76" r="4.5" fill="#E8C89A"/><circle cx="44" cy="88" r="3" fill="#E8C89A"/>' +
      '<circle cx="76" cy="88" r="3.5" fill="#E8C89A"/>';
    // 蛋里透出小鸡影子（进度越高越明显）
    var shadow = progress > 60 ? '<ellipse cx="60" cy="78" rx="12" ry="16" fill="#FFD54F" opacity="0.5"/>' : '';
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="60" cy="76" rx="30" ry="38" fill="#FFF6E5" stroke="#E8D5B0" stroke-width="2.5"/>' +
      shadow + spots + crackLines(progress) +
      '<text x="86" y="34" font-size="14">✨</text>' +
      '</svg>';
  }

  function svgHatched() {
    // 破壳雏鸡：探头 + 头顶蛋壳帽
    var sleeping = isSleeping();
    var eyes = sleeping
      ? '<path d="M50 60 Q54 64 58 60 M66 60 Q70 64 74 60" stroke="#5B3A1E" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : '<circle cx="52" cy="60" r="4.5" fill="#3A2A1A"/><circle cx="72" cy="60" r="4.5" fill="#3A2A1A"/>' +
        '<circle cx="53.5" cy="58.5" r="1.6" fill="#fff"/><circle cx="73.5" cy="58.5" r="1.6" fill="#fff"/>';
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="60" cy="88" rx="34" ry="22" fill="#FFD54F"/>' +
      '<circle cx="60" cy="62" r="24" fill="#FFD54F"/>' +
      '<path d="M56 70 L60 75 L64 70 Z" fill="#FF9800"/>' +
      eyes +
      '<path d="M36 52 Q60 34 84 52 L80 44 Q60 28 40 44 Z" fill="#FFF6E5" stroke="#E8D5B0" stroke-width="2"/>' +
      '<path d="M42 48 L48 54 M78 48 L72 54" stroke="#B8860B" stroke-width="2"/>' +
      (sleeping ? '<text x="84" y="30" font-size="13">💤</text>' : '<text x="86" y="30" font-size="13">🎵</text>') +
      '</svg>';
  }

  function svgChick() {
    var sleeping = isSleeping();
    var eyes = sleeping
      ? '<path d="M48 56 Q53 61 58 56 M64 56 Q69 61 74 56" stroke="#5B3A1E" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : '<circle cx="52" cy="55" r="5" fill="#3A2A1A"/><circle cx="72" cy="55" r="5" fill="#3A2A1A"/>' +
        '<circle cx="53.5" cy="53" r="1.8" fill="#fff"/><circle cx="73.5" cy="53" r="1.8" fill="#fff"/>';
    // 毛茸小鸡：绒毛边 + 小翅膀
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="60" cy="82" rx="34" ry="26" fill="#FFD54F"/>' +
      '<circle cx="60" cy="50" r="24" fill="#FFD54F"/>' +
      '<path d="M40 72 Q34 80 38 86 M80 72 Q86 80 82 86" stroke="#FFC107" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M55 62 L60 68 L65 62 Z" fill="#FF9800"/>' +
      eyes +
      '<path d="M48 34 Q50 26 56 30 M64 30 Q70 24 74 32" stroke="#FFC107" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="38" cy="80" rx="9" ry="13" fill="#FFCA28" transform="rotate(-20 38 80)"/>' +
      '<ellipse cx="82" cy="80" rx="9" ry="13" fill="#FFCA28" transform="rotate(20 82 80)"/>' +
      (sleeping ? '<text x="84" y="28" font-size="13">💤</text>' : '<text x="86" y="28" font-size="13">🌾</text>') +
      '</svg>';
  }

  function svgAdult(male) {
    var sleeping = isSleeping();
    var eyes = sleeping
      ? '<path d="M48 50 Q53 55 58 50 M64 50 Q69 55 74 50" stroke="#5B3A1E" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : '<circle cx="52" cy="49" r="5" fill="#3A2A1A"/><circle cx="72" cy="49" r="5" fill="#3A2A1A"/>' +
        '<circle cx="53.5" cy="47" r="1.8" fill="#fff"/><circle cx="73.5" cy="47" r="1.8" fill="#fff"/>';
    var comb = male
      ? '<path d="M46 24 Q50 12 58 20 Q62 8 70 16 Q76 10 78 22 Q70 18 62 22 Q54 16 46 24 Z" fill="#E53935"/>'
      : '<path d="M50 24 Q54 16 60 22 Q66 16 72 24 Q66 20 60 24 Q54 20 50 24 Z" fill="#FF8A80"/>';
    var tail = male
      ? '<path d="M92 76 Q112 60 108 44 Q104 62 90 68 Z" fill="#43A047"/>' +
        '<path d="M92 78 Q116 70 112 56 Q104 70 90 74 Z" fill="#5C6BC0"/>'
      : '<path d="M92 76 Q108 66 104 54 Q100 68 90 72 Z" fill="#FFB74D"/>';
    var bodyColor = male ? '#FFCA28' : '#FFE082';
    var body = '<ellipse cx="60" cy="82" rx="34" ry="26" fill="' + bodyColor + '"/>' +
      '<circle cx="60" cy="48" r="23" fill="' + bodyColor + '"/>' +
      '<path d="M54 60 L60 66 L66 60 Z" fill="#FF9800"/>' +
      '<path d="M46 100 L46 108 M56 102 L56 110 M68 102 L68 110 M78 100 L78 108" stroke="#FF9800" stroke-width="4" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">' +
      tail + body + comb + eyes +
      (sleeping ? '<text x="84" y="26" font-size="13">💤</text>' : '<text x="86" y="26" font-size="13">🌽</text>') +
      '</svg>';
  }

  function svgWise(male) {
    var base = svgAdult(male)
      .replace('<text x="86" y="26" font-size="13">🌽</text>', '<text x="88" y="26" font-size="13">📚</text>')
      .replace('<text x="84" y="26" font-size="13">💤</text>', '<text x="84" y="26" font-size="13">💤</text>');
    // 学士帽 + 眼镜 + 光环
    var hat = '<path d="M34 30 L60 18 L86 30 L60 42 Z" fill="#37474F"/>' +
      '<rect x="52" y="36" width="16" height="6" rx="2" fill="#263238"/>' +
      '<circle cx="88" cy="34" r="3" fill="#FFD84D"/>';
    var glasses = '<circle cx="52" cy="49" r="7" fill="none" stroke="#37474F" stroke-width="2"/>' +
      '<circle cx="72" cy="49" r="7" fill="none" stroke="#37474F" stroke-width="2"/>' +
      '<path d="M59 49 L65 49" stroke="#37474F" stroke-width="2"/>';
    var halo = '<ellipse cx="60" cy="10" rx="26" ry="6" fill="none" stroke="#FFD84D" stroke-width="3" opacity="0.9"/>';
    return base.replace('<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">',
      '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">' + halo) +
      '<g opacity="0.95">' + glasses + '</g>' + hat;
  }

  function svg() {
    var v = get();
    switch (v.stage) {
      case 0: return svgEgg();
      case 1: return svgHatched();
      case 2: return svgChick();
      case 3: return svgAdult(v.gender !== 'female');
      case 4: return svgWise(v.gender !== 'female');
      default: return svgEgg();
    }
  }

  var Pet = {
    STAGES: STAGES,
    svg: svg,
    get: get,
    stageInfo: function () { return stageInfo(get()); },
    addExp: addExp,
    setGender: setGender,
    setName: setName,
    companionDays: companionDays,
    isSleeping: isSleeping,
    data: function () { return get(); },
    onLevelUp: null,
    // 渲染到容器（保留原类名，与 Mascot.render 同模式）
    render: function (el, size) {
      if (typeof el === 'string') el = document.getElementById(el);
      if (!el) return;
      el.innerHTML = svg();
      var s = size || 48;
      el.style.width = s + 'px';
      el.style.height = s + 'px';
    }
  };

  window.Pet = Pet;
})();
