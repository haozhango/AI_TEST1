const newJobsList = document.getElementById('newJobsList');
const template = document.getElementById('newJobTemplate');
const uartTemplate = document.getElementById('uartTemplate');
const recentJobs = document.getElementById('recentJobs');
const form = document.getElementById('newJobsForm');
let currentUser = 'user';

function makeJobsId() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  const ts = `${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${currentUser}_${ts}`;
}

function addUartItem(card, value = '') {
  const uartList = card.querySelector('.uart-list');
  const item = uartTemplate.content.firstElementChild.cloneNode(true);
  const input = item.querySelector('.uart-input');
  input.value = value;
  item.querySelector('.remove-uart-btn').addEventListener('click', () => item.remove());
  uartList.appendChild(item);
}

let fileBrowserModal = null;

function ensureFileBrowserModal() {
  if (fileBrowserModal) return fileBrowserModal;

  const overlay = document.createElement('div');
  overlay.className = 'file-browser-overlay';
  overlay.innerHTML = `
    <div class="file-browser-modal">
      <div class="file-browser-head">
        <strong>Select Path</strong>
        <button type="button" class="file-browser-close">×</button>
      </div>
      <div class="file-browser-path-row">
        <input class="file-browser-path" placeholder="/path/to/search" />
        <button type="button" class="mini-btn file-browser-go">Go</button>
      </div>
      <div class="file-browser-list"></div>
      <div class="file-browser-actions">
        <button type="button" class="mini-btn file-browser-use-path">Apply</button>
        <button type="button" class="mini-btn file-browser-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.style.display = 'none';

  const close = () => {
    overlay.style.display = 'none';
    overlay.dataset.mode = '';
    overlay.dataset.targetInput = '';
  };

  overlay.querySelector('.file-browser-close').addEventListener('click', close);
  overlay.querySelector('.file-browser-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  fileBrowserModal = {
    overlay,
    pathInput: overlay.querySelector('.file-browser-path'),
    list: overlay.querySelector('.file-browser-list'),
    goBtn: overlay.querySelector('.file-browser-go'),
    usePathBtn: overlay.querySelector('.file-browser-use-path'),
    close,
  };
  return fileBrowserModal;
}

function findParentPath(pathValue) {
  const normalized = (pathValue || '').trim();
  if (!normalized) return '';
  if (normalized === '/') return '/';

  const clean = normalized.endsWith('/') && normalized.length > 1 ? normalized.slice(0, -1) : normalized;
  const slashIndex = clean.lastIndexOf('/');
  if (slashIndex <= 0) return '/';
  return clean.slice(0, slashIndex);
}

async function loadFsEntriesWithFallback(path, mode) {
  const trimmed = (path || '').trim();
  try {
    return await loadFsEntries(trimmed, mode);
  } catch (error) {
    if (!trimmed) throw error;
    const fallbackPath = findParentPath(trimmed);
    if (!fallbackPath || fallbackPath === trimmed) throw error;
    return loadFsEntries(fallbackPath, mode);
  }
}

async function loadFsEntries(path, mode) {
  const url = `/api/fs?path=${encodeURIComponent(path || '')}&mode=${encodeURIComponent(mode)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'load failed');
  }
  return response.json();
}

async function browseViaFileSystem(target, mode = 'file') {
  const modal = ensureFileBrowserModal();
  modal.overlay.style.display = 'flex';
  modal.overlay.dataset.mode = mode;
  modal.overlay.currentTarget = target;

  const render = async (path) => {
    modal.list.textContent = 'Loading...';
    const data = await loadFsEntriesWithFallback(path || target.value || '', mode);
    modal.pathInput.value = data.cwd;
    modal.list.innerHTML = '';

    const addEntryButton = (name, pathValue, type, className = 'fs-item') => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = className;
      item.dataset.path = pathValue;
      item.dataset.type = type;
      item.textContent = name;
      item.addEventListener('click', async () => {
        const itemPath = item.dataset.path || '';
        const itemType = item.dataset.type;
        if (itemType === 'directory') {
          await render(itemPath);
          return;
        }
        target.value = itemPath;
        modal.close();
      });
      modal.list.appendChild(item);
    };

    if (data.parent) addEntryButton('..', data.parent, 'directory', 'fs-item fs-nav');

    data.entries.forEach((entry) => {
      const prefix = entry.type === 'directory' ? '\u{1F5C2}' : '\u{1F4C4}';
      addEntryButton(`${prefix} ${entry.name}`, entry.path, entry.type);
    });

    if (!data.entries.length && !data.parent) {
      const empty = document.createElement('div');
      empty.className = 'fs-empty';
      empty.textContent = '(empty)';
      modal.list.appendChild(empty);
    }
  };

  modal.goBtn.onclick = async () => {
    await render(modal.pathInput.value);
  };
  modal.pathInput.onkeydown = async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    await render(modal.pathInput.value);
  };
  modal.usePathBtn.onclick = () => {
    const nextValue = modal.pathInput.value.trim();
    if (!nextValue) return;
    target.value = nextValue;
    modal.close();
  };

  try {
    await render(target.value);
  } catch (error) {
    modal.list.innerHTML = '';
    const errorNode = document.createElement('div');
    errorNode.className = 'fs-error';
    errorNode.textContent = `Failed: ${error.message}`;
    modal.list.appendChild(errorNode);
  }
}

function bindFileSystemBrowse(card, btnSelector, inputSelector, mode = 'file') {
  const btn = card.querySelector(btnSelector);
  const target = card.querySelector(inputSelector);
  if (!btn || !target) return;

  btn.addEventListener('click', async () => {
    await browseViaFileSystem(target, mode);
  });
}

function updateDbConfigState(card, key, enabled) {
  const input = card.querySelector(`input[name="${key}"]`);
  if (!input) return;
  input.disabled = !enabled;
  const browseMap = {
    database_path: '.database-browse-btn',
    reset_script: '.reset-browse-btn',
    imgload_script: '.imgload-browse-btn',
  };
  const browseBtn = card.querySelector(browseMap[key]);
  if (browseBtn) browseBtn.disabled = !enabled;
}

function bindDbConfigToggles(card, prefill = {}) {
  card.querySelectorAll('.db-config-toggle').forEach((toggle) => {
    const key = toggle.dataset.target;
    const initialValue = prefill[key];
    if (initialValue === 'auto') toggle.checked = false;

    updateDbConfigState(card, key, toggle.checked);
    toggle.addEventListener('change', () => updateDbConfigState(card, key, toggle.checked));
  });
}

function createNewJobCard(prefill = {}, insertAfterNode = null) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector('input[name="jobs_id"]').value = prefill.jobs_id || makeJobsId();
  node.querySelector('select[name="haps_platform"]').value = prefill.haps_platform || 'BJ-HAPS80';
  node.querySelector('input[name="database_path"]').value = prefill.database_path && prefill.database_path !== 'auto' ? prefill.database_path : '';
  node.querySelector('input[name="reset_script"]').value = prefill.reset_script && prefill.reset_script !== 'auto' ? prefill.reset_script : '';
  node.querySelector('input[name="imgload_script"]').value = prefill.imgload_script && prefill.imgload_script !== 'auto' ? prefill.imgload_script : '';
  node.querySelector('input[name="binfile"]').value = prefill.binfile || '';
  node.querySelector('input[name="img_file"]').value = prefill.img_file || '';
  node.querySelector('input[name="log_path"]').value = prefill.log_path || '';

  const openocdCfg = prefill.openocd_cfg || {};
  node.querySelector('input[name="openocd_tool_path"]').value = openocdCfg.tool_path || '';
  node.querySelector('input[name="openocd_cfg_file"]').value = openocdCfg.cfg_file || '';

  (prefill.uart_paths || ['']).forEach((val) => addUartItem(node, val));

  node.querySelector('.add-uart-btn').addEventListener('click', () => addUartItem(node));
  node.querySelector('.delete-btn').addEventListener('click', () => {
    node.remove();
    if (!newJobsList.children.length) createNewJobCard();
  });
  node.querySelector('.add-btn').addEventListener('click', () => createNewJobCard({}, node));

  bindFileSystemBrowse(node, '.browse-btn', '.binfile-path', 'file');
  bindFileSystemBrowse(node, '.img-file-browse-btn', '.img-file-path', 'file');
  bindFileSystemBrowse(node, '.database-browse-btn', '.database-path', 'file');
  bindFileSystemBrowse(node, '.reset-browse-btn', '.reset-script-path', 'file');
  bindFileSystemBrowse(node, '.imgload-browse-btn', '.imgload-script-path', 'file');
  bindDbConfigToggles(node, prefill);

  if (insertAfterNode && insertAfterNode.parentNode === newJobsList) {
    insertAfterNode.insertAdjacentElement('afterend', node);
  } else {
    newJobsList.appendChild(node);
  }
}

function collectNewJobs() {
  return Array.from(newJobsList.querySelectorAll('.job-card')).map((card) => {
    const uartPaths = Array.from(card.querySelectorAll('.uart-input')).map((i) => i.value.trim()).filter(Boolean);
    return {
      jobs_id: card.querySelector('input[name="jobs_id"]').value.trim(),
      haps_platform: card.querySelector('select[name="haps_platform"]').value,
      database_path: card.querySelector('.db-config-toggle[data-target="database_path"]').checked ? (card.querySelector('input[name="database_path"]').value.trim() || 'auto') : 'auto',
      reset_script: card.querySelector('.db-config-toggle[data-target="reset_script"]').checked ? (card.querySelector('input[name="reset_script"]').value.trim() || 'auto') : 'auto',
      imgload_script: card.querySelector('.db-config-toggle[data-target="imgload_script"]').checked ? (card.querySelector('input[name="imgload_script"]').value.trim() || 'auto') : 'auto',
      binfile: card.querySelector('input[name="binfile"]').value.trim(),
      img_file: card.querySelector('input[name="img_file"]').value.trim(),
      log_path: card.querySelector('input[name="log_path"]').value.trim(),
      openocd_cfg: {
        tool_path: card.querySelector('input[name="openocd_tool_path"]').value.trim(),
        cfg_file: card.querySelector('input[name="openocd_cfg_file"]').value.trim(),
      },
      uart_paths: uartPaths,
    };
  });
}

async function submitJobs(event) {
  event.preventDefault();
  const response = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobs: collectNewJobs() }),
  });
  if (!response.ok) return alert(`Submit failed: ${await response.text()}`);
  newJobsList.innerHTML = '';
  createNewJobCard();
  refreshRecentJobs();
}

async function finishJob(jobId) {
  if (!window.confirm('Finish this running job?')) return;
  const response = await fetch(`/api/jobs/${jobId}/stop`, { method: 'POST' });
  if (!response.ok) return alert('Finish failed');
  refreshRecentJobs();
}

function renderRecentJobs(jobs) {
  recentJobs.innerHTML = '';
  if (!jobs.length) return (recentJobs.textContent = 'No jobs yet');

  jobs.forEach((job) => {
    const payload = job.payload || {};
    const item = document.createElement('div');
    item.className = 'recent-card row-grid';
    item.innerHTML = `
      <div class="kv jobid-kv"><span class="key">JobsID</span><span class="val jobid-val">${payload.jobs_id || '-'}</span></div>
      <div class="kv status-kv"><span class="key">Status</span><span class="val status ${job.status}">${job.status}</span></div>
      <div class="kv"><span class="key">Endtime</span><span class="val">${job.end_time || '-'}</span></div>
      <div class="kv"><span class="key">Log Info</span><span class="val">${payload.log_info || '-'}</span></div>
      <div class="actions"></div>
    `;

    const actions = item.querySelector('.actions');
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy to New Jobs';
    copyBtn.className = 'copy-btn';
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => createNewJobCard(payload));
    actions.appendChild(copyBtn);

    if (job.status === 'Runing') {
      const finishBtn = document.createElement('button');
      finishBtn.textContent = 'Finish';
      finishBtn.className = 'finish-btn';
      finishBtn.type = 'button';
      finishBtn.addEventListener('click', () => finishJob(job.id));
      actions.appendChild(finishBtn);
    }

    recentJobs.appendChild(item);
  });
}

async function refreshRecentJobs() {
  const response = await fetch('/api/jobs');
  if (!response.ok) return;
  const data = await response.json();
  renderRecentJobs(data.jobs || []);
}

async function bootstrap() {
  try {
    const sessionResp = await fetch('/api/session');
    if (sessionResp.ok) currentUser = (await sessionResp.json()).user || 'user';
  } catch (_) {}

  createNewJobCard();
  refreshRecentJobs();
  setInterval(refreshRecentJobs, 2000);
}

form.addEventListener('submit', submitJobs);
bootstrap();
