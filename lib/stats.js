const https = require('node:https');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function normalize(payload, now) {
  if (!payload || payload.success !== true) {
    throw new Error('接口返回 success !== true');
  }
  const limits = payload.data && payload.data.limits;
  if (!limits) {
    throw new Error('接口响应缺少 data.limits');
  }
  const fields = ['dailyCostLimit', 'weeklyOpusCostLimit', 'currentWindowCost', 'currentDailyCost', 'weeklyOpusCost'];
  for (const k of fields) {
    if (typeof limits[k] !== 'number') {
      throw new Error(`接口响应缺少字段 ${k}`);
    }
  }
  const windowUsed = limits.currentWindowCost;
  const dailyUsed = limits.currentDailyCost;
  const dailyLimit = limits.dailyCostLimit;
  const weeklyUsed = limits.weeklyOpusCost;
  const weeklyLimit = limits.weeklyOpusCostLimit;
  return {
    windowUsed,
    dailyUsed,
    dailyLimit,
    weeklyUsed,
    weeklyLimit,
    dailyPct: round2((dailyUsed / dailyLimit) * 100),
    weeklyPct: round2((weeklyUsed / weeklyLimit) * 100),
    // 托盘显示：第一个数 = 5分钟窗口已花费，第二个数 = 周已花费
    trayText: `$${round2(windowUsed).toFixed(2)} / $${round2(weeklyUsed).toFixed(2)}`,
    updatedAt: now,
    error: null,
  };
}

function barColor(pct) {
  if (pct < 60) return 'green';
  if (pct < 85) return 'yellow';
  return 'red';
}

const REQUEST_TIMEOUT_MS = 10000;

function fetchUserStats(apiId, { host, path }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ apiId });
    const req = https.request(
      {
        host,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(normalize(parsed, Date.now()));
          } catch (e) {
            reject(new Error(`解析响应失败: ${e.message}`));
          }
        });
      }
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`请求超时 ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { normalize, barColor, fetchUserStats };
