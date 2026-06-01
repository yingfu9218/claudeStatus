const apiIdEl = document.getElementById('apiId');
const apiHostEl = document.getElementById('apiHost');
const errEl = document.getElementById('form-error');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

function showError(msg) {
  errEl.textContent = msg;
  errEl.hidden = !msg;
}

async function init() {
  const cfg = await window.settingsApi.get();
  apiIdEl.value = cfg.apiId || '';
  apiHostEl.value = cfg.apiHost || '';
}

saveBtn.addEventListener('click', async () => {
  showError('');
  const data = { apiId: apiIdEl.value.trim(), apiHost: apiHostEl.value.trim() };
  const res = await window.settingsApi.save(data);
  if (res && res.ok) {
    window.settingsApi.close();
  } else {
    showError((res && res.error) || '保存失败');
  }
});

cancelBtn.addEventListener('click', () => window.settingsApi.close());

init();
