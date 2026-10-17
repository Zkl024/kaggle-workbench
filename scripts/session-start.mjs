#!/usr/bin/env node
/**
 * SessionStart hook — injects a short Kaggle Workbench briefing into a new session.
 *
 * Constraints this script is written against:
 *   - must stay well inside the 5 s handler timeout and the 15 s event budget;
 *   - performs no network I/O, so it is deterministic and cheap;
 *   - fails open: any error produces no stdout and exit code 0;
 *   - never prints credential values, only whether they are configured.
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

const CLI_PROBE_TIMEOUT_MS = 2000;
const MAX_CONTEXT_CHARS = 4000;

function kaggleCliInstalled() {
  try {
    const result = spawnSync('kaggle', ['--version'], {
      encoding: 'utf8',
      timeout: CLI_PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

/** Kaggle CLI 2.x keeps its OAuth session in ~/.kaggle/credentials.json. */
function kaggleCliLoggedIn() {
  const kaggleDir = path.join(homedir(), '.kaggle');
  try {
    if (existsSync(path.join(kaggleDir, 'credentials.json'))) {
      const data = JSON.parse(readFileSync(path.join(kaggleDir, 'credentials.json'), 'utf8'));
      return Boolean(data.refresh_token);
    }
  } catch {
    // fall through to the legacy check
  }
  try {
    if (existsSync(path.join(kaggleDir, 'kaggle.json'))) {
      const data = JSON.parse(readFileSync(path.join(kaggleDir, 'kaggle.json'), 'utf8'));
      return Boolean(data.username && data.key);
    }
  } catch {
    return false;
  }
  return false;
}

function buildContext() {
  const hasCredentials = Boolean(process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY);
  const cliInstalled = kaggleCliInstalled();
  const cliLoggedIn = cliInstalled && kaggleCliLoggedIn();

  let setupLine;
  if (!cliInstalled) {
    setupLine =
      '- 官方 `kaggle` CLI：**未安装**。先让用户自己执行 `pip install kaggle`，装完再执行 ' +
      '`python -m kaggle auth login` 登录（会拉起浏览器，不能代替用户做）。';
  } else if (!cliLoggedIn) {
    setupLine =
      '- 官方 `kaggle` CLI：**已安装但未登录**。CLI 的任何命令（包括只读列表）都要求登录，' +
      '请让用户自己执行 `python -m kaggle auth login`。';
  } else {
    setupLine =
      '- 官方 `kaggle` CLI：**已安装并已登录**（会话在 `~/.kaggle/credentials.json`）。' +
      '`kaggle kernels push`、`kaggle competitions submit` 等写操作可执行。';
  }

  const lines = [
    'Kaggle Workbench 已启用，涉及 Kaggle 的任务按下面的分工执行：',
    '',
    '**流程分工**',
    '- 找数据、比较候选、查竞赛与公开 Notebook → `kaggle-discovery` 技能。',
    '- 下载数据、数据体检、Notebook 开发、提交准备 → `kaggle-dev` 技能。',
    '',
    '**MCP 工具（kaggle-server）**',
    '- 完全免登录（公开 REST API）：`kaggle_status`、`kaggle_search_datasets`、' +
      '`kaggle_dataset_view`、`kaggle_dataset_download`。',
    '- 需要登录（二选一）：`kaggle_search_kernels`、`kaggle_list_competitions`。' +
      '环境变量 `KAGGLE_USERNAME` + `KAGGLE_KEY` 走 REST（字段更全），' +
      '或已登录的官方 CLI 走 `kaggle <cmd> --csv`（字段更少）。返回里的 `via` 标明走哪条路。',
    '- 数据集标识符是 `owner/slug`；检索每页固定 20 条；`sortBy` 仅接受 relevance / hottest / active / updated。',
    '',
    '**当前环境**',
    setupLine,
    hasCredentials
      ? '- 环境变量凭证：已设置（可选路径，REST 用）。不要打印或复述其值。'
      : '- 环境变量凭证：未设置。这是可选路径，不影响已登录 CLI 的使用。',
    '',
    '**可委派的子代理**（用 task 工具，`agent_name` 填 scoped 名）',
    '- `kaggle-workbench:dataset-scout` — 并行检索并对比多个数据集候选。',
    '- `kaggle-workbench:kernel-reviewer` — 提交前审查 Notebook 的可复现性、泄漏与 submission 格式。',
    '',
    '注意：安装与登录都要让用户自己执行（会拉起浏览器）；提交、推送、创建版本是外部可见的' +
      '写操作，执行前必须让用户明确确认。',
  ];

  let context = lines.join('\n');
  if (context.length > MAX_CONTEXT_CHARS) {
    context = `${context.slice(0, MAX_CONTEXT_CHARS)}\n（上下文已截断）`;
  }
  return context;
}

function readStdin() {
  return new Promise((resolve) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      // A SessionStart payload is tiny; stop growing well past any plausible size.
      if (buffer.length > 1024 * 1024) process.stdin.pause();
    });
    process.stdin.on('end', () => resolve(buffer));
    process.stdin.on('error', () => resolve(buffer));
  });
}

async function main() {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = JSON.parse(raw) ?? {};
  } catch {
    // An unparsable payload is not a reason to fail the session.
    payload = {};
  }

  // SessionStart reports `source` (startup / resume / clear / compact / fork). It is read
  // only to confirm the payload arrived; the briefing is the same for every source.
  if (typeof payload.source !== 'string') payload.source = 'unknown';

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: buildContext(),
      },
    })}\n`
  );
}

main().catch(() => {
  process.exitCode = 0;
});
