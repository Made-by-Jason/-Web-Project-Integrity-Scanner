import { applyRules } from "./rules.js";

/**
 * Extract selectors from JS heuristically (regex for common patterns).
 */
export function extractSelectorsFromJS(jsText = "") {
  const out = [];
  const push = (type, name, snippet) => out.push({ type, name, snippet });

  // getElementById('id')
  const idRe = /getElementById\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  for (const m of jsText.matchAll(idRe)) push("id", m[1], m[0]);

  // querySelector / querySelectorAll
  const qsRe = /querySelector(All)?\s*\(\s*(['"`])([\s\S]*?)\2\s*\)/g;
  for (const m of jsText.matchAll(qsRe)) push("css", m[3], m[0]);

  // jQuery $('#id') or $('.class') basic
  const jqRe = /\$\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
  for (const m of jsText.matchAll(jqRe)) push("css", m[2], m[0]);

  return out;
}

/**
 * Parse HTML safely via DOMParser in-browser.
 */
function parseHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || "<html></html>", "text/html");
  return doc;
}

function collectHtmlSelectors(doc) {
  const ids = new Set();
  const classes = new Set();
  const dataAttrs = new Set();

  doc.querySelectorAll("[id]").forEach((e) => ids.add(`#${e.id}`));
  doc.querySelectorAll("[class]").forEach((e) =>
    e.className
      .toString()
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => classes.add(`.${c}`)),
  );
  doc.querySelectorAll("*").forEach((e) => {
    for (const a of e.attributes) {
      if (a.name.startsWith("data-")) {
        dataAttrs.add(`[${a.name}="${a.value}"]`);
      }
    }
  });

  return { ids, classes, dataAttrs };
}

function detectJSONLD(doc) {
  const nodes = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  const types = [];
  for (const s of nodes) {
    try {
      const json = JSON.parse(s.textContent || "{}");
      if (Array.isArray(json)) {
        json.forEach((o) => types.push(o["@type"] || "Unknown"));
      } else {
        types.push(json["@type"] || "Unknown");
      }
    } catch {}
  }
  return types;
}

function detectMicrodata(doc) {
  const types = new Set();
  doc.querySelectorAll("[itemscope][itemtype]").forEach((el) => {
    const t = el.getAttribute("itemtype");
    if (t) types.add(t);
  });
  return [...types];
}

function detectRDFa(doc) {
  const types = new Set();
  doc.querySelectorAll("[typeof]").forEach((el) => {
    const t = el.getAttribute("typeof");
    if (t) types.add(t);
  });
  return [...types];
}

function criticalElementsReport(doc, criticalSelectors) {
  const results = [];
  // Built-ins
  const builtIns = [
    { selector: "title", label: "Page <title>" },
    { selector: 'meta[name="description"]', label: "Meta description" },
    { selector: 'link[rel="canonical"]', label: "Canonical link" },
    { selector: 'meta[property="og:title"]', label: "Open Graph title" },
    { selector: "h1", label: "H1 present" },
  ];

  [...builtIns, ...criticalSelectors.map((s) => ({ selector: s, label: s }))].forEach((item) => {
    const present = !!doc.querySelector(item.selector);
    results.push({ label: item.label, selector: item.selector, present });
  });

  return results;
}

function contentVisibilityReport(doc) {
  const aboveTheFoldCandidates = [...doc.querySelectorAll("h1, header, nav, .hero, .header, .nav")];
  const hidden = [];
  const isHidden = (el) => {
    const style = (el.getAttribute("style") || "").toLowerCase();
    if (style.includes("display:none") || style.includes("visibility:hidden") || style.includes("opacity:0")) {
      return true;
    }
    // Hidden attribute
    if (el.hasAttribute("hidden")) return true;
    return false;
  };
  aboveTheFoldCandidates.forEach((el) => {
    if (isHidden(el)) hidden.push(el.outerHTML.slice(0, 120));
  });
  return hidden;
}

function buildGraph(jsSelectors, htmlIndex) {
  // Nodes: js:<selector>, html:<selector>
  const nodes = [];
  const edges = [];

  const seen = new Set();
  const addNode = (id, label, group) => {
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({ id, label, group });
  };

  const hasInHtml = (css) => {
    if (css.startsWith("#")) return htmlIndex.ids.has(css);
    if (css.startsWith(".")) return htmlIndex.classes.has(css);
    if (css.startsWith("[data-")) return htmlIndex.dataAttrs.has(css);
    // naive: try doc.querySelector (skip here to avoid requiring doc)
    return false;
  };

  jsSelectors.forEach((s, i) => {
    let key = s.type === "id" ? `#${s.name}` : s.type === "css" ? s.name : s.name;
    // Normalize simple id(.)
    if (s.type === "id" && !key.startsWith("#")) key = `#${key}`;
    addNode(`js:${i}`, key, "js");

    // Attempt basic mapping for common forms
    const basicTargets = [];
    if (key.startsWith("#") || key.startsWith(".") || key.startsWith("[data-")) basicTargets.push(key);

    basicTargets.forEach((t) => {
      const ok = hasInHtml(t);
      addNode(`html:${t}`, t, "html");
      edges.push({ from: `js:${i}`, to: `html:${t}`, ok });
    });
  });

  return { nodes, edges };
}

export async function runAllChecks({ html = "", js = "", config }) {
  const doc = parseHTML(html);
  const htmlIndex = collectHtmlSelectors(doc);
  const jsSelectors = extractSelectorsFromJS(js);

  const seo = {
    jsonld: detectJSONLD(doc),
    microdata: detectMicrodata(doc),
    rdfa: detectRDFa(doc),
    critical: criticalElementsReport(doc, config.seo.criticalSelectors),
  };

  const visibilityHiddenATF = contentVisibilityReport(doc);

  const { findings } = applyRules({
    doc,
    htmlIndex,
    jsSelectors,
    seo,
    config,
  });

  const summary = {
    totalSelectors: htmlIndex.ids.size + htmlIndex.classes.size + htmlIndex.dataAttrs.size,
    broken: findings.filter((f) => f.rule === "selector-mismatch" && f.severity === "error").length,
    seoCriticalMissing: seo.critical.filter((c) => !c.present).length,
    hiddenATF: visibilityHiddenATF.length,
  };

  const graph = buildGraph(jsSelectors, htmlIndex);

  return {
    findings,
    summary,
    seo,
    graph,
  };
}

