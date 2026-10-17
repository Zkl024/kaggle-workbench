---
name: kaggle-discovery-visualizer
description: 把 kaggle-discovery 产出的 Kaggle 候选数据集对比结果渲染成可交互的 GenUI 看板，用于在 3–6 个候选之间看清规模、热度、可用性、许可与时效的取舍并选定首选。当发现阶段已完成逐个 kaggle_dataset_view 核对、需要把横向对比以对比表、bench 条和落地风险标记呈现时使用。只转换已有结果，不发起新的 Kaggle 调用。
---

# Kaggle 候选对比可视化

把 `kaggle-discovery` 已经算好的对比结果画出来。**本技能只做转换，不做取数。**

## 先读基础规范

> **本仓库不包含 GenUI 基础文件。**
> `references/genui-widget/` 下的 5 份规范（`SKILL.md` 及 `color-system.md`、
> `visual-rules.md`、`widget-patterns.md`、`widget-recipes.md`）是从 MiniMax 内置
> `plugin-creator` 技能逐字拷贝的第三方内容，出于再分发考虑**未随本仓库发布**。
> 使用本技能前，请从本地 MiniMax 安装的插件中取回它们，或重新用 Creator 生成
> 派生技能。缺失这 5 份文件时，本技能的 Widget 产出无法保证符合 DSL 协议与主题安全约束。
>
> 取回路径（本地已安装的插件）：`<data-dir>/plugins/kaggle-workbench/skills/kaggle-discovery-visualizer/references/genui-widget/`

渲染任何 Widget 之前，先读这些基础文件：

1. `references/genui-widget/SKILL.md` — DSL 协议、安全约束、`--mw-*` 主题令牌、Chart.js 使用规则。
2. `references/genui-widget/references/color-system.md` — 令牌契约与 JS 运行时令牌。
3. `references/genui-widget/references/widget-patterns.md` — 渲染器选择、Chart.js 护栏、CSS/SVG 组件。
4. `references/genui-widget/references/widget-recipes.md` — 通用脚手架与 sendPrompt 示例。
5. `references/genui-widget/references/visual-rules.md` — 流式、排版、布局、状态规则。

再读本技能的业务层文件（这些**包含在本仓库中**）：

- `references/components.md` — 三套 Kaggle 专用组件配方。
- `references/data-schema.json` — 输入契约，字段、量纲、空值策略。
- `references/examples.md` — 完整 Widget 示例与静态审查要点。

`genui.json` 记录了基础的来源与摘要（`forkedFrom`、`sourceDigest`）。
这些规范不放松 Host 的沙箱、CSP、能力白名单、输出大小与协议校验。

## 什么时候渲染

**渲染**：用户明确要"看板 / 面板 / 对比图 / 可视化看看"，或者候选数 ≥ 4 且用户在做选型决策。

**不渲染，保持 `kaggle-discovery` 的文本结论**：

- 候选只有 1 个且没有取舍问题——直接用配方三的结论卡，或干脆用文字；
- 候选只有 2–3 个且差异是单一维度的——一句"X 比 Y 大 3 倍且更新"比一张看板更快；
- 数据量太小、太不确定、字段大量为 null；
- 用户明确要纯文本结果；
- 检索刚失败或凭证问题导致结果不完整——先说清楚缺什么，不要画一张残缺的图。

## 数据纪律

只消费 `kaggle-discovery` 已经产出的、符合 `references/data-schema.json` 的对比结果。

**绝对禁止**：

- 在 Widget 内发起 `fetch`、`XMLHttpRequest` 或任何远程调用；
- 重新调用 `kaggle_search_datasets` / `kaggle_dataset_view` 来"补齐"字段；
- 编造行数、列名、更新时间、许可或评分；
- 把缺失值渲染成 0、把 `null` 许可渲染成"无限制"；
- 把 `KAGGLE_KEY`、`KAGGLE_USERNAME`、本机绝对路径写进 Widget 或 `selectedData`。

每个候选必须保留 `ref` 作为稳定标识符，用户点击后能精确指回来源行。

## 组件选择

| 情况 | 用哪个 |
| --- | --- |
| `candidates.length >= 2` | 配方一候选对比表（主组件）+ 可选的配方二风险标记 |
| 存在 `blockedReason` 非 null 的候选 | 追加配方二落地风险标记 |
| `candidates.length === 1` | 配方三单候选结论卡 |

**渲染器选择**：候选规模是 3–6，且各列量纲不同（字节、次、0–1 评分、日期、字符串），
因此默认用 **CSS bench 条 + 对比表，不调用 `new Chart(...)`**。
只有当候选数 ≥ 6 且只比较**单一可归一化指标**时，才用 Chart.js 横向条形图。
不要为了"像个图表"而把不同量纲塞进同一个 y 轴。

## Widget 契约

- 默认输出**恰好一个** `<mavis-widget>`，`version="mavis.widget.v1"`、`theme="app"`、
  `token-set="mavis.semantic.v1"`、`streaming="html-first"`。
- 多组件场景用 `kind="dashboard"`，因此 `capabilities="resize,sendPrompt"`。
- 完整结构：`<mavis-meta>` → `<mavis-style>` → `<mavis-html>` → `<mavis-data>` →
  `<mavis-script>` → `<mavis-fallback>`。数据放 `<mavis-data>`，脚本只从
  `window.__mavisData['candidates']` 读，**不要把同一份数据硬编码进脚本**。
- CSS 只用基础规范列出的 `--mw-*` 令牌，**不给 `var(--mw-*)` 加回退值**。
- 脚本用 `addEventListener` 绑定，禁止内联 `onclick`，禁止 `submitForm`。
- `<mavis-fallback>` 给首选结论 + 2–3 个备选及理由，不重复整张表格。

## 状态处理

| 状态 | 行为 |
| --- | --- |
| Working | KPI 行 + 对比表 + 选中行详情 |
| Loading | 保留表头与骨架，数值位 `--`，空 bench 槽，**不显示 0** |
| Empty | 保留布局，居中一行说明无候选，并给出换关键词 / 换 `sortBy` 的下一步 |
| Error | 保留布局，内联一行短消息说明检索失败，不整页报错 |
| Auth | `credentialsConfigured` 为 false 时说明内核检索与竞赛列表不可用，但不阻断数据集对比本身 |

任何状态都不得暴露原始内部报错文本或凭证值。

## sendPrompt

只有点击才是授权。筛选、排序、hover 一律留在前端。

动作与载荷见 `references/components.md` 的配方一。`text` 与 `userIntent` **必须与对话语言一致**：
`conversationLanguage` 为 `zh` 时两者都写中文，`userIntent` 没有语言豁免。
`selectedData` 只放 `ref` 与决策所需的几个指标 + `provenance`。

## 输出位置

Widget 是给用户看的结果，不是进度播报。

- 所有取数、文件操作、校验和 todo 都完成之后，才把完整的 `<mavis-widget>` 放进**最后一条**
  助手消息。
- **Widget 之后不要再调用任何工具。** 在同一条消息里、Widget 之前或之后加一句简短说明是可以的。
- 如果宿主不支持渲染或渲染失败，`<mavis-fallback>` 里的文本就是回退答案；
  此时不要再在 Widget 外重复一份长 Markdown。

## 与业务技能的协作

渲染链路是：`kaggle-discovery` 先跑完发现流程产出结构化对比结果 → 本技能把该结果转成 Widget。

运行时限定的技能名是 `kaggle-workbench:kaggle-discovery-visualizer`；
目录名、frontmatter 名与 `plugin.json` 中都用裸名 `kaggle-discovery-visualizer`。
