// 引导式对话状态机（AI 辅导引擎）
// 用于错题重练与拍照识题的对话式辅导：
//   - 配置大模型时：本文件提供状态机规范（系统提示）与合法性校验
//   - 未配置时：确定性对话逻辑兜底，离线也能走完整个状态机
// 本文件为纯 JS 且无依赖（require solver），可在 Node 中单测。

const solver = require('../utils/solver');

// ---------------- 状态机定义 ----------------

const STATE_MACHINE = {
  GREETING: {
    label: '接题与情绪确认',
    enter: '会话开始（新题进入）',
    goal: '确认孩子的情绪与准备度，建立安全感；让孩子知道"答错也没关系"',
    allowed: ['问候并点出题目主题', '问一次感受/准备度'],
    forbidden: ['不讲题', '不给任何提示', '绝不提及答案'],
    phrase: '我看到你拍了一道题，我们先不急着算。你准备好了吗？',
    exit: '孩子回应（准备好/紧张都可以）→ READ_PROBLEM'
  },
  READ_PROBLEM: {
    label: '读题与题意理解',
    enter: 'GREETING 结束',
    goal: '引导孩子把题读进去：找出已知数字和所求问题',
    allowed: ['一次只问一个理解性问题（已知/所求）', '孩子读不懂时把题目拆成单句再问'],
    forbidden: ['不讲方法', '不示范计算', '不提答案'],
    phrase: '你能用自己的话说一遍吗？已知什么，要求什么？',
    exit: '孩子回答了理解性问题（或拆句引导后）→ ACTIVATE_KNOWLEDGE'
  },
  ACTIVATE_KNOWLEDGE: {
    label: '激活旧知与知识点识别',
    enter: 'READ_PROBLEM 结束',
    goal: '把题目与已学知识挂钩，唤醒旧知',
    allowed: ['问孩子知识点', '出示知识点卡片（是什么/怎么做/易错点）'],
    forbidden: ['不针对本题示范步骤', '不提答案'],
    phrase: '你觉得这道题在考我们哪个知识点？',
    exit: '孩子确认/回应 → STUDENT_ATTEMPT'
  },
  STUDENT_ATTEMPT: {
    label: '学生先说思路',
    enter: 'ACTIVATE_KNOWLEDGE 结束',
    goal: '让孩子先说出自己的第一步思路（先尝试，再辅导）',
    allowed: ['请孩子说第一步并追问为什么', '孩子说"我不会"时缩小问题、只问第一步', '孩子要答案时回应"我先帮你，但你先说第一步，我们一起做"'],
    forbidden: ['不纠正具体做法', '不给提示', '不给答案'],
    phrase: '你打算先做什么？为什么？',
    exit: '孩子给出思路 → DIAGNOSE（思路已对可直达 VERIFY）'
  },
  DIAGNOSE: {
    label: '诊断卡点',
    enter: 'STUDENT_ATTEMPT 结束',
    goal: '定位卡点：是方法不会、计算不会，还是思路有偏差',
    allowed: ['一次只问一个诊断性问题'],
    forbidden: ['不给提示', '不示范', '不提答案'],
    phrase: '你卡在"怎么算"，还是"不知道先算哪一步"？',
    exit: '孩子说出卡点 → SCAFFOLD'
  },
  SCAFFOLD: {
    label: '分层提示',
    enter: 'DIAGNOSE 结束',
    goal: '按"最小提示→更大提示"的阶梯，一次只给一层，让孩子在提示下自己做出答案',
    allowed: ['每轮只给一层提示（读题提示→方法提示→示范第一步→易错点提醒）', '提示后请孩子再试并写下答案', '连续 2 次答错主动降难度：换更简单的同类题（→ DEFORM）', '提示梯用尽仍不会时，作为兜底完整讲解并给出答案'],
    forbidden: ['绝不提前给最终答案（只有走完提示梯仍不会才兜底）', '一次不给多层提示'],
    phrase: '第一层提示示例："个位相加满十，要怎么办？"（提示要小，一次一层）',
    exit: '答对 → VERIFY；连错 2 次降难度 → DEFORM；提示用尽 → 兜底讲解后 → VERIFY'
  },
  VERIFY: {
    label: '验证与复述',
    enter: 'SCAFFOLD 答对（或兜底讲解后）',
    goal: '让孩子复述解法、解释为什么，验证是否真正理解',
    allowed: ['请孩子讲一遍/解释为什么', '肯定与温和纠正'],
    forbidden: ['不讲新内容', '不提新题'],
    phrase: '你能告诉我为什么这里要进位吗？',
    exit: '孩子复述完 → REFLECT'
  },
  REFLECT: {
    label: '反思与策略提炼',
    enter: 'VERIFY 结束',
    goal: '把方法、易错点提炼成可迁移的策略，并让孩子说出"以后先做什么"',
    allowed: ['小结方法+易错点', '问一个反思性问题'],
    forbidden: ['不讲新题', '不提答案（已解决）'],
    phrase: '今天你学会了一个方法：个位满十，向十位进一。以后遇到，你先做什么？',
    exit: '孩子回应 → DEFORM'
  },
  DEFORM: {
    label: '错题变形与再试',
    enter: 'REFLECT 结束（或 SCAFFOLD 连错降难度）',
    goal: '用同知识点变形题检验独立完成能力',
    allowed: ['出示一道变形题（同类型换数字/情境；降难度时为更简单的同类题）', '孩子作答，正确鼓励', '变形题连错 2 次时给出变形题完整讲解（兜底）'],
    forbidden: ['不做原题重新讲解', '变形题未作答前不提示'],
    phrase: '变形题示例："小松鼠有 35 颗松果，又捡到 27 颗，每 10 颗装一筐，能装满几筐？"',
    exit: '变形题答对 → REVIEW（原错题标记已掌握）；连错 2 次兜底讲解后 → REVIEW'
  },
  REVIEW: {
    label: '间隔复习与家长脚本',
    enter: 'DEFORM 结束',
    goal: '安排间隔复习计划，给出家长沟通脚本，正向收尾',
    allowed: ['给出复习提醒（1~2 天后再复习）', '给出给家长的小脚本', '表扬与告别'],
    forbidden: ['不新增内容', '不再出题'],
    phrase: '把今天的收获讲给爸爸妈妈听。给家长：可以问问孩子这道题第一步从哪里开始。结尾记得说"明天小狐还在这里等你"。',
    exit: '会话结束'
  }
};

const STATE_ORDER = ['GREETING', 'READ_PROBLEM', 'ACTIVATE_KNOWLEDGE', 'STUDENT_ATTEMPT', 'DIAGNOSE', 'SCAFFOLD', 'VERIFY', 'REFLECT', 'DEFORM', 'REVIEW'];

const TRANSITIONS = {
  GREETING: ['READ_PROBLEM'],
  READ_PROBLEM: ['READ_PROBLEM', 'ACTIVATE_KNOWLEDGE'],
  ACTIVATE_KNOWLEDGE: ['STUDENT_ATTEMPT'],
  STUDENT_ATTEMPT: ['STUDENT_ATTEMPT', 'DIAGNOSE', 'SCAFFOLD'],
  DIAGNOSE: ['DIAGNOSE', 'SCAFFOLD'],
  SCAFFOLD: ['SCAFFOLD', 'VERIFY', 'DEFORM'],
  VERIFY: ['VERIFY', 'REFLECT'],
  REFLECT: ['REFLECT', 'DEFORM'],
  DEFORM: ['DEFORM', 'REVIEW'],
  REVIEW: ['REVIEW']
};

// ---------------- 会话管理 ----------------

function extractNumber(s) {
  const m = String(s).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// 判断学生消息是否是一个答案（数字或算式），与目标答案比对
function checkAnswer(target, text) {
  const t = String(text || '').trim();
  if (!t) return { correct: null, value: null };
  let num = null;
  if (/^[0-9+\-*×÷/()（）.\s]+$/.test(t) && /[+\-*×÷/]/.test(t)) {
    const v = solver.evaluate(t);
    if (v !== null) num = v;
  }
  if (num === null) num = extractNumber(t);
  if (num === null) return { correct: null, value: null };
  if (target === null || target === undefined) return { correct: null, value: num };
  return { correct: Math.abs(num - target) < 0.011, value: num };
}

function createSession(body) {
  const problem = body.problem || '';
  const r = problem ? solver.solveText(problem) : null;
  const answer = body.answer !== undefined && body.answer !== null ? body.answer : (r && r.answer !== null && r.answer !== undefined ? r.answer : null);
  return {
    id: 's' + Date.now() + Math.floor(Math.random() * 10000),
    problem: problem,
    knowledge: body.knowledge || (r && r.knowledge) || '综合',
    answer: answer,
    displayAnswer: body.rightAnswer || (r && r.displayAnswer) || (answer === null || answer === undefined ? '' : String(answer)),
    myAnswer: body.myAnswer || '',
    errorType: '',
    steps: body.steps || (r && r.steps) || [],
    state: 'GREETING',
    asked: {},
    hintLevel: 0,
    wrongStreak: 0,
    easyMode: false,
    answerRevealed: false,
    variant: null,
    variantAnswer: null,
    variantDisplay: '',
    variantRound: 0,
    masteredOriginal: false,
    complete: false,
    history: []
  };
}

// ---------------- 确定性对话逻辑 ----------------

function fullSolutionText(sess) {
  if (sess.steps && sess.steps.length) {
    return sess.steps
      .map((s) => s.title + '：' + (s.content || ''))
      .join('\n');
  }
  const lib = solver.getKnowledge(sess.knowledge);
  return '方法：' + lib.method;
}

function hintText(sess, level) {
  const lib = solver.getKnowledge(sess.knowledge);
  const steps = sess.steps || [];
  const firstDemo =
    steps.length > 1 && steps[1].content
      ? steps[1].content
      : '先写出题目里的数字，想一想它们之间应该做什么运算。';
  const ladder = [
    '小提示①：先回到题目，把已知条件和问题圈出来，别急着动笔。',
    '小提示②：这道题要用「' + sess.knowledge + '」的方法：' + lib.method,
    '小提示③：老师做第一步给你看：\n' + firstDemo + '\n剩下的你来。',
    '小提示④：要小心哦：' + (lib.mistakes || '计算要一步一步来，别忘了验算。')
  ];
  return ladder[Math.min(level, ladder.length - 1)];
}

function respond(sess, tutorText, nextState, quickReplies, extra) {
  if (nextState && nextState !== sess.state) sess.state = nextState;
  sess.history.push({ role: 'tutor', text: tutorText });
  return {
    state: sess.state,
    tutorText: tutorText,
    quickReplies: quickReplies || [],
    extra: extra || null
  };
}

// 核心入口：处理学生的一条消息（check 由外部预计算可传入）
// 语义：每个状态进入时"只问一个问题"；学生回答后转移到下一状态并问下一个问题。
function step(sess, rawText, preCheck) {
  const t = String(rawText || '').trim();
  const check = preCheck || checkAnswer(sess.state === 'DEFORM' ? sess.variantAnswer : sess.answer, t);
  const isStuck = /不会|不知道|不懂|没思路|卡住/.test(t);
  const wantsAnswer = /直接告诉我|告诉我答案|给我答案|要答案|报答案/.test(t);
  const lib = solver.getKnowledge(sess.knowledge);

  if (t) sess.history.push({ role: 'student', text: t });

  switch (sess.state) {
    case 'GREETING': {
      if (!sess.asked.greet) {
        sess.asked.greet = true;
        return respond(
          sess,
          '你好呀，我是小狐老师 🦊\n这道题是：\n「' + sess.problem + '」\n有点挑战呢，不过别担心，答错也没关系，小狐陪你一步一步来。\n你现在感觉怎么样？准备好开始了吗？',
          null,
          ['我准备好了 💪', '有点紧张 😅']
        );
      }
      return respond(
        sess,
        '好，那我们开始！先不着急算，请你在心里把题目读一遍，然后告诉老师：\n① 题目里告诉了我们哪些数？\n② 最后问的是什么？',
        'READ_PROBLEM',
        ['数有…问的是…', '我没读懂 😥']
      );
    }

    case 'READ_PROBLEM': {
      if (/没读懂/.test(t)) {
        return respond(
          sess,
          '没关系，我们一句一句来。只看第一句，它告诉你什么了？',
          null,
          ['我知道了', '还是不懂 😥']
        );
      }
      return respond(
        sess,
        '读得很认真，信息都找齐啦！\n老师想起来了，这道题考的是「' + sess.knowledge + '」。\n📚 是什么：' + lib.desc + '\n📚 怎么做：' + lib.method + '\n⚠️ 容易错：' + lib.mistakes + '\n这个知识点，你还记得吗？',
        'ACTIVATE_KNOWLEDGE',
        ['我记得！', '有点忘了 😅'],
        { knowledgeCard: { name: sess.knowledge, desc: lib.desc, method: lib.method, mistakes: lib.mistakes } }
      );
    }

    case 'ACTIVATE_KNOWLEDGE': {
      return respond(
        sess,
        '现在轮到你啦！如果让你做，第一步你打算先做什么？大胆说，说错也没关系，老师想先听听你的想法。',
        'STUDENT_ATTEMPT',
        ['我先算…', '我不会 😣', '直接告诉我答案']
      );
    }

    case 'STUDENT_ATTEMPT': {
      if (wantsAnswer) {
        return respond(
          sess,
          '老师一定帮你！但我们要一起做——你先说第一步打算怎么算？说了第一步，我们就往下走。',
          null,
          ['我先算…', '我不会 😣']
        );
      }
      if (isStuck) {
        if (!sess.asked.narrowed) {
          sess.asked.narrowed = true;
          return respond(
            sess,
            '没关系，我们把问题变小一点。只看第一步：题目里的数字，你都找到了吗？',
            null,
            ['找到了', '找哪几个数？']
          );
        }
      }
      return respond(
        sess,
        '嗯，老师大概知道你卡在哪里了。我们来确认一下：最让你头疼的是"不知道用什么方法"，还是"计算算不对"？',
        'DIAGNOSE',
        ['方法不知道', '计算算不对', '好像都对但答案不对']
      );
    }

    case 'DIAGNOSE': {
      // 错因识别：读题不清 / 计算出错 / 方法不熟（用于错因标签与行为日志）
      if (/读|没懂|看不懂|题目/.test(t)) {
        sess.errorType = 'read_error';
      } else if (/算|计算|乘法|除法|加法|减法|进位|借位/.test(t)) {
        sess.errorType = 'calc_error';
      } else {
        sess.errorType = 'method_unknown';
      }
      return respond(
        sess,
        '好，老师明白了。这样，老师给你一个小提示，你试试看能不能继续：\n' + hintText(sess, sess.hintLevel),
        'SCAFFOLD',
        ['我试试', '还是不会']
      );
    }

    case 'SCAFFOLD': {
      if (check.correct === true) {
        return respond(
          sess,
          (sess.easyMode
            ? '对啦！你看，从简单的题入手，是不是一下就通了？🎉 '
            : '完全正确！你太棒了！🎉 ') +
            '现在请你当小老师：把这道题的解法讲给老师听一遍——先算什么？再算什么？',
          'VERIFY',
          ['我来讲：先算…', '我讲好了 ✅']
        );
      }
      if (check.correct === false) {
        sess.wrongStreak++;
        if (sess.wrongStreak >= 2 && !sess.easyMode) {
          sess.easyMode = true;
          return respond(
            sess,
            '连着错了两次，别灰心，这不是你不行，是这道题太难了。老师给你换一道更简单的同类题，我们从简单的开始。',
            'DEFORM',
            ['好的 🙋']
          );
        }
      }
      if (isStuck || check.correct === false) {
        if (sess.hintLevel >= 3) {
          sess.answerRevealed = true;
          return respond(
            sess,
            '没关系，这道题确实有点绕。老师带你完整走一遍，你跟着看：\n' + fullSolutionText(sess) +
              '\n所以答案是：' + (sess.displayAnswer || '（见上面过程）') +
              '\n看完后，请你也给老师讲一遍。',
            'VERIFY',
            []
          );
        }
        sess.hintLevel++;
        return respond(
          sess,
          hintText(sess, sess.hintLevel) + '\n现在再试试，把答案写下来（直接写数字就行）？',
          null,
          ['我试试', '还是不会']
        );
      }
      return respond(
        sess,
        '大胆试试，把答案写下来（直接写数字就行），老师等着你 ✨',
        null,
        ['我不会 😣']
      );
    }

    case 'VERIFY': {
      return respond(
        sess,
        '讲得很清楚，老师给你点赞 👍 我们把这个方法记下来。\n我们一起总结一下：\n这道题用的是「' + sess.knowledge + '」——' + lib.method +
          '\n最容易出错的地方：' + (lib.mistakes || '计算和单位') +
          '\n以后遇到这类题，你第一个会想到什么？',
        'REFLECT',
        ['先想方法', '先圈数字和问题']
      );
    }

    case 'REFLECT': {
      // 进入变形题
      const v = solver.variantByKnowledge(sess.knowledge, sess.problem) || solver.generatePractice();
      sess.variant = v.problem;
      sess.variantAnswer = v.answer;
      sess.variantDisplay = v.displayAnswer || String(v.answer);
      return respond(
        sess,
        '说得太好了！检验时间到：老师给你出了一道变形题，自己独立完成它：\n📝 ' + v.problem + '\n把答案写下来。',
        'DEFORM',
        [],
        { variant: { problem: v.problem } }
      );
    }

// REVIEW 完整收尾（含家长脚本与复习提醒）
function reviewResponse(sess, prefix) {
  sess.complete = true;
  const days = sess.masteredOriginal ? 2 : 1;
  return respond(
    sess,
    (prefix || '今天的课就到这里，你表现得非常棒 🌟') +
      '\n小任务：' + days + ' 天后再来复习一遍这道题，小狐会帮你记在错题本上。\n也可以把今天的收获讲给爸爸妈妈听，他们会为你骄傲的！\n明天小狐还在这里等你，不见不散哦 🦊',
    'REVIEW',
    ['谢谢老师！👋'],
    {
      complete: true,
      masteredOriginal: sess.masteredOriginal,
      reviewDue: days + ' 天后',
      errorType: sess.errorType || '',
      parentScript: {
        problem: sess.problem,
        question: '可以问问孩子：这道「' + sess.knowledge + '」题，第一步你是从哪里开始的？',
        closing: '多听孩子讲思路，少直接给答案。'
      }
    }
  );
}

    case 'DEFORM': {
      if (check.correct === true) {
        sess.masteredOriginal = true;
        return reviewResponse(sess, '太棒了！变形题也拿下啦！🎉 你已经真正掌握「' + sess.knowledge + '」了。');
      }
      if (check.correct === false || isStuck) {
        sess.variantRound++;
        if (sess.variantRound >= 2) {
          return reviewResponse(sess);
        }
        return respond(
          sess,
          '再想想哦，检查一下计算。还记得我们的方法吗？' + lib.method + '\n再试一次！',
          null,
          ['我重算一遍', '还是不会 😣']
        );
      }
      return respond(
        sess,
        '把变形题的答案写下来（直接写数字就行），老师等着你 ✨',
        null,
        ['我不会 😣']
      );
    }

    case 'REVIEW': {
      if (sess.complete) {
        return respond(sess, '再见啦，记得' + (sess.masteredOriginal ? '2 天后回来复习哦！👋' : '明天再来复习一遍哦！👋'), 'REVIEW', []);
      }
      return reviewResponse(sess);
    }

    default:
      sess.state = 'GREETING';
      return respond(sess, '我们重新开始。这道题是：\n「' + sess.problem + '」\n准备好了吗？', null, ['准备好了 💪']);
  }
}

// ---------------- LLM 提示词构造与校验 ----------------

function buildSystemPrompt(sess, check) {
  // 默认只发当前状态定义（省 token）；设 LLM_FULL_SPEC=1 时发送全量十状态规范
  const fullSpec = typeof process !== 'undefined' && process.env && process.env.LLM_FULL_SPEC === '1';
  let stateSection;
  if (fullSpec) {
    stateSection = STATE_ORDER
      .map((s, i) => {
        const d = STATE_MACHINE[s];
        return (i + 1) + '. ' + s + '（' + d.label + '）\n' +
          '进入：' + d.enter + '\n目标：' + d.goal + '\n允许：' + d.allowed.join('；') +
          '\n禁止：' + d.forbidden.join('；') + '\n话术：' + d.phrase + '\n退出：' + d.exit;
      })
      .join('\n\n');
  } else {
    const d = STATE_MACHINE[sess.state];
    stateSection =
      '状态机共 10 个状态，按序推进：' + STATE_ORDER.join(' → ') + '\n\n' +
      '【当前状态定义】\n状态：' + sess.state + '（' + d.label + '）\n' +
      '进入：' + d.enter + '\n目标：' + d.goal + '\n允许：' + d.allowed.join('；') +
      '\n禁止：' + d.forbidden.join('；') + '\n话术：' + d.phrase + '\n退出：' + d.exit;
  }
  let prompt =
    '# 角色\n你是小狐老师——一只温暖、耐心、机灵的狐狸，孩子的专属数学伙伴。' +
    '你是引导老师：先情绪后内容、只教思考不直接给答案。自称"小狐"，语气亲切鼓励，' +
    '常用"别急，小狐陪你一起看""你已经很接近了"。\n\n' +
    '# 目标\n让学生自己思考、自己走完解题过程，而不是你讲给他听。\n\n' +
    '# 总原则\n- 先情绪，后内容\n- 先思路，后答案\n- 先小步，后完整\n\n' +
    '# 语言要求\n- 简短，一句话不超过 25 个字\n- 适合三年级学生阅读\n- 鼓励性，不评判\n- 不用成人术语\n\n' +
    '# 禁止\n- 不要说"这道题很简单"\n- 不要直接给最终答案\n- 不要一次问多个问题\n- 不要说"你粗心""你又错了"\n\n' +
    '# 状态机（严格按当前状态的话术风格回应）\n' + stateSection + '\n\n' +
    '# 核心规则（最高优先级）\n' +
    '1. 绝不直接给最终答案：只有学生尝试后、且走完 SCAFFOLD 全部分层提示仍不会时，才可作为兜底完整讲解并给出答案。\n' +
    '2. 一次只问一个问题；一次只给一层提示。\n' +
    '3. 学生连续 2 次答案错误：主动降低难度，换一道更简单的同类题（转 DEFORM）。\n' +
    '4. 学生说"我不会"：先缩小问题，只问第一步。\n' +
    '5. 学生说"直接告诉我答案"：回应"我先帮你，但你先说第一步，我们一起做"。\n' +
    '6. 状态转移必须合法：' + (TRANSITIONS[sess.state] || []).join('、') + '（也可停留在当前状态）。\n' +
    '7. VERIFY 状态：学生解释清楚后立即进入下一状态，同一问题不要问第二遍。\n' +
    '8. DEFORM 状态：不要自己出题，题目由系统提供，你只需鼓励和陪伴孩子作答。\n\n' +
    '# 本题信息\n题目：' + sess.problem + '\n知识点：' + sess.knowledge +
    (sess.displayAnswer ? '\n正确答案（仅用于判断学生对错，严禁在兜底前透露）：' + sess.displayAnswer : '') +
    (sess.myAnswer ? '\n学生上次写错的答案：' + sess.myAnswer : '') +
    '\n\n# 当前状态\n' + sess.state + '（' + STATE_MACHINE[sess.state].label + '）\n';
  if (check && check.correct !== null && check.correct !== undefined) {
    prompt += '\n[系统判断] 学生刚才的答案 ' + (check.correct ? '正确 ✅' : '错误 ❌') + '，请据此推进状态（正确 → VERIFY；错误按规则处理）。\n';
  }
  prompt +=
    '\n# 输出格式\n只返回 JSON：{"state": "下一个状态", "tutorText": "你要对孩子说的话", "quickReplies": ["2~4个适合小学生的短回复"]}';
  return prompt;
}

function buildUserMessage(sess, studentText, check) {
  const hist = sess.history.slice(-4).map((h) => (h.role === 'tutor' ? '老师：' : '学生：') + h.text).join('\n');
  return '对话记录：\n' + hist + '\n\n学生刚刚说：' + studentText;
}

function isValidTransition(from, to) {
  if (!STATE_MACHINE[to]) return false;
  const allow = TRANSITIONS[from] || [];
  return allow.indexOf(to) > -1;
}

module.exports = {
  STATE_MACHINE: STATE_MACHINE,
  STATE_ORDER: STATE_ORDER,
  TRANSITIONS: TRANSITIONS,
  createSession: createSession,
  step: step,
  checkAnswer: checkAnswer,
  buildSystemPrompt: buildSystemPrompt,
  buildUserMessage: buildUserMessage,
  isValidTransition: isValidTransition
};
