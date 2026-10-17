---
name: kaggle-dev
description: 把 Kaggle 数据集取到本地并完成分析、EDA 或 Notebook 开发，包括下载解压、字段与缺失值体检、可复现性规范，以及比赛提交与 kernel 推送准备。当用户要下载 Kaggle 数据、检查数据质量、做探索性分析、写训练与预测 Notebook、准备比赛提交文件或推送 kernel 时使用。
---

# Kaggle 数据落地与开发

发现阶段选定数据集后，用本 Skill 把它变成可复现的分析或提交物。核心是：**每个结论都要能被别人重跑出来。**

## 工具与前提（已实测）

- `kaggle_status` — 落地前必跑，看 `kaggleCli.installed` 与 `kaggleCli.loggedIn`。
- `kaggle_dataset_download` — 公开数据集**免登录**可用。默认落到工作区的 `./kaggle-data`，`destDir` **必须留在工作区内**，越界会被拒绝。
- `kaggle_dataset_view` — 下载前看文件清单和体积。

### 写操作的官方前置（按顺序引导，不要跳步）

| 现状 | 让用户自己执行 |
| --- | --- |
| 没有 `kaggle` CLI | `pip install kaggle` |
| 装了但没登录 | `python -m kaggle auth login` |

`python -m kaggle auth login` 会**拉起浏览器**走 OAuth，会话写入 `~/.kaggle/credentials.json`。
所以这一步必须由用户自己执行——不要替他跑，也不要让他把 token 贴到对话里。
先跑 `kaggle_status` 确认状态，再决定要给哪一条命令，**不要一次把两条都甩给他**。

写操作（建版本、推送 kernel、正式提交）一律走官方 CLI：

```powershell
# 推送 kernel / Notebook
kaggle kernels push -p .\notebook-dir

# 查询提交状态
kaggle kernels status <owner>/<kernel-slug>

# 创建数据集版本
kaggle datasets version -p .\data-dir -m "description"

# 正式提交竞赛（submit.csv 路径按实际改）
kaggle competitions submit -c <competition-slug> -f .\submission.csv -m "notes"
```

这些是**外部可见的写操作**。执行前必须让用户明确确认，包括 competition slug、文件名和提交说明，不要代替用户按下按钮。

### 1. 环境自检

```
kaggle_status
```

读 `kaggleCli.installed` 与 `kaggleCli.loggedIn`，以及 `toolsUnavailable`。
若本次任务包含提交或推送，而 `loggedIn` 为 false，现在就把 `python -m kaggle auth login`
告诉用户——别等写完 Notebook 才发现交不了。

### 2. 下载前先看清单

```
kaggle_dataset_view { "ref": "owner/slug" }
```

看 `fileCount`、`sizeLabel`、`files[].name`。几百 MB 以上先跟用户确认再下。

### 3. 下载与解压

```
kaggle_dataset_download { "ref": "owner/slug", "destDir": "kaggle-data" }
```

返回的 `savedTo` 是工作区相对路径。解压时注意：

- 保留原始目录结构，Notebook 里的路径要和它对得上；
- 不要在原文件上改，派生副本另存；
- CSV 超过约 1 GB 就别硬读 pandas，换 polars / dask 或直接采样。

### 4. 数据体检

这一步决定后面所有分析的可信度，别跳过。用 pandas 或 polars 实际跑一遍，至少产出：

- **形状与字段**：行数、列数、每列 dtype；
- **缺失**：每列缺失率，`describe` 的等统计；全缺失列和常量列直接标出来；
- **重复**：整行重复数、主键或业务键上的重复数；
- **目标变量分布**：类别分布与类别比，或分位数和偏度；
- **异常值**：数值列的 min/max 与分位数是否自洽；
- **时间列**：起止范围，是否有未来数据泄漏风险。

产出一段可复跑的体检脚本 + 一段结论。**结论里要写清哪些字段可以直接用、哪些需要清洗、哪些建议丢弃。**

### 5. Notebook 可复现性规范

每一条都会直接影响 Kaggle 上的运行结果，提交前逐条自查：

- **随机种子**：NumPy、random、`PYTHONHASHSEED`、`torch.manual_seed` 全部固定，并写明用了哪个种子值；
- **路径**：用相对路径或 `/kaggle/input/`、`/kaggle/working/`，不要出现本机绝对路径；
- **依赖**：关键库写版本（`pandas==2.2.2` 这种），GPU 相关设置显式声明，别依赖默认；
- **单元顺序自洽**：从干净内核"Restart & Run All"能跑通，中间不依赖上一个会话的变量；
- **内存**：对大表做显式 dtype 转换（`category`、`int32`），避免无谓的 OOM；
- **产物落盘**：submission 等输出写到 `/kaggle/working/`，并确认文件名与竞赛要求完全一致（含大小写和扩展名）。

### 6. 提交准备

`kaggle_status` 显示 CLI 已装时，用官方 CLI：

```powershell
# 推送 kernel / Notebook
kaggle kernels push -p .\notebook-dir

# 查询提交状态
kaggle kernels status <owner>/<kernel-slug>

# 创建数据集版本
kaggle datasets version -p .\data-dir -m "description"

# 正式提交竞赛（submit.csv 路径按实际改）
kaggle competitions submit -c <competition-slug> -f .\submission.csv -m "notes"
```

这些是**外部可见的写操作**。执行前必须让用户明确确认，包括 competition slug、文件名和提交说明，不要代替用户按下按钮。

提交后用 `kaggle kernels status` 轮询，并把版本号或提交 id 回报给用户。

## 需要并行时派子代理

- `agent_name: "kaggle-workbench:kernel-reviewer"` — 提交前独立审查 Notebook。用它代替自己自查，因为它的上下文里看不到你刚才的取舍。
- `agent_name: "kaggle-workbench:dataset-scout"` — 体检中发现字段不够用，需要横向再找替代数据集时。

## 反模式

- 跳过体检直接建模 — 缺失值和重复行会让所有后续结论失效。
- 在 Notebook 里写本机绝对路径 — Kaggle 上必然 FileNotFoundError。
- 只在最后一步才想起 submission 文件名 — 名字不对等于白跑一整轮。
- 把 `kaggle competitions submit` 当成普通命令随手执行 — 这是不可撤销的外部提交。
- 声称"已提交成功"却没跑 `kaggle kernels status` 确认 — 提交可能失败或仍在排队。
