const KEY = "wpis_config_v1";

export function defaultConfig() {
  return {
    seo: {
      criticalSelectors: [
        'meta[name="description"]',
        'meta[property="og:title"]',
        "title",
        "h1",
        'link[rel="canonical"]',
      ],
    },
    naming: {
      enforceBEM: false,
    },
    dev: {
      hotReload: true,
    },
  };
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {}
}

