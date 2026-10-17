# kaggle-workbench

A MiniMax Code local Plugin for the Kaggle platform: find datasets, evaluate them honestly,
download and profile them, then develop and submit a notebook.

Everything runs locally. No credentials are stored in this repository.

---

## What it does

| Capability | Contents |
| --- | --- |
| MCP server (`kaggle-server`) | 6 tools over Kaggle's REST API and the official CLI, zero npm dependencies |
| `kaggle-discovery` | Search, vet and shortlist candidate datasets |
| `kaggle-dev` | Download, profile, develop reproducibly, prepare a submission |
| `kaggle-discovery-visualizer` | Turn the shortlist comparison into an interactive dashboard |
| Subagents | `dataset-scout` (parallel shortlisting), `kernel-reviewer` (pre-submission review) |
| Hook | `SessionStart` briefing that states the real environment state |

## Install

Copy the package directory into your MiniMax data dir so it lands at
`<data-dir>/plugins/kaggle-workbench/`, keeping the `.minimax-plugin/` folder:

```bash
cp -r kaggle-workbench ~/.minimax/plugins/kaggle-workbench
```

MiniMax Code rescans local plugins automatically. Verify it loaded with the
`kaggle_status` MCP tool.

## Tool reference

| Tool | Sign-in needed | Notes |
| --- | --- | --- |
| `kaggle_status` | no | Reports what works right now and the single next onboarding step |
| `kaggle_search_datasets` | no | `sortBy`: `relevance` \| `hottest` \| `active` \| `updated` |
| `kaggle_dataset_view` | no | Metadata plus the real file manifest |
| `kaggle_dataset_download` | no | Public datasets only; destination stays inside the workspace |
| `kaggle_search_kernels` | **yes** | REST when env credentials exist, otherwise the signed-in CLI |
| `kaggle_list_competitions` | **yes** | Same dual transport |

Sign-in reality, verified against the live API:

- `www.kaggle.com/api/v1/datasets/*` is fully public. No sign-in at all.
- `www.kaggle.com/api/v1/kernels/list` and `/competitions/list` return 401 regardless of
  User-Agent.
- **Every official CLI command requires sign-in**, including read-only listings.

## Getting authenticated

Run these yourself — step 2 opens a browser, so it cannot be automated:

```bash
pip install kaggle          # only if the CLI is not installed
python -m kaggle auth login # stores the OAuth session in ~/.kaggle/credentials.json
```

`kaggle_status` reports `onboarding.step` with exactly which of these you still need.

The optional alternative is `KAGGLE_USERNAME` + `KAGGLE_KEY` environment variables, which
use the REST path and expose more fields. It is not required.

## Verified constraints

These were established by probing the live API, not assumed:

- Search returns exactly 20 results per page; `pageSize` is ignored. Page with `page`.
- `sortBy` accepts only the four values above. `vote` and `downloads` return HTTP 400.
- Dataset identifiers are `owner/slug`, not numeric ids.
- The REST API returns protobuf-flattened objects with `*Nullable` and `has*` duplicates;
  the server strips them.
- The Kaggle CLI writes to a pipe using the Windows locale codepage and crashes on
  non-ASCII titles. The server injects `PYTHONIOENCODING=utf-8` for that reason.
- The CLI uses `\r\r\n` as a line separator in CSV output.

## Write operations

Version creation, kernel push and competition submit are never proxied by the MCP server.
Run them yourself with the official CLI, and confirm with the user first — they are
externally visible.

```bash
kaggle kernels push -p ./notebook-dir
kaggle kernels status <owner>/<kernel-slug>
kaggle datasets version -p ./data-dir -m "description"
kaggle competitions submit -c <competition-slug> -f ./submission.csv -m "notes"
```

## Not included in this repository

`skills/kaggle-discovery-visualizer/references/genui-widget/` is **deliberately absent**.
Those 5 files are verbatim copies from the MiniMax built-in `plugin-creator` skill and are
third-party content, so they are not redistributed here. The skill cannot produce compliant
widgets without them; restore them from your local installation before using it. Provenance
is recorded in `genui.json` (`forkedFrom`, `sourceDigest`).

## Privacy

This package contains no credentials, tokens, or local filesystem paths. It reads
`~/.kaggle/credentials.json` at runtime only to report whether a sign-in exists — it never
copies, logs, or transmits any credential value.

## License

No license file is included yet. Without one, the default is all rights reserved.
Add a LICENSE before treating this as reusable.
