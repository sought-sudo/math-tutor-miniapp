// server/subjects/english/vocabulary-seed-g4.js — 四年级英语核心词汇（人教版 PEP 三起，按单元）
// 每单元 6 词，共 12 单元 72 词；unit 字段对应 curriculum.js 的单元 id。

'use strict';

const G4 = [
  // 四上 Unit 1 My classroom
  { word: 'classroom', meaning: '教室', phonetic: '/ˈklɑːsruːm/', category: 'school', unit: 'E4U1' },
  { word: 'blackboard', meaning: '黑板', phonetic: '/ˈblækbɔːd/', category: 'school', unit: 'E4U1' },
  { word: 'window', meaning: '窗户', phonetic: '/ˈwɪndəʊ/', category: 'school', unit: 'E4U1' },
  { word: 'door', meaning: '门', phonetic: '/dɔː/', category: 'school', unit: 'E4U1' },
  { word: 'light', meaning: '灯', phonetic: '/laɪt/', category: 'school', unit: 'E4U1' },
  { word: 'picture', meaning: '图画', phonetic: '/ˈpɪktʃə/', category: 'school', unit: 'E4U1' },
  // 四上 Unit 2 My schoolbag
  { word: 'schoolbag', meaning: '书包', phonetic: '/ˈskuːlbæɡ/', category: 'school', unit: 'E4U2' },
  { word: 'notebook', meaning: '笔记本', phonetic: '/ˈnəʊtbʊk/', category: 'school', unit: 'E4U2' },
  { word: 'crayon', meaning: '蜡笔', phonetic: '/ˈkreɪən/', category: 'school', unit: 'E4U2' },
  { word: 'storybook', meaning: '故事书', phonetic: '/ˈstɔːribʊk/', category: 'school', unit: 'E4U2' },
  { word: 'pencil-box', meaning: '铅笔盒', phonetic: '/ˈpensl bɒks/', category: 'school', unit: 'E4U2' },
  { word: 'maths-book', meaning: '数学书', phonetic: '/mæθs bʊk/', category: 'school', unit: 'E4U2' },
  // 四上 Unit 3 My friends
  { word: 'friend', meaning: '朋友', phonetic: '/frend/', category: 'family', unit: 'E4U3' },
  { word: 'quiet', meaning: '安静的', phonetic: '/ˈkwaɪət/', category: 'family', unit: 'E4U3' },
  { word: 'friendly', meaning: '友好的', phonetic: '/ˈfrendli/', category: 'family', unit: 'E4U3' },
  { word: 'strong', meaning: '强壮的', phonetic: '/strɒŋ/', category: 'family', unit: 'E4U3' },
  { word: 'tall', meaning: '高的', phonetic: '/tɔːl/', category: 'family', unit: 'E4U3' },
  { word: 'short', meaning: '矮的', phonetic: '/ʃɔːt/', category: 'family', unit: 'E4U3' },
  // 四上 Unit 4 My home
  { word: 'bedroom', meaning: '卧室', phonetic: '/ˈbedruːm/', category: 'home', unit: 'E4U4' },
  { word: 'bathroom', meaning: '卫生间', phonetic: '/ˈbɑːθruːm/', category: 'home', unit: 'E4U4' },
  { word: 'kitchen', meaning: '厨房', phonetic: '/ˈkɪtʃɪn/', category: 'home', unit: 'E4U4' },
  { word: 'sofa', meaning: '沙发', phonetic: '/ˈsəʊfə/', category: 'home', unit: 'E4U4' },
  { word: 'fridge', meaning: '冰箱', phonetic: '/frɪdʒ/', category: 'home', unit: 'E4U4' },
  { word: 'living-room', meaning: '客厅', phonetic: '/ˈlɪvɪŋ ruːm/', category: 'home', unit: 'E4U4' },
  // 四上 Unit 5 Dinner's ready
  { word: 'beef', meaning: '牛肉', phonetic: '/biːf/', category: 'food', unit: 'E4U5' },
  { word: 'soup', meaning: '汤', phonetic: '/suːp/', category: 'food', unit: 'E4U5' },
  { word: 'vegetables', meaning: '蔬菜', phonetic: '/ˈvedʒtəblz/', category: 'food', unit: 'E4U5' },
  { word: 'fork', meaning: '叉子', phonetic: '/fɔːk/', category: 'food', unit: 'E4U5' },
  { word: 'knife', meaning: '刀', phonetic: '/naɪf/', category: 'food', unit: 'E4U5' },
  { word: 'chopsticks', meaning: '筷子', phonetic: '/ˈtʃɒpstɪks/', category: 'food', unit: 'E4U5' },
  // 四上 Unit 6 Meet my family
  { word: 'family', meaning: '家庭', phonetic: '/ˈfæməli/', category: 'family', unit: 'E4U6' },
  { word: 'parents', meaning: '父母', phonetic: '/ˈpeərənts/', category: 'family', unit: 'E4U6' },
  { word: 'uncle', meaning: '叔叔', phonetic: '/ˈʌŋkl/', category: 'family', unit: 'E4U6' },
  { word: 'aunt', meaning: '阿姨', phonetic: '/ɑːnt/', category: 'family', unit: 'E4U6' },
  { word: 'cousin', meaning: '堂兄弟姐妹', phonetic: '/ˈkʌzn/', category: 'family', unit: 'E4U6' },
  { word: 'baby', meaning: '婴儿', phonetic: '/ˈbeɪbi/', category: 'family', unit: 'E4U6' },
  // 四下 Unit 1 My school
  { word: 'playground', meaning: '操场', phonetic: '/ˈpleɪɡraʊnd/', category: 'school', unit: 'E4U7' },
  { word: 'library', meaning: '图书馆', phonetic: '/ˈlaɪbrəri/', category: 'school', unit: 'E4U7' },
  { word: 'garden', meaning: '花园', phonetic: '/ˈɡɑːdn/', category: 'school', unit: 'E4U7' },
  { word: 'gym', meaning: '体育馆', phonetic: '/dʒɪm/', category: 'school', unit: 'E4U7' },
  { word: 'office', meaning: '办公室', phonetic: '/ˈɒfɪs/', category: 'school', unit: 'E4U7' },
  { word: 'computer', meaning: '电脑', phonetic: '/kəmˈpjuːtə/', category: 'school', unit: 'E4U7' },
  // 四下 Unit 2 What time is it?
  { word: 'breakfast', meaning: '早餐', phonetic: '/ˈbrekfəst/', category: 'food', unit: 'E4U8' },
  { word: 'lunch', meaning: '午餐', phonetic: '/lʌntʃ/', category: 'food', unit: 'E4U8' },
  { word: 'dinner', meaning: '晚餐', phonetic: '/ˈdɪnə/', category: 'food', unit: 'E4U8' },
  { word: 'get-up', meaning: '起床', phonetic: '/ɡet ʌp/', category: 'home', unit: 'E4U8' },
  { word: 'go-home', meaning: '回家', phonetic: '/ɡəʊ həʊm/', category: 'home', unit: 'E4U8' },
  { word: 'o-clock', meaning: '点钟', phonetic: '/əˈklɒk/', category: 'numbers', unit: 'E4U8' },
  // 四下 Unit 3 Weather
  { word: 'weather', meaning: '天气', phonetic: '/ˈweðə/', category: 'weather', unit: 'E4U9' },
  { word: 'sunny', meaning: '晴朗的', phonetic: '/ˈsʌni/', category: 'weather', unit: 'E4U9' },
  { word: 'rainy', meaning: '下雨的', phonetic: '/ˈreɪni/', category: 'weather', unit: 'E4U9' },
  { word: 'cloudy', meaning: '多云的', phonetic: '/ˈklaʊdi/', category: 'weather', unit: 'E4U9' },
  { word: 'windy', meaning: '有风的', phonetic: '/ˈwɪndi/', category: 'weather', unit: 'E4U9' },
  { word: 'snowy', meaning: '下雪的', phonetic: '/ˈsnəʊi/', category: 'weather', unit: 'E4U9' },
  // 四下 Unit 4 At the farm
  { word: 'farm', meaning: '农场', phonetic: '/fɑːm/', category: 'home', unit: 'E4U10' },
  { word: 'sheep', meaning: '绵羊', phonetic: '/ʃiːp/', category: 'animals', unit: 'E4U10' },
  { word: 'horse', meaning: '马', phonetic: '/hɔːs/', category: 'animals', unit: 'E4U10' },
  { word: 'cow', meaning: '奶牛', phonetic: '/kaʊ/', category: 'animals', unit: 'E4U10' },
  { word: 'hen', meaning: '母鸡', phonetic: '/hen/', category: 'animals', unit: 'E4U10' },
  { word: 'tomato', meaning: '西红柿', phonetic: '/təˈmɑːtəʊ/', category: 'food', unit: 'E4U10' },
  // 四下 Unit 5 My clothes
  { word: 'clothes', meaning: '衣服', phonetic: '/kləʊðz/', category: 'clothes', unit: 'E4U11' },
  { word: 'coat', meaning: '外套', phonetic: '/kəʊt/', category: 'clothes', unit: 'E4U11' },
  { word: 'shirt', meaning: '衬衫', phonetic: '/ʃɜːt/', category: 'clothes', unit: 'E4U11' },
  { word: 'skirt', meaning: '短裙', phonetic: '/skɜːt/', category: 'clothes', unit: 'E4U11' },
  { word: 'socks', meaning: '袜子', phonetic: '/sɒks/', category: 'clothes', unit: 'E4U11' },
  { word: 'shoes', meaning: '鞋子', phonetic: '/ʃuːz/', category: 'clothes', unit: 'E4U11' },
  // 四下 Unit 6 Shopping
  { word: 'umbrella', meaning: '雨伞', phonetic: '/ʌmˈbrelə/', category: 'clothes', unit: 'E4U12' },
  { word: 'scarf', meaning: '围巾', phonetic: '/skɑːf/', category: 'clothes', unit: 'E4U12' },
  { word: 'gloves', meaning: '手套', phonetic: '/ɡlʌvz/', category: 'clothes', unit: 'E4U12' },
  { word: 'sunglasses', meaning: '太阳镜', phonetic: '/ˈsʌnɡlɑːsɪz/', category: 'clothes', unit: 'E4U12' },
  { word: 'shop', meaning: '商店', phonetic: '/ʃɒp/', category: 'home', unit: 'E4U12' },
  { word: 'cheap', meaning: '便宜的', phonetic: '/tʃiːp/', category: 'colors', unit: 'E4U12' }
];

module.exports = G4.map((w) => ({
  word: w.word,
  meaning: w.meaning,
  phonetic: w.phonetic,
  category: w.category,
  grade: 4,
  unit: w.unit,
  audio_url: ''
}));
