const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS, getConfigPath, loadConfig, saveConfig, isConfigured } = require('../lib/config');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudestatus-test-'));
}

test('getConfigPath 拼出 configDir/config.json', () => {
  assert.equal(getConfigPath('/foo/bar'), path.join('/foo/bar', 'config.json'));
});

test('loadConfig: 文件不存在时返回空 apiId/apiHost + 默认常量', () => {
  const dir = tmpDir();
  const cfg = loadConfig(dir);
  assert.equal(cfg.apiId, '');
  assert.equal(cfg.apiHost, '');
  assert.equal(cfg.apiPath, DEFAULTS.apiPath);
  assert.equal(cfg.pollIntervalMs, DEFAULTS.pollIntervalMs);
});

test('saveConfig 后 loadConfig 能读回 apiId/apiHost', () => {
  const dir = tmpDir();
  saveConfig(dir, { apiId: 'abc', apiHost: 'h.com' });
  const cfg = loadConfig(dir);
  assert.equal(cfg.apiId, 'abc');
  assert.equal(cfg.apiHost, 'h.com');
  assert.equal(cfg.apiPath, DEFAULTS.apiPath);
  assert.equal(cfg.pollIntervalMs, DEFAULTS.pollIntervalMs);
});

test('saveConfig 在目录不存在时自动创建', () => {
  const dir = path.join(tmpDir(), 'nested', 'deep');
  saveConfig(dir, { apiId: 'x', apiHost: 'y.com' });
  assert.ok(fs.existsSync(path.join(dir, 'config.json')));
});

test('saveConfig 只写 apiId/apiHost 两个字段', () => {
  const dir = tmpDir();
  saveConfig(dir, { apiId: 'x', apiHost: 'y.com' });
  const raw = JSON.parse(fs.readFileSync(getConfigPath(dir), 'utf8'));
  assert.deepEqual(Object.keys(raw).sort(), ['apiHost', 'apiId']);
});

test('saveConfig 对空 apiId 抛错', () => {
  const dir = tmpDir();
  assert.throws(() => saveConfig(dir, { apiId: '', apiHost: 'y.com' }), /apiId/);
});

test('saveConfig 对空 apiHost 抛错', () => {
  const dir = tmpDir();
  assert.throws(() => saveConfig(dir, { apiId: 'x', apiHost: '' }), /apiHost/);
});

test('isConfigured: 两字段都非空才 true', () => {
  assert.equal(isConfigured({ apiId: 'x', apiHost: 'y.com' }), true);
  assert.equal(isConfigured({ apiId: '', apiHost: 'y.com' }), false);
  assert.equal(isConfigured({ apiId: 'x', apiHost: '' }), false);
});
