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
    list.unshift({ ts: Date.now(), ok: rec.ok, seconds: rec.seconds || 0, knowledge: rec.knowledge || '', mode: rec.mode || 'practice' });
    storeSet(KEY.records, list.slice(0, 200));
  }

  function getCode() {
    var code = storeStr(KEY.code, '');
    if (!code) {
      code = String(Math.floor(100000 + Math.random() * 900000));
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

  function refreshStatus() {
    var base = getApiBase();
    if (location.protocol === 'file:' && !base) return;
    fetch(base + '/api/status')
      .then(function (r) { return r.json(); })
      .then(function (j) { aiReady = !!(j && j.ok && j.llm); })
      .catch(function () { aiReady = false; });
  }

  function fetchTutor(payload) {
    var base = getApiBase();
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
        reject(new Error('timeout'));
      }, 20000);
      fetch(base + '/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) { return r.json(); }).then(function (j) {
        clearTimeout(timer);
        if (j && j.ok && j.steps && j.steps.length) {
          resolve({
            source: 'ai',
            problem: payload.problem,
            knowledge: j.knowledge || '综合',
            answer: j.answer,
            displayAnswer: j.displayAnswer || String(j.answer),
            steps: j.steps.map(function (s, i) {
              return { title: s.title || ('第' + (i + 1) + '步'), content: s.content || '' };
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

  // ---------------- 视图切换 ----------------

  var currentView = 'home';

  function showView(name) {
    currentView = name;
    ['home', 'camera', 'wrong', 'parent', 'guide'].forEach(function (v) {
      $('view-' + v).style.display = v === name ? 'block' : 'none';
    });
    $('bottom-nav').style.display = name === 'guide' ? 'none' : 'flex';
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('on', el.dataset.nav === name);
    });
    window.scrollTo(0, 0);
    if (name === 'home') refreshHome();
    if (name === 'wrong') refreshWrong();
    if (name === 'parent') refreshParent();
  }

  // ---------------- 首页 ----------------

  function refreshHome() {
    var h = new Date().getHours();
    var greet = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    var s = getStats();
    $('home-greet').textContent = greet + '，小数学家！';
    $('home-today').textContent = s.today;
    $('home-acc').textContent = s.accuracy === null ? '--' : Math.round(s.accuracy * 100) + '%';
    $('home-active').textContent = s.activeCount;
    $('home-tip').textContent = pick([
      '先算乘除，后算加减，有括号先算括号里的！',
      '计算完后记得验算，别忘了单位和"答"。',
      '错题多复习一遍，比做新题更有用哦！',
      '遇到应用题，先找"已知条件"和"问题"。',
      '每天练 3~5 道题，坚持就是胜利！'
    ]);
  }

  // ---------------- 拍照识题 ----------------

  function handleImage(file) {
    if (!file) return;
    var url = URL.createObjectURL(file);
    var img = $('camera-img');
    img.src = url;
    img.style.display = 'block';
    $('camera-ph').style.display = 'none';
    $('recog-card').style.display = 'block';
    $('recog-note').style.display = 'none';
    $('recog-input').value = '';
    $('camera-scan').style.display = 'block';

    var base = getApiBase();
    if (!syncOn()) {
      setTimeout(function () {
        $('camera-scan').style.display = 'none';
        $('recog-note').style.display = 'block';
      }, 700);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = String(reader.result);
      var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      fetch(base + '/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 })
      }).then(function (r) { return r.json(); }).then(function (j) {
        $('camera-scan').style.display = 'none';
        if (j && j.ok && j.text) {
          $('recog-input').value = String(j.text).trim();
        } else {
          $('recog-note').style.display = 'block';
        }
      }).catch(function () {
        $('camera-scan').style.display = 'none';
        $('recog-note').style.display = 'block';
      });
    };
    reader.readAsDataURL(file);
  }

  function refreshSamples() {
    var list = S.sampleProblems(3);
    var box = $('sample-list');
    box.innerHTML = '';
    list.forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'sample';
      div.innerHTML = '<div class="sample-text">' + esc(p.problem) + '</div><div class="sample-go">去辅导 →</div>';
      div.addEventListener('click', function () { startGuide(p.problem); });
      box.appendChild(div);
    });
  }

  // ---------------- 分步引导 ----------------

  var guide = null; // 当前辅导会话

  function newPractice() {
    guide = null;
    applyResult(S.generatePractice(), { retry: false });
  }

  function startGuide(problem) {
    // 错题重练：优先用错题本里存好的步骤与答案
    var item = getWrongs().find(function (w) { return w.problem === problem && w.status === 'active'; });
    if (item && item.steps && item.steps.length) {
      applyResult({
        source: 'local',
        problem: item.problem,
        knowledge: item.knowledge,
        answer: item.rightNum,
        displayAnswer: item.rightAnswer,
        steps: item.steps,
        note: ''
      }, { retry: true, wrongId: item.id });
      return;
    }
    // 新题目（搜题/拍照/输入）：AI 优先，超时或失败回退本地引擎
    if (aiReady) {
      applyResultLoading(problem);
      fetchTutor({ problem: problem }).then(function (res) {
        applyResult(res, { retry: false });
      }).catch(function () {
        applyResult(localSolve(problem), { retry: false });
      });
    } else {
      applyResult(localSolve(problem), { retry: false });
    }
  }

  function applyResultLoading(problem) {
    showView('guide');
    guide = { loading: true };
    $('retry-banner').style.display = 'none';
    $('guide-knowledge').textContent = 'AI 讲解中';
    $('guide-problem').textContent = problem;
    $('guide-note').style.display = 'none';
    $('guide-progress').textContent = '';
    $('guide-steps').innerHTML =
      '<div class="card"><div class="loading-line">🤖 小助手正在读题、组织讲解步骤…</div></div>';
    $('guide-answer').style.display = 'none';
    $('guide-result').style.display = 'none';
    $('explain-box').style.display = 'none';
  }

  // AI 错题讲解：先分析错因（结合我的答案），再分步讲解；结果缓存在错题上
  function explainWrong(item) {
    showView('guide');
    guide = {
      mode: 'explain',
      loading: false,
      item: item,
      problem: item.problem,
      knowledge: item.knowledge,
      steps: [],
      revealed: 0,
      wrongId: item.id,
      retry: false,
      note: '',
      startTs: Date.now()
    };
    $('guide-knowledge').textContent = item.knowledge;
    $('guide-problem').textContent = item.problem;
    $('guide-note').style.display = 'none';
    $('retry-banner').style.display = 'block';
    $('retry-banner').textContent = '🤖 AI 错题讲解：看看错在哪里、怎么一步步做对';
    $('guide-answer').style.display = 'none';
    $('guide-result').style.display = 'none';
    $('explain-compare-my').textContent = '✗ 我的答案：' + (item.myAnswer || '未作答');
    $('explain-compare-right').textContent = '✓ 正确答案：' + (item.rightAnswer || '见步骤');
    $('explain-reason').style.display = 'none';
    $('explain-box').style.display = 'block';

    var cached = item.explain && item.explain.steps && item.explain.steps.length ? item.explain : null;
    if (cached) {
      guide.steps = cached.steps;
      guide.knowledge = cached.knowledge || item.knowledge;
      $('guide-knowledge').textContent = guide.knowledge;
      if (cached.reason) showReason(cached.reason);
      renderGuide();
      return;
    }
    $('guide-progress').textContent = '';
    $('guide-steps').innerHTML =
      '<div class="card"><div class="loading-line">🤖 AI 正在分析这道错题…</div></div>';
    if (aiReady) {
      fetchTutor({
        problem: item.problem,
        myAnswer: item.myAnswer,
        rightAnswer: item.rightAnswer,
        mode: 'wrong'
      }).then(function (res) {
        guide.steps = res.steps;
        guide.knowledge = res.knowledge || item.knowledge;
        $('guide-knowledge').textContent = guide.knowledge;
        item.explain = { steps: res.steps, knowledge: guide.knowledge, reason: res.reason || '' };
        saveWrongs(getWrongs());
        if (res.reason) showReason(res.reason);
        renderGuide();
      }).catch(function () {
        var res = explainFallback(item);
        guide.steps = res.steps;
        guide.knowledge = res.knowledge || item.knowledge;
        $('guide-knowledge').textContent = guide.knowledge;
        renderGuide();
      });
    } else {
      var res = explainFallback(item);
      guide.steps = res.steps;
      guide.knowledge = res.knowledge || item.knowledge;
      $('guide-knowledge').textContent = guide.knowledge;
      renderGuide();
    }
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
    $('explain-reason').textContent = '💡 错因分析：' + reason;
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
      problem: res.problem,
      knowledge: res.knowledge || '综合',
      note: res.note || '',
      steps: steps,
      revealed: 0,
      rightNum: rightNum === null ? null : rightNum,
      rightAnswerText: res.displayAnswer || (res.answer == null ? '' : String(res.answer)),
      startTs: Date.now(),
      retry: !!(opts && opts.retry),
      wrongId: opts && opts.wrongId ? opts.wrongId : '',
      wrongTimes: 0,
      phase: 'solving'
    };
    showView('guide');
    $('retry-banner').style.display = guide.retry ? 'block' : 'none';
    $('retry-banner').textContent = '💪 错题重练：认真想一想，这次一定能做对！';
    $('explain-box').style.display = 'none';
    $('guide-knowledge').textContent = guide.knowledge;
    $('guide-problem').textContent = guide.problem;
    $('guide-note').style.display = guide.note ? 'block' : 'none';
    $('guide-note').textContent = guide.note;
    $('guide-result').style.display = 'none';
    renderGuide();
  }

  function renderGuide() {
    var explain = guide.mode === 'explain';
    var shown = explain ? guide.steps.length : guide.revealed;
    $('guide-progress').textContent = explain
      ? '讲解共 ' + guide.steps.length + ' 步'
      : '已解锁 ' + guide.revealed + ' / ' + guide.steps.length + ' 步';
    var box = $('guide-steps');
    box.innerHTML = '';
    guide.steps.forEach(function (s, i) {
      var div = document.createElement('div');
      div.className = 'step' +
        (i < shown ? ' open' : '') +
        (!explain && i === shown ? ' current' : '');
      if (i < shown) {
        div.innerHTML = '<div class="step-body"><div class="step-title">' + esc(s.title) + '</div>' +
          '<div class="step-content">' + esc(s.content) + '</div></div>';
      } else if (!explain && i === shown) {
        div.innerHTML = '<div class="step-locked"><div class="lock-text">💡 第 ' + (i + 1) + ' 步已准备好</div>' +
          '<button class="btn btn-primary btn-sm reveal-btn">看这一步</button></div>';
        div.querySelector('.reveal-btn').addEventListener('click', function () {
          guide.revealed++;
          renderGuide();
          if (guide.revealed >= guide.steps.length) showAnswerArea();
        });
      } else {
        div.innerHTML = '<div class="step-locked dim"><div class="lock-text">🔒 第 ' + (i + 1) + ' 步</div></div>';
      }
      box.appendChild(div);
    });
  }

  function showAnswerArea() {
    $('guide-answer').style.display = 'block';
    var numeric = guide.rightNum !== null && guide.rightNum !== undefined;
    $('answer-input-box').style.display = numeric ? 'block' : 'none';
    $('answer-self-box').style.display = numeric ? 'none' : 'block';
    if (numeric) {
      $('answer-input').value = '';
      $('answer-input').focus();
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
    var num = parseUserAnswer(user);
    var right = num !== null && guide.rightNum !== null && guide.rightNum !== undefined &&
      Math.abs(num - guide.rightNum) < 0.011;
    if (right) {
      finish(true, user);
    } else {
      guide.wrongTimes++;
      $('answer-input').value = '';
      if (guide.wrongTimes < 2) {
        $('guide-progress').textContent = '再想想哦，可以回看上面的步骤 💪';
      } else {
        finish(false, user);
      }
    }
  }

  function finish(correct, userAnswer) {
    var seconds = Math.round((Date.now() - guide.startTs) / 1000);
    addRecord({ ok: correct, seconds: seconds, knowledge: guide.knowledge, mode: guide.retry ? 'retry' : 'practice' });
    syncSend('record', { ts: Date.now(), ok: correct, seconds: seconds, knowledge: guide.knowledge, mode: guide.retry ? 'retry' : 'practice' });

    var praise = correct
      ? pick(['太棒了！🎉', '你真厉害！🌟', '算得又快又准！⚡', '小数学家，继续加油！🚀'])
      : '没关系，错题已经帮你记进错题本啦，下次一定能做对！💪';

    if (correct) {
      if (guide.retry && guide.wrongId) {
        var ws = getWrongs();
        var it = ws.find(function (w) { return w.id === guide.wrongId; });
        if (it) { it.status = 'mastered'; it.masteredAt = dateStr(); saveWrongs(ws); }
        syncSend('master', { problem: guide.problem });
      }
    } else if (guide.retry && guide.wrongId) {
      var ws2 = getWrongs();
      var it2 = ws2.find(function (w) { return w.id === guide.wrongId; });
      if (it2) { it2.times = (it2.times || 1) + 1; it2.lastAt = dateStr(); saveWrongs(ws2); }
      syncSend('wrong', { problem: it2.problem, myAnswer: it2.myAnswer, rightAnswer: it2.rightAnswer, knowledge: it2.knowledge, times: it2.times });
    } else {
      var wrongs = getWrongs();
      var exist = wrongs.find(function (w) { return w.problem === guide.problem && w.status === 'active'; });
      var item;
      if (exist) {
        exist.times = (exist.times || 1) + 1;
        exist.myAnswer = userAnswer || '未作答';
        exist.lastAt = dateStr();
        item = exist;
      } else {
        item = {
          id: 'w' + Date.now() + Math.floor(Math.random() * 1000),
          problem: guide.problem,
          myAnswer: userAnswer || '未作答',
          rightAnswer: guide.rightAnswerText || '见步骤',
          rightNum: guide.rightNum,
          steps: guide.steps,
          knowledge: guide.knowledge,
          times: 1,
          createdAt: dateStr(),
          lastAt: dateStr(),
          status: 'active'
        };
        wrongs.unshift(item);
      }
      saveWrongs(wrongs);
      syncSend('wrong', { problem: item.problem, myAnswer: item.myAnswer, rightAnswer: item.rightAnswer, knowledge: item.knowledge, times: item.times });
    }

    $('guide-answer').style.display = 'none';
    $('guide-result').style.display = 'block';
    $('guide-result').className = 'card result-card ' + (correct ? 'ok' : 'no');
    $('result-icon').textContent = correct ? '🎉' : '📕';
    $('result-title').textContent = praise;
    $('result-sub').textContent = '用时 ' + seconds + ' 秒 · 已记入今日练习';
    if (!correct) {
      $('result-answer').style.display = 'block';
      $('result-answer').textContent = '✅ 正确答案：' + (guide.rightAnswerText || '见上面步骤');
    } else {
      $('result-answer').style.display = 'none';
    }
  }

  // ---------------- 错题本 ----------------

  var wrongTab = 'active';

  function refreshWrong() {
    var all = getWrongs();
    $('wrong-active-count').textContent = all.filter(function (w) { return w.status === 'active'; }).length;
    $('wrong-mastered-count').textContent = all.filter(function (w) { return w.status === 'mastered'; }).length;
    $('tab-active').classList.toggle('on', wrongTab === 'active');
    $('tab-mastered').classList.toggle('on', wrongTab === 'mastered');
    var list = all.filter(function (w) { return w.status === wrongTab; });
    var box = $('wrong-list');
    box.innerHTML = '';
    $('btn-clear-mastered').style.display = wrongTab === 'mastered' && list.length ? 'block' : 'none';

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML = wrongTab === 'active'
        ? '<div class="empty">📭 还没有错题，太棒了！</div><div class="empty-sub">做错的题会自动收进来，记得常来复习</div>'
        : '<div class="empty">🌱 还没有掌握的错题</div><div class="empty-sub">继续加油，做对的错题会出现在这里</div>';
      box.appendChild(empty);
      return;
    }

    list.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'card wrong-item' + (item.status === 'mastered' ? ' mastered-item' : '');
      var top = item.status === 'mastered'
        ? '✓ ' + esc(item.masteredAt || '') + ' 掌握'
        : '错 ' + item.times + ' 次 · ' + esc(item.lastAt || '');
      var btns = item.status === 'active'
        ? '<button class="btn btn-primary btn-sm w-btn" data-act="retry">再练一次</button>' +
          '<button class="btn btn-blue btn-sm w-btn" data-act="explain">AI 讲解</button>' +
          '<button class="btn btn-green btn-sm w-btn" data-act="master">掌握啦</button>' +
          '<button class="btn btn-ghost btn-sm w-btn" data-act="delete">删除</button>'
        : '<button class="btn btn-blue btn-sm w-btn" data-act="explain">AI 讲解</button>' +
          '<button class="btn btn-ghost btn-sm w-btn" data-act="delete">删除</button>';
      div.innerHTML =
        '<div class="w-top"><div class="tag">' + esc(item.knowledge) + '</div><div class="w-times">' + top + '</div></div>' +
        '<div class="w-problem">' + esc(item.problem) + '</div>' +
        '<div class="w-ans bad">✗ 我的答案：' + esc(item.myAnswer) + '</div>' +
        '<div class="w-ans good">✓ 正确答案：' + esc(item.rightAnswer) + '</div>' +
        '<div class="w-btns">' + btns + '</div>';
      div.querySelectorAll('[data-act]').forEach(function (b) {
        b.addEventListener('click', function () { wrongAction(b.dataset.act, item); });
      });
      box.appendChild(div);
    });
  }

  function wrongAction(act, item) {
    if (act === 'retry') {
      startGuide(item.problem);
    } else if (act === 'explain') {
      explainWrong(item);
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
    $('parent-code').textContent = getCode();
    $('name-input').value = getName();
    $('api-input').value = base;
    $('sync-status').textContent = syncOn()
      ? '✅ 已开启：每次练习后数据会自动同步给家长端'
      : '⏸️ 未开启（演示模式）：数据只保存在本机浏览器';
    $('sync-status').className = syncOn() ? 'sync-on' : 'sync-off';
    $('sync-last').textContent = '最近同步：' + fmtTime(getLastSync());
    var origin = location.protocol === 'file:' ? 'http://127.0.0.1:8787' : location.origin;
    $('parent-url-text').textContent = (base || origin) + '/parent';
    var s = getStats();
    $('parent-today').textContent = s.today;
    $('parent-acc').textContent = s.accuracy === null ? '--' : Math.round(s.accuracy * 100) + '%';
    $('parent-active').textContent = s.activeCount;
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

  $('btn-camera').addEventListener('click', function () { $('cam-file').click(); });
  $('btn-album').addEventListener('click', function () { $('alb-file').click(); });
  $('cam-file').addEventListener('change', function (e) { handleImage(e.target.files[0]); });
  $('alb-file').addEventListener('change', function (e) { handleImage(e.target.files[0]); });
  $('btn-start-guide').addEventListener('click', function () {
    var t = $('recog-input').value.trim();
    if (!t) { alert('请先输入或识别题目'); return; }
    startGuide(t);
  });
  $('btn-submit').addEventListener('click', submitAnswer);
  $('answer-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitAnswer(); });
  $('btn-self-ok').addEventListener('click', function () { finish(true, ''); });
  $('btn-self-no').addEventListener('click', function () { finish(false, ''); });
  $('btn-again').addEventListener('click', newPractice);
  $('btn-home').addEventListener('click', function () { showView('home'); });
  $('btn-explain-retry').addEventListener('click', function () {
    if (guide && guide.item) startGuide(guide.item.problem);
  });
  $('btn-explain-back').addEventListener('click', function () { showView('wrong'); });

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
  $('api-input').addEventListener('change', function () {
    setApiBase(this.value.trim().replace(/\/$/, ''));
    refreshStatus();
    refreshParent();
  });

  // ---------------- 启动 ----------------

  refreshSamples();
  refreshStatus();
  refreshHome();
  showView('home');
})();
