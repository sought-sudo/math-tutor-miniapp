// server/subjects/english/dialogues.js — 三年级英语场景对话库（零依赖，确定性输出）
// 每场景 4~5 轮；小狐句由前端 TTS 朗读，孩子句鼓励跟读。
// scenes: greeting / animals / fruits / school / toys

'use strict';

const SCENES = {
  greeting: {
    title: '打招呼 Greeting',
    emoji: '👋',
    knowledge: 'dialogue-greeting',
    turns: [
      { who: 'fox', en: 'Hello! I am Xiaohu!', zh: '你好！我是小狐！' },
      { who: 'kid', en: 'Hello! I am Li Ming.', zh: '你好！我是李明。', hint: '介绍你自己：I am + 名字' },
      { who: 'fox', en: 'Nice to meet you!', zh: '很高兴见到你！' },
      { who: 'kid', en: 'Nice to meet you, too!', zh: '我也很高兴见到你！', hint: 'too 表示"也"，放句尾' },
      { who: 'fox', en: 'Goodbye! See you!', zh: '再见！回见！' },
      { who: 'kid', en: 'Bye-bye!', zh: '拜拜！', hint: '再见还可以说 Goodbye / See you' }
    ]
  },
  animals: {
    title: '动物园 Animals',
    emoji: '🐼',
    knowledge: 'vocab-animals',
    turns: [
      { who: 'fox', en: 'Look! What is this?', zh: '看！这是什么？' },
      { who: 'kid', en: 'It is a panda!', zh: '它是一只熊猫！', hint: 'It is a + 动物名' },
      { who: 'fox', en: 'Yes! Do you like pandas?', zh: '对！你喜欢熊猫吗？' },
      { who: 'kid', en: 'Yes, I do. I like pandas!', zh: '是的，我喜欢熊猫！', hint: 'Do you like...? 用 Yes, I do. 回答' },
      { who: 'fox', en: 'Me too! Pandas are cute!', zh: '我也是！熊猫真可爱！' }
    ]
  },
  fruits: {
    title: '水果店 Fruits',
    emoji: '🍎',
    knowledge: 'sentence-what',
    turns: [
      { who: 'fox', en: 'What is this?', zh: '这是什么？' },
      { who: 'kid', en: 'It is an apple.', zh: '它是一个苹果。', hint: '元音开头的词用 an：an apple' },
      { who: 'fox', en: 'Do you like apples?', zh: '你喜欢苹果吗？' },
      { who: 'kid', en: 'Yes! Apples are yummy.', zh: '喜欢！苹果很好吃。', hint: 'yummy = 好吃' },
      { who: 'fox', en: 'An apple a day!', zh: '一天一苹果！' }
    ]
  },
  school: {
    title: '在学校 At School',
    emoji: '🏫',
    knowledge: 'vocab-school',
    turns: [
      { who: 'fox', en: 'What is in your bag?', zh: '你书包里有什么？' },
      { who: 'kid', en: 'A pencil and a ruler.', zh: '一支铅笔和一把尺子。', hint: '列出两样东西用 and' },
      { who: 'fox', en: 'I have a book, too!', zh: '我还有一本书！' },
      { who: 'kid', en: 'I have an eraser.', zh: '我有一块橡皮。', hint: 'I have + 东西' },
      { who: 'fox', en: 'Great! Let us go to class!', zh: '太好了！我们去上课吧！' }
    ]
  },
  toys: {
    title: '玩玩具 Toys',
    emoji: '🪁',
    knowledge: 'vocab-toys',
    turns: [
      { who: 'fox', en: 'I have a new kite!', zh: '我有一个新风筝！' },
      { who: 'kid', en: 'Wow! It is cool!', zh: '哇！太酷了！', hint: 'cool = 很酷' },
      { who: 'fox', en: 'Let us fly the kite!', zh: '我们一起放风筝吧！' },
      { who: 'kid', en: 'OK! Let us go!', zh: '好！走吧！', hint: 'Let us... = 一起……吧' },
      { who: 'fox', en: 'This is fun!', zh: '太好玩了！' }
    ]
  }
};

function listScenes() {
  return Object.keys(SCENES).map((code) => ({
    code: code,
    title: SCENES[code].title,
    emoji: SCENES[code].emoji,
    knowledge: SCENES[code].knowledge,
    turns: SCENES[code].turns.length
  }));
}

function getScene(code) {
  return SCENES[code] || null;
}

module.exports = {
  SCENES: SCENES,
  listScenes: listScenes,
  getScene: getScene
};
