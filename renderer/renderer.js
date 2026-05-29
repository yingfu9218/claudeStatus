const els = {
  loading: document.getElementById('loading-view'),
  error: document.getElementById('error-view'),
  data: document.getElementById('data-view'),
  retry: document.getElementById('retry-btn'),
  updated: document.getElementById('updated-text'),
  dailyValue: document.getElementById('daily-value'),
  dailyBar: document.getElementById('daily-bar'),
  dailyPct: document.getElementById('daily-pct'),
  weeklyValue: document.getElementById('weekly-value'),
  weeklyBar: document.getElementById('weekly-bar'),
  weeklyPct: document.getElementById('weekly-pct'),
};

let currentPayload = null;

els.retry.addEventListener('click', () => window.api.requestRefresh());

function barColor(pct) {
  if (pct < 60) return 'green';
  if (pct < 85) return 'yellow';
  return 'red';
}

function relativeTime(diffMs) {
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return '刚刚';
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  return `${hr} 小时前`;
}

function showView(name) {
  els.loading.hidden = name !== 'loading';
  els.error.hidden = name !== 'error';
  els.data.hidden = name !== 'data';
}

function render(payload) {
  const { lastSuccess, lastError, now } = payload;

  if (!lastSuccess && !lastError) {
    showView('loading');
    return;
  }
  if (!lastSuccess && lastError) {
    showView('error');
    return;
  }

  showView('data');
  const d = lastSuccess;

  els.dailyValue.textContent = `$${d.dailyUsed.toFixed(4)} / $${d.dailyLimit.toFixed(2)}`;
  els.dailyBar.style.width = Math.min(d.dailyPct, 100) + '%';
  els.dailyBar.className = 'bar-fill ' + barColor(d.dailyPct);
  els.dailyPct.textContent = d.dailyPct.toFixed(2) + '%';

  els.weeklyValue.textContent = `$${d.weeklyUsed.toFixed(4)} / $${d.weeklyLimit.toFixed(2)}`;
  els.weeklyBar.style.width = Math.min(d.weeklyPct, 100) + '%';
  els.weeklyBar.className = 'bar-fill ' + barColor(d.weeklyPct);
  els.weeklyPct.textContent = d.weeklyPct.toFixed(2) + '%';

  const diff = now - d.updatedAt;
  const text = lastError
    ? `上次更新：${relativeTime(diff)} · 连接失败，重试中…`
    : `上次更新：${relativeTime(diff)}`;
  els.updated.textContent = text;
  els.updated.classList.toggle('stale', Boolean(lastError));
}

window.api.onStatsUpdate((payload) => {
  currentPayload = payload;
  render(payload);
});

// 每秒重渲染一次「上次更新」时间，无需等下一轮 IPC
setInterval(() => {
  if (currentPayload) {
    render({ ...currentPayload, now: Date.now() });
  }
}, 1000);
