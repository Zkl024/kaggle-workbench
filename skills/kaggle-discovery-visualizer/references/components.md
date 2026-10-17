# Kaggle 候选对比组件配方

本文件定义 `kaggle-discovery-visualizer` 专用的业务组件。所有配方的输入都来自
[references/data-schema.json](references/data-schema.json) 所描述的对比结果，**Visualizer 只能转换
已有结果，不得发起新的 Kaggle 调用、补齐缺失字段或推断未核对到的元数据**。

## 选型总则

| 候选数 | 对比维度 | 渲染方式 |
| --- | --- | --- |
| 1–5 | 多个不同量纲的指标 | 对比表 + CSS bench 条，**不调用 Chart.js** |
| 6–12 | 单一可归一化指标（如 usabilityRating） | 可用 Chart.js 横向条形图 |
| 任意 | 跨量纲多指标 | 始终用对比表，不要强行塞进同一个 y 轴 |

`kaggle-discovery` 技能规定的候选规模是 3–6 个，因此**默认走 CSS bench 条路线**。基础规范里
"5 个及以下数据点不要用 Chart.js" 的规则在本业务里优先于任何图表偏好。

---

## 配方一：候选对比表（主组件）

### 业务问题与选用规则

**问题**：这些候选之间该怎么取舍，谁是首选，谁会在什么地方翻车？

**选用规则**：`candidates.length >= 2` 时使用。等于 1 时不渲染表格，直接用配方三的单候选卡片 +
一句话结论。

### 输入字段、单位、空值策略与来源

| 展示位 | 字段 | 单位 | 空值策略 | 来源 |
| --- | --- | --- | --- | --- |
| 名称 | `title` / `subtitle` | — | 标题为空时显示 `ref` 的 slug 段 | 检索摘要 + `kaggle_dataset_view` |
| 规模 | `sizeLabel`，缺失时用 `totalBytes` | 字节 / 可读标签 | 两者皆空显示 `未知`，**不得显示 0** | `kaggle_dataset_view` |
| 可用性 | `usabilityRating` | 0–1 | null 时 bench 条留空并在单元格显示 `未核对` | `kaggle_dataset_view` |
| 下载量 | `downloadCount` | 次 | null 显示 `—` | 检索摘要 |
| 点赞 | `voteCount` | 次 | null 显示 `—` | 检索摘要 |
| 社区验证 | `kernelCount` | 个 | null 显示 `—` | `kaggle_dataset_view` |
| 许可 | `licenseName` | — | null 显示 `未知，需人工确认`，禁止显示"无限制" | `kaggle_dataset_view` |
| 更新时间 | `lastUpdated` | ISO 8601 | null 显示 `—` | 两者都返回 |
| 版本数 | `versionCount` | 个 | null 显示 `—` | `kaggle_dataset_view` |

**归一化规则**：bench 条长度只在**同一列内**按该列最大值归一化，禁止跨列共用同一比例尺。
`usabilityRating` 已是 0–1，直接乘 100。`downloadCount` / `voteCount` / `kernelCount` 用
`value / columnMax * 100`。`columnMax` 为 0 时整列为空条并在数值位显示 `0`。

### Widget kind、布局与语义层级

- `kind="dashboard"`，`capabilities="resize,sendPrompt"`。
- 语义层级：`抬头（检索口径）` → `KPI 行` → `对比表` → `选中行详情面板` → `动作行`。
- 抬头必须显示 `query.search` 与 `query.sortBy`，让用户知道这份对比对应哪次检索。
- 当 `generatedFrom.fieldsVerified` 为 false 时，在抬头下方加一行
  `仅摘要级核对，未逐个调用 kaggle_dataset_view`——这是事实陈述，不是建议。
- 对比表按行呈现，每行左侧一个可选中的行首标记。行内数值右对齐并使用
  `font-variant-numeric: tabular-nums`。
- 关键数值必须在布局中直接可见，**不得只放在 hover tooltip 里**。

### 本地交互（留在前端，不回传模型）

1. **点击行选中**：点击任意行，右侧详情面板切换到该候选，展示 `note`、
   `blockedReason`、`versionCount`、`lastUpdated` 与来源工具。
2. **排序切换**：提供 `规模 / 下载量 / 可用性 / 更新时间` 四个本地排序按钮，纯前端排序，
   不发消息。null 一律排到末尾。
3. **hover**：bench 条与单元格用 `:hover` 轻微背景变化提示可点击，不做位移或缩放。

### 推理跟进的 sendPrompt 与安全载荷

选中行后，动作行给出两个跟进入口，点击才发送：

- `adopt-candidate` → 提示进入下载与数据体检（切到 `kaggle-dev` 技能）。
- `deep-dive-candidate` → 提示针对该候选继续拉详情并核对字段。

`selectedData` 只放最小必要内容，且必须保留稳定标识符：

```json
{
  "ref": "heptapod/titanic",
  "title": "Titanic",
  "sizeLabel": "10.8 KB",
  "usabilityRating": 0.706,
  "downloadCount": 171232,
  "licenseName": "Database: Open Database, Contents: Database Contents",
  "blockedReason": null,
  "provenance": { "tool": "kaggle_dataset_view", "detailLevel": "full" }
}
```

**禁止**把 `KAGGLE_KEY`、`KAGGLE_USERNAME`、本机绝对路径、文件内容或任何凭证放进 `selectedData`。

### 状态呈现

| 状态 | 表现 |
| --- | --- |
| Working | KPI 行 + 完整对比表 + 详情面板 |
| Loading | 保留表头与 KPI 骨架，数值位显示 `--`，bench 条为 `--mw-surface-muted` 空槽，**不显示 0** |
| Empty | `candidates.length === 0`：保留抬头与表头，中间一行居中说明"本次检索没有返回候选数据集"，并给出换关键词或换 `sortBy` 的下一步 |
| Error | 保留整体布局，在 KPI 行下方插入一行内联短消息，说明检索失败；不整页报错 |
| Auth | `credentialsConfigured` 为 false 时在抬头加一行：`当前未配置 Kaggle 凭证，内核检索与竞赛列表不可用`——这是能力说明，不阻断数据集对比 |

### 文本回退

`<mavis-fallback>` 给出：首选数据集的 `ref`、规模、许可、更新时间、下载命令，以及它会在哪里翻车；
再列 2–3 个备选及排序理由。**不重复整张表格**。

---

## 配方二：落地风险标记

### 业务问题与选用规则

**问题**：这些候选里哪些会卡在落地环节？

**选用规则**：只要存在任一候选的 `blockedReason` 非 null 就渲染；全部为 null 时不渲染，
不要为了"看起来完整"而放一个全绿状态。

### 字段、空值策略与来源

`blockedReason` 的取值与含义（全部来自 `data-schema.json` 的 enum）：

| 值 | 触发条件 | 语义色 |
| --- | --- | --- |
| `licence-unknown` | `licenseName` 为 null | `--mw-warning` |
| `licence-restricted` | 许可明确不允许目标用途 | `--mw-danger` |
| `fields-unknown` | `fieldsKnown` 为 false | `--mw-warning` |
| `stale` | `lastUpdated` 早于本次分析所需时效 | `--mw-warning` |
| `private` | `isPrivate` 为 true | `--mw-danger` |

**禁止**用颜色以外的方式暗示"安全"：不要写"无风险"，只写具体阻断项。

### 布局

一排可换行的 chip，每个 chip 是 `ref` + 原因 + 一句补救动作。chip 使用
`border: 1px solid var(--mw-border)` 与语义色文字，不使用填充底色，避免在暗色模式下糊成一片。

### 交互

点击 chip 选中对应行（复用配方一的选中状态），不单独发消息。

### 文本回退

一句话列出被阻断的 `ref` 及原因，并说明下一步是补凭证、确认许可，还是下载后核对字段。

---

## 配方三：单候选结论卡

### 业务问题与选用规则

**问题**：只有一个候选时，直接给结论。

**选用规则**：`candidates.length === 1`。**不得**为凑满表格而虚构其余候选。

### 字段与来源

`ref`、`title`、`subtitle`、`sizeLabel`、`licenseName`、`lastUpdated`、`fieldsKnown`、
`blockedReason`、`note`，来源同配方一。

### 布局

`kind="chart"` 或 `kind="dashboard"` 均可（无 Chart.js 调用，二者在本例中等价）。
一张卡片，标题为数据集名，正文用 2–3 行列出规模、许可、更新时间与翻车点，底部一个
`进入下载与体检` 动作。

### 交互与回退

唯一 sendPrompt 是 `adopt-candidate`。文本回退就是那 2–3 行，不加表格。
