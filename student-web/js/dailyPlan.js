// student-web/js/dailyPlan.js — 今日学习计划编排器（纯函数，UMD：前端 window.DailyPlan / Node require）
// 规则（产品验收标准）：
//   1) 每天最多 2 科：数学默认必选；第二科按星期轮换（周二/四→英语，周三/五→语文，周六/日→完成度低的）
//   2) 总时长预算 15~25 分钟：数学 1 关≈2 分钟（目标上限 8 关），英语任务包≈6 分钟，语文任务包≈6 分钟
// 输出：{ subjects, estimatedMinutes, items:[{subject,name,task,done,total,minutes}], note }

(function () {
  'use strict';

  var SUBJECT_NAMES = { math: '数学', english: '英语', chinese: '语文' };

  // 第二科轮换表（getDay(): 0 周日 ~ 6 周六）
  function rotationFor(day) {
    if (day === 2 || day === 4) return 'english';   // 周二/周四
    if (day === 3 || day === 5) return 'chinese';   // 周三/周五
    return null;                                    // 周一/六/日由完成度决定
  }

  function buildDailyPlan(mathGoal, enDone, cnDone, dayOfWeek) {
    var goal = Math.max(1, Math.min(8, mathGoal || 3)); // cap 8 关 = 16 分钟
    var mathMinutes = goal * 2;
    var enTotal = 3, cnTotal = 3; // 任务包：英语 听/跟读/拼写、语文 认/听写/读
    var enRatio = enTotal ? Math.min(1, (enDone || 0) / enTotal) : 0;
    var cnRatio = cnTotal ? Math.min(1, (cnDone || 0) / cnTotal) : 0;

    // 第二科：轮换优先；周一/六/日选完成度低的（相同则英语）
    var second = rotationFor(dayOfWeek);
    if (!second) second = enRatio <= cnRatio ? 'english' : 'chinese';

    var subjects = ['math', second];
    var secondMinutes = 6;
    var estimated = mathMinutes + secondMinutes;
    var note = '';

    // 时长兜底：超出 25 分钟不可能（16+6=22）；不足 15 分钟则把数学关数补足
    if (estimated < 15) {
      var need = Math.ceil((15 - secondMinutes) / 2);
      if (need > goal) {
        goal = need;
        mathMinutes = goal * 2;
        estimated = mathMinutes + secondMinutes;
        note = '为了练得扎实，今天数学多安排了几关';
      }
    }

    var items = [
      {
        subject: 'math',
        name: SUBJECT_NAMES.math,
        task: '每日练习闯 ' + goal + ' 关',
        done: Math.min(goal, Math.round(goal * 0)), // 完成度由调用方按当日 records 传入覆盖
        total: goal,
        minutes: mathMinutes
      }
    ];
    if (second === 'english') {
      items.push({
        subject: 'english',
        name: SUBJECT_NAMES.english,
        task: '听 3 词 · 跟读 2 次 · 拼对 2 个',
        done: enDone || 0,
        total: enTotal,
        minutes: secondMinutes
      });
    } else {
      items.push({
        subject: 'chinese',
        name: SUBJECT_NAMES.chinese,
        task: '认 3 字 · 听写 2 个 · 读 1 首',
        done: cnDone || 0,
        total: cnTotal,
        minutes: secondMinutes
      });
    }

    return {
      subjects: subjects,
      estimatedMinutes: estimated,
      items: items,
      note: note
    };
  }

  const api = {
    buildDailyPlan: buildDailyPlan,
    rotationFor: rotationFor,
    SUBJECT_NAMES: SUBJECT_NAMES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.DailyPlan = api;
  }
})();
