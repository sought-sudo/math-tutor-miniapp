// student-web/js/mascot.js — 虚拟伙伴「小狐老师」SVG 表情集（代码手绘，零素材零依赖）
// 六个表情：greet 开心挥手 / think 思考 / encourage 鼓励 / comfort 安慰 / proud 骄傲 / cheer 庆祝
// 用法：Mascot.render(元素或id, 表情名, 尺寸)；Mascot.mapState(状态机状态) 返回对应表情
(function () {
  'use strict';

  function star(x, y, s) {
    return '<path d="M' + x + ' ' + (y - 6 * s) +
      ' l' + (1.6 * s) + ' ' + (4.6 * s) +
      ' l' + (5.8 * s) + ' ' + (0.8 * s) +
      ' l-' + (4.2 * s) + ' ' + (3 * s) +
      ' l' + (1 * s) + ' ' + (5.7 * s) +
      ' l-' + (4.8 * s) + '-' + (2.9 * s) +
      ' l-' + (4.8 * s) + ' ' + (2.9 * s) +
      ' l' + (1 * s) + '-' + (5.7 * s) +
      ' l-' + (4.2 * s) + '-' + (3 * s) +
      ' l' + (5.8 * s) + '-' + (0.8 * s) + ' z" fill="#FFD84D"/>';
  }

  var EYES = {
    normal:
      '<circle cx="45" cy="62" r="5.5" fill="#3A2A1A"/><circle cx="75" cy="62" r="5.5" fill="#3A2A1A"/>' +
      '<circle cx="47" cy="60" r="2" fill="#fff"/><circle cx="77" cy="60" r="2" fill="#fff"/>',
    happy:
      '<path d="M39 63 Q45 55 51 63" stroke="#3A2A1A" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M69 63 Q75 55 81 63" stroke="#3A2A1A" stroke-width="4" fill="none" stroke-linecap="round"/>',
    wide:
      '<circle cx="45" cy="62" r="6.5" fill="#3A2A1A"/><circle cx="75" cy="62" r="6.5" fill="#3A2A1A"/>' +
      '<circle cx="47" cy="59" r="2.4" fill="#fff"/><circle cx="77" cy="59" r="2.4" fill="#fff"/>'
  };

  var MOUTHS = {
    smile: '<path d="M52 82 Q60 90 68 82" stroke="#5B3A1E" stroke-width="4" fill="none" stroke-linecap="round"/>',
    open: '<path d="M50 82 Q60 96 70 82 Z" fill="#7A4A22"/><path d="M55 87 Q60 92 65 87 Z" fill="#FF8A80"/>',
    o: '<ellipse cx="60" cy="85" rx="4.5" ry="5.5" fill="#7A4A22"/>',
    soft: '<path d="M54 83 Q60 88 66 83" stroke="#5B3A1E" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
  };

  var EXTRAS = {
    greet:
      '<path d="M88 84 Q102 76 106 66" stroke="#FF9F1C" stroke-width="8" stroke-linecap="round" fill="none"/>' +
      '<circle cx="107" cy="64" r="6.5" fill="#FF9F1C"/>' +
      '<text x="16" y="30" font-size="13">✨</text>',
    think:
      '<text x="90" y="32" font-size="26" fill="#FF8A00" font-weight="bold" font-family="sans-serif">?</text>',
    encourage:
      '<path d="M96 88 Q108 80 106 66" stroke="#FF9F1C" stroke-width="8" stroke-linecap="round" fill="none"/>' +
      '<circle cx="105" cy="63" r="7" fill="#FF9F1C"/>' +
      '<text x="82" y="52" font-size="13">💪</text>',
    comfort:
      '<path d="M94 24 c-3-6-11-4-10 2 1 4 6 7 10 10 4-3 9-6 10-10 1-6-7-8-10-2 z" fill="#FF7B7B"/>',
    proud:
      '<path d="M88 84 Q102 76 106 66" stroke="#FF9F1C" stroke-width="8" stroke-linecap="round" fill="none"/>' +
      '<circle cx="107" cy="64" r="6.5" fill="#FF9F1C"/>' +
      '<path d="M108 58 l3.5 7 8 1.2-5.8 5.6 1.4 7.9-7.1-3.7-7.1 3.7 1.4-7.9-5.8-5.6 8-1.2z" fill="#FFD84D" transform="scale(0.62) translate(66 18)"/>',
    cheer:
      star(20, 26, 1.3) + star(102, 22, 1) +
      '<circle cx="26" cy="46" r="3" fill="#FFD84D"/><circle cx="96" cy="40" r="3" fill="#FF8A80"/>' +
      '<circle cx="16" cy="58" r="2.4" fill="#35D0AA"/><circle cx="105" cy="52" r="2.4" fill="#5DA5FF"/>'
  };

  var EXPR = {
    greet: { eyes: EYES.happy, mouth: MOUTHS.open, extra: EXTRAS.greet },
    think: { eyes: EYES.wide, mouth: MOUTHS.o, extra: EXTRAS.think },
    encourage: { eyes: EYES.normal, mouth: MOUTHS.smile, extra: EXTRAS.encourage },
    comfort: { eyes: EYES.normal, mouth: MOUTHS.soft, extra: EXTRAS.comfort },
    proud: { eyes: EYES.happy, mouth: MOUTHS.smile, extra: EXTRAS.proud },
    cheer: { eyes: EYES.happy, mouth: MOUTHS.open, extra: EXTRAS.cheer }
  };

  function svg(expr) {
    var e = EXPR[expr] || EXPR.greet;
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M30 44 L18 14 L48 30 Z" fill="#FF9F1C"/>' +
      '<path d="M90 44 L102 14 L72 30 Z" fill="#FF9F1C"/>' +
      '<path d="M33 39 L26 22 L45 32 Z" fill="#FFD9B3"/>' +
      '<path d="M87 39 L94 22 L75 32 Z" fill="#FFD9B3"/>' +
      '<ellipse cx="60" cy="68" rx="42" ry="36" fill="#FFB44D"/>' +
      '<ellipse cx="60" cy="82" rx="24" ry="15" fill="#FFF3E2"/>' +
      '<circle cx="33" cy="76" r="7" fill="#FF9E8A" opacity="0.65"/>' +
      '<circle cx="87" cy="76" r="7" fill="#FF9E8A" opacity="0.65"/>' +
      '<ellipse cx="60" cy="70" rx="6" ry="4.5" fill="#5B3A1E"/>' +
      e.eyes + e.mouth + e.extra +
      '</svg>';
  }

  // 状态机状态 → 表情
  var STATE_EXPR = {
    GREETING: 'greet',
    READ_PROBLEM: 'greet',
    ACTIVATE_KNOWLEDGE: 'think',
    STUDENT_ATTEMPT: 'think',
    DIAGNOSE: 'think',
    SCAFFOLD: 'encourage',
    VERIFY: 'proud',
    REFLECT: 'proud',
    DEFORM: 'cheer',
    REVIEW: 'cheer'
  };

  var EXPR_KEYS = Object.keys(EXPR);

  window.Mascot = {
    svg: svg,
    mapState: function (state) {
      return STATE_EXPR[state] || 'greet';
    },
    EXPRESSIONS: EXPR_KEYS,
    // 渲染到容器；el 可为元素或 id；保留容器原有类名，只更新 mascot-* 表情类
    render: function (el, expr, size) {
      if (typeof el === 'string') el = document.getElementById(el);
      if (!el) return;
      el.innerHTML = svg(expr);
      EXPR_KEYS.forEach(function (e) {
        el.classList.remove('mascot-' + e);
      });
      el.classList.add('mascot', 'mascot-' + expr);
      var s = size || 48;
      el.style.width = s + 'px';
      el.style.height = s + 'px';
    }
  };
})();
