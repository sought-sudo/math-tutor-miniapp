/* 网页版学生端（零依赖，浏览器直接运行）
 * 与微信小程序版共用 utils/solver.js 解题引擎（以 /student/solver.js 引入）。
 * 数据保存在 localStorage；后端运行时自动同步到家长端、支持拍照 OCR。
 */
(function () {
  'use strict';

  var S = window.Solver;
  if (!S) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">解题引擎加载失败，请通过后端访问 /student</p>';
    return;
  }

  // ---------------- 本地存储 ----------------

  var KEY = {
    wrongs: 'stu_wrongs',
    records: 'stu_records',
    code: 'stu_code',
    name: 'stu_name',
    api: 'stu_api',
    lastsync: 'stu_lastsync'
  };

  function storeGet(key, def) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? def : JSON.parse(v);
    } catch (e) {
      return def;
    }
  }
  function storeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function storeStr(key, def) {
    try { return localStorage.getItem(key) || def; } catch (e) { return def; }
  }
  function storeSetStr(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function getWrongs() { return storeGet(KEY.wrongs, []); }
  function saveWrongs(list) { storeSet(KEY.wrongs, list.slice(0, 100)); }
  function getRecords() { return storeGet(KEY.records, []); }
  function addRecord(rec) {
    var list = getRecords();
    list.unshift({
      ts: Date.now(),
      ok: rec.ok,
      seconds: rec.seconds || 0,
      attempts: rec.attempts || 1,
      knowledge: rec.knowledge || '',
      mode: rec.mode || 'practice'
    });
    storeSet(KEY.records, list.slice(0, 200));
  }

  // 同步码：老用户保留 6 位数字；新用户生成 12 位字母数字 token
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function token(len) {
    var s = '';
    for (var i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }
  function getCode() {
    var code = storeStr(KEY.code, '');
    if (!code) {
      code = token(12);
      storeSetStr(KEY.code, code);
    }
    return code;
  }
  function getName() { return storeStr(KEY.name, '小朋友'); }
  function setName(n) { storeSetStr(KEY.name, n || '小朋友'); }
  function getLastSync() { return Number(storeStr(KEY.lastsync, '0')); }
  function setLastSync(ts) { storeSetStr(KEY.lastsync, String(ts)); }

  function getApiBase() {
    var saved = storeStr(KEY.api, null);
    if (saved !== null) return saved;
    // 由后端托管时同源即为已开启；file:// 直接打开时默认填本机后端
    return location.protocol === 'file:' ? 'http://127.0.0.1:8787' : '';
  }
  function setApiBase(base) { storeSetStr(KEY.api, base); }

  // 同步是否开启：同源托管/已填后端地址 = 开启；file:// 且未填地址 = 关闭
  function syncOn() {
    return getApiBase() !== '' || location.protocol !== 'file:';
  }

  // ---------------- 工具 ----------------

  function $(id) { return document.getElementById(id); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function extractNumber(str) {
    var m = String(str).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function getStats() {
    var records = getRecords();
    var wrongs = getWrongs();
    var judged = records.filter(function (r) { return r.ok === true || r.ok === false; });
    var correct = judged.filter(function (r) { return r.ok === true; }).length;
    var total = judged.length;
    var today = dateStr();
    return {
      total: total,
      accuracy: total ? correct / total : null,
      today: records.filter(function (r) { return dateStr(r.ts) === today; }).length,
      activeCount: wrongs.filter(function (w) { return w.status === 'active'; }).length
    };
  }

  // ---------------- 同步（与小程序同后端） ----------------

  function syncSend(type, data) {
    if (!syncOn()) return;
    var base = getApiBase(); // '' 表示同源
    fetch(base + '/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: getCode(), name: getName(), type: type, data: data })
    }).then(function () {
      setLastSync(Date.now());
    }).catch(function () {});
  }

  // ---------------- AI 能力（搜题/错题讲解走大模型，失败回退本地引擎） ----------------

  var aiReady = false;
  var ocrReady = false;

  function refreshStatus() {
    var base = getApiBase();
    if (location.protocol === 'file:' && !base) return;
    fetch(base + '/api/status')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        aiReady = !!(j && j.ok && j.llm);
        ocrReady = !!(j && j.ok && j.ocr);
      })
      .catch(function () { aiReady = false; ocrReady = false; });
  }

  function fetchTutor(payload, path) {
    var base = getApiBase();
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
        reject(new Error('timeout'));
      }, 20000);
      fetch(base + (path || '/tutor'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) { return r.json(); }).then(function (j) {
        clearTimeout(timer);
        if (j && j.ok && j.steps && j.steps.length) {
          resolve({
            source: 'ai',
            problem: j.problem || payload.problem,
            knowledge: j.knowledge || '综合',
            answer: j.answer,
            displayAnswer: j.displayAnswer || String(j.answer),
            steps: j.steps.map(function (s, i) {
              return {
                title: s.title || ('第' + (i + 1) + '步'),
                content: s.content || '',
                tip: s.tip || '',
                ask: s.ask || ''
              };
            }),
            note: '',
            reason: j.reason || ''
          });
        } else {
          reject(new Error((j && j.error) || 'AI 讲解不可用'));
        }
      }).catch(function (e) {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  function localSolve(problem) {
    return S.solveText(problem) || S.genericGuide(problem);
  }

  // ---------------- 伙伴记忆与亲密度（小狐老师） ----------------

  var COMP_KEY = 'stu_companion';

  function compGet() {
    var v = storeStr(COMP_KEY, '');
    try { return v ? JSON.parse(v) : {}; } catch (e) { return {}; }
  }
  function compSet(c) { storeSetStr(COMP_KEY, JSON.stringify(c)); }

  function bondLevel(bond) {
    return bond >= 60 ? '最佳拍档' : bond >= 30 ? '好伙伴' : bond >= 10 ? '朋友' : '初识';
  }
  function bondIcon(bond) {
    return bond >= 60 ? '🏆' : bond >= 30 ? '🌟' : bond >= 10 ? '🤝' : '👋';
  }

  // 亲密度 +n；每日首次互动额外 +2（连续陪伴）
  function addBond(n) {
    var c = compGet();
    var t = dateStr();
    if (c.lastBondDate !== t) {
      c.bond = (c.bond || 0) + 2;
      c.lastBondDate = t;
    }
    var prev = bondLevel(c.bond || 0);
    c.bond = (c.bond || 0) + (n || 0);
    compSet(c);
    var cur = bondLevel(c.bond);
    if (cur !== prev) {
      showBadgeToast({ icon: bondIcon(c.bond), name: cur, desc: '小狐和你更亲近啦！' });
      if (window.TTS) TTS.playUnlock();
    }
    companionSync();
    return c;
  }

  // 记录练习知识点，形成"最喜欢/进步最多"的记忆
  function compTouch(knowledge, correct) {
    if (!knowledge) return;
    var c = compGet();
    c.knowCounts = c.knowCounts || {};
    c.knowCounts[knowledge] = (c.knowCounts[knowledge] || 0) + (correct ? 1 : 0.5);
    var best = '';
    var bestN = 0;
    Object.keys(c.knowCounts).forEach(function (k) {
      if (c.knowCounts[k] > bestN) {
        bestN = c.knowCounts[k];
        best = k;
      }
    });
    c.favoriteKnowledge = best;
    compSet(c);
  }

  // 每次进入首页：记录到访，返回相隔天数
  function companionVisit() {
    var c = compGet();
    var t = dateStr();
    var awayDays = 0;
    if (c.lastVisitAt && c.lastVisitAt !== t) {
      var d1 = new Date(c.lastVisitAt + 'T00:00:00');
      var d2 = new Date();
      awayDays = Math.floor((d2.getTime() - d1.getTime()) / 86400000);
    }
    c.greetCount = (c.greetCount || 0) + 1;
    c.lastVisitAt = t;
    compSet(c);
    return { c: c, awayDays: awayDays };
  }

  function companionSync() {
    var c = compGet();
    syncSend('companion', { bond: c.bond || 0, streak: window.Rewards ? Rewards.streak() : 0 });
  }

  // ---------------- 掌握度（薄弱优先出题） ----------------

  var masteryCache = null;

  function refreshMastery(cb) {
    var base = getApiBase();
    if (!syncOn()) {
      masteryCache = null;
      return;
    }
    fetch(base + '/api/mastery/' + encodeURIComponent(getCode()))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        masteryCache = j && j.ok && Array.isArray(j.mastery) ? j.mastery : null;
        if (cb) cb();
      })
      .catch(function () {
        masteryCache = null;
        if (cb) cb();
      });
  }

  // 70% 按薄弱加权选题，30% 随机（无数据时返回 null → 随机）
  function pickWeakKnowledge() {
    if (!masteryCache || !masteryCache.length) return null;
    if (Math.random() < 0.3) return null;
    var total = 0;
    var weights = masteryCache.map(function (m) {
      var w = Math.max(1, 100 - m.score);
      total += w;
      return w;
    });
    var r = Math.random() * total;
    for (var i = 0; i < masteryCache.length; i++) {
      r -= weights[i];
      if (r <= 0) return masteryCache[i].knowledge_point;
    }
    return masteryCache[0].knowledge_point;
  }

  // ---------------- 教材同步单元选择 ----------------

  var currentUnit = storeStr('stu_unit', '');

  function unitKnowledgePool() {
    if (!currentUnit || !window.Curriculum) return null;
    var u = window.Curriculum.unitById(currentUnit);
    return u ? u.knowledge : null;
  }

  function initUnitSelect() {
    var sel = $('unit-select');
    if (!sel) return;
    sel.innerHTML = '';
    var allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = '全部知识点（按薄弱点智能出题）';
    sel.appendChild(allOpt);
    if (window.Curriculum && window.Curriculum.CURRICULUM) {
      var books = {};
      window.Curriculum.CURRICULUM.forEach(function (u) {
        (books[u.book] = books[u.book] || []).push(u);
      });
      Object.keys(books).forEach(function (book) {
        var g = document.createElement('optgroup');
        g.label = book;
        books[book].forEach(function (u) {
          var o = document.createElement('option');
          o.value = u.id;
          o.textContent = u.unit + ' ' + u.title;
          g.appendChild(o);
        });
        sel.appendChild(g);
      });
    }
    sel.value = currentUnit;
  }

  // 从候选知识点池中按薄弱加权选一个（无掌握度数据则随机）
  function pickWeakInPool(pool) {
    var cands = masteryCache ? masteryCache.filter(function (m) { return pool.indexOf(m.knowledge_point) > -1; }) : [];
    if (!cands.length || Math.random() < 0.3) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    var total = 0;
    var weights = cands.map(function (m) {
      var w = Math.max(1, 100 - m.score);
      total += w;
      return w;
    });
    var r = Math.random() * total;
    for (var i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r <= 0) return cands[i].knowledge_point;
    }
    return cands[0].knowledge_point;
  }

  // ---------------- 对话式 AI 辅导（引导式状态机） ----------------

  var chat = { sessionId: '', state: '', busy: false, ctx: null };

  var STATE_LABELS = {
    GREETING: '打招呼',
    READ_PROBLEM: '读题理解',
    ACTIVATE_KNOWLEDGE: '知识点',
    STUDENT_ATTEMPT: '听你说思路',
    DIAGNOSE: '找卡点',
    SCAFFOLD: '提示闯关',
    VERIFY: '复述验证',
    REFLECT: '方法总结',
    DEFORM: '变形题',
    REVIEW: '复习收尾'
  };

  function chatApi(payload) {
    var base = getApiBase();
    payload.code = getCode();
    return fetch(base + '/tutor-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  // ---------------- 行为事件（练习会话 session_start / session_end） ----------------

  var practiceSessionId = '';

  function sendEvent(ev) {
    var base = getApiBase();
    if (!syncOn()) return;
    fetch(base + '/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ code: getCode() }, ev))
    }).catch(function () {});
  }

  function beginPracticeSession() {
    practiceSessionId = 'ps' + Date.now() + Math.floor(Math.random() * 10000);
    sendEvent({ sessionId: practiceSessionId, eventType: 'session_start' });
  }

  function endPracticeSession() {
    if (!practiceSessionId) return;
    sendEvent({ sessionId: practiceSessionId, eventType: 'session_end' });
    practiceSessionId = '';
  }

  function startChatSession(ctx) {
    chat.ctx = ctx;
    chat.sessionId = '';
    chat.busy = true;
    showView('chat');
    $('chat-bubbles').innerHTML = '';
    $('chat-quick').innerHTML = '';
    $('chat-state').textContent = '打招呼中';
    $('chat-input-row').style.display = 'flex';
    addTypingBubble();
    chatApi({
      sessionId: '',
      problem: ctx.problem,
      knowledge: ctx.knowledge || '',
      myAnswer: ctx.myAnswer || '',
      rightAnswer: ctx.rightAnswer || '',
      answer: ctx.answer,
      steps: ctx.steps || []
    }).then(function (j) {
      removeTypingBubble();
      chat.busy = false;
      if (j && j.ok) {
        chat.sessionId = j.sessionId;
        renderTutorTurn(j);
      } else {
        chatFallback(ctx);
      }
    }).catch(function () {
      removeTypingBubble();
      chat.busy = false;
      chatFallback(ctx);
    });
  }

  function chatFallback(ctx) {
    alert('对话辅导需要后端服务（运行 node server/server.js）。已切换为本地分步讲解。');
    if (ctx.wrongId) {
      var item = getWrongs().find(function (w) { return w.id === ctx.wrongId; });
      if (item) {
        lessonWrong(item);
        return;
      }
    }
    startGuide(ctx.problem);
  }

  function sendChat(text) {
    var msg = String(text || '').trim();
    if (!msg || chat.busy) return;
    addStudentBubble(msg);
    $('chat-quick').innerHTML = '';
    $('chat-input').value = '';
    chat.busy = true;
    addTypingBubble();
    chatApi({ sessionId: chat.sessionId, message: msg }).then(function (j) {
      removeTypingBubble();
      chat.busy = false;
      if (j && j.ok) renderTutorTurn(j);
    }).catch(function () {
      removeTypingBubble();
      chat.busy = false;
      addTutorBubble('网络开小差了，请再发一次 🙏');
    });
  }

  function addTypingBubble() {
    var div = document.createElement('div');
    div.className = 'bubble tutor typing';
    div.id = 'typing-bubble';
    div.innerHTML = '<div class="bubble-avatar" data-mascot="1"></div><div class="bubble-text">小狐正在打字…</div>';
    $('chat-bubbles').appendChild(div);
    if (window.Mascot) {
      Mascot.render(div.querySelector('[data-mascot]'), 'think', 30);
    }
    scrollChat();
  }

  function removeTypingBubble() {
    var el = document.getElementById('typing-bubble');
    if (el) el.remove();
  }

  function addTutorBubble(text) {
    var div = document.createElement('div');
    div.className = 'bubble tutor';
    div.innerHTML = '<div class="bubble-avatar" data-mascot="1"></div><div class="bubble-text">' + esc(text).replace(/\n/g, '<br>') + '<span class="bubble-speak" title="朗读">🔊</span></div>';
    div.querySelector('.bubble-speak').addEventListener('click', function () {
      if (window.TTS) TTS.speak(text);
    });
    $('chat-bubbles').appendChild(div);
    if (window.Mascot) {
      Mascot.render(div.querySelector('[data-mascot]'), Mascot.mapState(chat.state || 'GREETING'), 30);
    }
    scrollChat();
  }

  function addStudentBubble(text) {
    var div = document.createElement('div');
    div.className = 'bubble student';
    div.innerHTML = '<div class="bubble-text">' + esc(text) + '</div>';
    $('chat-bubbles').appendChild(div);
    scrollChat();
  }

  function scrollChat() {
    $('chat-bubbles').scrollTop = $('chat-bubbles').scrollHeight;
  }

  function renderTutorTurn(j) {
    chat.state = j.state;
    $('chat-state').textContent = STATE_LABELS[j.state] || j.state;
    addTutorBubble(j.tutorText);
    if (j.extra) {
      if (j.extra.knowledgeCard) renderChatKnowledgeCard(j.extra.knowledgeCard);
      if (j.extra.variant) renderChatVariantCard(j.extra.variant);
      if (j.extra.complete) renderChatComplete(j.extra);
    }
    if (j.extra && j.extra.complete) {
      $('chat-input-row').style.display = 'none';
      $('chat-quick').innerHTML = '';
    } else {
      renderQuickReplies(j.quickReplies || []);
    }
  }

  function renderChatKnowledgeCard(k) {
    var div = document.createElement('div');
    div.className = 'chat-card knowledge-card';
    div.innerHTML = '<div class="k-title">📚 知识点 · ' + esc(k.name) + '</div>' +
      '<div class="k-line"><b>是什么：</b>' + esc(k.desc) + '</div>' +
      '<div class="k-line"><b>怎么做：</b>' + esc(k.method) + '</div>' +
      (k.mistakes ? '<div class="k-mistake">⚠️ 容易错：' + esc(k.mistakes) + '</div>' : '');
    $('chat-bubbles').appendChild(div);
    scrollChat();
  }

  function renderChatVariantCard(v) {
    var div = document.createElement('div');
    div.className = 'chat-card variant-card';
    div.innerHTML = '<div class="vc-title">📝 变形题</div><div class="vc-problem">' + esc(v.problem) + '</div>' +
      '<div class="vc-hint">把答案写在下面输入框里 👇</div>';
    $('chat-bubbles').appendChild(div);
    scrollChat();
  }

  function renderChatComplete(ex) {
    var div = document.createElement('div');
    div.className = 'chat-card complete-card';
    var html = '<div class="cc-title">🎉 今天的学习完成啦！</div>';
    if (ex.parentScript) {
      html += '<div class="cc-script"><b>给家长的小脚本：</b>' + esc(ex.parentScript.question) + '</div>';
    }
    if (ex.reviewDue) {
      html += '<div class="cc-review">⏰ 复习提醒：' + esc(ex.reviewDue) + ' 再来复习一遍</div>';
    }
    html += '<div class="result-row"><button class="btn btn-primary btn-sm" id="chat-again">再来一题</button>' +
      '<button class="btn btn-ghost btn-sm" id="chat-home">回首页</button></div>';
    div.innerHTML = html;
    $('chat-bubbles').appendChild(div);
    div.querySelector('#chat-again').addEventListener('click', newPractice);
    div.querySelector('#chat-home').addEventListener('click', function () { showView('home'); });
    scrollChat();
    // 完成效果：变形题通过 → 原错题标记已掌握；否则记复习提醒与错因
    var ctx = chat.ctx;
    if (ctx && ctx.wrongId) {
      var item = getWrongs().find(function (w) { return w.id === ctx.wrongId; });
      if (item) {
        if (ex.masteredOriginal) {
          markWrongMastered(ctx.wrongId);
        } else {
          if (ex.reviewDue) {
            var m = String(ex.reviewDue).match(/(\d+)/);
            var days = m ? parseInt(m[1], 10) : 2;
            var due = new Date();
            due.setDate(due.getDate() + days);
            item.reviewDue = ex.reviewDue;
            item.reviewDueDate = dateStr(due.getTime());
          }
          if (ex.errorType) item.errorType = ex.errorType;
          saveWrongs(getWrongs());
        }
      }
    }
    // 奖励：打卡 + 变形题通关星星 +2
    if (window.Rewards) {
      Rewards.checkIn();
      if (ex.masteredOriginal) Rewards.addStars(2);
      rewardSync();
    }
    if (window.TTS) TTS.playCorrect();
    refreshMastery(); // 会话结束后刷新掌握度
    addBond(2); // 对话完成，伙伴亲近 +2
  }

  function renderQuickReplies(list) {
    var box = $('chat-quick');
    box.innerHTML = '';
    (list || []).forEach(function (qr) {
      var b = document.createElement('button');
      b.className = 'qr-btn';
      b.textContent = qr;
      b.addEventListener('click', function () { sendChat(qr); });
      box.appendChild(b);
    });
  }

  // ---------------- 视图切换 ----------------

  var currentView = 'home';

  function showView(name) {
    currentView = name;
    ['home', 'camera', 'wrong', 'parent', 'guide', 'chat', 'camp'].forEach(function (v) {
      $('view-' + v).style.display = v === name ? 'block' : 'none';
    });
    $('bottom-nav').style.display = (name === 'guide' || name === 'chat') ? 'none' : 'flex';
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('on', el.dataset.nav === name);
    });
    window.scrollTo(0, 0);
    if (name === 'home') refreshHome();
    if (name === 'wrong') refreshWrong();
    if (name === 'parent') refreshParent();
    if (name === 'camera') cameraOnShow();
    if (name === 'camp') refreshCamp();
  }

  // ---------------- 首页 ----------------

  function refreshHome() {
    var h = new Date().getHours();
    var greet = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    var s = getStats();
    $('home-greet').textContent = greet + '，小数学家！';
    // 伙伴记忆：个性化问候
    var visit = companionVisit();
    var c = visit.c;
    var sub;
    if (visit.awayDays >= 2) {
      sub = visit.awayDays + ' 天没见啦，小狐想你了！';
    } else if (visit.awayDays === 1) {
      sub = '昨天没见你，小狐一直在等你哦';
    } else if ((c.greetCount || 0) > 1 && masteryCache && masteryCache.length) {
      sub = '你在「' + masteryCache[0].knowledge_point + '」上进步了好多！';
    } else if ((c.greetCount || 0) <= 1) {
      sub = '我是小狐老师，今天也要一起加油！';
    } else {
      sub = '我们又见面啦！小狐陪你继续加油！';
    }
    $('home-sub').textContent = sub;
    $('hero-bond').textContent = bondIcon(c.bond || 0) + ' ' + bondLevel(c.bond || 0);
    refreshTaskCard(s.today);
    if (window.Mascot) {
      Mascot.render($('hero-mascot'), Rewards && Rewards.streak() >= 3 ? 'cheer' : 'greet', 64);
    }
    $('home-today').textContent = s.today;
    $('home-acc').textContent = s.accuracy === null ? '--' : Math.round(s.accuracy * 100) + '%';
    $('home-active').textContent = s.activeCount;
    // 错题本入口红点：今日到期复习数
    var dueTodayCount = getWrongs().filter(function (w) { return w.status === 'active' && isDueToday(w); }).length;
    var dot = $('wrong-dot');
    if (dot) {
      dot.style.display = dueTodayCount ? 'block' : 'none';
      dot.textContent = dueTodayCount;
    }
    $('home-tip').textContent = pick([
      '先算乘除，后算加减，有括号先算括号里的！',
      '算完记得回头检查一遍，单位和"答"别忘啦。',
      '错过的题再看一遍，比做新题更厉害哦！',
      '读题时圈出数字和问题，思路就出来啦。',
      '每天闯几关，你就是数学小达人！'
    ]);
    // 奖励与成长
    if (window.Rewards) {
      $('hero-stars').textContent = '⭐ ' + Rewards.stars();
      $('hero-streak').textContent = '🔥 ' + (Rewards.streak() || 0) + ' 天';
      var icons = Rewards.badges().map(function (id) {
        return Rewards.BADGES[id] ? Rewards.BADGES[id].icon : '';
      }).join(' ');
      $('hero-badges').textContent = icons;
    }
    if (window.TTS) {
      $('btn-sound').textContent = TTS.isMuted() ? '🔇' : '🔊';
    }
  }

  function showBadgeToast(badge) {
    if (!$('badge-toast')) return;
    if (window.Mascot) Mascot.render($('badge-toast-mascot'), 'cheer', 44);
    $('badge-toast-icon').textContent = badge.icon;
    $('badge-toast-title').textContent = '解锁新徽章：' + badge.name + '！';
    $('badge-toast-text').textContent = badge.desc;
    $('badge-toast').style.display = 'block';
    if (window.TTS) TTS.playUnlock();
    clearTimeout(showBadgeToast._t);
    showBadgeToast._t = setTimeout(function () {
      $('badge-toast').style.display = 'none';
    }, 2600);
  }

  // ---------------- 每日任务卡 ----------------

  // 每日目标：按近 7 天日均练习量自适应（3~10 关）
  function dynamicGoal() {
    var records = getRecords();
    var weekAgo = Date.now() - 7 * 86400000;
    var days = {};
    records.forEach(function (r) {
      if (r.ts >= weekAgo) {
        var d = dateStr(r.ts);
        days[d] = (days[d] || 0) + 1;
      }
    });
    var counts = Object.keys(days).map(function (k) { return days[k]; });
    var avg = counts.length ? counts.reduce(function (a, b) { return a + b; }, 0) / counts.length : 0;
    return Math.max(3, Math.min(10, Math.round(avg) + 2));
  }

  function refreshTaskCard(today) {
    var goal = dynamicGoal();
    var done = Math.min(today, goal);
    var complete = today >= goal;
    $('task-text').textContent = complete
      ? '🎉 任务完成！小狐给你点赞！'
      : '今天小狐想和你一起闯 ' + goal + ' 关，还差 ' + (goal - done) + ' 关';
    $('task-progress').textContent = '已完成 ' + done + ' / ' + goal;
    $('task-fill').style.width = Math.round((done / goal) * 100) + '%';
    // 达标奖励（每天一次 +3 星）
    if (complete && window.Rewards) {
      var c = compGet();
      var t = dateStr();
      if (c.taskRewardedDate !== t) {
        c.taskRewardedDate = t;
        compSet(c);
        Rewards.addStars(3);
        showBadgeToast({ icon: '🎯', name: '今日任务', desc: '完成闯关目标，+3 颗星！' });
      }
    }
    if (window.Mascot) {
      Mascot.render($('task-mascot'), complete ? 'cheer' : 'encourage', 44);
    }
  }

  // ---------------- 徽章墙 ----------------

  function openBadgeWall() {
    if (!window.Rewards) return;
    var list = $('bw-list');
    list.innerHTML = '';
    Object.keys(Rewards.BADGES).forEach(function (id) {
      var b = Rewards.BADGES[id];
      var earned = Rewards.badges().indexOf(id) > -1;
      var div = document.createElement('div');
      div.className = 'bw-item' + (earned ? ' earned' : '');
      div.innerHTML = '<div class="bw-icon">' + (earned ? b.icon : '🔒') + '</div>' +
        '<div class="bw-name">' + b.name + '</div><div class="bw-desc">' + b.desc + '</div>';
      list.appendChild(div);
    });
    // 伙伴等级徽章（亲密度）
    var c = compGet();
    var bond = c.bond || 0;
    var next = bond >= 60 ? null : bond >= 30 ? 60 : bond >= 10 ? 30 : 10;
    var div2 = document.createElement('div');
    div2.className = 'bw-item earned bond-item';
    div2.innerHTML = '<div class="bw-icon">' + bondIcon(bond) + '</div>' +
      '<div class="bw-name">' + bondLevel(bond) + '（亲密度 ' + bond + '）</div>' +
      '<div class="bw-desc">' + (next ? '再获得 ' + (next - bond) + ' 点亲密度，升级 ' + bondLevel(next) : '已是最高等级：最佳拍档！') + '</div>';
    list.appendChild(div2);
    if (window.Mascot) Mascot.render($('bw-mascot'), 'proud', 48);
    $('badge-wall').style.display = 'block';
  }

  function closeBadgeWall() {
    $('badge-wall').style.display = 'none';
  }

  function rewardSync() {
    if (!window.Rewards) return;
    syncSend('reward', { stars: Rewards.stars(), streak: Rewards.streak() });
  }

  // ---------------- 拍照识题 ----------------

  var camRotateDeg = 0;

  // 把 dataURL 图下采样到最长边 maxSide，返回新 dataURL（原图小于 maxSide 则原样返回）
  function camResize(dataUrl, maxSide, quality, cb) {
    var img = new Image();
    img.onload = function () {
      try {
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        if (scale >= 1) { cb(dataUrl); return; }
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', quality));
      } catch (e) { cb(dataUrl); }
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }

  // 设置当前图源（拍照/相册/历史/编辑后共用），后续 OCR/模糊检测/放大/历史全部基于它
  function setCamImage(src) {
    var img = $('camera-img');
    img.src = src;
    img.style.display = 'block';
    img.style.transform = 'rotate(0deg)';
    camRotateDeg = 0;
    $('btn-rotate').style.display = 'flex';
    $('btn-crop').style.display = 'flex';
    $('btn-annotate').style.display = 'flex';
    $('blur-hint').style.display = 'none';
    $('camera-guide').style.display = 'none';
    $('recog-card').style.display = 'block';
    detectBlur(src);
    camRequestOcr(src);
  }

  function handleImage(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = String(reader.result);
      // 大图先降采样（平板照片动辄 3000px+，统一到 1280 内方便编辑/OCR/存储）
      camResize(dataUrl, 1280, 0.9, function (small) {
        $('camera-scan').style.display = 'block';
        $('recog-input').value = '';
        $('recog-note').style.display = 'none';
        setCamImage(small);
      });
    };
    reader.readAsDataURL(file);
  }

  // OCR 识别：未配置视觉模型时直接手动输入；成功填入并提示核对，失败显示原因 + 可重试
  var lastOcrSrc = '';

  function camOcrNote(msg) {
    var note = $('recog-note');
    if (!note) return;
    note.textContent = msg;
    note.style.display = 'block';
  }

  function camRequestOcr(dataUrl) {
    lastOcrSrc = dataUrl || '';
    var retryBtn = $('btn-ocr-retry');
    if (retryBtn) retryBtn.style.display = 'none';
    // 未开启同步（file:// 无后端）或后端无视觉模型：直接手动输入，不发请求
    if (!syncOn() || !ocrReady) {
      $('camera-scan').style.display = 'none';
      camOcrNote(syncOn() ? 'ℹ️ 后端未接视觉模型：请手动输入题目（可先用 ✂️ 裁剪看清题目）' : 'ℹ️ 未配置 OCR：请手动输入题目，或用下面的示例题体验。');
      return;
    }
    var base64 = String(dataUrl).slice(dataUrl.indexOf(',') + 1);
    var base = getApiBase();
    fetch(base + '/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 })
    }).then(function (r) { return r.json(); }).then(function (j) {
      $('camera-scan').style.display = 'none';
      if (j && j.ok && j.text) {
        $('recog-input').value = String(j.text).trim();
        camOcrNote('✨ 识别完成，请检查一下对不对');
        if (retryBtn) retryBtn.style.display = 'inline-block';
      } else {
        camOcrNote('😕 ' + ((j && j.error) || '识别失败') + '：可以手动输入，或点"重新识别"再试一次');
        if (retryBtn) retryBtn.style.display = 'inline-block';
      }
    }).catch(function () {
      $('camera-scan').style.display = 'none';
      camOcrNote('😕 网络开了小差：可以手动输入，或点"重新识别"再试一次');
      if (retryBtn) retryBtn.style.display = 'inline-block';
    });
  }

  function refreshSamples() {
    // 示例题优先按当前教材单元/薄弱知识点生成
    var list = [];
    var pool = unitKnowledgePool();
    if (!pool && masteryCache && masteryCache.length) {
      pool = masteryCache.slice(0, 3).map(function (m) { return m.knowledge_point; });
    }
    if (pool && pool.length) {
      var seen = {};
      var guard = 0;
      while (list.length < 3 && guard++ < 24) {
        var k = pool[Math.floor(Math.random() * pool.length)];
        if (seen[k]) continue;
        seen[k] = true;
        list.push(S.generateByKnowledge(k));
      }
    }
    var guard2 = 0;
    while (list.length < 3 && guard2++ < 24) {
      var p = S.generatePractice();
      if (!list.some(function (x) { return x.problem === p.problem; })) list.push(p);
    }
    var box = $('sample-list');
    box.innerHTML = '';
    list.forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'sample';
      div.innerHTML = '<div class="sample-text">' + esc(p.problem) + '</div><div class="sample-go">去辅导 →</div>';
      div.addEventListener('click', function () { startChatSession({ problem: p.problem, knowledge: p.knowledge }); });
      box.appendChild(div);
    });
  }

  // ---------------- 拍照增强：模糊检测 / 历史 / 引导 ----------------

  function detectBlur(url) {
    try {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = 64;
          c.height = 64;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, 64, 64);
          var data = ctx.getImageData(0, 0, 64, 64).data;
          var vals = [];
          var sum = 0;
          for (var i = 0; i < data.length; i += 4) {
            var l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            vals.push(l);
            sum += l;
          }
          var mean = sum / vals.length;
          var vsum = 0;
          vals.forEach(function (v) { vsum += (v - mean) * (v - mean); });
          var std = Math.sqrt(vsum / vals.length);
          if (std < 14) $('blur-hint').style.display = 'block';
        } catch (e) {
          // 渐进增强：检测失败不打扰
        }
      };
      img.src = url;
    } catch (e) {
      // 忽略
    }
  }

  function makeThumb(url, maxSide, quality, cb) {
    try {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          cb(c.toDataURL('image/jpeg', quality));
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = url;
    } catch (e) { cb(null); }
  }

  function camHistory() {
    var v = storeStr('stu_cam_history', '');
    try { return v ? JSON.parse(v) : []; } catch (e) { return []; }
  }

  function camPushHistory(problem) {
    var img = $('camera-img');
    if (!img || !img.src || img.style.display === 'none') return;
    makeThumb(img.src, 640, 0.75, function (mid) {
      makeThumb(img.src, 120, 0.7, function (thumb) {
        var list = camHistory();
        list.unshift({ img: mid || '', thumb: thumb || mid || '', problem: problem || '', ts: Date.now() });
        storeSetStr('stu_cam_history', JSON.stringify(list.slice(0, 5)));
        renderCamHistory();
      });
    });
  }

  function renderCamHistory() {
    var list = camHistory();
    var card = $('history-card');
    var box = $('history-list');
    if (!card || !box) return;
    card.style.display = list.length ? 'block' : 'none';
    box.innerHTML = '';
    list.forEach(function (h) {
      var div = document.createElement('div');
      div.className = 'hist-item';
      div.innerHTML = (h.thumb ? '<img class="hist-thumb" src="' + h.thumb + '" alt="">' : '<div class="hist-thumb ph">📷</div>') +
        '<div class="hist-text">' + esc(h.problem || '（未输入题目）') + '</div>';
      div.addEventListener('click', function () {
        $('camera-scan').style.display = 'none';
        setCamImage(h.img || h.thumb);
        $('recog-input').value = h.problem || '';
        camOcrNote('ℹ️ 从历史恢复：可修改题目后开始辅导');
      });
      box.appendChild(div);
    });
  }

  function cameraOnShow() {
    renderCamHistory();
    if (!storeStr('stu_cam_guide', '')) {
      $('guide-overlay').style.display = 'block';
    }
  }

  // ---------------- 拍照编辑：裁剪 / 标注 ----------------

  var camEdit = {
    mode: '',          // crop | annotate
    base: null,        // 底图 canvas（含旋转，原图分辨率）
    view: null,        // 编辑画布 2d ctx
    vw: 0, vh: 0,      // 画布尺寸
    dx: 0, dy: 0, sc: 1, // 底图在画布内的 letterbox 位置与缩放
    rect: null,        // 裁剪框 {x,y,w,h}（画布坐标）
    handle: null,      // 正在拖动的角 'tl'|'tr'|'bl'|'br' 或 'move'
    strokes: [],       // 标注笔迹 [{color, points:[{x,y}]}]
    color: '#FF3B30',
    drawing: null
  };

  function camEditStart(mode) {
    var img = $('camera-img');
    if (!img.src || img.style.display === 'none') return;
    // 把当前图（含 CSS 旋转）烘进底图 canvas
    var bake = new Image();
    bake.onload = function () {
      try {
        var c = document.createElement('canvas');
        var rot = ((camRotateDeg % 360) + 360) % 360;
        var swap = rot === 90 || rot === 270;
        c.width = swap ? bake.height : bake.width;
        c.height = swap ? bake.width : bake.height;
        var ctx = c.getContext('2d');
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate(rot * Math.PI / 180);
        ctx.drawImage(bake, -bake.width / 2, -bake.height / 2);
        camEdit.base = c;
        camEdit.mode = mode;
        camEdit.strokes = [];
        camEdit.drawing = null;
        camEdit.handle = null;
        // 画布铺满 camera-box
        var box = $('camera-box');
        var cv = $('cam-edit-canvas');
        camEdit.vw = box.clientWidth;
        camEdit.vh = box.clientHeight;
        cv.width = camEdit.vw;
        cv.height = camEdit.vh;
        camEdit.view = cv.getContext('2d');
        // letterbox 参数
        var sc = Math.min(camEdit.vw / c.width, camEdit.vh / c.height);
        camEdit.sc = sc;
        camEdit.dx = (camEdit.vw - c.width * sc) / 2;
        camEdit.dy = (camEdit.vh - c.height * sc) / 2;
        if (mode === 'crop') {
          var w = camEdit.vw * 0.8;
          var h = camEdit.vh * 0.8;
          camEdit.rect = { x: (camEdit.vw - w) / 2, y: (camEdit.vh - h) / 2, w: w, h: h };
        }
        // 工具条显隐：标注才显示画笔组
        document.querySelectorAll('#cam-edit-tools .pen').forEach(function (b) {
          b.style.display = mode === 'annotate' ? 'inline-block' : 'none';
        });
        $('cam-edit').style.display = 'block';
        camEditRender();
      } catch (e) {
        // 编辑失败静默保留原图
      }
    };
    bake.src = img.src;
  }

  function camEditRender() {
    var e = camEdit;
    if (!e.view || !e.base) return;
    var ctx = e.view;
    ctx.clearRect(0, 0, e.vw, e.vh);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, e.vw, e.vh);
    var dw = e.base.width * e.sc;
    var dh = e.base.height * e.sc;
    ctx.drawImage(e.base, e.dx, e.dy, dw, dh);
    if (e.mode === 'crop' && e.rect) {
      var r = e.rect;
      // 框外遮罩
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, e.vw, r.y);
      ctx.fillRect(0, r.y + r.h, e.vw, e.vh - r.y - r.h);
      ctx.fillRect(0, r.y, r.x, r.h);
      ctx.fillRect(r.x + r.w, r.y, e.vw - r.x - r.w, r.h);
      // 边框与角手柄
      ctx.strokeStyle = '#FFB400';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 11, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#FF9F1C';
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    }
    if (e.mode === 'annotate' && e.strokes.length) {
      e.strokes.forEach(function (s) {
        if (s.points.length < 2) return;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        s.points.forEach(function (p) { ctx.lineTo(p.x, p.y); });
        ctx.stroke();
      });
    }
  }

  function camEditPos(ev) {
    var cv = $('cam-edit-canvas');
    var b = cv.getBoundingClientRect();
    return { x: ev.clientX - b.left, y: ev.clientY - b.top };
  }

  function camEditHit(p) {
    var r = camEdit.rect;
    var corners = { tl: [r.x, r.y], tr: [r.x + r.w, r.y], bl: [r.x, r.y + r.h], br: [r.x + r.w, r.y + r.h] };
    var names = Object.keys(corners);
    for (var i = 0; i < names.length; i++) {
      var c = corners[names[i]];
      if (Math.abs(p.x - c[0]) < 26 && Math.abs(p.y - c[1]) < 26) return names[i];
    }
    if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) return 'move';
    return null;
  }

  function camEditDown(ev) {
    var e = camEdit;
    if (!e.view) return;
    ev.preventDefault();
    var cv = $('cam-edit-canvas');
    cv.setPointerCapture(ev.pointerId);
    var p = camEditPos(ev);
    if (e.mode === 'crop') {
      e.handle = camEditHit(p);
      e.startP = p;
      e.startRect = e.rect ? { x: e.rect.x, y: e.rect.y, w: e.rect.w, h: e.rect.h } : null;
    } else if (e.mode === 'annotate') {
      e.drawing = { color: e.color, points: [p] };
    }
  }

  function camEditMove(ev) {
    var e = camEdit;
    if (!e.view) return;
    if (e.mode === 'crop' && e.handle) {
      ev.preventDefault();
      var p = camEditPos(ev);
      var r0 = e.startRect;
      var min = 40;
      var r = e.rect;
      if (e.handle === 'move') {
        var nx = r0.x + (p.x - e.startP.x);
        var ny = r0.y + (p.y - e.startP.y);
        r.x = Math.max(0, Math.min(e.vw - r0.w, nx));
        r.y = Math.max(0, Math.min(e.vh - r0.h, ny));
      } else {
        // 拖动的角 = 移动边，锚点 = 对角（左 Handle 锚右边，上 Handle 锚下边）
        var anchorX = e.handle.indexOf('l') > -1 ? r0.x + r0.w : r0.x;
        var anchorY = e.handle.indexOf('t') > -1 ? r0.y + r0.h : r0.y;
        var x1 = Math.max(0, Math.min(e.vw, Math.min(anchorX, p.x)));
        var x2 = Math.max(0, Math.min(e.vw, Math.max(anchorX, p.x)));
        var y1 = Math.max(0, Math.min(e.vh, Math.min(anchorY, p.y)));
        var y2 = Math.max(0, Math.min(e.vh, Math.max(anchorY, p.y)));
        if (x2 - x1 >= min && y2 - y1 >= min) {
          r.x = x1; r.y = y1; r.w = x2 - x1; r.h = y2 - y1;
        }
      }
      camEditRender();
    } else if (e.mode === 'annotate' && e.drawing) {
      ev.preventDefault();
      e.drawing.points.push(camEditPos(ev));
      camEditRender();
      // 实时画出当前笔迹
      var s = e.drawing;
      if (s.points.length > 1) {
        var ctx = e.view;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[s.points.length - 2].x, s.points[s.points.length - 2].y);
        ctx.lineTo(s.points[s.points.length - 1].x, s.points[s.points.length - 1].y);
        ctx.stroke();
      }
    }
  }

  function camEditUp() {
    var e = camEdit;
    if (e.mode === 'annotate' && e.drawing) {
      if (e.drawing.points.length > 1) e.strokes.push(e.drawing);
      e.drawing = null;
      camEditRender();
    }
    e.handle = null;
  }

  function camEditCancel() {
    camEdit.mode = '';
    camEdit.base = null;
    camEdit.drawing = null;
    $('cam-edit').style.display = 'none';
  }

  function camEditDone() {
    var e = camEdit;
    if (!e.base) { camEditCancel(); return; }
    var out;
    if (e.mode === 'crop' && e.rect) {
      // 画布坐标 → 底图坐标
      var x = Math.max(0, (e.rect.x - e.dx) / e.sc);
      var y = Math.max(0, (e.rect.y - e.dy) / e.sc);
      var w = Math.min(e.base.width - x, e.rect.w / e.sc);
      var h = Math.min(e.base.height - y, e.rect.h / e.sc);
      if (w < 10 || h < 10) { camEditCancel(); return; }
      out = document.createElement('canvas');
      out.width = Math.round(w);
      out.height = Math.round(h);
      out.getContext('2d').drawImage(e.base, x, y, w, h, 0, 0, out.width, out.height);
    } else if (e.mode === 'annotate') {
      out = document.createElement('canvas');
      out.width = e.base.width;
      out.height = e.base.height;
      var ctx = out.getContext('2d');
      ctx.drawImage(e.base, 0, 0);
      // 笔迹按画布→底图坐标烧进去
      e.strokes.forEach(function (s) {
        if (s.points.length < 2) return;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 4 / e.sc;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo((s.points[0].x - e.dx) / e.sc, (s.points[0].y - e.dy) / e.sc);
        s.points.forEach(function (p) { ctx.lineTo((p.x - e.dx) / e.sc, (p.y - e.dy) / e.sc); });
        ctx.stroke();
      });
    } else {
      camEditCancel();
      return;
    }
    var dataUrl = out.toDataURL('image/jpeg', 0.9);
    camEditCancel();
    $('camera-scan').style.display = 'block';
    $('recog-input').value = '';
    $('recog-note').style.display = 'none';
    setCamImage(dataUrl);
  }

  // ---------------- 分步引导 ----------------

  var guide = null; // 当前辅导会话
  var combo = 0; // 连续答对连击

  // 掌握度 → 难度策略（薄弱偏好 easy，扎实掺 hard）
  function pickDifficulty() {
    var score = 70;
    if (masteryCache && masteryCache.length) {
      var pool = unitKnowledgePool();
      var relevant = pool
        ? masteryCache.filter(function (m) { return pool.indexOf(m.knowledge_point) > -1; })
        : masteryCache;
      if (relevant.length) score = relevant[0].score;
    }
    if (score < 40) return Math.random() < 0.7 ? 'easy' : 'medium';
    if (score > 70) return Math.random() < 0.3 ? 'hard' : 'medium';
    return 'medium';
  }

  // 25% 概率穿插一道已掌握错题的复习（间隔复习简化版，越早掌握的越优先）
  function pickReviewWrong() {
    if (Math.random() >= 0.25) return null;
    var list = getWrongs().filter(function (w) { return w.status === 'mastered'; });
    if (!list.length) return null;
    list.sort(function (a, b) { return (a.masteredAt || '').localeCompare(b.masteredAt || ''); });
    return list[0];
  }

  function newPractice() {
    guide = null;
    beginPracticeSession();
    var review = pickReviewWrong();
    if (review) {
      startGuide(review.problem);
      return;
    }
    var difficulty = pickDifficulty();
    var pool = unitKnowledgePool();
    if (pool) {
      // 已选教材单元：单元内薄弱优先；概念题必为选择题，其余 70% 选择题
      var k = pickWeakInPool(pool);
      if (window.MCQ && (window.MCQ.isConcept(k) || Math.random() < 0.7)) {
        applyResult(window.MCQ.generateMcqByKnowledge(k, difficulty), { retry: false, task: 'practice' });
      } else {
        applyResult(S.generateByKnowledge(k, difficulty), { retry: false, task: 'practice' });
      }
      return;
    }
    var weak = pickWeakKnowledge();
    if (window.MCQ && (window.MCQ.isConcept(weak) || Math.random() < 0.7)) {
      applyResult(weak ? window.MCQ.generateMcqByKnowledge(weak, difficulty) : window.MCQ.generateMcq(null, difficulty), { retry: false, task: 'practice' });
    } else if (weak) {
      applyResult(S.generateByKnowledge(weak, difficulty), { retry: false, task: 'practice' });
    } else {
      applyResult(S.generatePractice(null, difficulty), { retry: false, task: 'practice' });
    }
  }

  function startGuide(problem) {
    beginPracticeSession();
    // 错题重练：优先用错题本里存好的步骤与答案（已掌握的错题也可复习）
    var item = getWrongs().find(function (w) { return w.problem === problem && w.status === 'active'; }) ||
      getWrongs().find(function (w) { return w.problem === problem; });
    if (item && item.steps && item.steps.length) {
      applyResult({
        source: 'local',
        problem: item.problem,
        knowledge: item.knowledge,
        answer: item.rightNum,
        displayAnswer: item.rightAnswer,
        steps: item.steps,
        options: item.options || null,
        answerIndex: item.answerIndex !== undefined ? item.answerIndex : -1,
        note: ''
      }, { retry: true, wrongId: item.id, task: 'retry' });
      return;
    }
    // 新题目（搜题/拍照/输入）：AI 优先，超时或失败回退本地引擎
    if (aiReady) {
      applyResultLoading(problem, '🤖 小助手正在认真读题，马上就好…');
      fetchTutor({ problem: problem }).then(function (res) {
        applyResult(res, { retry: false, task: 'search' });
      }).catch(function () {
        applyResult(localSolve(problem), { retry: false, task: 'search' });
      });
    } else {
      applyResult(localSolve(problem), { retry: false, task: 'search' });
    }
  }

  // 变形题巩固：AI 优先，失败用本地生成器，再失败退回随机练习
  function variantPractice(problem, knowledge, originalWrongId) {
    beginPracticeSession();
    // 概念题没有填空生成器：变形题同样用同知识点概念选择题
    if (window.MCQ && window.MCQ.isConcept(knowledge)) {
      applyResult(window.MCQ.generateMcqByKnowledge(knowledge), { retry: false, task: 'variant', variantOf: originalWrongId || '' });
      return;
    }
    var done = function (res) {
      if (res && res.problem) {
        applyResult(res, { retry: false, task: 'variant', variantOf: originalWrongId || '' });
        return;
      }
      alert('暂时没有合适的变形题，先做一道同类型的练习吧！');
      newPractice();
    };
    if (aiReady) {
      applyResultLoading(problem, '🤖 AI 正在为你出变形题…');
      fetchTutor({ problem: problem, knowledge: knowledge || '' }, '/variant').then(done).catch(function () {
        done(S.variantByKnowledge(knowledge, problem));
      });
    } else {
      done(S.variantByKnowledge(knowledge, problem));
    }
  }

  function showGuideLoading(msg) {
    $('book-nav').style.display = 'none';
    $('book-page').innerHTML = '<div class="loading-line">' + (msg || '🤖 小助手正在认真读题，马上就好…') + '</div>';
  }

  function applyResultLoading(problem, msg) {
    showView('guide');
    guide = { loading: true };
    $('retry-banner').style.display = 'none';
    $('guide-knowledge').textContent = 'AI 讲解中';
    $('guide-problem').textContent = problem;
    $('guide-note').style.display = 'none';
    $('guide-progress').textContent = '';
    $('progress-fill').style.width = '0%';
    showGuideLoading(msg);
    $('guide-answer').style.display = 'none';
    $('guide-result').style.display = 'none';
    $('explain-box').style.display = 'none';
  }

  // 错题重练小课堂：错因 → 知识点卡片 → 老师逐步讲解（含完整解答）→ 变形题挑战
  function lessonWrong(item) {
    showView('guide');
    guide = {
      mode: 'lesson',
      task: 'lesson',
      item: item,
      problem: item.problem,
      knowledge: item.knowledge,
      steps: [],
      revealed: 1,
      currentPage: 0,
      wrongId: item.id,
      retry: false,
      note: '',
      startTs: Date.now()
    };
    $('guide-knowledge').textContent = item.knowledge;
    $('guide-problem').textContent = item.problem;
    $('guide-note').style.display = 'none';
    $('retry-banner').style.display = 'block';
    $('retry-banner').textContent = '👩‍🏫 错题重练小课堂：先听老师讲，再闯一道变形题';
    $('guide-answer').style.display = 'none';
    $('guide-result').style.display = 'none';
    $('explain-box').style.display = 'block';
    $('explain-compare-my').textContent = '✗ 我当时写的：' + (item.myAnswer || '未作答');
    $('explain-compare-right').textContent = '✓ 正确答案：' + (item.rightAnswer || '见步骤');
    $('explain-reason').style.display = 'none';
    $('lesson-challenge').style.display = 'none';
    renderKnowledgeCard(item.knowledge);

    var cached = item.explain && item.explain.steps && item.explain.steps.length ? item.explain : null;
    if (cached) {
      guide.knowledge = cached.knowledge || item.knowledge;
      $('guide-knowledge').textContent = guide.knowledge;
      renderKnowledgeCard(guide.knowledge);
      if (cached.reason) showReason(cached.reason);
      guide.steps = buildLessonSteps(cached.steps, guide.knowledge, item);
      renderGuide();
      return;
    }
    $('guide-progress').textContent = '';
    if ($('progress-fill')) $('progress-fill').style.width = '0%';
    showGuideLoading('👩‍🏫 老师正在备课，马上开始…');
    if (aiReady) {
      fetchTutor({
        problem: item.problem,
        myAnswer: item.myAnswer,
        rightAnswer: item.rightAnswer,
        mode: 'wrong'
      }).then(function (res) {
        guide.knowledge = res.knowledge || item.knowledge;
        $('guide-knowledge').textContent = guide.knowledge;
        renderKnowledgeCard(guide.knowledge);
        item.explain = { steps: res.steps, knowledge: guide.knowledge, reason: res.reason || '' };
        saveWrongs(getWrongs());
        if (res.reason) showReason(res.reason);
        guide.steps = buildLessonSteps(res.steps, guide.knowledge, item);
        renderGuide();
      }).catch(function () {
        var fallback = explainFallback(item);
        guide.knowledge = fallback.knowledge || item.knowledge;
        $('guide-knowledge').textContent = guide.knowledge;
        renderKnowledgeCard(guide.knowledge);
        guide.steps = buildLessonSteps(fallback.steps, guide.knowledge, item);
        renderGuide();
      });
    } else {
      var fallback = explainFallback(item);
      guide.knowledge = fallback.knowledge || item.knowledge;
      $('guide-knowledge').textContent = guide.knowledge;
      renderKnowledgeCard(guide.knowledge);
      guide.steps = buildLessonSteps(fallback.steps, guide.knowledge, item);
      renderGuide();
    }
  }

  // 老师口吻的课堂步骤：开场白 + 讲解步骤 + 课堂小结（完整解答）
  function buildLessonSteps(steps, knowledge, item) {
    var lib = S.getKnowledge(knowledge);
    var arr = [{
      title: '开始上课',
      content: '别着急，老师陪你一起把这道题弄明白。先想一想：它考的是「' + knowledge + '」里的哪个方法？'
    }];
    (steps || []).forEach(function (s, i) {
      arr.push({
        title: s.title || ('第' + (i + 1) + '步'),
        content: s.content || '',
        tip: s.tip || '',
        ask: s.ask || ''
      });
    });
    arr.push({
      title: '课堂小结',
      content: '我们一起整理一遍：\n这道题用的是「' + knowledge + '」的方法。' + lib.method +
        '\n完整解答：' + (item.rightAnswer || '见上面步骤') + '。\n以后再遇到这类题，先回想这个方法，一步一步来，你一定行！'
    });
    return arr;
  }

  function renderKnowledgeCard(knowledge) {
    var lib = S.getKnowledge(knowledge);
    $('knowledge-card').style.display = 'block';
    $('knowledge-name').textContent = knowledge;
    $('knowledge-desc').textContent = lib.desc;
    $('knowledge-method').textContent = lib.method;
    if (lib.mistakes) {
      $('knowledge-mistakes').textContent = '⚠️ 容易错：' + lib.mistakes;
      $('knowledge-mistakes').style.display = 'block';
    } else {
      $('knowledge-mistakes').style.display = 'none';
    }
  }

  function showLessonChallenge() {
    $('lesson-challenge').style.display = 'block';
  }

  // AI 不可用时的讲解回退：优先用错题本存好的练习步骤，其次本地引擎
  function explainFallback(item) {
    if (item.steps && item.steps.length) {
      return { steps: item.steps, knowledge: item.knowledge };
    }
    var r = localSolve(item.problem);
    return { steps: r.steps, knowledge: r.knowledge };
  }

  function showReason(reason) {
    $('explain-reason').textContent = '💡 老师看出你的问题啦：' + reason;
    $('explain-reason').style.display = 'block';
  }

  function applyResult(res, opts) {
    var steps = (res.steps || []).map(function (s, i) {
      return { title: s.title || ('第' + (i + 1) + '步'), content: s.content || '' };
    });
    if (!steps.length) steps.push({ title: '提示', content: '跟着老师教的思路自己列式算一算，再对答案。' });
    var rightNum = typeof res.answer === 'number' ? res.answer : extractNumber(res.answer);
    guide = {
      mode: 'practice',
      task: (opts && opts.task) || 'practice', // practice / retry / variant / search（行为数据）
      variantOf: (opts && opts.variantOf) || '',
      problem: res.problem,
      knowledge: res.knowledge || '综合',
      note: res.note || '',
      steps: steps,
      revealed: 1,
      currentPage: 0,
      rightNum: rightNum === null ? null : rightNum,
      rightAnswerText: res.displayAnswer || (res.answer == null ? '' : String(res.answer)),
      options: res.options || null,
      answerIndex: res.answerIndex !== undefined ? res.answerIndex : -1,
      startTs: Date.now(),
      retry: !!(opts && opts.retry),
      wrongId: opts && opts.wrongId ? opts.wrongId : '',
      wrongTimes: 0,
      prevScore: (function () {
        if (!masteryCache) return null;
        var m = masteryCache.find(function (x) { return x.knowledge_point === res.knowledge; });
        return m ? m.score : null;
      })(),
      phase: 'solving'
    };
    $('result-combo').style.display = 'none';
    $('result-mastery').style.display = 'none';
    $('guide-answer').style.display = 'none';
    showView('guide');
    $('retry-banner').style.display = guide.retry ? 'block' : 'none';
    $('retry-banner').textContent = '💪 错题重练：认真想一想，这次一定能做对！';
    $('explain-box').style.display = 'none';
    $('answer-feedback').style.display = 'none';
    $('btn-variant').style.display = 'none';
    $('knowledge-card').style.display = 'none';
    $('lesson-challenge').style.display = 'none';
    $('guide-knowledge').textContent = guide.knowledge;
    $('guide-problem').textContent = guide.problem;
    $('guide-note').style.display = guide.note ? 'block' : 'none';
    $('guide-note').textContent = guide.note;
    $('guide-result').style.display = 'none';
    renderGuide();
  }

  function renderGuide() {
    var lesson = guide.mode === 'lesson';
    var total = guide.steps.length;
    var page = guide.currentPage || 0;
    var shown = guide.revealed || 1;
    if (page > total - 1) page = total - 1;
    if (page < 0) page = 0;
    guide.currentPage = page;

    // 书页导航恢复（loading 时隐藏）
    $('book-nav').style.display = 'flex';
    var pg = $('book-page');
    if (!pg.querySelector('.page-head')) {
      pg.innerHTML =
        '<div class="page-head"><span class="page-num" id="page-num"></span><span class="page-title" id="page-title"></span></div>' +
        '<div class="page-content" id="page-content"></div>' +
        '<div class="page-extra" id="page-extra"></div>';
    }
    var s = guide.steps[page] || { title: '想一想', content: '这道题你会怎么开始呢？' };
    $('page-num').textContent = '第 ' + (page + 1) + ' / ' + total + ' 页';
    $('page-title').textContent = s.title || ('第' + (page + 1) + '步');
    $('page-content').textContent = s.content || '';
    var extra = $('page-extra');
    extra.innerHTML = '';
    if (s.tip) {
      var tip = document.createElement('div');
      tip.className = 'step-tip';
      tip.textContent = '📌 ' + s.tip;
      extra.appendChild(tip);
    }
    if (s.ask) {
      var ask = document.createElement('div');
      ask.className = 'step-ask';
      ask.textContent = '🤔 想一想：' + s.ask;
      extra.appendChild(ask);
    }

    // 页码圆点：已解锁可点，当前页拉长
    var dots = $('page-dots');
    dots.innerHTML = '';
    for (var i = 0; i < total; i++) {
      (function (idx) {
        var d = document.createElement('span');
        d.className = 'dot' + (idx < shown ? ' on' : '') + (idx === page ? ' cur' : '');
        if (idx < shown && idx !== page) {
          d.addEventListener('click', function () { goPage(idx, idx > page ? 'next' : 'prev'); });
        }
        dots.appendChild(d);
      })(i);
    }

    // 翻页按钮
    var prevBtn = $('btn-prev-page');
    prevBtn.classList.toggle('off', page === 0);
    var nextBtn = $('btn-next-page');
    if (page < total - 1) {
      nextBtn.textContent = page >= shown - 1 ? '翻开下一页 ✨' : '下一页 →';
    } else {
      nextBtn.textContent = lesson ? '开始挑战 🎯' : (guide.isExample ? '开始练习 ✏️' : '开始作答 ✏️');
    }

    // 进度条与文字
    $('guide-progress').textContent = lesson
      ? '已听 ' + shown + ' / ' + total + ' 页'
      : '已翻开 ' + shown + ' / ' + total + ' 页';
    var fill = $('progress-fill');
    if (fill) {
      fill.style.width = (total ? Math.round(shown / total * 100) : 0) + '%';
    }
  }

  function goPage(idx, dir) {
    guide.currentPage = idx;
    var el = $('book-page');
    el.classList.remove('flip-next', 'flip-prev');
    void el.offsetWidth; // 重排以重新触发动画
    el.classList.add(dir === 'next' ? 'flip-next' : 'flip-prev');
    renderGuide();
  }

  function bookNext() {
    if (!guide || guide.loading) return;
    var total = guide.steps.length;
    var page = guide.currentPage || 0;
    if (page < total - 1) {
      if (page >= (guide.revealed || 1) - 1) guide.revealed = page + 2; // 翻到下一页 = 解锁它
      goPage(page + 1, 'next');
    } else {
      guide.revealed = total;
      renderGuide();
      if (guide.mode === 'lesson') showLessonChallenge();
      else if (guide.isExample) campNextItem();
      else showAnswerArea();
    }
  }

  function bookPrev() {
    if (!guide || guide.loading) return;
    var page = guide.currentPage || 0;
    if (page > 0) goPage(page - 1, 'prev');
  }

  var MCQ_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  function showAnswerArea() {
    $('guide-answer').style.display = 'block';
    var mc = !!(guide.options && guide.options.length);
    var numeric = !mc && guide.rightNum !== null && guide.rightNum !== undefined;
    $('answer-mcq-box').style.display = mc ? 'block' : 'none';
    $('answer-input-box').style.display = numeric ? 'block' : 'none';
    $('answer-self-box').style.display = (!mc && !numeric) ? 'block' : 'none';
    if (mc) renderMcqOptions();
    if (numeric) {
      $('answer-input').value = '';
      $('answer-input').focus();
    }
  }

  function renderMcqOptions() {
    var box = $('mcq-options');
    box.innerHTML = '';
    guide.options.forEach(function (opt, i) {
      var b = document.createElement('button');
      b.className = 'mcq-opt';
      b.innerHTML = '<span class="mcq-letter">' + MCQ_LETTERS[i] + '</span><span class="mcq-text">' + esc(opt) + '</span>';
      b.addEventListener('click', function () { selectOption(i, b); });
      box.appendChild(b);
    });
  }

  function selectOption(i, btn) {
    if (guide.phase !== 'solving') return;
    guide.lastValue = i; // 训练营上报用：选项下标
    var myText = MCQ_LETTERS[i] + '. ' + guide.options[i];
    if (i === guide.answerIndex) {
      if (btn) btn.classList.add('right');
      finish(true, myText);
    } else {
      guide.wrongTimes++;
      if (btn) btn.classList.add('wrong');
      if (guide.wrongTimes < 2) {
        var fb = $('answer-feedback');
        fb.style.display = 'block';
        fb.textContent = pick([
          '差一点点！回看第 2 步，会有启发哦 💪',
          '再想想哦，把第 3 步重看一遍，你很接近了 ✨',
          '别着急！检查一下再选一次 👀',
          '思路不错！回看上面的步骤，再选一次 ✅'
        ]);
      } else {
        finish(false, myText);
      }
    }
  }

  function parseUserAnswer(s) {
    var t = String(s).trim();
    if (/^[0-9+\-*×÷/()（）.\s]+$/.test(t) && /[+\-*×÷/]/.test(t)) {
      var v = S.evaluate(t);
      if (v !== null) return v;
    }
    return extractNumber(t);
  }

  function submitAnswer() {
    var user = $('answer-input').value.trim();
    if (!user) { alert('先写上你的答案吧 ✍️'); return; }
    guide.lastValue = user; // 训练营上报用：文本答案
    var num = parseUserAnswer(user);
    var right = num !== null && guide.rightNum !== null && guide.rightNum !== undefined &&
      Math.abs(num - guide.rightNum) < 0.011;
    if (right) {
      $('answer-feedback').style.display = 'none';
      finish(true, user);
    } else {
      guide.wrongTimes++;
      $('answer-input').value = '';
      if (guide.wrongTimes < 2) {
        // 引导优先：鼓励 + 指向具体步骤的提示，而不是直接判错
        var fb = $('answer-feedback');
        fb.style.display = 'block';
        fb.textContent = pick([
          '差一点点！回看第 2 步，会有启发哦 💪',
          '再想想哦，把第 3 步重看一遍，你很接近了 ✨',
          '别着急！检查一下数字有没有抄错、单位有没有写 ✅',
          '思路不错！先回看上面的步骤，再试一次 👀'
        ]);
      } else {
        finish(false, user);
      }
    }
  }

  function markWrongMastered(id) {
    var ws = getWrongs();
    var it = ws.find(function (w) { return w.id === id; });
    if (it && it.status === 'active') {
      it.status = 'mastered';
      it.masteredAt = dateStr();
      saveWrongs(ws);
      syncSend('master', { problem: it.problem });
    }
  }

  function finish(correct, userAnswer) {
    // 选择题：正确答案带字母前缀展示
    if (guide.options && guide.options.length) {
      guide.rightAnswerText = MCQ_LETTERS[guide.answerIndex] + '. ' + guide.options[guide.answerIndex];
    }
    var seconds = Math.round((Date.now() - guide.startTs) / 1000);
    var attempts = guide.wrongTimes + 1; // 第几次作答定结果（行为数据）
    var task = guide.task || 'practice';
    endPracticeSession();
    addRecord({ ok: correct, seconds: seconds, attempts: attempts, knowledge: guide.knowledge, mode: task });
    syncSend('record', { ts: Date.now(), ok: correct, seconds: seconds, attempts: attempts, knowledge: guide.knowledge, mode: task });

    var praise;
    if (correct) {
      praise = guide.wrongTimes > 0
        ? pick(['调整后答对了！你学会了检查，太棒了！🌟', '第二次就做对了，这个检查习惯真厉害！👏', '你停下来想了想就做对了，这就是进步！🚀'])
        : pick(['太棒了！🎉', '你真厉害！🌟', '算得又快又准！⚡', '小数学家，继续加油！🚀']);
    } else {
      praise = '没关系，错题已经帮你记进错题本啦，下次一定能做对！💪';
    }

    if (correct) {
      if (guide.retry && guide.wrongId) {
        markWrongMastered(guide.wrongId);
      }
      // 变形题做对 → 原错题自动标记已掌握
      if (guide.variantOf && guide.variantOf !== guide.wrongId) {
        markWrongMastered(guide.variantOf);
      }
    } else if (guide.retry && guide.wrongId) {
      var ws2 = getWrongs();
      var it2 = ws2.find(function (w) { return w.id === guide.wrongId; });
      if (it2) {
        it2.times = (it2.times || 1) + 1;
        it2.lastAt = dateStr();
        if (it2.status === 'mastered') it2.status = 'active'; // 复习又错了 → 回到待复习
        saveWrongs(ws2);
      }
      syncSend('wrong', { problem: it2.problem, myAnswer: it2.myAnswer, rightAnswer: it2.rightAnswer, knowledge: it2.knowledge, times: it2.times, errorType: it2.errorType || '' });
    } else {
      var wrongs = getWrongs();
      var exist = wrongs.find(function (w) { return w.problem === guide.problem && w.status === 'active'; });
      var rightText = guide.options && guide.options.length
        ? MCQ_LETTERS[guide.answerIndex] + '. ' + guide.options[guide.answerIndex]
        : (guide.rightAnswerText || '见步骤');
      var item;
      if (exist) {
        exist.times = (exist.times || 1) + 1;
        exist.myAnswer = userAnswer || '未作答';
        exist.lastAt = dateStr();
        exist.options = guide.options;
        exist.answerIndex = guide.answerIndex;
        item = exist;
      } else {
        item = {
          id: 'w' + Date.now() + Math.floor(Math.random() * 1000),
          problem: guide.problem,
          myAnswer: userAnswer || '未作答',
          rightAnswer: rightText,
          rightNum: guide.rightNum,
          steps: guide.steps,
          knowledge: guide.knowledge,
          times: 1,
          createdAt: dateStr(),
          lastAt: dateStr(),
          status: 'active',
          options: guide.options,
          answerIndex: guide.answerIndex
        };
        wrongs.unshift(item);
      }
      saveWrongs(wrongs);
      syncSend('wrong', { problem: item.problem, myAnswer: item.myAnswer, rightAnswer: item.rightAnswer, knowledge: item.knowledge, times: item.times, errorType: item.errorType || '' });
    }

    // 奖励：每日打卡 + 星星（变形题成功 +2），答对播放轻音效
    if (window.Rewards) {
      Rewards.checkIn();
      if (correct) {
        Rewards.addStars(task === 'variant' ? 2 : 1);
        if (task === 'variant') Rewards.unlock('variant_hero');
        rewardSync();
      }
    }
    if (correct && window.TTS) TTS.playCorrect();
    // 连击：连续答对奖励
    if (correct) {
      combo++;
      if (combo % 5 === 0 && window.Rewards) {
        Rewards.addStars(1);
      }
      if (combo === 10) {
        showBadgeToast({ icon: '🔥', name: '连击大师', desc: '连续答对 10 题，太厉害了！' });
      }
      $('result-combo').textContent = '🔥 连击 x' + combo;
      $('result-combo').style.display = combo >= 2 ? 'block' : 'none';
    } else {
      combo = 0;
      $('result-combo').style.display = 'none';
    }
    refreshMastery(function () {
      // 掌握度进步反馈
      if (correct && guide.prevScore !== null && guide.prevScore !== undefined && masteryCache) {
        var m = masteryCache.find(function (x) { return x.knowledge_point === guide.knowledge; });
        var el = $('result-mastery');
        if (m && el) {
          var delta = m.score - guide.prevScore;
          el.style.display = 'block';
          el.textContent = delta > 0
            ? '「' + guide.knowledge + '」掌握度 +' + delta + '，继续加油！'
            : '「' + guide.knowledge + '」掌握度很稳，小狐为你高兴！';
        }
      }
    }); // 答题后刷新掌握度，驱动薄弱优先出题
    addBond(correct ? 1 : 0); // 伙伴亲密度
    compTouch(guide.knowledge, correct);

    $('guide-answer').style.display = 'none';
    $('guide-result').style.display = 'block';
    $('guide-result').className = 'card result-card ' + (correct ? 'ok' : 'no');
    if (window.Mascot) {
      Mascot.render($('result-icon'), correct ? 'cheer' : 'comfort', 56);
    } else {
      $('result-icon').textContent = correct ? '🎉' : '📕';
    }
    $('result-title').textContent = praise;
    $('result-sub').textContent = '用时 ' + seconds + ' 秒 · 已记入今日练习';
    $('btn-variant').style.display = correct ? 'none' : 'block';
    if (!correct) {
      $('result-answer').style.display = 'block';
      $('result-answer').textContent = '✅ 正确答案：' + (guide.rightAnswerText || '见上面步骤');
    } else {
      $('result-answer').style.display = 'none';
    }

    // 训练营模式：结果卡按钮切换为课程流程
    if (guide.task === 'camp' && !guide.isExample) {
      $('btn-variant').style.display = 'none';
      $('btn-again').textContent = correct ? '下一题 →' : '再试一次 💪';
      campAfterAnswer(correct);
    }
  }

  // ---------------- 错题本 ----------------

  var wrongTab = 'active';

  // ---------------- 错题本状态 ----------------

  var wrongFilterK = '';
  var wrongFilterQ = '';
  var multiMode = false;
  var selectedIds = {};

  function errLabel(t) {
    return { method_unknown: '方法不熟', calc_error: '计算出错', read_error: '读题不清' }[t] || '';
  }

  function isDueToday(item) {
    if (!item.reviewDueDate) return false;
    return item.reviewDueDate <= dateStr();
  }

  function dueLabel(item) {
    if (!item.reviewDue) return '';
    return isDueToday(item) ? '⏰ 已到期复习' : '⏰ ' + item.reviewDue;
  }

  function refreshWrong() {
    var all = getWrongs();
    var actives = all.filter(function (w) { return w.status === 'active'; });
    var mastered = all.filter(function (w) { return w.status === 'mastered'; });
    var dueToday = actives.filter(isDueToday).length;
    $('wrong-active-count').textContent = actives.length + (dueToday ? '（今日到期 ' + dueToday + '）' : '');
    $('wrong-mastered-count').textContent = mastered.length;
    // 错题清零徽章
    if (window.Rewards) {
      if (actives.length === 0 && mastered.length > 0) Rewards.unlock('wrong_clear');
    }
    $('tab-active').classList.toggle('on', wrongTab === 'active');
    $('tab-mastered').classList.toggle('on', wrongTab === 'mastered');

    var list = all.filter(function (w) { return w.status === wrongTab; });
    // 筛选
    if (wrongFilterK) {
      list = list.filter(function (w) { return (w.knowledge || '综合') === wrongFilterK; });
    }
    if (wrongFilterQ) {
      list = list.filter(function (w) { return w.problem.indexOf(wrongFilterQ) > -1; });
    }
    // 到期优先排序
    list.sort(function (a, b) {
      var da = isDueToday(a) ? 1 : 0;
      var db = isDueToday(b) ? 1 : 0;
      if (da !== db) return db - da;
      return (b.lastAt || '').localeCompare(a.lastAt || '');
    });

    var box = $('wrong-list');
    box.innerHTML = '';
    $('btn-clear-mastered').style.display = wrongTab === 'mastered' && list.length ? 'block' : 'none';

    // 知识点筛选 chips
    var chips = $('wrong-filters');
    chips.innerHTML = '';
    if (all.length) {
      var ks = {};
      all.forEach(function (w) { ks[w.knowledge || '综合'] = 1; });
      Object.keys(ks).forEach(function (k) {
        var c = document.createElement('button');
        c.className = 'w-chip' + (wrongFilterK === k ? ' on' : '');
        c.textContent = k;
        c.addEventListener('click', function () {
          wrongFilterK = wrongFilterK === k ? '' : k;
          refreshWrong();
        });
        chips.appendChild(c);
      });
    }

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML = (wrongFilterK || wrongFilterQ)
        ? '<div class="empty">没有符合条件的错题</div>'
        : wrongTab === 'active'
          ? '<div class="empty">📭 还没有错题，太棒了！</div><div class="empty-sub">做错的题会自动收进来，记得常来复习</div>'
          : '<div class="empty">🌱 还没有掌握的错题</div><div class="empty-sub">继续加油，做对的错题会出现在这里</div>';
      box.appendChild(empty);
      return;
    }

    // 按知识点分组展示
    var groups = {};
    list.forEach(function (item) {
      var k = item.knowledge || '综合';
      (groups[k] = groups[k] || []).push(item);
    });
    Object.keys(groups).forEach(function (k) {
      var head = document.createElement('div');
      head.className = 'wg-head';
      head.innerHTML = '<span class="tag">' + esc(k) + '</span><span class="w-times">' + groups[k].length + ' 道</span>';
      box.appendChild(head);
      groups[k].forEach(function (item) {
        var div = document.createElement('div');
        div.className = 'card wrong-item' + (item.status === 'mastered' ? ' mastered-item' : '') + (selectedIds[item.id] ? ' selected' : '');
        var tags = '';
        if (errLabel(item.errorType)) tags += '<span class="w-err">' + errLabel(item.errorType) + '</span>';
        var due = item.status === 'active' ? dueLabel(item) : '';
        if (due) tags += '<span class="w-due">' + esc(due) + '</span>';
        var top = item.status === 'mastered'
          ? '✓ ' + esc(item.masteredAt || '') + ' 掌握'
          : '错 ' + item.times + ' 次 · ' + esc(item.lastAt || '');
        var chk = multiMode && item.status === 'active'
          ? '<label class="w-chk"><input type="checkbox" data-wid="' + item.id + '"' + (selectedIds[item.id] ? ' checked' : '') + '> 选择</label>'
          : '';
        var btns = item.status === 'active'
          ? '<button class="btn btn-primary btn-sm w-btn" data-act="lesson">重新学习</button>' +
            '<button class="btn btn-green btn-sm w-btn" data-act="variant">变形题</button>' +
            '<button class="btn btn-ghost btn-sm w-btn" data-act="master">掌握啦</button>' +
            '<button class="btn btn-ghost btn-sm w-btn" data-act="delete">删除</button>'
          : '<button class="btn btn-blue btn-sm w-btn" data-act="lesson">重新学习</button>' +
            '<button class="btn btn-ghost btn-sm w-btn" data-act="delete">删除</button>';
        div.innerHTML =
          '<div class="w-top"><div>' + tags + '</div><div class="w-times">' + top + '</div></div>' +
          '<div class="w-problem">' + esc(item.problem) + '</div>' +
          '<div class="w-ans bad">✗ 我的答案：' + esc(item.myAnswer) + '</div>' +
          '<div class="w-ans good">✓ 正确答案：' + esc(item.rightAnswer) + '</div>' +
          '<div class="w-btns">' + btns + '</div>' + chk;
        div.querySelectorAll('[data-act]').forEach(function (b) {
          b.addEventListener('click', function () { wrongAction(b.dataset.act, item); });
        });
        var cb = div.querySelector('input[type=checkbox]');
        if (cb) {
          cb.addEventListener('change', function () {
            if (cb.checked) selectedIds[item.id] = true;
            else delete selectedIds[item.id];
            updateBatchBar();
            div.classList.toggle('selected', !!selectedIds[item.id]);
          });
        }
        box.appendChild(div);
      });
    });
  }

  function updateBatchBar() {
    var ids = Object.keys(selectedIds);
    $('batch-count').textContent = '已选 ' + ids.length + ' 道';
    $('wrong-batch').style.display = multiMode ? 'flex' : 'none';
  }

  function toggleMulti() {
    multiMode = !multiMode;
    if (!multiMode) selectedIds = {};
    $('btn-wrong-multi').textContent = multiMode ? '✖️ 退出多选' : '☑️ 多选';
    updateBatchBar();
    refreshWrong();
  }

  function batchMaster() {
    var ids = Object.keys(selectedIds);
    if (!ids.length) return;
    if (!confirm('把选中的 ' + ids.length + ' 道错题标记为已掌握？')) return;
    var ws = getWrongs();
    ids.forEach(function (id) { markWrongMastered(id); });
    selectedIds = {};
    updateBatchBar();
    refreshWrong();
  }

  function batchDelete() {
    var ids = Object.keys(selectedIds);
    if (!ids.length) return;
    if (!confirm('删除选中的 ' + ids.length + ' 道错题？删除后无法恢复。')) return;
    var keep = getWrongs().filter(function (w) { return ids.indexOf(w.id) < 0; });
    saveWrongs(keep);
    ids.forEach(function (id) {
      var it = getWrongs().find(function (w) { return w.id === id; });
      if (it) syncSend('deleteWrong', { problem: it.problem });
    });
    selectedIds = {};
    updateBatchBar();
    refreshWrong();
  }

  function csvCell(v) {
    v = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function exportWrongCsv() {
    var rows = [['题目', '我的答案', '正确答案', '知识点', '错因', '状态', '最近时间']];
    getWrongs().forEach(function (w) {
      rows.push([
        w.problem, w.myAnswer, w.rightAnswer, w.knowledge,
        errLabel(w.errorType), w.status === 'mastered' ? '已掌握' : '待复习',
        w.lastAt || w.masteredAt || ''
      ]);
    });
    var csv = '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '错题本.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function wrongAction(act, item) {
    if (act === 'retry') {
      startGuide(item.problem);
    } else if (act === 'lesson') {
      // 错题重练 → 对话式 AI 辅导（状态机）
      startChatSession({
        problem: item.problem,
        knowledge: item.knowledge,
        myAnswer: item.myAnswer,
        rightAnswer: item.rightAnswer,
        answer: item.rightNum,
        steps: item.steps,
        wrongId: item.id
      });
    } else if (act === 'variant') {
      variantPractice(item.problem, item.knowledge, item.id);
    } else if (act === 'master') {
      if (!confirm('确认这道题已经会做了吗？')) return;
      var ws = getWrongs();
      var it = ws.find(function (w) { return w.id === item.id; });
      if (it) { it.status = 'mastered'; it.masteredAt = dateStr(); saveWrongs(ws); }
      syncSend('master', { problem: item.problem });
      refreshWrong();
    } else if (act === 'delete') {
      if (!confirm('删除后无法恢复，确定删除这道错题吗？')) return;
      saveWrongs(getWrongs().filter(function (w) { return w.id !== item.id; }));
      syncSend('deleteWrong', { problem: item.problem });
      refreshWrong();
    }
  }

  // ---------------- 家长端入口 ----------------

  function fmtTime(ts) {
    if (!ts) return '未同步';
    var d = new Date(ts);
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function refreshParent() {
    var base = getApiBase();
    var code = getCode();
    $('parent-code').textContent = code;
    $('parent-code-inline').textContent = code;
    $('name-input').value = getName();
    $('api-input').value = base;
    $('sync-status').textContent = syncOn()
      ? '✅ 你的练习会自动同步给爸爸妈妈看'
      : '⏸️ 现在只保存在这台设备上';
    $('sync-status').className = syncOn() ? 'sync-on' : 'sync-off';
    $('sync-last').textContent = '最近同步：' + fmtTime(getLastSync());
    var origin = location.protocol === 'file:' ? 'http://127.0.0.1:8787' : location.origin;
    $('parent-url-text').textContent = (base || origin) + '/parent';
    var s = getStats();
    $('parent-today').textContent = s.today;
    $('parent-acc').textContent = s.accuracy === null ? '--' : Math.round(s.accuracy * 100) + '%';
    $('parent-active').textContent = s.activeCount;
  }

  // ---------------- 查漏补缺训练营 ----------------

  var camp = {
    plan: null,       // 课表（GET /api/camp/plan）
    diag: null,       // 测评会话 {id, questions, cur, answered, total, isFinal}
    lesson: null,     // 当前课内容
    lessonIndex: 0,
    queue: null,      // 上课题目队列 [{kind:'example'|'practice'|'quiz', data}]
    queueIdx: 0,
    retryFlag: false,
    finalResult: null
  };

  function campFetch(path, method, body) {
    var base = getApiBase();
    return fetch(base + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json(); });
  }

  function campShowPanel(name) {
    $('camp-home-panel').style.display = name === 'home' ? 'block' : 'none';
    $('camp-diagnostic-panel').style.display = name === 'diagnostic' ? 'block' : 'none';
    $('camp-report-panel').style.display = name === 'report' ? 'block' : 'none';
  }

  // 营首页：入学测入口 / 继续测评 / 生成课表 / 课表与进度 / 结课报告
  function refreshCamp() {
    campShowPanel('home');
    campFetch('/api/camp/plan/' + encodeURIComponent(getCode())).then(function (j) {
      if (!j.ok) { renderCampOffline(); return; }
      if (j.plan) {
        camp.plan = j.plan;
        // 已结课：直接展示结课报告
        if (j.plan.status === 'done' && j.plan.result) {
          storeSet('stu_camp_result', j.plan.result);
          camp.finalResult = j.plan.result;
          renderCampFinal(j.plan.result);
          return;
        }
        renderCampPlan(j.plan);
        return;
      }
      // 已结课（计划归档）且有本地结课报告 → 直接展示
      var saved = storeGet('stu_camp_result');
      if (saved && saved.report_text) {
        camp.finalResult = saved;
        renderCampFinal(saved);
        return;
      }
      renderCampHome(j.hasDiagnostic, j.hasActiveDiagnostic);
    }).catch(function () {
      renderCampOffline();
    });
  }

  function renderCampOffline() {
    $('camp-hero-sub').textContent = '训练营需要后端服务（node server/server.js）';
    $('btn-camp-start').style.display = 'block';
    $('btn-camp-plan').style.display = 'none';
    $('camp-lesson-card').style.display = 'none';
  }

  function renderCampHome(hasDiag, hasActiveDiag) {
    $('camp-lesson-card').style.display = 'none';
    var startBtn = $('btn-camp-start');
    var planBtn = $('btn-camp-plan');
    if (hasActiveDiag) {
      $('camp-hero-sub').textContent = '上次的入学测评还没做完，小狐帮你留着进度呢';
      startBtn.textContent = '继续入学测评 ▶';
      startBtn.style.display = 'block';
      planBtn.style.display = 'none';
    } else if (hasDiag) {
      $('camp-hero-sub').textContent = '入学测评完成啦！小狐老师已经找到你的薄弱点，接下来生成课表开始补课';
      startBtn.style.display = 'none';
      planBtn.style.display = 'inline-block';
    } else {
      $('camp-hero-sub').textContent = '先来一次入学小测，小狐老师帮你把薄弱的地方一个个补上';
      startBtn.textContent = '开始入学测评 🚀';
      startBtn.style.display = 'block';
      planBtn.style.display = 'none';
    }
  }

  function renderCampPlan(plan) {
    $('btn-camp-start').style.display = 'none';
    $('btn-camp-plan').style.display = 'none';
    $('camp-hero-sub').textContent = '课表已经排好啦，一节一节来，学完自动解锁下一节 💪';
    $('camp-lesson-card').style.display = 'block';
    var box = $('camp-lessons');
    box.innerHTML = '';
    var notice = $('camp-notice');
    var currentStarted = null;
    plan.lessons.forEach(function (l) {
      if (l.status === 'active') currentStarted = l;
      var div = document.createElement('div');
      div.className = 'camp-lesson ' + l.status;
      var icon = l.lesson_type === 'concept' ? '🧠' : '✏️';
      var statusText = l.status === 'done' ? '已完成 ✅' : (l.status === 'active' ? '进行中 ▶' : '未解锁 🔒');
      var btnText = l.status === 'done' ? '已完成' : (l.status === 'active' ? '上课 →' : '🔒');
      div.innerHTML =
        '<div class="cl-icon">' + icon + '</div>' +
        '<div class="cl-body">' +
        '<div class="cl-title">第 ' + (l.index + 1) + ' 节 · ' + esc(l.knowledge) + '</div>' +
        '<div class="cl-sub">' + statusText + (l.status === 'done' ? ' · 答对 ' + l.correct + ' 题' : '') + '</div>' +
        '</div>' +
        '<button class="cl-btn">' + btnText + '</button>';
      if (l.status === 'active') {
        div.querySelector('.cl-btn').addEventListener('click', function () { campStartLesson(l.index); });
      }
      box.appendChild(div);
    });
    var allDone = plan.lessons.every(function (l) { return l.status === 'done'; });
    $('btn-camp-final').style.display = allDone ? 'block' : 'none';
    if (allDone) {
      notice.style.display = 'block';
      notice.textContent = '🎉 全部课程完成！来一次结课验收，看看自己进步了多少';
    } else {
      notice.style.display = 'none';
    }
  }

  function campGeneratePlan() {
    campFetch('/api/camp/plan/generate', 'POST', { code: getCode() }).then(function (j) {
      if (!j.ok) { alert(j.error || '网络开了小差'); return; }
      if (j.needDiagnostic) {
        campShowPanel('home');
        renderCampHome(false, false);
        return;
      }
      campShowPanel('home');
      if (j.allStrong) {
        $('camp-lesson-card').style.display = 'none';
        $('camp-hero-sub').textContent = '这一期没有明显的薄弱点，基础很扎实！保持每天练习就行 🎉';
        $('btn-camp-start').style.display = 'none';
        $('btn-camp-plan').style.display = 'none';
        return;
      }
      storeSet('stu_camp_result', null);
      camp.plan = j.plan;
      renderCampPlan(j.plan);
    }).catch(function () {
      alert('训练营需要后端服务（node server/server.js）');
    });
  }

  // ---------------- 入学测评 ----------------

  function campStartDiag() {
    campFetch('/api/camp/diagnostic/start', 'POST', { code: getCode() }).then(function (j) {
      if (!j.ok) { alert(j.error || '网络开了小差，稍后再试'); return; }
      camp.diag = {
        id: j.diagnosticId,
        questions: j.questions || [],
        cur: 0,
        answered: j.answered || 0,
        total: j.answered ? j.answered + (j.questions || []).length : (j.questions || []).length,
        isFinal: false
      };
      campShowPanel('diagnostic');
      campDiagRender();
    }).catch(function () {
      alert('训练营需要后端服务（node server/server.js）');
    });
  }

  function campDiagRender() {
    var d = camp.diag;
    var q = d.questions[d.cur];
    $('diag-progress-fill').style.width = (d.total ? Math.round(d.answered / d.total * 100) : 0) + '%';
    $('diag-progress-text').textContent = d.isFinal ? ('结课验收 · 已答 ' + d.answered + ' / ' + d.total) : ('入学测评 · 已答 ' + d.answered + ' / ' + d.total);
    $('diag-knowledge').textContent = q.knowledge;
    $('diag-problem').textContent = q.problem;
    $('diag-feedback').style.display = 'none';
    $('btn-diag-next').style.display = 'none';
    var opts = $('diag-options');
    opts.innerHTML = '';
    if (q.type === 'mcq') {
      opts.style.display = 'block';
      $('diag-input-box').style.display = 'none';
      q.options.forEach(function (opt, i) {
        var b = document.createElement('button');
        b.className = 'mcq-opt';
        b.innerHTML = '<span class="mcq-letter">' + MCQ_LETTERS[i] + '</span><span class="mcq-text">' + esc(opt) + '</span>';
        b.addEventListener('click', function () {
          opts.querySelectorAll('.mcq-opt').forEach(function (x) { x.classList.remove('picked'); });
          b.classList.add('picked');
          campDiagAnswer(i);
        });
        opts.appendChild(b);
      });
    } else {
      opts.style.display = 'none';
      $('diag-input-box').style.display = 'flex';
      $('diag-input').value = '';
      $('diag-input').focus();
    }
  }

  function campDiagAnswer(value) {
    var d = camp.diag;
    var q = d.questions[d.cur];
    if (camp.diagBusy) return;
    camp.diagBusy = true;
    campFetch('/api/camp/diagnostic/answer', 'POST', {
      code: getCode(),
      diagnosticId: d.id,
      questionId: q.id,
      value: value
    }).then(function (j) {
      camp.diagBusy = false;
      if (!j.ok) { alert(j.error || '网络开了小差'); return; }
      d.answered = j.answered;
      d.total = j.total;
      if (j.extra) d.questions.push(j.extra);
      var fb = $('diag-feedback');
      fb.style.display = 'block';
      fb.textContent = j.correct ? '✅ 答对啦！' : '❌ 正确答案：' + j.rightAnswer;
      fb.style.color = j.correct ? '#0E8A6D' : '#D64545';
      $('btn-diag-next').style.display = 'block';
      $('btn-diag-next').textContent = d.answered >= d.total ? '完成测评 🎉' : '下一题 →';
    }).catch(function () {
      camp.diagBusy = false;
      alert('网络开了小差，稍后再试');
    });
  }

  function campDiagNext() {
    var d = camp.diag;
    if (d.answered >= d.total) {
      campDiagFinish();
      return;
    }
    d.cur++;
    campDiagRender();
  }

  function campDiagFinish() {
    var d = camp.diag;
    if (camp.diagBusy) return; // 防重复提交
    camp.diagBusy = true;
    $('btn-diag-next').style.display = 'none';
    if (d.isFinal) {
      campFetch('/api/camp/plan/' + encodeURIComponent(getCode()) + '/final/done', 'POST', { code: getCode(), diagnosticId: d.id }).then(function (j) {
        camp.diagBusy = false;
        if (!j.ok) { alert(j.error || '网络开了小差'); return; }
        storeSet('stu_camp_result', j.result);
        camp.finalResult = j.result;
        campShowPanel('report');
        renderCampFinal(j.result);
      }).catch(function () {
        camp.diagBusy = false;
        alert('网络开了小差，稍后再试');
      });
      return;
    }
    campFetch('/api/camp/diagnostic/finish', 'POST', { code: getCode(), diagnosticId: d.id }).then(function (j) {
      camp.diagBusy = false;
      if (!j.ok) { alert(j.error || '网络开了小差'); return; }
      $('diag-question-card').style.display = 'none';
      var card = $('diag-result-card');
      card.style.display = 'block';
      $('diag-result-title').textContent = '测评完成！';
      var weakBox = $('diag-result-weak');
      weakBox.innerHTML = '';
      (j.weak || []).slice(0, 6).forEach(function (w) {
        var c = document.createElement('span');
        c.className = 'wk-chip';
        c.textContent = w.knowledge;
        weakBox.appendChild(c);
      });
      if (!(j.weak || []).length) weakBox.innerHTML = '<div style="color:#0E8A6D">没有明显的薄弱点，基础很扎实！</div>';
      $('diag-report-text').textContent = j.report_text || '';
    }).catch(function () {
      camp.diagBusy = false;
      alert('网络开了小差，稍后再试');
    });
  }

  // ---------------- 上课：例题 → 巩固 → 小测 ----------------

  function campStartLesson(i) {
    campFetch('/api/camp/lesson/' + encodeURIComponent(getCode()) + '/' + i).then(function (j) {
      if (!j.ok) { alert(j.error || '网络开了小差'); return; }
      camp.lesson = j.lesson;
      camp.lessonIndex = i;
      camp.queue = [{ kind: 'example', data: j.lesson.example }]
        .concat(j.lesson.practices.map(function (q) { return { kind: 'practice', data: q }; }))
        .concat(j.lesson.quiz.map(function (q) { return { kind: 'quiz', data: q }; }));
      camp.queueIdx = 0;
      camp.retryFlag = false;
      campNextItem();
    }).catch(function () {
      alert('网络开了小差，稍后再试');
    });
  }

  function campNextItem() {
    if (!camp.queue) return;
    if (camp.queueIdx >= camp.queue.length) {
      campCompleteLesson();
      return;
    }
    var item = camp.queue[camp.queueIdx];
    if (item.kind === 'example') {
      campApplyExample(item.data);
      camp.queueIdx++; // 例题页翻完即进入巩固题
    } else {
      campApplyQuestion(item.data);
    }
  }

  // 环节①+②：知识点卡片 + 例题书页讲解
  function campApplyExample(ex) {
    applyResult({
      source: 'camp',
      problem: ex.problem,
      knowledge: camp.lesson.knowledge,
      steps: ex.steps || [],
      note: ''
    }, { retry: false, task: 'camp' });
    guide.isExample = true;
    guide.rightNum = null;
    renderKnowledgeCard(camp.lesson.knowledge);
    $('knowledge-card').style.display = 'block';
    $('retry-banner').style.display = 'block';
    $('retry-banner').textContent = '🎯 训练营 · 第 ' + (camp.lessonIndex + 1) + ' 节：先听小狐老师讲例题';
  }

  // 环节③+④：巩固/小测题（复用书页与作答引擎）
  function campApplyQuestion(q) {
    applyResult({
      source: 'camp',
      problem: q.problem,
      knowledge: camp.lesson.knowledge,
      answer: q.answer,
      displayAnswer: q.displayAnswer,
      options: q.options || null,
      answerIndex: q.answerIndex !== undefined ? q.answerIndex : -1,
      steps: [{ title: '试一试', content: '例题的方法记住了吗？自己动笔试一试！' }],
      note: ''
    }, { retry: false, task: 'camp' });
    guide.phase = 'solving';
    $('retry-banner').style.display = 'block';
    var label = camp.queueIdx >= 4 ? '🎯 训练营 · 结课小测' : '🎯 训练营 · 巩固练习';
    $('retry-banner').textContent = label;
  }

  function campAfterAnswer(correct) {
    var q = camp.queue && camp.queue[camp.queueIdx];
    if (!q) return;
    campFetch('/api/camp/lesson/' + encodeURIComponent(getCode()) + '/' + camp.lessonIndex + '/answer', 'POST', {
      code: getCode(),
      index: camp.lessonIndex,
      questionId: q.data.id,
      value: guide.lastValue
    }).then(function () { }).catch(function () { });
    camp.retryFlag = !correct;
    if (correct) {
      camp.queueIdx++;
      if (camp.queueIdx >= camp.queue.length) {
        $('btn-again').textContent = '完成本节课 🎉';
      }
    }
  }

  function campCompleteLesson() {
    campFetch('/api/camp/lesson/' + encodeURIComponent(getCode()) + '/' + camp.lessonIndex + '/complete', 'POST', {
      code: getCode(),
      index: camp.lessonIndex
    }).then(function (j) {
      camp.queue = null;
      camp.lesson = null;
      if (j.ok && j.plan) camp.plan = j.plan;
      refreshCamp();
      showView('camp');
    }).catch(function () {
      camp.queue = null;
      refreshCamp();
      showView('camp');
    });
  }

  // ---------------- 结课验收 ----------------

  function campStartFinal() {
    campFetch('/api/camp/plan/' + encodeURIComponent(getCode()) + '/final', 'POST', { code: getCode() }).then(function (j) {
      if (!j.ok) { alert(j.error || '网络开了小差'); return; }
      camp.diag = {
        id: j.diagnosticId,
        questions: j.questions || [],
        cur: 0,
        answered: j.answered || 0,
        total: j.answered ? j.answered + (j.questions || []).length : (j.questions || []).length,
        isFinal: true
      };
      campShowPanel('diagnostic');
      campDiagRender();
    });
  }

  function renderCampFinal(result) {
    campShowPanel('report');
    var box = $('final-compare');
    box.innerHTML = '';
    (result.after || []).forEach(function (a) {
      var b = (result.before || []).find(function (x) { return x.knowledge === a.knowledge; });
      var before = b ? b.score : a.score;
      var up = a.score > before;
      var row = document.createElement('div');
      row.className = 'fc-row';
      row.innerHTML =
        '<div class="fc-name">' + esc(a.knowledge) + '</div>' +
        '<div class="fc-track"><div class="fc-fill before" style="width:' + Math.max(4, before) + '%"></div></div>' +
        '<div class="fc-track"><div class="fc-fill after" style="width:' + Math.max(4, a.score) + '%"></div></div>' +
        '<div class="fc-tag ' + (up ? 'up' : '') + '">' + before + '→' + a.score + (up ? ' ↑' : '') + '</div>';
      box.appendChild(row);
    });
    $('final-report-text').textContent = result.report_text || '';
    $('final-parent-script').textContent = '💬 给爸爸妈妈的话：' + (result.parent_script || '');
  }

  // ---------------- 事件绑定 ----------------

  document.querySelectorAll('.feature').forEach(function (el) {
    el.addEventListener('click', function () {
      if (el.dataset.go === 'guide') newPractice();
      else showView(el.dataset.go);
    });
  });
  document.querySelectorAll('.nav-item').forEach(function (el) {
    el.addEventListener('click', function () { showView(el.dataset.nav); });
  });

  // 训练营按钮
  $('btn-camp-start').addEventListener('click', campStartDiag);
  $('btn-camp-plan').addEventListener('click', campGeneratePlan);
  $('btn-diag-submit').addEventListener('click', function () {
    var v = $('diag-input').value.trim();
    if (!v) { alert('先写上你的答案吧 ✍️'); return; }
    campDiagAnswer(v);
  });
  $('diag-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btn-diag-submit').click(); });
  $('btn-diag-next').addEventListener('click', campDiagNext);
  $('btn-diag-to-plan').addEventListener('click', campGeneratePlan);
  $('btn-camp-final').addEventListener('click', campStartFinal);
  $('btn-camp-new').addEventListener('click', function () {
    storeSet('stu_camp_result', null);
    campGeneratePlan();
  });
  $('btn-camp-home2').addEventListener('click', function () { refreshCamp(); });

  $('btn-camera').addEventListener('click', function () { $('cam-file').click(); });
  $('btn-album').addEventListener('click', function () { $('alb-file').click(); });
  $('btn-rotate').addEventListener('click', function () {
    camRotateDeg = (camRotateDeg + 90) % 360;
    $('camera-img').style.transform = 'rotate(' + camRotateDeg + 'deg)';
  });
  $('camera-img').addEventListener('click', function () {
    if ($('camera-img').style.display === 'none') return;
    $('zoom-img').src = $('camera-img').src;
    $('zoom-img').style.transform = 'rotate(' + camRotateDeg + 'deg)';
    $('zoom-overlay').style.display = 'block';
  });
  $('btn-zoom-close').addEventListener('click', function () { $('zoom-overlay').style.display = 'none'; });
  $('zoom-overlay').addEventListener('click', function (e) {
    if (e.target === $('zoom-overlay')) $('zoom-overlay').style.display = 'none';
  });

  // 拍照编辑：裁剪 / 标注
  $('btn-crop').addEventListener('click', function () { camEditStart('crop'); });
  $('btn-annotate').addEventListener('click', function () { camEditStart('annotate'); });
  $('btn-ocr-retry').addEventListener('click', function () {
    if (lastOcrSrc) {
      $('camera-scan').style.display = 'block';
      $('recog-note').style.display = 'none';
      camRequestOcr(lastOcrSrc);
    }
  });
  $('btn-edit-cancel').addEventListener('click', camEditCancel);
  $('btn-edit-done').addEventListener('click', camEditDone);
  $('btn-pen-red').addEventListener('click', function () {
    camEdit.color = '#FF3B30';
    $('btn-pen-red').classList.add('on');
    $('btn-pen-yellow').classList.remove('on');
  });
  $('btn-pen-yellow').addEventListener('click', function () {
    camEdit.color = '#FFD60A';
    $('btn-pen-yellow').classList.add('on');
    $('btn-pen-red').classList.remove('on');
  });
  $('btn-annotate-undo').addEventListener('click', function () {
    camEdit.strokes.pop();
    camEditRender();
  });
  $('btn-annotate-clear').addEventListener('click', function () {
    camEdit.strokes = [];
    camEditRender();
  });
  (function () {
    var cv = $('cam-edit-canvas');
    cv.addEventListener('pointerdown', camEditDown);
    cv.addEventListener('pointermove', camEditMove);
    cv.addEventListener('pointerup', camEditUp);
    cv.addEventListener('pointercancel', camEditUp);
  })();
  $('btn-guide-ok').addEventListener('click', function () {
    storeSetStr('stu_cam_guide', '1');
    $('guide-overlay').style.display = 'none';
  });
  document.querySelectorAll('#math-chips .w-chip').forEach(function (b) {
    b.addEventListener('click', function () {
      var ta = $('recog-input');
      ta.value = (ta.value || '') + b.dataset.ch;
      ta.focus();
    });
  });
  $('cam-file').addEventListener('change', function (e) { handleImage(e.target.files[0]); });
  $('alb-file').addEventListener('change', function (e) { handleImage(e.target.files[0]); });
  $('btn-start-guide').addEventListener('click', function () {
    var t = $('recog-input').value.trim();
    if (!t) { alert('先写一道题目吧 ✍️'); return; }
    camPushHistory(t); // 记入拍照历史
    // 拍照/搜题 → 对话式 AI 辅导（状态机）；本地引擎已知答案时传给后端用于判题
    var r = localSolve(t);
    startChatSession({
      problem: t,
      knowledge: r.knowledge || '',
      answer: r.answer,
      steps: r.steps || []
    });
  });
  $('btn-submit').addEventListener('click', submitAnswer);
  $('answer-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitAnswer(); });

  // 书页翻页：按钮 + 左右滑动
  $('btn-next-page').addEventListener('click', bookNext);
  $('btn-prev-page').addEventListener('click', bookPrev);
  (function () {
    var sx = 0;
    var bp = $('book-page');
    bp.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    bp.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) < 50) return;
      if (dx < 0) bookNext(); else bookPrev();
    }, { passive: true });
  })();
  $('btn-self-ok').addEventListener('click', function () { finish(true, ''); });
  $('btn-self-no').addEventListener('click', function () { finish(false, ''); });
  $('btn-again').addEventListener('click', function () {
    if (guide && guide.task === 'camp') {
      if (guide.isExample) { campNextItem(); return; }
      if (camp.retryFlag) {
        camp.retryFlag = false;
        guide.phase = 'solving';
        guide.wrongTimes = 0;
        $('guide-result').style.display = 'none';
        $('guide-answer').style.display = 'none';
        showAnswerArea();
        return;
      }
      campNextItem();
      return;
    }
    newPractice();
  });
  $('btn-home').addEventListener('click', function () { showView('home'); });
  $('btn-lesson-variant').addEventListener('click', function () {
    if (guide && guide.item) variantPractice(guide.item.problem, guide.item.knowledge, guide.item.id);
  });
  $('btn-lesson-back').addEventListener('click', function () { showView('wrong'); });
  $('btn-variant').addEventListener('click', function () {
    if (!guide) return;
    var origin = guide.variantOf || (guide.task === 'retry' ? guide.wrongId : '');
    variantPractice(guide.problem, guide.knowledge, origin);
  });

  // 对话辅导
  $('chat-send').addEventListener('click', function () {
    sendChat($('chat-input').value);
  });
  $('chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendChat($('chat-input').value);
  });

  // 语音输入（和小狐说话）
  if (window.Voice && Voice.supported) {
    $('btn-mic').style.display = 'flex';
  }
  $('btn-mic').addEventListener('click', function () {
    if (!window.Voice || !Voice.supported) return;
    if (Voice.listening()) {
      Voice.stop();
      $('btn-mic').classList.remove('listening');
      return;
    }
    Voice.start(function (text) {
      $('btn-mic').classList.remove('listening');
      if (text) sendChat(text);
    }, function () {
      $('btn-mic').classList.remove('listening');
    });
    $('btn-mic').classList.add('listening');
  });

  // 语音与奖励
  $('btn-sound').addEventListener('click', function () {
    if (!window.TTS) return;
    TTS.setMuted(!TTS.isMuted());
    $('btn-sound').textContent = TTS.isMuted() ? '🔇' : '🔊';
  });
  $('btn-speak-problem').addEventListener('click', function () {
    if (window.TTS) TTS.speak($('guide-problem').textContent);
  });
  if (window.Rewards) Rewards.onBadge(showBadgeToast);

  // 教材单元选择
  $('unit-select').addEventListener('change', function () {
    currentUnit = this.value;
    storeSetStr('stu_unit', currentUnit);
    syncSend('unit', { unit: currentUnit });
  });

  // 徽章墙
  $('hero-badges').addEventListener('click', openBadgeWall);
  $('btn-bw-close').addEventListener('click', closeBadgeWall);
  $('bw-mask').addEventListener('click', closeBadgeWall);

  // 打印错题本（打印样式见 style.css 的 @media print）
  $('btn-print-wrong').addEventListener('click', function () {
    document.body.classList.add('printing-wrong');
    window.addEventListener('afterprint', function h() {
      document.body.classList.remove('printing-wrong');
      window.removeEventListener('afterprint', h);
    });
    window.print();
  });

  // 错题本：搜索 / 多选 / 批量 / 导出
  $('wrong-search').addEventListener('input', function () {
    wrongFilterQ = this.value.trim();
    refreshWrong();
  });
  $('btn-wrong-multi').addEventListener('click', toggleMulti);
  $('btn-batch-master').addEventListener('click', batchMaster);
  $('btn-batch-delete').addEventListener('click', batchDelete);
  $('btn-batch-cancel').addEventListener('click', toggleMulti);
  $('btn-export-csv').addEventListener('click', exportWrongCsv);

  $('tab-active').addEventListener('click', function () { wrongTab = 'active'; refreshWrong(); });
  $('tab-mastered').addEventListener('click', function () { wrongTab = 'mastered'; refreshWrong(); });
  $('btn-clear-mastered').addEventListener('click', function () {
    if (!confirm('把"已掌握"的错题全部清空？')) return;
    saveWrongs(getWrongs().filter(function (w) { return w.status !== 'mastered'; }));
    syncSend('clearMastered', {});
    refreshWrong();
  });

  $('btn-copy-code').addEventListener('click', function () {
    var code = getCode();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(function () { alert('已复制：' + code); });
    } else {
      alert('同步码：' + code);
    }
  });
  $('btn-save-name').addEventListener('click', function () {
    var n = $('name-input').value.trim() || '小朋友';
    setName(n);
    syncSend('name', { name: n });
    alert('已保存');
  });
  // 使用家长提供的孩子码
  $('btn-adopt-code').addEventListener('click', function () {
    var code = $('adopt-code').value.trim();
    if (!code || !/^[A-Za-z0-9]{6,32}$/.test(code)) {
      alert('孩子码格式不对，请核对后重试');
      return;
    }
    storeSetStr(KEY.code, code);
    $('adopt-code').value = '';
    refreshParent();
    refreshMastery();
    alert('已切换到这个孩子码，以后的练习都会记在它上面！');
  });
  $('api-input').addEventListener('change', function () {
    setApiBase(this.value.trim().replace(/\/$/, ''));
    refreshStatus();
    refreshParent();
  });

  // ---------------- 启动 ----------------

  refreshSamples();
  refreshStatus();
  refreshMastery();
  initUnitSelect();
  refreshHome();
  if (window.Mascot) Mascot.render($('chat-avatar'), 'greet', 34);
  showView('home');
})();
