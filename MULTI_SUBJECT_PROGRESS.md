# 多学科架构改造进度（math / english / chinese）

> 目标：把"数学小助手"升级为多学科辅导架构，**不破坏现有数学功能**。
> 每阶段完成并验证后才进入下一阶段。

## 阶段总览

- [x] **阶段 1：多学科骨架（数据层 + 学科模块目录 + 学科路由）** — 2026-10-04 完成
- [x] **阶段 2：英语学科 MVP（词库/听音/跟读/拼写/对话 + 评测占位）** — 2026-10-04 完成
- [x] **阶段 3：语文学科 MVP（生字/听写/古诗/阅读引导/写作建议 + 朗读评测占位）** — 2026-10-04 完成
- [x] **阶段 4：多学科端到端验收（每日学习计划 + 分科报告 + 七步全链路验证）** — 2026-10-04 完成 ✅ **全部完成**

---

## 阶段 4 验收清单（多学科端到端，全部通过）

> 验证脚本：`node scripts/check-e2e-multisubject.js`（每步打印输出，任何一步失败给出文件/函数/报错线索）

- [x] **数学**：模拟退位减法（四则混合运算）连错 3 题 → 掌握度降至 20 分 → 训练营自动排课含该薄弱点（active）
- [x] **英语**：跟读 cat（exact）+ 拼写 dog 对/pig 错（渐进提示）→ 掌握度按词类知识点落库（vocab-animals → speak 维度可查）
- [x] **语文**：听写错/对（提示不给字）、阅读引导追问（无标准答案）、写作建议 3 条 scored=false
- [x] **每日学习计划**：新增编排器 `student-web/js/dailyPlan.js`——一周 7 天全部 ≤2 科、每科组合 15~25 分钟（数学 cap 8 关×2 分钟 + 第二科 6 分钟）；星期轮换（周二四英语/周三五语文/周末选完成度低）；首页任务卡升级为"今日学习计划"（显示两科任务+预计总时长+完成度）
- [x] **家长报告分科**：`buildFacts` 按 subject_id 分科统计（bySubject: attempts/correct/wrong/minutes/knowledge）；LLM 提示词要求分科分段+禁止百分比排名；**输出硬校验**（含 %/百分/排名/第几名 → 回退本地分科兜底）；实测 LLM 生成三科分段报告且无冷数据
- [x] **虚拟伙伴适配学科**：数学"小狐的今日任务"、英语英文话术（先点一点听小狐读）、语文中文话术（大声读给小狐听）；三科首页问候语各自适配
- [x] 全量单测 9 套全绿（新增 check-e2e-multisubject）
- [x] 浏览器抽查：首页"今日学习计划"卡（数学+语文 = 22 分钟，语文完成度 67%）

### 阶段 4 改动明细
- `student-web/js/dailyPlan.js`（新增）：每日计划编排纯函数（UMD，前端/脚本共用）
- `student-web/index.html`：首页任务卡内嵌"今日学习计划"区
- `server/server.js`：英语 repeat/spell 掌握度落库改按词类知识点（vocab-<category>，维度经 knowledgeGraph 查询）
- `server/db.js`：getEventsSince SELECT 补 subject_id 列
- `server/services/reportService.js`：buildFacts 分科统计（bySubject）、报告提示词分科要求+禁百分比排名、输出硬校验 reportPassesRules、本地兜底分科文案（subjectLines）
- `/api/report` 响应新增 `bySubject` 汇总

---

## 阶段 3 交付清单（已完成，数学/英语零破坏）

### 数据层（server/db.js）
- [x] 新表 `chinese_characters(id, char UNIQUE, pinyin, strokes, radicals, words, grade, audio_url)`
- [x] 种子生字 `subjects/chinese/characters-seed.js`：50 个三年级常用字（含笔画数/部首/组词），启动时 INSERT OR IGNORE
- [x] `listChineseCharacters(grade?)` / `getChineseCharByChar(char)`
- [x] 古诗数据文件 `subjects/chinese/poems-seed.js`：6 首三年级必背（咏柳/春日/望天门山/饮湖上初晴后雨/乞巧/嫦娥，全文+作者+朝代+诗意）——数据文件不建表，是否入库留阶段 4
- [x] 语文行为事件落 learning_events（subject_id='chinese'）→ 语文掌握度自动积累

### chinese 四件套（server/subjects/chinese/）
- [x] `knowledgeGraph.js`：17 个知识点（code/name/dimension∈word|sentence|reading|writing）——识字写字/查字典/组词（word）、句子完整/比喻拟人/修改病句/口语交际（sentence）、古诗诵读/阅读理解/联系上下文猜词/主要内容（reading）、日记/看图写话/开头结尾/写具体（writing）
- [x] `prompts.js`：硬约束落地——三年级伙伴小狐、**先朗读再理解不直接给中心思想**、**阅读先问"你从哪句话看出来的？"**、**作文只给建议不打分不说"写得不好"**、鼓励一句话≤**25 字**；`CN_WRITING_SYSTEM` 写作专用提示词（只查开头中间结尾/跑题/错别字/通顺；不评分不排名不比较；输出 2~3 条每条≤30 字）
- [x] `stateMachine.js`：READ_ALOUD→WORD_PRACTICE→SENTENCE_PRACTICE→READING_GUIDE→EXPRESSION→WRITING_SUGGEST→REVIEW 七状态（每状态 enter/goal/allowed/forbidden/exit）+ step 引擎（含 start_reading/start_expression 显式进入 action）
- [x] `evaluator.js`：dictationCheck（写错给部首/笔画提示**不直接给字**）、readingGuide（**任何答案都追问"哪句话看出来的"，永不输出标准答案/中心思想**）、writingSuggestLocal（规则引擎：长度/结构/重复词检测 → 2~3 条每条≤30 字，先肯定优点）

### 接口（server/server.js，数学/英语路由零改动）
- [x] `GET /api/chinese/characters?grade=3` 生字表（?shuffle=1 随机供听写）
- [x] `POST /api/chinese/dictation` 听写判题（correct/feedback/charDetail）
- [x] `GET /api/chinese/poems?grade=3` 古诗全文
- [x] `POST /api/chinese/reading` 阅读引导（响应里**无标准答案字段**）
- [x] `POST /api/chinese/writing/suggest` 写作建议（本地规则兜底 + LLM 按写作提示词生成，输出校验 2~3 条/≤30字/无评分字样，不过回退本地）
- [x] `POST /api/chinese/read-aloud` 朗读评测占位（SPEECH_API_KEY+SPEECH_API_URL 均配置才调外部，否则占位；不用 DeepSeek）
- [x] subjectService：chinese AVAILABLE 翻 true；通用路由对 chinese 提示"请使用语文入口"

### 前端（student-web，网页端；小程序阶段 4 补齐）
- [x] 首页第 8 张功能卡「📖 语文」（正好 4 行×2 列对齐）+ view-chinese 五面板
- [x] 语文首页：小狐问候 + 今日语文任务卡（认 3 字/听写 2 个/读 1 首，localStorage 计数）
- [x] 字词：生字卡（大字+拼音+笔画+部首，笔画组词默认折叠）→ 听写（显示拼音输入汉字，错给提示不给字，对给庆祝）
- [x] 古诗：6 首诗卡逐句展示 + 🔊 中文朗读
- [x] 阅读引导：短文+问题 → 作答 → 追问"哪句话让你这么想的"（界面无标准答案）
- [x] 写作小建议：粘贴作文 → 2~3 条建议（界面标注"小建议，不打分"）
- [x] 小狐贯穿语文场景（greet/encourage/cheer + 语文话术），中文朗读复用现有 TTS.speak

### 验证记录
- `scripts/check-chinese.js` 全绿（50 生字/听写边界/阅读引导永不含标准答案/写作建议 2~3 条≤30 字/七状态机/提示词五硬约束/古诗 6 首）+ 内置"晨字听写+阅读引导"模拟流程打印
- 数学 7 套 + 英语 1 套单测全回归通过（check-english 的"chinese 开发中"断言同步更新为已可用）
- curl 十项实测：subjects 三科全 available、生字表、听写错/对（对的返回 charDetail）、古诗 6 首、阅读引导追问、写作建议（LLM 生成且"先肯定+不打分"）、朗读占位、数学 /tutor 正常（answer=81）、英语拼写正常
- 浏览器实测：语文首页 → 生字卡（晨，笔画组词折叠）→ 听写"尘"提示/"晨"庆祝 → 古诗 6 卡 24 句 → 阅读引导追问 → 写作建议 3 条+不打分标注

---

## 阶段 2 交付清单（已完成，数学零破坏）

### 数据层（server/db.js）
- [x] 新表 `english_vocabulary(id, word UNIQUE, meaning, phonetic, category, grade, audio_url)` + category 索引
- [x] 种子词库 `subjects/english/vocabulary-seed.js`：82 词 × 8 类（animals/colors/numbers/fruits/body/school/food/toys），grade=3，启动时 INSERT OR IGNORE
- [x] `listEnglishVocabulary(category?)` / `getEnglishWordByWord(word)`（大小写不敏感）
- [x] 英语行为事件落 learning_events（subject_id='english'）→ 英语掌握度自动积累（阶段 3 家长端按学科展示）

### english 四件套（server/subjects/english/）
- [x] `knowledgeGraph.js`：19 个知识点（每项 code/name/dimension∈listen|speak|read|write）——字母与自然拼读/词汇 8 类/句型/语法初步/对话/阅读/拼写；四维度分组 units()
- [x] `prompts.js`：引导式学习提示词，硬约束落地——三年级伙伴小狐、先听后跟读**不直接纠错**、鼓励性一句话≤20 字、不评判发音（"再听一次，我们慢慢来"）、**不直接给中文翻译先猜**；附七状态话术
- [x] `stateMachine.js`：LISTEN→REPEAT→PRONOUNCE_CHECK→PRACTICE→DIALOGUE→SPELL→REVIEW 七状态（每状态 enter/goal/allowed/forbidden/exit 完整定义）+ createSession/step/isValidTransition 确定性引擎
- [x] `evaluator.js`：spellCheck（大小写宽松/差一字 close 提示/全错给长度+首字母提示，**不直接给答案**）+ repeatTextCheck（MVP 不评分只鼓励）
- [x] `dialogues.js`（新增）：5 场景 × 4~6 轮（greeting/animals/fruits/school/toys），三年级级句子 + 每轮小提示
- [x] `vocabulary-seed.js`（新增）：词库种子

### 接口（server/server.js，数学路由零改动）
- [x] `GET /api/english/vocabulary?category=` 词库
- [x] `POST /api/english/repeat` 跟读反馈：text→本地判分鼓励；recording→SPEECH_API_KEY+SPEECH_API_URL 均配置才调外部评测（通用约定），否则**占位"已收到录音，继续加油"**（不用 DeepSeek）
- [x] `POST /api/english/spell` 拼写判题（correct/hint/level/meaning）
- [x] `GET /api/english/dialogue?scene=` 场景对话
- [x] **通用路由分流加固**：/tutor /tutor-chat /variant /ocr 的学科条件从 isAvailable() 改为 `subject_code !== 'math'` → 英语请求提示"请使用英语练习入口"，**防止英语被误路由进数学讲解**

### 前端（student-web，网页端；小程序阶段 3 补齐）
- [x] 首页第 7 张功能卡「🔤 英语」+ view-english 视图（英语首页/听音/跟读/拼写/对话五面板）
- [x] 英语首页：小狐英文问候 + 今日英语任务卡（听 3 词/跟读 2 次/拼对 2 词，localStorage 计数）+ 四入口
- [x] 听音（LISTEN）：类别 chips → 词卡（单词+音标+🔊 TTS 英文朗读；**中文意思默认折叠"点我看意思"**，呼应先猜原则）
- [x] 跟读（REPEAT→PRONOUNCE_CHECK）：TTS 听音 → 🎤 MediaRecorder 录音 ≤5s（权限不可用自动降级"我读好了"自评）→ 占位反馈
- [x] 拼写（SPELL）：中文+听音 → 判题（错给首字母+长度提示，对给庆祝）→ 下一词
- [x] 对话（DIALOGUE）：场景 chips → 逐轮对话（小狐句点击英文朗读）
- [x] tts.js 新增 `speakEn(text, rate)`（lang=en-US、rate 0.85、优先英文音色），中文朗读不受影响
- [x] 小狐贯穿英语场景（greet/encourage/cheer 表情 + 英文话术）

### 验证记录
- `scripts/check-english.js` 全绿（词库 82 词/拼写判分边界/跟读判分/七状态机转移/提示词四硬约束/知识图谱四维度/场景对话）+ 内置"cat 跟读+拼写"模拟流程打印
- 数学 7 套单测全回归通过；curl 实测：/tutor 无 subject_code 正常讲解（零破坏）、subject_code:english 正确分流、英语四接口全部符合预期
- 浏览器实测：英语首页 → 听音（cat）→ 看意思 → 跟读自评反馈 → 拼写"tiger"错答提示/正确庆祝 → 动物园场景对话 5 轮

---

## 阶段 1 交付清单（已完成）

### 数据层（server/db.js）
- [x] 新表 `subjects(id, code UNIQUE, name, sort_order)`，种子数据：math 数学 / english 英语 / chinese 语文（INSERT OR IGNORE，重复启动安全）
- [x] `learning_events` 增加 `subject_id TEXT DEFAULT 'math'`（ALTER 兼容旧库，历史数据自动归为数学）
- [x] `plans` / `lesson_progress`（训练营）增加 `subject_id TEXT DEFAULT 'math'`
- [x] `logEvent` 写入 `ev.subjectId || 'math'`
- [x] `getMastery / getMasteryTrend / getRetryRate / getEventsSince` 支持可选 `subjectId` 过滤（**默认不过滤，数学行为完全不变**）
- [x] 新增 `listSubjects() / getSubjectByCode(code)`

### 学科模块目录（server/subjects/）
```
server/subjects/
  math/
    knowledgeGraph.js   知识图谱（包装共享 utils/solver + utils/curriculum，单一来源不复制）
    prompts.js          4 套提示词（自 server.js 物理迁入：TUTOR_SYSTEM/TUTOR_WRONG_SYSTEM/TUTOR_VARIANT_SYSTEM/OCR_SYSTEM）
    stateMachine.js     10 状态引导式对话状态机（包装 re-export server/tutor-engine.js）
    evaluator.js        判分器（包装 tutorEngine.checkAnswer + solver.evaluate）
  english/  四件套占位骨架（AVAILABLE:false，阶段 2 实装）
  chinese/  四件套占位骨架（阶段 3 实装）
```

### 学科路由（server/services/subjectService.js + server.js）
- [x] `subjectService`：getSubjectByCode / getKnowledgeGraph / getPrompt / getStateMachine / getEvaluator + isAvailable + listSubjects
- [x] `/tutor`、`/tutor-chat`、`/variant`、`/ocr` 支持 `body.subject_code`（缺省 math）：非可用学科返回 `200 {ok:false, error:"该学科正在开发中 🚧..."}`，不建会话不调 LLM
- [x] 新增 `GET /api/subjects` → `{ok, subjects:[{code,name,available,message}]}`

### 与原设想表结构的差异记录（重要）
原设想中的 5 张表在本项目中的真实对应物与决策：

| 设想 | 现实 | 决策 |
|---|---|---|
| knowledge_points 表 | 知识点 = utils/solver.js KNOWLEDGE_LIB（硬编码，三端共享）+ learning_events.knowledge_point | 不建表；学科知识图谱放 subjects/<code>/knowledgeGraph.js |
| questions 表 | 题目由 solver/mcq 实时生成，快照在 diagnostics.detail / plans.lessons / lesson_progress.content | 不建表 |
| mastery 表 | 无表，computeMastery 纯函数实时计算 | 不建表；getMastery 系列加 subject 过滤参数；dimension（英语 listen/speak/read/write、语文 word/sentence/reading/writing）由各学科 evaluator 在阶段 2/3 自定义 |
| learning_plans 表 | 实际表名 plans | 已加 subject_id |
| daily_tasks 表 | 不存在（每日目标为客户端动态计算） | 阶段 1 不建，阶段 2 按学科设计每日任务时再定 |

### 兼容性保证
- `utils/solver.js / utils/mcq.js / utils/curriculum.js / server/tutor-engine.js` 四个共享文件**零改动**（小程序/浏览器/后端三方共用）；
- 全部数学接口默认行为不变（subject_code 缺省 = math 原路径）；
- 现有 7 套单测全绿（check-services / check-camp / check-solver / check-tutor-engine / check-mcq-leak / check-auth / check-subjects）。

---

## 阶段 2 预告（英语，待确认后启动）
- english 四件套真实现：词法/句型知识图谱、英语引导提示词、对话状态机（听/说/读/写维度）、判分器
- 英语出题器（题库或生成器）
- learning_events 的 dimension 字段（区分四技能）
- 端到端：英语题目拍照/输入 → 引导 → 巩固 → 家长报告
