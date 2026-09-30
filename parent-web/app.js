/* 家长端逻辑（零依赖，任何浏览器直接运行） */
(function () {
  'use strict';

  var LS_CODE = 'parent_code';
  var LS_API = 'parent_api';

  // 通过 file:// 直接双击打开时，默认后端地址为本机 8787；由后端托管时同源即可
  var apiBase =
    localStorage.getItem(LS_API) ||
    (location.protocol === 'file:' ? 'http://127.0.0.1:8787' : '');

  var current = null; // { name, code, records, wrongs }

  function $(id) { return document.getElementById(id); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path) {
    return fetch(apiBase + path).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function computeStats(records, wrongs) {
    var judged = records.filter(function (r) { return r.ok === true || r.ok === false; });
    var correct = judged.filter(function (r) { return r.ok === true; }).length;
    var total = judged.length;
    var accuracy = total ? correct / total : null;

    var last7 = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var ds = fmtDate(d.getTime());
      last7.push({
        date: ds,
        label: ds.slice(5),
        count: records.filter(function (r) { return fmtDate(r.ts) === ds; }).length
      });
    }

    var map = {};
    wrongs.filter(function (w) { return w.status === 'active'; }).forEach(function (w) {
      map[w.knowledge] = (map[w.knowledge] || 0) + 1;
    });
    var knowledge = Object.keys(map).map(function (k) { return { name: k, count: map[k] }; });
    knowledge.sort(function (a, b) { return b.count - a.count; });

    var activeCount = wrongs.filter(function (w) { return w.status === 'active'; }).length;
    var week = records.filter(function (r) { return Date.now() - r.ts < 7 * 86400000; }).length;
    var onePass = judged.filter(function (r) { return r.ok === true && (r.attempts || 1) <= 1; }).length;

    return {
      total: total,
      correct: correct,
      accuracy: accuracy,
      week: week,
      last7: last7,
      knowledge: knowledge,
      activeCount: activeCount,
      masteredCount: wrongs.length - activeCount,
      onePass: onePass,
      onePassRate: total ? onePass / total : null
    };
  }

  // 按知识点给出具体的"今晚可以这样问"沟通脚本
  var QUESTION_MAP = {
    '三位数乘两位数': '你是怎么把两位数拆开、一步一步乘起来的？',
    '除数是两位数的除法': '试商的时候，你先看被除数的哪几位？',
    '四则混合运算': '这道题里先算什么、后算什么？为什么？',
    '运算定律·简算': '看到 25（或 125），你会马上想到和哪个数凑整？',
    '小数的加法': '列竖式时，你先把谁和谁对齐了？有没有满十进一？',
    '小数的减法': '小数部分不够减时，你向谁借了 1？',
    '行程问题·路程': '速度和时间的单位对应上了吗？你用的关系式是什么？',
    '购物·总价与找零': '你是先算总价，还是先算找回？为什么？',
    '归一问题': '先求"一台机器"的还是先求"一个小时"的？',
    '平均数': '三个数加起来以后，为什么要除以 3？',
    '鸡兔同笼': '假设笼子里全是鸡，脚会差几只？',
    '长方形周长': '周长要"围一圈"，你绕着它走全了吗？',
    '长方形面积': '"长乘宽"算出来的是哪一块地方？单位写对了吗？'
  };

  // 掌握度条形卡
  function loadMastery(code) {
    api('/api/mastery/' + encodeURIComponent(code)).then(function (res) {
      if (!res.ok || !res.mastery) return;
      var box = $('masterybox');
      box.innerHTML = '';
      if (!res.mastery.length) {
        box.innerHTML = '<div class="empty">还没有足够数据，练几题后这里会出现掌握度</div>';
        return;
      }
      res.mastery.forEach(function (m) {
        var cls = m.score >= 80 ? 'good' : (m.score >= 50 ? 'mid' : 'weak');
        var row = document.createElement('div');
        row.className = 'krow';
        row.innerHTML =
          '<div class="kname">' + esc(m.knowledge_point) + '</div>' +
          '<div class="ktrack"><div class="kfill ' + cls + '" style="width:' + Math.max(4, m.score) + '%"></div></div>' +
          '<div class="kcount">' + m.score + '分</div>';
        box.appendChild(row);
      });
    }).catch(function () {});
  }

  // 一键复制沟通脚本
  function copyScript() {
    var lines = [];
    var empty = document.querySelector('#scriptbox .empty');
    if (empty) lines.push(empty.textContent.replace(/\s+/g, ' ').trim());
    document.querySelectorAll('.script-item').forEach(function (el) {
      lines.push(el.textContent.replace(/\s+/g, ' ').trim());
    });
    var tip = document.querySelector('.script-tip');
    if (tip) lines.push(tip.textContent.trim());
    var text = lines.join('\n\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { alert('沟通脚本已复制，去粘贴给家里人吧 📋'); });
    } else {
      alert(text);
    }
  }

  function buildScripts(wrongs) {
    var actives = wrongs.filter(function (w) { return w.status === 'active'; })
      .sort(function (a, b) { return (b.times || 1) - (a.times || 1); })
      .slice(0, 2);
    var box = $('scriptbox');
    box.innerHTML = '';
    if (!actives.length) {
      box.innerHTML = '<div class="empty">🎉 没有待复习的错题。今晚可以问问孩子：今天数学练习里，哪道题最有意思？</div>';
      appendTipAndCopy(box);
      return;
    }
    actives.forEach(function (w) {
      var q = QUESTION_MAP[w.knowledge] || '你是从哪一步开始做的？卡在哪里了？';
      var div = document.createElement('div');
      div.className = 'script-item';
      div.innerHTML =
        '<div class="script-problem">📖 「' + esc(w.problem) + '」</div>' +
        '<div class="script-q">💬 饭后可以问："' + esc(q) + '"</div>' +
        '<div class="script-a">听完孩子的思路再补充：正确答案是 ' + esc(w.rightAnswer) + '。多听思路，少直接给答案。</div>';
      box.appendChild(div);
    });
    appendTipAndCopy(box, false);
  }

  function appendTipAndCopy(box, hasTip) {
    if (!hasTip) {
      var tip = document.createElement('div');
      tip.className = 'script-tip';
      tip.textContent = '小贴士：孩子讲错时，先说"这个思路有意思"，再一起找问题；讲对时追问一句"你是怎么想到的？"比表扬更有用。';
      box.appendChild(tip);
    }
    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-ghost btn-sm copy-btn';
    copyBtn.textContent = '📋 一键复制沟通脚本';
    copyBtn.addEventListener('click', copyScript);
    box.appendChild(copyBtn);
  }

  function adviceText(s) {
    if (s.total === 0) {
      return '孩子还没有开始练习。可以从孩子小程序首页的"每日练习"开始，每天 3~5 道题，坚持就有进步！';
    }
    var pct = Math.round(s.accuracy * 100) + '%';
    var text;
    if (s.accuracy >= 0.9) {
      text = '正确率很高（' + pct + '），基础扎实！可以适当挑战难题，或提前预习。';
    } else if (s.accuracy >= 0.7) {
      text = '正确率不错（' + pct + '）。建议每天把错题本里的题复习一遍，巩固薄弱点。';
    } else if (s.accuracy >= 0.5) {
      text = '正确率一般（' + pct + '）。建议家长陪着孩子重做错题，找到卡住的地方。';
    } else {
      text = '最近错误偏多（' + pct + '）。先别急着做新题，把错题一道道讲清楚更重要。';
    }
    if (s.knowledge.length) {
      text += ' 错题主要集中在：' + s.knowledge.slice(0, 3).map(function (k) { return k.name; }).join('、') + '。';
    }
    if (s.total > 0) {
      text += ' 其中 ' + s.onePass + '/' + s.total + ' 题一次通过。具体怎么和孩子聊，可以看下面的沟通脚本。';
    }
    return text;
  }

  function render() {
    $('view-login').style.display = 'none';
    $('view-dash').style.display = 'block';

    var s = computeStats(current.records, current.wrongs);
    $('child-title').textContent = current.name + ' 的学习进度';
    $('child-code').textContent = '同步码 ' + current.code + (current.unitLabel ? ' · 练习单元：' + current.unitLabel : '');
    $('stat-week').textContent = s.week;
    $('stat-acc').textContent = s.accuracy === null ? '--' : Math.round(s.accuracy * 100) + '%';
    $('stat-active').textContent = s.activeCount;
    $('stat-mastered').textContent = s.masteredCount;
    $('advice').textContent = adviceText(s);

    // 最近 7 天柱状图
    var max = Math.max.apply(null, [1].concat(s.last7.map(function (d) { return d.count; })));
    var chart = $('chart7');
    chart.innerHTML = '';
    s.last7.forEach(function (d) {
      var col = document.createElement('div');
      col.className = 'bar-col';
      var h = d.count === 0 ? 6 : 24 + Math.round((d.count / max) * 150);
      col.innerHTML =
        '<div class="bar-count">' + d.count + '</div>' +
        '<div class="bar" style="height:' + h + 'px"></div>' +
        '<div class="bar-label">' + d.label + '</div>';
      chart.appendChild(col);
    });

    // 知识点分布
    var kmax = Math.max.apply(null, [1].concat(s.knowledge.map(function (k) { return k.count; })));
    var kbox = $('kbox');
    kbox.innerHTML = '';
    if (!s.knowledge.length) {
      kbox.innerHTML = '<div class="empty">🎉 没有待复习的错题，真棒！</div>';
    }
    s.knowledge.slice(0, 6).forEach(function (k) {
      var row = document.createElement('div');
      row.className = 'krow';
      row.innerHTML =
        '<div class="kname">' + esc(k.name) + '</div>' +
        '<div class="ktrack"><div class="kfill" style="width:' + Math.round(25 + (k.count / kmax) * 75) + '%"></div></div>' +
        '<div class="kcount">' + k.count + '道</div>';
      kbox.appendChild(row);
    });

    // 错题本
    var wbox = $('wrongbox');
    wbox.innerHTML = '';
    if (!current.wrongs.length) {
      wbox.innerHTML = '<div class="empty">📭 还没有错题记录</div>';
    }
    current.wrongs.forEach(function (w) {
      var div = document.createElement('div');
      div.className = 'wrong-item' + (w.status === 'mastered' ? ' mastered' : '');
      var times = w.status === 'mastered'
        ? '✓ 已掌握 ' + esc(w.masteredAt || '')
        : '错 ' + w.times + ' 次 · ' + esc(w.lastAt || '');
      div.innerHTML =
        '<div class="w-top"><span class="tag">' + esc(w.knowledge) + '</span><span class="w-times">' + times + '</span></div>' +
        '<div class="w-problem">' + esc(w.problem) + '</div>' +
        '<div class="w-ans bad">✗ 我的答案：' + esc(w.myAnswer) + '</div>' +
        '<div class="w-ans good">✓ 正确答案：' + esc(w.rightAnswer) + '</div>';
      wbox.appendChild(div);
    });

    // 沟通脚本
    buildScripts(current.wrongs);
    if (current.stars > 0 || current.streak > 0) {
      $('child-stars').textContent = '⭐ ' + current.name + ' 已获得 ' + current.stars + ' 颗星 · 连续练习 ' + current.streak + ' 天';
      $('child-stars').style.display = 'block';
    } else {
      $('child-stars').style.display = 'none';
    }

    // 最近练习记录
    var rbox = $('recentbox');
    rbox.innerHTML = '';
    var recent = current.records.slice(-15).reverse();
    if (!recent.length) {
      rbox.innerHTML = '<div class="empty">还没有练习记录</div>';
    }
    recent.forEach(function (r) {
      var div = document.createElement('div');
      div.className = 'rec-row';
      var okText = r.ok
        ? ((r.attempts || 1) > 1 ? '✓ 试了' + (r.attempts || 1) + '次' : '✓ 一次通过')
        : '✗ 做错';
      div.innerHTML =
        '<span class="rec-ok ' + (r.ok ? 'ok' : 'no') + '">' + okText + '</span>' +
        '<span class="rec-k">' + esc(r.knowledge || '综合') + '</span>' +
        '<span class="rec-t">' + fmtTime(r.ts) + '</span>';
      rbox.appendChild(div);
    });
  }

  function showLogin() {
    $('view-dash').style.display = 'none';
    $('view-login').style.display = 'block';
    $('code-input').value = localStorage.getItem(LS_CODE) || '';
    $('api-input').value = apiBase;
  }

  function load(code, demo) {
    $('err').textContent = '';
    if (demo) {
      current = demoData();
      render();
      return;
    }
    var btn = $('btn-load');
    btn.disabled = true;
    api('/api/child/' + encodeURIComponent(code))
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || '未找到该同步码');
        current = {
          name: res.child.name,
          code: code,
          records: res.child.records || [],
          wrongs: res.child.wrongs || [],
          stars: res.child.stars || 0,
          streak: res.child.streak || 0,
          unitLabel: res.child.unitLabel || ''
        };
        localStorage.setItem(LS_CODE, code);
        render();
        loadMastery(code);
        // 行为日志：家长查看报告/沟通脚本
        fetch(apiBase + '/api/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, eventType: 'parent_script_viewed' })
        }).catch(function () {});
      })
      .catch(function (e) {
        $('err').textContent = '加载失败：' + e.message + '。请确认后端已启动（node server/server.js）、接口地址正确。';
      })
      .then(function () { btn.disabled = false; });
  }

  function demoData() {
    var knowledges = ['三位数乘两位数', '除数是两位数的除法', '四则混合运算', '小数的加法', '鸡兔同笼'];
    var records = [];
    var now = Date.now();
    for (var i = 0; i < 28; i++) {
      records.push({
        ts: now - Math.floor(Math.random() * 7 * 86400000),
        ok: Math.random() < 0.72,
        seconds: 40 + Math.floor(Math.random() * 120),
        knowledge: knowledges[i % knowledges.length],
        mode: 'practice'
      });
    }
    records.sort(function (a, b) { return a.ts - b.ts; });
    var wrongs = [
      { problem: '计算：178 × 36 = ?', myAnswer: '6248', rightAnswer: '6408', knowledge: '三位数乘两位数', times: 2, status: 'active', lastAt: '09-26 19:20' },
      { problem: '计算：3.6 + 2.75 = ?', myAnswer: '6.1', rightAnswer: '6.35', knowledge: '小数的加法', times: 1, status: 'active', lastAt: '09-27 18:05' },
      { problem: '笼子里有鸡和兔共10只，脚共28只。鸡和兔各有多少只？', myAnswer: '未作答', rightAnswer: '兔 4 只，鸡 6 只', knowledge: '鸡兔同笼', times: 1, status: 'active', lastAt: '09-27 19:40' },
      { problem: '计算：125 × 32 = ?', myAnswer: '3900', rightAnswer: '4000', knowledge: '运算定律·简算', times: 3, status: 'mastered', masteredAt: '09-25 20:00' }
    ];
    return { name: '演示小朋友', code: '000000', records: records, wrongs: wrongs };
  }

  $('btn-load').addEventListener('click', function () {
    var code = $('code-input').value.trim();
    var base = $('api-input').value.trim();
    if (base) {
      apiBase = base.replace(/\/$/, '');
      localStorage.setItem(LS_API, apiBase);
    }
    if (!code) {
      $('err').textContent = '请输入 6 位同步码';
      return;
    }
    load(code, false);
  });

  $('btn-demo').addEventListener('click', function () { load('', true); });
  $('btn-refresh').addEventListener('click', function () { if (current) load(current.code, false); });
  $('btn-back').addEventListener('click', showLogin);

  showLogin();
})();
