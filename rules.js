function bemValid(className) {
  // Simplified BEM: block[__element][--modifier]
  return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:__(?:[a-z0-9]+(?:-[a-z0-9]+)*))?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(
    className,
  );
}

export function applyRules(ctx) {
  const findings = [];

  // 1) Selector mismatch: JS references not found in HTML
  ctx.jsSelectors.forEach((s) => {
    let css = s.type === "id" ? `#${s.name}` : s.type === "css" ? s.name : s.name;
    const exists =
      (css.startsWith("#") && ctx.htmlIndex.ids.has(css)) ||
      (css.startsWith(".") && ctx.htmlIndex.classes.has(css)) ||
      (css.startsWith("[data-") && ctx.htmlIndex.dataAttrs.has(css));

    if (!exists && (css.startsWith("#") || css.startsWith(".") || css.startsWith("[data-"))) {
      findings.push({
        rule: "selector-mismatch",
        severity: "error",
        type: "css",
        name: css,
        message: `Referenced in JS but not found in HTML: ${css}`,
        snippet: s.snippet,
      });
    }
  });

  // 2) Critical SEO elements presence
  ctx.seo.critical.forEach((c) => {
    if (!c.present) {
      findings.push({
        rule: "seo-critical-missing",
        severity: "error",
        type: "seo",
        name: c.selector,
        message: `Missing critical SEO element: ${c.label} (${c.selector})`,
      });
    }
  });

  // 3) JSON-LD validity (presence of known types)
  if (ctx.seo.jsonld.length === 0) {
    findings.push({
      rule: "jsonld-missing",
      severity: "warn",
      type: "seo",
      message: "No JSON-LD structured data detected.",
    });
  }

  // 4) Duplicate IDs (simple)
  const idCounts = {};
  ctx.htmlIndex.ids.forEach((id) => (idCounts[id] = (idCounts[id] || 0) + 1));
  Object.entries(idCounts).forEach(([id, count]) => {
    if (count > 1) {
      findings.push({
        rule: "duplicate-id",
        severity: "error",
        type: "id",
        name: id,
        message: `Duplicate id detected: ${id} (${count} occurrences)`,
      });
    }
  });

  // 5) Naming convention: BEM on classes (optional)
  if (ctx.config.naming.enforceBEM) {
    ctx.htmlIndex.classes.forEach((cls) => {
      const name = cls.slice(1);
      if (!bemValid(name)) {
        findings.push({
          rule: "naming-bem",
          severity: "info",
          type: "class",
          name: cls,
          message: `Class doesn't match BEM pattern: ${cls}`,
        });
      }
    });
  }

  // 6) Above-the-fold hidden heuristic already summarized; surface as info
  // (We don't have exact elements here; result is summarized in overview)

  return { findings };
}

