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
