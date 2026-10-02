// student-web/js/voice.js — 语音输入（Web SpeechRecognition，Chrome/Edge 可用，零依赖）
// 用法：Voice.supported 判断是否支持；Voice.start(onResult, onEnd) 开始识别
(function () {
  'use strict';
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;

  function stop() {
    if (rec) {
      try { rec.stop(); } catch (e) {}
      rec = null;
    }
  }

  window.Voice = {
    supported: !!SR,
    listening: function () { return !!rec; },
    start: function (onResult, onEnd) {
      if (!SR) return false;
      stop();
      try {
        rec = new SR();
        rec.lang = 'zh-CN';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onresult = function (e) {
          var text = '';
          for (var i = 0; i < e.results.length; i++) {
            text += e.results[i][0].transcript;
          }
          if (onResult) onResult(text.trim());
        };
        rec.onerror = function () {
          rec = null;
          if (onEnd) onEnd();
        };
        rec.onend = function () {
          rec = null;
          if (onEnd) onEnd();
        };
        rec.start();
        return true;
      } catch (e) {
        rec = null;
        return false;
      }
    },
    stop: stop
  };
})();
