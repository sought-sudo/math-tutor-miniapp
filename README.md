# 数学小助手 · 小学四年级 AI 数学辅导小程序

一个面向小学四年级的数学辅导微信小程序，包含四个核心功能：

- 📷 **拍照识题**：拍下题目照片，识别题目文字，一键进入辅导
- 🧮 **分步引导**：像老师一样一步步引导（读题 → 想思路 → 列式计算 → 检查作答），答对鼓励、答错自动收集
- 📕 **错题本**：错题自动入库、按知识点归类，支持"再练一次"重练和"标记掌握"
- 📊 **家长报告**：练习量、正确率、最近 7 天趋势、错题知识点分布、给家长的一句话建议

**零配置即可体验**：内置"本地解题引擎"，覆盖四年级常见题型（三位数乘两位数、除数是两位数的除法、四则混合运算、简便计算、小数加减法、行程/购物/归一/平均数/鸡兔同笼/长方形周长面积等），未接入任何 AI 接口时也能完整演示。

## 从 GitHub 获取（其他设备）

在任意装有 Git 的设备上：

```bash
git clone https://github.com/sought-sudo/math-tutor-miniapp.git
```

也可以在仓库主页点绿色「Code」按钮 →「Download ZIP」下载压缩包解压。项目已带 `.gitattributes` 统一行尾，Windows / macOS / Linux 克隆后都能直接在微信开发者工具中导入运行（AppID 使用测试号或游客模式即可）。

## 快速开始

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开工具 → 「导入项目」→ 选择本目录 `math-tutor-miniapp`
3. AppID 选择「测试号」或「游客模式」即可
4. 编译运行，从首页的「每日练习」开始体验

> 建议在「详情 → 本地设置」勾选「不校验合法域名」，便于本地调试后端。

## 项目结构

```
math-tutor-miniapp/
├── app.js / app.json / app.wxss     全局配置与样式
├── pages/
│   ├── index/       首页（功能入口 + 今日统计）
│   ├── camera/      拍照识题（相机 + 相册 + 手动输入）
│   ├── guide/       分步引导（核心辅导页，逐步解锁提示）
│   ├── wrongbook/   错题本（待复习 / 已掌握）
│   └── report/      家长报告（图表 + 建议）
├── components/
│   └── bottom-nav/  自定义底部导航
├── utils/
│   ├── solver.js    本地解题引擎（题型生成 + 分步讲解）
│   ├── ai.js        AI 调度层（大模型优先，本地引擎兜底）
│   ├── storage.js   错题本 / 练习记录 / 统计（本地存储）
│   ├── config.js    AI 接口配置开关
│   └── util.js      工具函数
├── server/
│   └── server.js    可选后端（Node，零依赖，接大模型）
└── scripts/
    └── check-solver.js  本地引擎自检脚本
```

## 两种运行模式

### 模式一：演示模式（默认，开箱即用）

`utils/config.js` 中 `llm.enabled` / `ocr.enabled` 均为 `false`：

- 练习、错题、报告全部可用
- 拍照后需**手动输入题目文字**（页面会提示，也提供示例题）
- 题目解析由本地引擎完成：四则运算逐步脱式讲解，鸡兔同笼按数字自动识别，其余文字题走通用引导步骤

### 模式二：真实 AI 模式（可选）

1. 启动后端（Node ≥ 18）：

   ```bash
   # Windows CMD
   set LLM_BASE_URL=https://api.deepseek.com
   set LLM_API_KEY=sk-xxxx
   node server/server.js

   # 识图需另设支持视觉的模型（Qwen-VL / GLM-4V / GPT-4o 等）
   set OCR_MODEL=qwen-vl-plus
   ```

2. 在 `utils/config.js` 填入后端地址并打开开关：

   ```js
   llm: { enabled: true, baseUrl: 'http://127.0.0.1:8787' },
   ocr: { enabled: true, baseUrl: 'http://127.0.0.1:8787' }
   ```

3. 真机上线时，需在微信公众平台把后端域名加入 request 合法域名（要求 HTTPS）。

## 关键设计

- **数据只存本机**：错题本与练习记录保存在微信本地存储（Storage），不上传；报告页可一键重置
- **辅导闭环**：作答错误两次 → 显示正确答案并自动加入错题本 → 错题本「再练一次」→ 做对自动标记"已掌握"
- **答题宽容度**：答案比较容差 0.01；支持直接输入算式（如 `125×8+25×4`）；答案含文字的题型（鸡兔同笼）改为"自我核对"
- **本地引擎可自检**：`node scripts/check-solver.js` 批量生成题目并验证答案

## 常见问题

- **提示基础库版本过低**：在开发者工具「详情 → 本地设置」调高调试基础库（项目配置为 3.3.4）
- **相机黑屏/无权限**：真机需授权相机；开发者工具中相机为模拟画面，也可用「从相册选择」
- **后端连不上**：确认勾选「不校验合法域名」，且后端已用 `node server/server.js` 启动在 8787 端口
