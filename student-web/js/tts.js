// student-web/js/tts.js — 语音朗读与音效（浏览器内置 Web Speech / Web Audio，零依赖）
// 朗读题目与老师讲解；答对播放轻提示音；静音偏好存 localStorage
(function () {
  'use strict';

  var KEY_MUTE = 'tts_muted';
  var muted = false;
  var audioCtx = null;
  try {
    muted = localStorage.getItem(KEY_MUTE) === '1';
  } catch (e) {
    // 忽略
  }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
    return audioCtx;
  }

  function tone(freq, start, dur, gain) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = gain || 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    var t0 = ctx.currentTime + start;
    o.start(t0);
    g.gain.setValueAtTime(gain || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.stop(t0 + dur);
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return false;
    // 朗读时去掉 emoji 与符号，更自然
    var t = String(text || '').replace(/[📚💡⚠️✗✓🎉📝⏰🤔📌🔒💪✨😣😥🙋👋🧩⭐🔥🏅🎯🧹]/g, '').trim();
    if (!t) return false;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(t);
    u.lang = 'zh-CN';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
    return true;
  }

  // 英文朗读（英语学科）：lang=en-US，语速放慢便于跟读
  function speakEn(text, rate) {
    if (!('speechSynthesis' in window)) return false;
    var t = String(text || '').replace(/[👋🎧🎤🌱🎮💬✏️🔊▶️✅]/g, '').trim();
    if (!t) return false;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(t);
    u.lang = 'en-US';
    u.rate = rate || 0.85;
    // 优先选英文音色（系统装了英文语音时）
    try {
      var voices = window.speechSynthesis.getVoices() || [];
      var en = voices.find(function (v) { return /^en(-|_)/i.test(v.lang); });
      if (en) u.voice = en;
    } catch (e) {
      // 忽略
    }
    window.speechSynthesis.speak(u);
    return true;
  }

  window.TTS = {
    speak: speak,
    speakEn: speakEn,
    isMuted: function () { return muted; },
    setMuted: function (m) {
      muted = !!m;
      try { localStorage.setItem(KEY_MUTE, muted ? '1' : '0'); } catch (e) {}
    },
    // 答对轻提示音（两个上行音）
    playCorrect: function () {
      if (muted) return;
      try { ensureAudio(); } catch (e) { return; }
      tone(660, 0, 0.15, 0.07);
      tone(880, 0.15, 0.2, 0.07);
    },
    // 解锁徽章音（三连音）
    playUnlock: function () {
      if (muted) return;
      try { ensureAudio(); } catch (e) { return; }
      tone(523, 0, 0.12, 0.06);
      tone(659, 0.12, 0.12, 0.06);
      tone(784, 0.24, 0.2, 0.06);
    }
  };
})();
