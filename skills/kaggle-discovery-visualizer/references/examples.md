# 渲染示例

以下示例是一个完整、有效的 `mavis.widget.v1` 输出，形状严格符合
[references/data-schema.json](references/data-schema.json)，渲染方式对应
[references/components.md](references/components.md) 的配方一 + 配方二。

**候选数为 4（≤5），因此使用 CSS bench 条，不调用 `new Chart(...)`** —— 这与基础规范
"5 个及以下数据点不要用 Chart.js" 的规则一致。候选数达到 6 且只比较单一归一化指标时，
才改用 Chart.js 横向条形图。

**关于数值**：示例中的 `ref` 来自真实 Kaggle API 返回。数值除 `heptapod/titanic` 一行标注为
实测外，其余为符合 schema 量纲的示意值，用于说明形状与渲染；真实运行时全部由 MCP 工具返回，
Visualizer 不得自行补齐。

## 完整示例

<mavis-widget
  version="mavis.widget.v1"
  kind="dashboard"
  title="Kaggle 候选数据集对比"
  height="620"
  min-height="440"
  max-height="900"
  streaming="html-first"
  capabilities="resize,sendPrompt"
  theme="app"
  token-set="mavis.semantic.v1">
  <mavis-meta type="json">{"summary":"4 个候选数据集在规模、社区验证度、可用性评分与许可上的取舍对比；首选 andrewmvd/heart-failure-clinical-data，许可与时效均已核对。","dataSource":"kaggle-discovery 技能产出，经 kaggle_search_datasets 检索并逐个 kaggle_dataset_view 核对","chartType":"table","conversationLanguage":"zh","datasetShape":{"rows":4,"dimensions":["ref","licenseName","lastUpdated"],"measures":["totalBytes","usabilityRating","downloadCount","kernelCount"]},"interactions":[{"id":"adopt-candidate","label":"下载该候选并做数据体检","capability":"sendPrompt"},{"id":"deep-dive-candidate","label":"继续核对该候选的字段与许可","capability":"sendPrompt"}]}</mavis-meta>

  <mavis-style>
body{margin:0;padding:16px;background:var(--mw-bg);color:var(--mw-text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5}
.head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px}
.title{font-size:16px;font-weight:700}
.muted{font-size:12px;color:var(--mw-text-muted)}
.note{font-size:12px;color:var(--mw-text-subtle);margin:0 0 12px}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.kpi{background:var(--mw-surface);border:1px solid var(--mw-border);border-radius:10px;padding:12px}
.kpi-label{font-size:12px;color:var(--mw-text-muted);margin-bottom:4px}
.kpi-value{font-size:22px;font-weight:700;color:var(--mw-text);font-variant-numeric:tabular-nums}
.kpi-value.warn{color:var(--mw-warning)}
.toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.sort-btn{padding:5px 10px;border-radius:8px;border:1px solid var(--mw-border);background:var(--mw-surface);color:var(--mw-text-muted);font-size:12px;cursor:pointer;font-family:inherit}
.sort-btn:hover{background:var(--mw-surface-muted)}
.sort-btn:focus-visible{outline:2px solid var(--mw-accent);outline-offset:2px}
.sort-btn.on{border-color:var(--mw-accent);color:var(--mw-accent)}
table{width:100%;border-collapse:collapse}
th{padding:8px 10px;text-align:left;font-size:12px;font-weight:500;color:var(--mw-text-muted);background:var(--mw-surface-muted);border-bottom:1px solid var(--mw-border)}
th.num{text-align:right}
td{padding:9px 10px;border-bottom:1px solid var(--mw-border);font-size:13px;vertical-align:middle}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tbody tr{cursor:pointer}
tbody tr:hover{background:var(--mw-surface-muted)}
tbody tr.sel{background:var(--mw-surface-muted)}
tbody tr.sel td:first-child{box-shadow:inset 2px 0 0 var(--mw-accent)}
tbody tr:focus-visible{outline:2px solid var(--mw-accent);outline-offset:-2px}
.ds-title{font-weight:500}
.ds-ref{font-size:12px;color:var(--mw-text-subtle)}
.bench{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.track{width:70px;height:8px;background:var(--mw-surface-muted);border-radius:4px;overflow:hidden}
.fill{height:100%;background:var(--mw-accent);border-radius:4px}
.bval{min-width:44px;text-align:right;font-variant-numeric:tabular-nums}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}
.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--mw-border);border-radius:8px;padding:4px 10px;font-size:12px;color:var(--mw-text-muted)}
.chip.warn{color:var(--mw-warning);border-color:var(--mw-warning)}
.detail{margin-top:14px;background:var(--mw-surface);border:1px solid var(--mw-border);border-radius:10px;padding:12px}
.detail h3{margin:0 0 6px;font-size:14px;font-weight:500}
.detail dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0;font-size:13px}
.detail dt{color:var(--mw-text-muted)}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--mw-border)}
.action-btn{padding:7px 13px;border-radius:8px;border:1px solid var(--mw-border);background:var(--mw-surface);color:var(--mw-text);font-size:12px;cursor:pointer;font-family:inherit}
.action-btn:hover{background:var(--mw-surface-muted)}
.action-btn:focus-visible{outline:2px solid var(--mw-accent);outline-offset:2px}
.action-btn.primary{border-color:var(--mw-accent);color:var(--mw-accent)}
  </mavis-style>

  <mavis-html>
    <div class="head">
      <span class="title">Kaggle 候选数据集对比</span>
      <span class="muted">检索 “health failure” · 排序 updated · 已逐个核对</span>
    </div>
    <p class="note">为一个小规模分类原型挑数据集，同时纳入两个成熟基线做参照。许可与更新时间为硬约束，点赞与内核数仅供参考。</p>

    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-label">候选数据集</div>
        <div class="kpi-value">4</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">最大规模</div>
        <div class="kpi-value">2.4 MB</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">最高可用性</div>
        <div class="kpi-value">0.73</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">许可待确认</div>
        <div class="kpi-value warn">1</div>
      </div>
    </div>

    <div class="toolbar">
      <span class="muted">排序</span>
      <button class="sort-btn on" data-sort="rank">推荐顺序</button>
      <button class="sort-btn" data-sort="size">规模</button>
      <button class="sort-btn" data-sort="download">下载量</button>
      <button class="sort-btn" data-sort="usability">可用性</button>
      <button class="sort-btn" data-sort="updated">更新时间</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>数据集</th>
          <th class="num">规模</th>
          <th class="num">可用性</th>
          <th class="num">下载量</th>
          <th class="num">公开内核</th>
          <th>许可</th>
          <th>更新时间</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>

    <div class="chips" id="chips"></div>

    <div class="detail" id="detail">
      <h3>选中一个候选以查看细节</h3>
      <p class="muted" style="margin:0">点击表格任意一行，这里会显示它的落地风险与来源。</p>
    </div>

    <div class="actions">
      <button class="action-btn primary" id="adopt">下载该候选并做数据体检</button>
      <button class="action-btn" id="deep">继续核对该候选的字段与许可</button>
    </div>
  </mavis-html>

  <mavis-data name="main" type="json">{"query":{"search":"health failure","sortBy":"updated","page":1,"intent":"为一个小规模分类原型挑数据集"},"generatedFrom":{"tools":["kaggle_search_datasets","kaggle_dataset_view"],"fieldsVerified":true,"verifiedAt":"2026-10-17T18:45:00Z","credentialsConfigured":false},"candidates":[{"ref":"andrewmvd/heart-failure-clinical-data","title":"Heart Failure Clinical Data","subtitle":"致命心力衰竭的临床预测记录","owner":"andrewmvd","totalBytes":303645,"sizeLabel":"296.5 KB","downloadCount":218743,"voteCount":1580,"kernelCount":2140,"usabilityRating":0.688,"licenseName":"CC0 1.0 Universal (Public Domain Dedication)","lastUpdated":"2023-11-02T00:00:00Z","versionCount":4,"fileCount":2,"fieldsKnown":true,"blockedReason":null,"note":"字段干净、类别均衡，是这几个里最贴近预测目标的；但只有 299 行，样本量偏小，适合做原型不适合做最终模型。","provenance":{"tool":"kaggle_dataset_view","detailLevel":"full"}},{"ref":"colabsss/smart-healthcare-multimodal-patient-dataset","title":"Smart Healthcare Multimodal Patient Dataset","subtitle":"多模态患者健康记录","owner":"colabsss","totalBytes":2516582,"sizeLabel":"2.4 MB","downloadCount":96412,"voteCount":612,"kernelCount":1846,"usabilityRating":0.702,"licenseName":"Database: Open Database, Contents: Database Contents","lastUpdated":"2024-02-18T00:00:00Z","versionCount":2,"fileCount":4,"fieldsKnown":true,"blockedReason":"licence-restricted","note":"规模与时效都最好，但许可条款明确限制再分发，做商用原型前必须先确认授权范围。","provenance":{"tool":"kaggle_dataset_view","detailLevel":"full"}},{"ref":"uciml/iris","title":"Iris","subtitle":"经典三分类基准集","owner":"uciml","totalBytes":4096,"sizeLabel":"4 KB","downloadCount":1043276,"voteCount":6421,"kernelCount":5980,"usabilityRating":0.734,"lastUpdated":"2016-06-22T00:00:00Z","versionCount":2,"fileCount":1,"fieldsKnown":true,"blockedReason":"licence-unknown","note":"社区验证度最高、许可最干净，但只有 150 行且距今十年，只适合当基线而不适合作为目标数据。","provenance":{"tool":"kaggle_dataset_view","detailLevel":"full"}},{"ref":"heptapod/titanic","title":"Titanic","subtitle":"适合二分类逻辑回归的入门集","owner":"heptapod","totalBytes":11090,"sizeLabel":"10.8 KB","downloadCount":171232,"voteCount":2168,"kernelCount":620,"usabilityRating":0.706,"licenseName":"Database: Open Database, Contents: Database Contents","lastUpdated":"2017-05-16T08:14:22.21Z","versionCount":1,"fileCount":1,"fieldsKnown":true,"blockedReason":null,"note":"实测数据：许可干净、体积小，适合把整条分析链路先跑通一遍，再换到目标数据集。","provenance":{"tool":"kaggle_dataset_view","detailLevel":"full"}}]}</mavis-data>

  <mavis-script>
(function () {
  var payload = window.__mavisData['main'];
  var rows = payload.candidates;
  var q = payload.query;
  var tbody = document.getElementById('rows');
  var chipBox = document.getElementById('chips');
  var detail = document.getElementById('detail');
  var adopt = document.getElementById('adopt');
  var deep = document.getElementById('deep');
  var current = null;
  var sortKey = 'rank';

  var nf = new Intl.NumberFormat('zh-CN');

  function colMax(key) {
    return rows.reduce(function (m, r) {
      var v = r[key];
      return (typeof v === 'number' && v > m) ? v : m;
    }, 0);
  }

  function bench(value, max, digits) {
    if (typeof value !== 'number') {
      return '<div class="bench"><span class="track"><span class="fill" style="width:0%"></span></span><span class="bval">未核对</span></div>';
    }
    var pct = max > 0 ? Math.round((value / max) * 100) : 0;
    var text = digits === 1 ? value.toFixed(1) : nf.format(value);
    return '<div class="bench"><span class="track"><span class="fill" style="width:' + pct + '%"></span></span><span class="bval">' + text + '</span></div>';
  }

  function shortDate(iso) {
    if (!iso) return '—';
    return String(iso).slice(0, 10);
  }

  var maxDl = colMax('downloadCount');
  var maxKb = colMax('kernelCount');

  var sorters = {
    rank: function (a, b) { return 0; },
    size: function (a, b) { return (b.totalBytes || -1) - (a.totalBytes || -1); },
    download: function (a, b) { return (b.downloadCount || -1) - (a.downloadCount || -1); },
    usability: function (a, b) { return (b.usabilityRating || -1) - (a.usabilityRating || -1); },
    updated: function (a, b) { return String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || '')); }
  };

  function render() {
    var ordered = rows.slice().sort(sorters[sortKey] || sorters.rank);
    tbody.innerHTML = ordered.map(function (r) {
      return '<tr tabindex="0" data-ref="' + r.ref + '" class="' + (current === r.ref ? 'sel' : '') + '">' +
        '<td><div class="ds-title">' + (r.title || r.ref) + '</div><div class="ds-ref">' + r.ref + '</div></td>' +
        '<td class="num">' + (r.sizeLabel || '未知') + '</td>' +
        '<td class="num">' + bench(r.usabilityRating, 1, 2) + '</td>' +
        '<td class="num">' + bench(r.downloadCount, maxDl, 0) + '</td>' +
        '<td class="num">' + bench(r.kernelCount, maxKb, 0) + '</td>' +
        '<td>' + (r.licenseName ? '已核对' : '未知') + '</td>' +
        '<td>' + shortDate(r.lastUpdated) + '</td>' +
        '</tr>';
    }).join('');

    Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr) {
      var ref = tr.getAttribute('data-ref');
      tr.addEventListener('click', function () { select(ref); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(ref); }
      });
    });
  }

  var reasonText = {
    'licence-unknown': '许可未核对到，商用前需确认',
    'licence-restricted': '许可限制再分发，商用前必须确认授权',
    'fields-unknown': '字段未核对，需下载后确认',
    'stale': '时效偏旧，可能已不适配当前需求',
    'private': '私有数据集，无公开访问权限'
  };

  function renderChips() {
    var risky = rows.filter(function (r) { return r.blockedReason; });
    if (!risky.length) { chipBox.innerHTML = ''; return; }
    chipBox.innerHTML = risky.map(function (r) {
      return '<span class="chip warn" data-ref="' + r.ref + '">' + r.ref + ' · ' + reasonText[r.blockedReason] + '</span>';
    }).join('');
    Array.prototype.forEach.call(chipBox.querySelectorAll('.chip'), function (c) {
      c.style.cursor = 'pointer';
      c.addEventListener('click', function () { select(c.getAttribute('data-ref')); });
    });
  }

  function find(ref) {
    for (var i = 0; i < rows.length; i++) { if (rows[i].ref === ref) return rows[i]; }
    return null;
  }

  function select(ref) {
    current = ref;
    var r = find(ref);
    if (!r) return;
    detail.innerHTML = '<h3>' + (r.title || r.ref) + '</h3><dl>' +
      '<dt>标识符</dt><dd>' + r.ref + '</dd>' +
      '<dt>规模</dt><dd>' + (r.sizeLabel || '未知') + '</dd>' +
      '<dt>许可</dt><dd>' + (r.licenseName || '未知，需人工确认') + '</dd>' +
      '<dt>更新时间</dt><dd>' + shortDate(r.lastUpdated) + ' · 第 ' + (r.versionCount || '?') + ' 版</dd>' +
      '<dt>字段</dt><dd>' + (r.fieldsKnown ? '已核对' : '未核对，需下载后确认') + '</dd>' +
      '<dt>落地风险</dt><dd>' + (r.blockedReason ? reasonText[r.blockedReason] : '未发现阻断项') + '</dd>' +
      '<dt>来源</dt><dd>' + r.provenance.tool + '（' + (r.provenance.detailLevel === 'full' ? '已核对详情' : '仅摘要') + '）</dd>' +
      '</dl><p style="margin:8px 0 0;font-size:13px;color:var(--mw-text-muted)">' + (r.note || '') + '</p>';
    render();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.sort-btn'), function (btn) {
    btn.addEventListener('click', function () {
      sortKey = btn.getAttribute('data-sort');
      Array.prototype.forEach.call(document.querySelectorAll('.sort-btn'), function (b) {
        b.classList.toggle('on', b === btn);
      });
      render();
    });
  });

  function payloadFor(r) {
    return {
      ref: r.ref,
      title: r.title,
      sizeLabel: r.sizeLabel,
      usabilityRating: r.usabilityRating,
      downloadCount: r.downloadCount,
      licenseName: r.licenseName,
      blockedReason: r.blockedReason,
      provenance: r.provenance
    };
  }

  function base(action, data, intent) {
    return {
      widgetTitle: 'Kaggle 候选数据集对比',
      action: action,
      selectedData: data,
      visibleFilters: { search: q.search, sortBy: q.sortBy, sort: sortKey },
      userIntent: intent
    };
  }

  adopt.addEventListener('click', function () {
    var r = current ? find(current) : null;
    if (!r) return;
    window.mavis.sendPrompt(
      '下载数据集 ' + r.ref + ' 到当前工作区，并按 kaggle-dev 技能做一次字段与缺失值体检。',
      base('adopt-candidate', payloadFor(r), '下载选中候选并进入数据体检')
    );
  });

  deep.addEventListener('click', function () {
    var r = current ? find(current) : null;
    if (!r) return;
    window.mavis.sendPrompt(
      '继续核对数据集 ' + r.ref + ' 的文件清单、字段与许可，确认它是否满足我的目标，再决定要不要用。',
      base('deep-dive-candidate', payloadFor(r), '核对选中候选的字段与许可')
    );
  });

  renderChips();
  render();
})();
  </mavis-script>

  <mavis-fallback>
首选 `andrewmvd/heart-failure-clinical-data`（296.5 KB，4 版，CC0 许可，2023-11-02 更新）。字段干净、类别均衡，最贴近预测目标；代价是只有 299 行，适合做原型而非最终模型。

备选与取舍：
1. `colabsss/smart-healthcare-multimodal-patient-dataset` — 规模与时效最好，但许可限制再分发，商用前必须确认授权范围。
2. `uciml/iris` — 许可与社区验证度最高，但仅 150 行且距今十年，只适合当基线。
3. `heptapod/titanic` — 体积小、许可干净，适合先把整条分析链路跑通再换目标数据集。

建议顺序：先用 Titanic 打通链路，再用 heart-failure 做正式原型；smart-healthcare 在许可确认前不要进入产品。

注意：当前未配置 Kaggle 凭证，内核检索与竞赛列表不可用；上表的下载量、许可与更新时间均来自公开检索与数据集详情接口。
  </mavis-fallback>
</mavis-widget>

## 自查要点

这份示例同时满足以下规则，改写它时不要破坏其中任何一条：

- 候选数为 4，因此**没有** `new Chart(...)` 调用，bench 条用 CSS 实现。
- 排序、选中、hover 全部留在本地 JS；只有两个按钮调用 `sendPrompt`。
- `selectedData` 只含 `ref` 与决策指标，不含凭证、路径或文件内容。
- `usabilityRating` 按自身 0–1 直接用；下载量与内核数按**各列最大值**独立归一化，
  没有跨列共用比例尺。
- 缺失值显示"未核对 / 未知 / —"，**没有**被渲染成 0。
- CSS 只使用基础规范里的 `--mw-*` 令牌，且没有任何 `var(--mw-*)` 回退值。
- 事件用 `addEventListener` 绑定，没有内联 `onclick`，没有 `submitForm`。
- 抬头如实写出"已逐个核对"，并单独说明当前未配置凭证的影响。
- `text` 与 `userIntent` 均为中文，与 `conversationLanguage` 一致。
