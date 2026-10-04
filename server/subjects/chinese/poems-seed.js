// server/subjects/chinese/poems-seed.js — 三年级必背古诗（6 首，全文数据文件，不建表）
// 阶段 4 如需按年级扩展/收藏记录再考虑入库。

'use strict';

const POEMS = [
  {
    id: 'yong-liu',
    title: '咏柳',
    dynasty: '唐',
    author: '贺知章',
    grade: 3,
    lines: ['碧玉妆成一树高，', '万条垂下绿丝绦。', '不知细叶谁裁出，', '二月春风似剪刀。'],
    note: '把柳树比作碧玉打扮的美人，赞美春天。'
  },
  {
    id: 'chun-ri',
    title: '春日',
    dynasty: '宋',
    author: '朱熹',
    grade: 3,
    lines: ['胜日寻芳泗水滨，', '无边光景一时新。', '等闲识得东风面，', '万紫千红总是春。'],
    note: '描写春天出游所见，万紫千红就是春天的模样。'
  },
  {
    id: 'wang-tian-men-shan',
    title: '望天门山',
    dynasty: '唐',
    author: '李白',
    grade: 3,
    lines: ['天门中断楚江开，', '碧水东流至此回。', '两岸青山相对出，', '孤帆一片日边来。'],
    note: '李白乘船经过天门山看到的壮丽景色。'
  },
  {
    id: 'yin-hu-shang',
    title: '饮湖上初晴后雨',
    dynasty: '宋',
    author: '苏轼',
    grade: 3,
    lines: ['水光潋滟晴方好，', '山色空蒙雨亦奇。', '欲把西湖比西子，', '淡妆浓抹总相宜。'],
    note: '把西湖比作古代美女西子，晴天雨天都很美。'
  },
  {
    id: 'qi-qiao',
    title: '乞巧',
    dynasty: '唐',
    author: '林杰',
    grade: 3,
    lines: ['七夕今宵看碧霄，', '牵牛织女渡河桥。', '家家乞巧望秋月，', '穿尽红丝几万条。'],
    note: '写七夕节姑娘们向织女乞巧的习俗。'
  },
  {
    id: 'chang-e',
    title: '嫦娥',
    dynasty: '唐',
    author: '李商隐',
    grade: 3,
    lines: ['云母屏风烛影深，', '长河渐落晓星沉。', '嫦娥应悔偷灵药，', '碧海青天夜夜心。'],
    note: '想象嫦娥在月宫里的孤独心情。'
  },
  {
    id: 'mu-jiang-yin',
    title: '暮江吟',
    dynasty: '唐',
    author: '白居易',
    grade: 4,
    lines: ['一道残阳铺水中，', '半江瑟瑟半江红。', '可怜九月初三夜，', '露似真珠月似弓。'],
    note: '写黄昏江边的美景，把露珠比作珍珠。'
  },
  {
    id: 'ti-xi-lin-bi',
    title: '题西林壁',
    dynasty: '宋',
    author: '苏轼',
    grade: 4,
    lines: ['横看成岭侧成峰，', '远近高低各不同。', '不识庐山真面目，', '只缘身在此山中。'],
    note: '从不同角度看庐山都不一样，蕴含深刻道理。'
  },
  {
    id: 'chu-sai',
    title: '出塞',
    dynasty: '唐',
    author: '王昌龄',
    grade: 4,
    lines: ['秦时明月汉时关，', '万里长征人未还。', '但使龙城飞将在，', '不教胡马度阴山。'],
    note: '写边关战士保家卫国的豪情。'
  },
  {
    id: 'xia-ri-jue-ju',
    title: '夏日绝句',
    dynasty: '宋',
    author: '李清照',
    grade: 4,
    lines: ['生当作人杰，', '死亦为鬼雄。', '至今思项羽，', '不肯过江东。'],
    note: '赞美项羽宁死不屈的气节。'
  },
  {
    id: 'si-shi-tian-yuan',
    title: '四时田园杂兴',
    dynasty: '宋',
    author: '范成大',
    grade: 4,
    lines: ['昼出耘田夜绩麻，', '村庄儿女各当家。', '童孙未解供耕织，', '也傍桑阴学种瓜。'],
    note: '写夏天农村大人小孩都忙着农活的景象。'
  },
  {
    id: 'su-xin-shi',
    title: '宿新市徐公店',
    dynasty: '宋',
    author: '杨万里',
    grade: 4,
    lines: ['篱落疏疏一径深，', '树头新绿未成阴。', '儿童急走追黄蝶，', '飞入菜花无处寻。'],
    note: '写儿童追蝴蝶的天真有趣。'
  },
  {
    id: 'fu-rong-lou',
    title: '芙蓉楼送辛渐',
    dynasty: '唐',
    author: '王昌龄',
    grade: 4,
    lines: ['寒雨连江夜入吴，', '平明送客楚山孤。', '洛阳亲友如相问，', '一片冰心在玉壶。'],
    note: '送别朋友，表白自己纯洁的心志。'
  },
  {
    id: 'mo-mei',
    title: '墨梅',
    dynasty: '元',
    author: '王冕',
    grade: 4,
    lines: ['吾家洗砚池头树，', '朵朵花开淡墨痕。', '不要人夸好颜色，', '只留清气满乾坤。'],
    note: '用墨梅比喻自己不求夸奖、保持清高的品格。'
  }
];

function listPoems(grade) {
  const g = Number(grade) || 0;
  return g ? POEMS.filter((p) => p.grade === g) : POEMS.slice();
}

function getPoem(id) {
  return POEMS.find((p) => p.id === id) || null;
}

module.exports = {
  POEMS: POEMS,
  listPoems: listPoems,
  getPoem: getPoem
};
