// student-web/js/kmap.js — 知识地图（纯 SVG，零依赖，三科通用）
// 节点 = 传入的知识点列表（[{code, name}]）；颜色按该学科掌握度：绿≥80 / 黄50-79 / 红<50 / 灰虚线待探索
// 用法：KMap.render(容器, items, masteryCache, onPick)；onPick(item) 由调用方接定向练习
(function () {
  'use strict';

  // 颜色与语义
  function nodeStyle(score) {
    if (score === null || score === undefined) {
      return { fill: '#F4EFE6', stroke: '#C9BBA4', dash: '5,4', label: '待探索', check: '🌫' };
    }
    if (score >= 80) return { fill: '#35D0AA', stroke: '#14A98C', dash: '', label: '已掌握', check: '✓' };
    if (score >= 50) return { fill: '#FFC53D', stroke: '#FF9F1C', dash: '', label: '学习中', check: '' };
    return { fill: '#FF6B6B', stroke: '#E04F4F', dash: '', label: '待加强', check: '!' };
  }

  // 渲染：容器内画 SVG 网格（每行 4 个节点）
  // items: [{code, name}]；mastery: [{knowledge_point, score}]
  function render(el, items, mastery, onPick) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    const knowledges = (items || []).slice();
    if (!knowledges.length) {
      el.innerHTML = '<div class="empty">知识点列表为空，刷新后再试试</div>';
      return;
    }
    var m = {};
    (mastery || []).forEach(function (x) { m[x.knowledge_point] = x.score; });

    var perRow = 4;
    var rows = Math.ceil(knowledges.length / perRow);
    var cellW = 150;
    var cellH = 118;
    var padX = 20;
    var padTop = 26;
    var W = padX * 2 + perRow * cellW;
    var H = padTop + rows * cellH + 10;

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">';
    knowledges.forEach(function (k, i) {
      var row = Math.floor(i / perRow);
      var col = i % perRow;
      var inRow = Math.min(perRow, knowledges.length - row * perRow);
      var offsetX = (W - inRow * cellW) / 2;
      var cx = offsetX + col * cellW + cellW / 2;
      var cy = padTop + row * cellH + 44;
      var score = m[k.code];
      var st = nodeStyle(score);
      var scoreTxt = (score === undefined || score === null) ? '' : (score + '分');
      var name = k.name.length > 7 ? k.name.slice(0, 7) + '…' : k.name;
      svg += '<g class="kmap-node" data-k="' + k.code + '" style="cursor:pointer">';
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="26" fill="' + st.fill + '" stroke="' + st.stroke + '" stroke-width="3"' + (st.dash ? ' stroke-dasharray="' + st.dash + '"' : '') + '/>';
      if (st.check && st.check !== '🌫') {
        svg += '<text x="' + cx + '" y="' + (cy + 8) + '" text-anchor="middle" font-size="24" font-weight="bold" fill="#fff" pointer-events="none">' + st.check + '</text>';
      } else if (st.check === '🌫') {
        svg += '<text x="' + cx + '" y="' + (cy + 8) + '" text-anchor="middle" font-size="20" pointer-events="none">🌫</text>';
      }
      svg += '<text x="' + cx + '" y="' + (cy + 52) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#666" pointer-events="none">' + name + '</text>';
      if (scoreTxt) {
        svg += '<text x="' + cx + '" y="' + (cy + 70) + '" text-anchor="middle" font-size="11" fill="#B08A4A" pointer-events="none">' + scoreTxt + '</text>';
      }
      svg += '</g>';
    });
    svg += '</svg>';
    el.innerHTML = svg;

    el.querySelectorAll('.kmap-node').forEach(function (g) {
      g.addEventListener('click', function () {
        if (onPick) onPick(g.getAttribute('data-k'));
      });
    });
  }

  window.KMap = {
    render: render,
    nodeStyle: nodeStyle
  };
})();
