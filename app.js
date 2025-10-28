import mitt from "mitt";
import { runAllChecks } from "./scanner.js";
import { defaultConfig, loadConfig, saveConfig } from "./config.js";
import { HotReloadBus } from "./hot.js";
import { renderMap } from "./map.js";

const emitter = mitt();
const state = {
  activeTab: "overview",
  config: loadConfig() ?? defaultConfig(),
  lastResult: null,
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "findings", label: "Findings" },
  { id: "seo", label: "SEO Checks" },
  { id: "map", label: "Selector Map" },
  { id: "integrations", label: "Integrations" },
  { id: "settings", label: "Settings" },
];

function el(html) {
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return div.firstElementChild;
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  TABS.forEach((t) => {
    const b = el(
      `<button data-tab="${t.id}" class="px-3 py-2 rounded text-sm ${
        state.activeTab === t.id
          ? "bg-neutral-900 text-white"
          : "text-neutral-700 hover:bg-neutral-100"
      }">${t.label}</button>`,
    );
    b.addEventListener("click", () => {
      state.activeTab = t.id;
      renderTabs();
      renderPanel();
    });
    tabs.appendChild(b);
  });
}

function renderOverviewPanel() {
  const r = state.lastResult;
  return el(`
    <section class="space-y-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="border rounded p-4">
          <div class="text-xs text-neutral-500">Total selectors</div>
          <div class="text-2xl font-semibold">${r ? r.summary.totalSelectors : 0}</div>
        </div>
        <div class="border rounded p-4">
          <div class="text-xs text-neutral-500">Broken references</div>
          <div class="text-2xl font-semibold ${r && r.summary.broken > 0 ? "text-red-600" : ""}">
            ${r ? r.summary.broken : 0}
          </div>
        </div>
        <div class="border rounded p-4">
          <div class="text-xs text-neutral-500">SEO critical missing</div>
          <div class="text-2xl font-semibold ${r && r.summary.seoCriticalMissing > 0 ? "text-red-600" : ""}">
            ${r ? r.summary.seoCriticalMissing : 0}
          </div>
        </div>
        <div class="border rounded p-4">
          <div class="text-xs text-neutral-500">Hidden above-the-fold</div>
          <div class="text-2xl font-semibold">${r ? r.summary.hiddenATF : 0}</div>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-2">Input</h3>
          <div class="space-y-2">
            <label class="text-xs text-neutral-500">HTML (paste or drop)</label>
            <textarea id="html-input" class="w-full h-40 border rounded p-2 font-mono text-xs" placeholder="Paste HTML to scan..."></textarea>
            <label class="text-xs text-neutral-500">JS Snippets (querySelector/getElementById)</label>
            <textarea id="js-input" class="w-full h-32 border rounded p-2 font-mono text-xs" placeholder="Paste JS to extract selectors..."></textarea>
          </div>
        </div>
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-2">Run</h3>
          <div class="text-sm text-neutral-600 mb-3">Runs core checks: schema markup, critical SEO elements, selector mismatches, content visibility.</div>
          <div class="flex gap-2">
            <button id="run-scan-main" class="px-3 py-2 rounded border hover:bg-neutral-50">Run Scan</button>
            <button id="load-sample" class="px-3 py-2 rounded border hover:bg-neutral-50">Load Sample</button>
          </div>
          <div id="run-hint" class="text-xs text-neutral-500 mt-2">Hot reload: re-runs when inputs change.</div>
        </div>
      </div>
    </section>
  `);
}

function renderFindingsPanel() {
  const r = state.lastResult;
  const list = (r?.findings ?? []).map((f) => {
    return `
    <div class="border rounded p-3">
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold">${f.severity.toUpperCase()} • ${f.rule}</div>
        <div class="text-xs text-neutral-500">${f.type ?? ""} ${f.name ?? ""}</div>
      </div>
      <div class="text-sm mt-1">${f.message}</div>
      ${
        f.snippet
          ? `<pre class="bg-neutral-50 text-xs p-2 rounded mt-2 overflow-x-auto">${f.snippet.replace(
              /</g,
              "&lt;",
            )}</pre>`
          : ""
      }
    </div>`;
  });

  return el(`
    <section class="space-y-3">
      <div class="flex gap-2 items-center">
        <span class="text-sm text-neutral-600">Filters:</span>
        <button data-filter="all" class="px-2 py-1 rounded border text-xs">All</button>
        <button data-filter="error" class="px-2 py-1 rounded border text-xs">Errors</button>
        <button data-filter="warn" class="px-2 py-1 rounded border text-xs">Warnings</button>
        <button data-filter="info" class="px-2 py-1 rounded border text-xs">Info</button>
      </div>
      <div id="findings-list" class="grid gap-2">
        ${list.join("") || `<div class="text-sm text-neutral-500">No findings yet.</div>`}
      </div>
    </section>
  `);
}

function renderSEOPanel() {
  const r = state.lastResult;
  const seo = r?.seo ?? { critical: [], jsonld: [], microdata: [], rdfa: [] };
  function pill(ok) {
    return ok
      ? '<span class="text-emerald-700 bg-emerald-100 text-xs px-2 py-0.5 rounded">OK</span>'
      : '<span class="text-red-700 bg-red-100 text-xs px-2 py-0.5 rounded">Missing</span>';
  }

  return el(`
    <section class="space-y-4">
      <div class="border rounded p-4">
        <h3 class="font-semibold mb-2">Critical Elements</h3>
        <div class="grid md:grid-cols-2 gap-2">
          ${
            (seo.critical ?? [])
              .map(
                (c) => `
            <div class="flex items-center justify-between border rounded px-3 py-2">
              <div class="text-sm">${c.label}</div>
              ${pill(c.present)}
            </div>`,
              )
              .join("") || `<div class="text-sm text-neutral-500">No data.</div>`
          }
        </div>
      </div>
      <div class="grid md:grid-cols-3 gap-4">
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-2">JSON-LD</h3>
          <div class="space-y-1 text-sm">
            ${(seo.jsonld || []).map((s) => `<div>• ${s["@type"] || "Unknown"}</div>`).join("") || "None"}
          </div>
        </div>
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-2">Microdata</h3>
          <div class="space-y-1 text-sm">${(seo.microdata || []).map((t) => `• ${t}`).join("<br>") || "None"}</div>
        </div>
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-2">RDFa</h3>
          <div class="space-y-1 text-sm">${(seo.rdfa || []).map((t) => `• ${t}`).join("<br>") || "None"}</div>
        </div>
      </div>
    </section>
  `);
}

function renderMapPanel() {
  const r = state.lastResult;
  const wrap = el(`
    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Selector Map</h3>
        <div class="text-xs text-neutral-500">Red = broken, Gray = ok</div>
      </div>
      <div class="border rounded p-2">
        <svg id="map-svg" class="w-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet"></svg>
      </div>
    </section>
  `);
  renderMap(wrap.querySelector("#map-svg"), r?.graph ?? { nodes: [], edges: [] });
  return wrap;
}

function renderIntegrationsPanel() {
  return el(`
    <section class="space-y-4">
      <div class="grid md:grid-cols-2 gap-4">
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-2">Google Search Console</h3>
          <div class="text-sm text-neutral-600 mb-2">Connect to pull indexed URLs, CTR, impressions.</div>
          <button class="px-3 py-2 rounded border hover:bg-neutral-50" disabled>Connect (stub)</button>
        </div>
        <div class="border rounded p-4">
          <h3 class="font-semibold mb-2">Lighthouse / Puppeteer</h3>
          <div class="text-sm text-neutral-600 mb-2">Simulate bot crawl; analyze late-loaded content.</div>
          <button class="px-3 py-2 rounded border hover:bg-neutral-50" disabled>Run Headless Audit (stub)</button>
        </div>
      </div>
      <div class="border rounded p-4">
        <h3 class="font-semibold mb-2">Slack / Email Alerts</h3>
        <div class="text-sm text-neutral-600 mb-2">Notify on new critical issues.</div>
        <button class="px-3 py-2 rounded border hover:bg-neutral-50" disabled>Configure (stub)</button>
      </div>
    </section>
  `);
}

function renderSettingsPanel() {
  const cfg = state.config;
  const html = `
    <section class="space-y-4">
      <div class="border rounded p-4">
        <h3 class="font-semibold mb-2">Naming Convention</h3>
        <label class="text-sm flex items-center gap-2">
          <span>Enforce BEM (class):</span>
          <input id="bem-toggle" type="checkbox" ${cfg.naming.enforceBEM ? "checked" : ""} />
        </label>
      </div>
      <div class="border rounded p-4">
        <h3 class="font-semibold mb-2">Critical Selectors (SEO)</h3>
        <div class="text-xs text-neutral-500 mb-2">Comma-separated CSS selectors to require.</div>
        <textarea id="critical-selectors" class="w-full h-24 border rounded p-2 text-xs font-mono">${cfg.seo.criticalSelectors.join(
          ", ",
        )}</textarea>
      </div>
      <div class="border rounded p-4">
        <h3 class="font-semibold mb-2">Auto re-run on change</h3>
        <label class="text-sm flex items-center gap-2">
          <span>Hot reload:</span>
          <input id="hot-toggle" type="checkbox" ${cfg.dev.hotReload ? "checked" : ""} />
        </label>
      </div>
      <div>
        <button id="save-config" class="px-3 py-2 rounded border hover:bg-neutral-50">Save</button>
      </div>
    </section>
  `;
  const node = el(html);
  node.querySelector("#save-config").addEventListener("click", () => {
    const updated = {
      ...cfg,
      naming: { ...cfg.naming, enforceBEM: node.querySelector("#bem-toggle").checked },
      seo: {
        ...cfg.seo,
        criticalSelectors: node
          .querySelector("#critical-selectors")
          .value.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
      dev: { ...cfg.dev, hotReload: node.querySelector("#hot-toggle").checked },
    };
    state.config = updated;
    saveConfig(updated);
    setStatus("Saved settings");
  });
  return node;
}

function renderPanel() {
  const panel = document.getElementById("panel-container");
  panel.innerHTML = "";
  let content;
  switch (state.activeTab) {
    case "overview":
      content = renderOverviewPanel();
      break;
    case "findings":
      content = renderFindingsPanel();
      break;
    case "seo":
      content = renderSEOPanel();
      break;
    case "map":
      content = renderMapPanel();
      break;
    case "integrations":
      content = renderIntegrationsPanel();
      break;
    case "settings":
      content = renderSettingsPanel();
      break;
  }
  panel.appendChild(content);
  bindOverviewActions();
}

function bindOverviewActions() {
  const run = document.getElementById("run-scan-main");
  const load = document.getElementById("load-sample");
  const htmlInput = document.getElementById("html-input");
  const jsInput = document.getElementById("js-input");
  if (!run || !htmlInput || !jsInput) return;

  run.onclick = () => {
    executeScan(htmlInput.value, jsInput.value);
  };
  load.onclick = () => {
    const sampleHTML = `
<!doctype html>
<html>
<head>
<title>Sample Product</title>
<link rel="canonical" href="https://example.com/product/123">
<meta name="description" content="Great product">
<meta property="og:title" content="Sample Product">
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"Product",
  "name":"Widget",
  "offers": {"@type":"Offer","price":"19.99","priceCurrency":"USD"}
}
</script>
</head>
<body>
<header><h1 id="product-title" class="product__title">Widget</h1></header>
<main>
  <div id="buy-panel" class="buy-panel">
    <button id="buyNowBtn" class="btn btn--primary" data-cta="buy-now">Buy now</button>
  </div>
  <section>
    <h2>Details</h2>
    <p class="is-hidden" style="display:none">Hidden intro</p>
  </section>
</main>
</body>
</html>`;
    const sampleJS = `
document.getElementById('buyNowBtn').addEventListener('click', onBuy);
document.querySelector('.product__title').textContent;
document.querySelector('#missingNode');
document.querySelector('[data-cta="buy-now"]');
`;
    htmlInput.value = sampleHTML.trim();
    jsInput.value = sampleJS.trim();
    setStatus("Sample loaded");
  };

  if (state.config.dev.hotReload) {
    const bus = HotReloadBus.get();
    htmlInput.addEventListener("input", () => bus.emit("changed"));
    jsInput.addEventListener("input", () => bus.emit("changed"));
    bus.off("changed");
    bus.on("changed", () => executeScan(htmlInput.value, jsInput.value));
  }
}

async function executeScan(html, js) {
  setStatus("Scanning...");
  const res = await runAllChecks({ html, js, config: state.config });
  state.lastResult = res;
  setStatus("Scan complete");
  // Rerender current tab to reflect new data
  renderPanel();
}

// Header buttons
document.getElementById("run-scan")?.addEventListener("click", () => {
  const htmlInput = document.getElementById("html-input");
  const jsInput = document.getElementById("js-input");
  executeScan(htmlInput?.value ?? "", jsInput?.value ?? "");
});
document.getElementById("open-config")?.addEventListener("click", () => {
  state.activeTab = "settings";
  renderTabs();
  renderPanel();
});

// Initialize
renderTabs();
renderPanel();

