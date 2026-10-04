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

  // 分科学习概览 + 掌握度按学科分组
  function loadBySubject(code) {
    // 1) 概览行（/api/report 的 bySubject）
    api('/api/report/' + encodeURIComponent(code)).then(function (res) {
      if (!res.ok) return;
      var box = $('subjectbox');
      var subs = res.bySubject || {};
      var names = { math: '数学', english: '英语', chinese: '语文' };
      var html = '';
      ['math', 'english', 'chinese'].forEach(function (sub) {
        var m = subs[sub];
        if (!m || (!m.attempts && !m.correct && !m.wrong)) return;
        html += '<div class="krow"><div class="kname">' + names[sub] + '</div>' +
          '<div class="ktrack"><div class="kfill good" style="width:100%"></div></div>' +
          '<div class="kcount">' + (m.correct + m.wrong) + ' 题 · ' + m.minutes + ' 分</div></div>';
      });
      if (html) {
        box.innerHTML = html + '<div class="empty">掌握度分科明细见下方卡片</div>';
        $('camp-subject-note') && 0;
      } else {
        box.innerHTML = '<div class="empty">三科都还没有练习记录</div>';
      }
    }).catch(function () {});

    // 2) 掌握度条形卡按学科分三段
    var masteryBox = $('masterybox');
    masteryBox.innerHTML = '';
    var names = { math: '🔢 数学', english: '🔤 英语', chinese: '📖 语文' };
    var any = false;
    ['math', 'english', 'chinese'].forEach(function (sub) {
      api('/api/mastery/' + encodeURIComponent(code) + '?subject=' + sub).then(function (res) {
        if (!res.ok || !res.mastery || !res.mastery.length) return;
        any = true;
        var head = document.createElement('div');
        head.className = 'subj-head';
        head.textContent = names[sub] + '（' + res.mastery.length + ' 项）';
        masteryBox.appendChild(head);
        res.mastery.forEach(function (m) {
          var cls = m.score >= 80 ? 'good' : (m.score >= 50 ? 'mid' : 'weak');
          var row = document.createElement('div');
          row.className = 'krow';
          row.innerHTML =
            '<div class="kname">' + esc(m.knowledge_point) + '</div>' +
            '<div class="ktrack"><div class="kfill ' + cls + '" style="width:' + Math.max(4, m.score) + '%"></div></div>' +
            '<div class="kcount">' + m.score + '分</div>';
          masteryBox.appendChild(row);
        });
      }).catch(function () {});
    });
    setTimeout(function () {
      if (!any && !masteryBox.children.length) {
        masteryBox.innerHTML = '<div class="empty">还没有足够数据，练几题后这里会出现掌握度</div>';
      }
    }, 1500);
  }

  // 掌握度成长曲线（近 14 天 SVG 折线）
  function loadTrend(code) {
    api('/api/mastery/trend/' + encodeURIComponent(code) + '?days=14').then(function (res) {
      if (!res.ok) return;
      var box = $('trendbox');
      var trend = (res.trend || []).filter(function (d) { return d.avg !== null; });
      if (trend.length < 2) {
        box.innerHTML = '<div class="empty">练习几天后，这里会出现孩子的成长曲线</div>';
        return;
      }
      var W = 340, H = 150, padL = 26, padR = 10, padT = 12, padB = 26;
      var iw = W - padL - padR, ih = H - padT - padB;
      // y 轴范围：50-100 区间放大差异；低于 50 时从 30 起
      var minV = Math.min.apply(null, trend.map(function (d) { return d.avg; }));
      var lo = minV < 50 ? 30 : 50;
      var hi = 100;
      var pts = trend.map(function (d, i) {
        var x = padL + (trend.length === 1 ? iw / 2 : (i / (trend.length - 1)) * iw);
        var y = padT + (1 - (d.avg - lo) / (hi - lo)) * ih;
        return { x: x, y: y, d: d };
      });
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">';
      // 网格线 60/80/100
      [lo, (lo + hi) / 2, hi].forEach(function (v) {
        var y = padT + (1 - (v - lo) / (hi - lo)) * ih;
        svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#F0E8D8" stroke-width="1"/>' +
          '<text x="' + (padL - 4) + '" y="' + (y + 4) + '" text-anchor="end" font-size="9" fill="#BBB">' + v + '</text>';
      });
      // 折线 + 区域
      var line = pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
      var area = padL + ',' + (padT + ih) + ' ' + line + ' ' + (W - padR) + ',' + (padT + ih);
      svg += '<polygon points="' + area + '" fill="rgba(53,208,170,0.12)"/>';
      svg += '<polyline points="' + line + '" fill="none" stroke="#14A98C" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      pts.forEach(function (p) {
        svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.5" fill="#14A98C"><title>' + p.d.date + ' · 掌握度 ' + p.d.avg + '</title></circle>';
      });
      // 日期标签：最多 5 个
      var step = Math.ceil(pts.length / 5);
      pts.forEach(function (p, i) {
        if (i % step !== 0 && i !== pts.length - 1) return;
        svg += '<text x="' + p.x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="#999">' + p.d.date + '</text>';
      });
      svg += '</svg>';
      var first = trend[0].avg, last = trend[trend.length - 1].avg;
      var delta = last - first;
      var summary = delta > 0
        ? '<span style="color:#14A98C;font-weight:800">↑ 上升 ' + delta + ' 分</span>'
        : (delta < 0 ? '<span style="color:#FF8A00">↓ 回落 ' + (-delta) + ' 分（掌握度有起伏是正常的）</span>' : '保持稳定');
      box.innerHTML = svg + '<div style="text-align:center;font-size:12px;color:#888;margin-top:4px">' + summary + '</div>';
    }).catch(function () {});
  }

  // 训练营卡：入学诊断 / 课表进度 / 结课报告
  function loadCamp(code) {
    api('/api/camp/plan/' + encodeURIComponent(code)).then(function (res) {
      if (!res.ok) return;
      var box = $('campbox');
      box.innerHTML = '';
      if (!res.plan) {
        if (res.hasDiagnostic) {
          box.innerHTML = '<div class="empty">已完成入学测评，还没生成课表</div>';
          $('camp-card').style.display = 'block';
        }
        return;
      }
      var plan = res.plan;
      $('camp-card').style.display = 'block';
      if (plan.result) {
        // 已结课：报告 + 沟通脚本
        var r = plan.result;
        var lines = [];
        (r.after || []).forEach(function (a) {
          var b = (r.before || []).find(function (x) { return x.knowledge === a.knowledge; });
          lines.push('<div class="camp-line">' + esc(a.knowledge) + '：' + (b ? b.score : a.score) + ' → ' + a.score + '</div>');
        });
        box.innerHTML =
          '<div class="script-box">🏁 已结课</div>' +
          '<div class="report-text">' + esc(r.report_text || '') + '</div>' +
          '<div class="script-box">💬 沟通建议：' + esc(r.parent_script || '') + '</div>';
        return;
      }
      // 进行中：课表进度
      var html = '<div class="report-text">' + (plan.diagnosisReport ? esc(plan.diagnosisReport.report_text || '') : '入学诊断已完成') + '</div>';
      plan.lessons.forEach(function (l) {
        var st = l.status === 'done' ? '✅ 已完成' : (l.status === 'active' ? '▶ 进行中' : '🔒 未解锁');
        html += '<div class="camp-line"><span class="camp-k">' + esc(l.knowledge) + '</span><span class="camp-s">' + st + '</span></div>';
      });
      var done = plan.lessons.filter(function (l) { return l.status === 'done'; }).length;
      html += '<div class="empty">已学完 ' + done + ' / ' + plan.lessons.length + ' 节课</div>';
      box.innerHTML = html;
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
    lines.push('—— 小狐老师 🦊');
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

    var sign = document.createElement('div');
    sign.className = 'script-sign';
    sign.textContent = '—— 小狐老师 🦊';
    box.appendChild(sign);
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
      var err = { method_unknown: '方法不熟', calc_error: '计算出错', read_error: '读题不清' }[w.errorType] || '';
      div.innerHTML =
        '<div class="w-top"><span class="tag">' + esc(w.knowledge) + '</span>' +
        (err ? '<span class="w-err">' + esc(err) + '</span>' : '') +
        '<span class="w-times">' + times + '</span></div>' +
        '<div class="w-problem">' + esc(w.problem) + '</div>' +
        '<div class="w-ans bad">✗ 我的答案：' + esc(w.myAnswer) + '</div>' +
        '<div class="w-ans good">✓ 正确答案：' + esc(w.rightAnswer) + '</div>';
      wbox.appendChild(div);
    });

    // 沟通脚本
    buildScripts(current.wrongs);
    if (current.stars > 0 || current.streak > 0) {
      var bond = current.companion ? current.companion.bond || 0 : 0;
      var bondName = bond >= 60 ? '最佳拍档' : bond >= 30 ? '好伙伴' : bond >= 10 ? '朋友' : '初识';
      $('child-stars').textContent = '⭐ ' + current.name + ' 已获得 ' + current.stars + ' 颗星 · 连续练习 ' + current.streak + ' 天 · 和小狐是「' + bondName + '」';
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

  // ---------------- 账号登录 ----------------

  var LS_TOKEN = 'parent_token';
  var LS_PHONE = 'parent_phone';

  function authHeaders() {
    var token = localStorage.getItem(LS_TOKEN);
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  function refreshAuthPanel() {
    var token = localStorage.getItem(LS_TOKEN);
    $('auth-form').style.display = token ? 'none' : 'block';
    $('auth-panel').style.display = token ? 'block' : 'none';
    if (token) {
      $('logged-phone').textContent = '已登录：' + (localStorage.getItem(LS_PHONE) || '');
      loadMyChildren();
    }
  }

  function loadMyChildren() {
    fetch(apiBase + '/api/my/children', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var box = $('my-children');
        box.innerHTML = '';
        if (!j.ok) {
          if (j.error) box.innerHTML = '<div class="sub">' + esc(j.error) + '</div>';
          return;
        }
        if (!j.children.length) {
          box.innerHTML = '<div class="sub">还没有绑定孩子：输入孩子端的同步码绑定，或创建新档案。</div>';
          return;
        }
        j.children.forEach(function (c) {
          var div = document.createElement('div');
          div.className = 'child-item';
          div.innerHTML = '<span class="child-name">' + esc(c.name) + '</span><span class="child-code">' + esc(c.code) + '</span>';
          div.addEventListener('click', function () {
            $('code-input').value = c.code;
            load(c.code, false);
          });
          box.appendChild(div);
        });
      })
      .catch(function () {});
  }

  function authSubmit(path) {
    var phone = $('login-phone').value.trim();
    var password = $('login-password').value;
    var err = $('auth-err');
    err.textContent = '';
    fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, password: password })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok && j.token) {
        localStorage.setItem(LS_TOKEN, j.token);
        localStorage.setItem(LS_PHONE, j.user.phone);
        $('login-password').value = '';
        refreshAuthPanel();
      } else {
        err.textContent = j.error || '操作失败';
      }
    }).catch(function () { err.textContent = '网络错误，请重试'; });
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
          unitLabel: res.child.unitLabel || '',
          companion: res.child.companion || { bond: 0 }
        };
        localStorage.setItem(LS_CODE, code);
        render();
        loadBySubject(code);
        loadCamp(code);
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
      $('err').textContent = '请输入同步码';
      return;
    }
    load(code, false);
  });

  // 登录 tab 切换
  $('tab-code').addEventListener('click', function () {
    $('tab-code').classList.add('on');
    $('tab-account').classList.remove('on');
    $('code-panel').style.display = 'block';
    $('account-panel').style.display = 'none';
  });
  $('tab-account').addEventListener('click', function () {
    $('tab-account').classList.add('on');
    $('tab-code').classList.remove('on');
    $('code-panel').style.display = 'none';
    $('account-panel').style.display = 'block';
    refreshAuthPanel();
  });

  // 登录 / 注册 / 退出
  $('btn-login').addEventListener('click', function () { authSubmit('/api/auth/login'); });
  $('btn-register').addEventListener('click', function () { authSubmit('/api/auth/register'); });
  $('btn-logout').addEventListener('click', function () {
    localStorage.removeItem(LS_TOKEN);
    refreshAuthPanel();
  });

  // 绑定同步码 / 创建孩子
  $('btn-bind').addEventListener('click', function () {
    var code = $('bind-code').value.trim();
    if (!code) { $('auth-err').textContent = '请输入同步码'; return; }
    fetch(apiBase + '/api/children/' + encodeURIComponent(code) + '/bind', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({})
    }).then(function (r) { return r.json(); }).then(function (j) {
      $('auth-err').textContent = '';
      if (j.ok) {
        $('bind-code').value = '';
        loadMyChildren();
      } else {
        $('auth-err').textContent = j.error || '绑定失败';
      }
    }).catch(function () { $('auth-err').textContent = '网络错误，请重试'; });
  });
  $('btn-create-child').addEventListener('click', function () {
    var name = $('new-child-name').value.trim() || '小朋友';
    fetch(apiBase + '/api/my/children', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ name: name })
    }).then(function (r) { return r.json(); }).then(function (j) {
      $('auth-err').textContent = '';
      if (j.ok && j.child) {
        $('new-code-text').textContent = j.child.code;
        $('new-child-code').style.display = 'block';
        $('new-child-name').value = '';
        loadMyChildren();
      } else {
        $('auth-err').textContent = j.error || '创建失败';
      }
    }).catch(function () { $('auth-err').textContent = '网络错误，请重试'; });
  });

  $('btn-demo').addEventListener('click', function () { load('', true); });
  $('btn-refresh').addEventListener('click', function () { if (current) load(current.code, false); });
  $('btn-back').addEventListener('click', showLogin);

  showLogin();
})();
