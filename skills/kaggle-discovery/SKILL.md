---
name: kaggle-discovery
description: 在 Kaggle 上发现、筛选和评估数据集、公开 Notebook（kernel）与竞赛。当用户要找适合某个分析或建模目标的数据集、比较多个候选数据集的质量与许可、判断某个 Kaggle 数据集能不能用、查公开竞赛的截止时间与奖励，或找可参考的公开 Notebook 时使用。
---

# Kaggle 发现与选型

用 `kaggle-server` 的 MCP 工具把"找数据"从碰运气变成有依据的选型。核心是：**不要凭标题和点赞数下结论，必须拉文件清单核对。**

## 工具与约束（已实测）

| 工具 | 免登录可用 | 说明 |
| --- | --- | --- |
| `kaggle_status` | 是 | 先跑这个，确认 CLI 安装、登录与实际解锁的工具 |
| `kaggle_search_datasets` | 是 | 关键词检索，`sortBy` 仅接受 `relevance` / `hottest` / `active` / `updated` |
| `kaggle_dataset_view` | 是 | 元数据 + 真实文件清单 |
| `kaggle_dataset_download` | 是 | 公开数据集直接下载 zip |
| `kaggle_search_kernels` | 否 | 需要登录；REST 或已登录 CLI 二选一 |
| `kaggle_list_competitions` | 否 | 同上 |

**登录路径（官方流程，不要自创）**：

| 现状 | 让用户执行的命令 |
| --- | --- |
| CLI 未安装 | `pip install kaggle` → 然后 `python -m kaggle auth login` |
| CLI 已装但未登录 | `python -m kaggle auth login` |
| 已登录 | 无需操作 |

`python -m kaggle auth login` 会拉起浏览器走 OAuth，会话写入 `~/.kaggle/credentials.json`。
**这一步永远让用户自己跑**，不要代替用户执行，也不要让用户把 token 贴进对话。

可选替代路径：设置 `KAGGLE_USERNAME` + `KAGGLE_KEY` 环境变量走鉴权 REST，字段更全。
这是可选项，不是必需项——官方推荐路径是上面的 CLI + 登录。

已验证的硬约束，不要凭直觉假设：

- 公开 REST 的 `/datasets/list`、`/datasets/view`、`/datasets/download` **完全免登录**。
- 公开 REST 的 `/kernels/list`、`/competitions/list` **必须鉴权**（401，与 User-Agent 无关）。
- **官方 CLI 的任何命令都需要登录**——包括 `datasets list` 这种只读列表。
  未登录时一律报 `Authentication required to call the Kaggle API.`
- REST 优先、已登录 CLI 回退。返回里的 `via` 字段标明实际走的是哪条路。
- CLI 回退的字段比 REST 少：`kernels` 没有 `language` / `kernelType`，
  `competitions` 的 `reward` 是展示字符串而不是独立字段。**不要**在回退结果上编造缺失字段。
- 检索结果**每页固定 20 条**，Kaggle API 忽略 `pageSize` 参数。用 `page` 翻页。
- `sortBy` 的合法值就是上面四个；传 `vote` / `downloads` 会直接返回 HTTP 400。
- 数据集标识符是 `owner/slug`，例如 `heptapod/titanic`。不是纯数字 id。
- 响应里大量 `*Nullable` 和 `has*` 字段是 protobuf 序列化产物，server 已经剥掉，直接用干净的 `ref` / `totalBytes` / `voteCount`。

## 流程

### 1. 先把需求问窄

检索词的质量上限由需求清晰度决定。开工前确认（能自己推断的就别问）：

- 要预测或解释的目标是什么，粒度多细；
- 标签/时间范围/样本量要求；
- 是否有时间限制、内存上限、是否只能用 CPU；
- 竞赛场景下，外部数据是否被允许。

### 2. 多角度检索，至少三种排序

同一个关键词在不同 `sortBy` 下反映完全不同的生态面貌，各跑一遍：

- `relevance` — 语义最相关，命中率最高；
- `hottest` — 下载量最大，最多人验证过；
- `active` — 近期仍在被使用，通常维护较好；
- `updated` — 刚更新过，适合时效性强的数据。

`updated` 尤其重要：一个三年前更新的数据集和一个上周更新的数据集，时效性完全不同。

### 3. 拉详情核对，不要只看检索摘要

对进入候选名单的每个数据集调用 `kaggle_dataset_view`，重点核对：

- **文件清单**：真实文件名、格式、单个文件大小。检索摘要里的 `totalBytes` 是压缩后总量。
- **列信息**：`files[].columns` 给出列名与类型。很多 CSV 不带列元数据，此时 `columns` 为 `null`，说明必须下载后才能知道字段。
- **版本数与最后更新时间**：`versionCount` 和 `lastUpdated` 判断它是否还活着。
- **许可**：`licenseName` 直接决定能不能商用或进产品，这是硬约束，不能事后再说。
- **规模**：`sizeLabel` 是人话可读大小。超过几百 MB 的先想清楚本地放不放得下。

### 4. 打分对比

对 3–6 个候选，用同一套标准横向比较，输出对比表。至少包含：

| 维度 | 怎么看 |
| --- | --- |
| 字段契合度 | 目标变量是否在、特征是否够、时间字段是否可用 |
| 样本量与均衡 | 总量、类别分布、正负样本比 |
| 缺失与脏数据 | 从 `description` 找线索，必要时下载抽样验证 |
| 更新与维护 | `lastUpdated`、`versionCount` |
| 许可合规 | `licenseName` 能否满足用途 |
| 规模与成本 | `sizeLabel`、下载与解析耗时 |

### 5. 需要交叉验证时派子代理

候选多于 4 个、或者需要逐个拉详情再比对时，用 `task` 工具委派：

- `agent_name: "kaggle-workbench:dataset-scout"` — 并行检索多个候选并返回结构化对比。
- `agent_name: "kaggle-workbench:kernel-reviewer"` — 审查已写好的 Notebook 是否满足竞赛提交要求。

子代理看不到当前会话，**必须把完整的检索关键词、目标定义和评价标准写进 prompt**，否则它只能靠猜。

## 交付

发现阶段的结论应该是可执行的，不要只丢一堆链接：

1. 首选数据集的 `ref`、规模、许可、更新时间和下载路径；
2. 备选及其取舍理由；
3. 明确的下一步动作（通常是转入 `kaggle-dev` 下载并做结构检查）。

### 可选：把对比结果渲染成看板

本技能**默认输出文本结论，不依赖任何可视化**。只有当用户明确要"看板 / 面板 / 对比图 /
可视化看看"，或者候选数 ≥ 4 且正在做选型决策时，才在产出结论之后追加可视化。

触发时加载运行时限定名 `kaggle-workbench:kaggle-discovery-visualizer`（裸目录名
`kaggle-discovery-visualizer`），并把本步骤产出的对比结果按它的
`references/data-schema.json` 形状交给它渲染。Visualizer 只转换已有结果，
不会重新发起 Kaggle 调用，也不会补齐缺失字段——核对工作仍然全部在这里完成。

## 反模式

- 只按 `voteCount` 排序就下结论 — 点赞是人气不是质量，且老数据集天然占优。
- 跳过 `kaggle_dataset_view` 直接下载 — 大文件白下载，还可能下到错的版本。
- 编造列名 — 没见过真实文件就不要写"该数据集包含 feature_x 字段"。
- 承诺竞赛剩余时间 — `kaggle_list_competitions` 的 deadline 是 UTC，换算成用户时区并说明基准时间。
