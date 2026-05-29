const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  apiPath: '/apiStats/api/user-stats',
  pollIntervalMs: 30000,
};

function getConfigPath(configDir) {
  return path.join(configDir, 'config.json');
}

function loadConfig(configDir) {
  const base = { ...DEFAULTS, apiId: '', apiHost: '' };
  try {
    const raw = fs.readFileSync(getConfigPath(configDir), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...base,
      apiId: typeof parsed.apiId === 'string' ? parsed.apiId : '',
      apiHost: typeof parsed.apiHost === 'string' ? parsed.apiHost : '',
    };
  } catch {
    return base;
  }
}

function saveConfig(configDir, { apiId, apiHost } = {}) {
  if (typeof apiId !== 'string' || apiId.trim() === '') {
    throw new Error('apiId 不能为空');
  }
  if (typeof apiHost !== 'string' || apiHost.trim() === '') {
    throw new Error('apiHost 不能为空');
  }
  fs.mkdirSync(configDir, { recursive: true });
  const data = { apiId: apiId.trim(), apiHost: apiHost.trim() };
  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function isConfigured(cfg) {
  return Boolean(cfg && typeof cfg.apiId === 'string' && cfg.apiId.trim()
    && typeof cfg.apiHost === 'string' && cfg.apiHost.trim());
}

module.exports = { DEFAULTS, getConfigPath, loadConfig, saveConfig, isConfigured };
