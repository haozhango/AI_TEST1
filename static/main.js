const newJobsList = document.getElementById('newJobsList');
const template = document.getElementById('newJobTemplate');
const uartTemplate = document.getElementById('uartTemplate');
const recentJobs = document.getElementById('recentJobs');
const form = document.getElementById('newJobsForm');
let currentUser = 'user';
let directoryOptions = [];

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

function closeAllDirectoryMenus() {
  document.querySelectorAll('.directory-menu').forEach((menu) => menu.classList.add('hidden'));
}

function bindPathBrowse(card, btnSelector, inputSelector, menuSelector) {
  const btn = card.querySelector(btnSelector);
  const target = card.querySelector(inputSelector);
  const menu = card.querySelector(menuSelector);
  if (!btn || !target || !menu) return;

  function renderMenu() {
    menu.innerHTML = '';
    const options = ['auto', ...directoryOptions];
    options.forEach((path) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'directory-option';
      option.textContent = path;
      option.addEventListener('click', () => {
        target.value = path;
        menu.classList.add('hidden');
      });
      menu.appendChild(option);
    });
  }

  renderMenu();

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    const hidden = menu.classList.contains('hidden');
    closeAllDirectoryMenus();
    if (hidden) {
      renderMenu();
      menu.classList.remove('hidden');
    }
  });

  menu.addEventListener('click', (event) => event.stopPropagation());
}

function createNewJobCard(prefill = {}, insertAfterNode = null) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector('input[name="jobs_id"]').value = prefill.jobs_id || makeJobsId();
  node.querySelector('select[name="haps_platform"]').value = prefill.haps_platform || 'BJ-HAPS80';
  node.querySelector('input[name="database_path"]').value = prefill.database_path || 'auto';
  node.querySelector('input[name="reset_script"]').value = prefill.reset_script || 'auto';
  node.querySelector('input[name="binfile"]').value = prefill.binfile || '';
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

  bindPathBrowse(node, '.browse-btn', '.binfile-path', '.binfile-menu');
  bindPathBrowse(node, '.database-browse-btn', '.database-path', '.database-menu');
  bindPathBrowse(node, '.reset-browse-btn', '.reset-script-path', '.reset-menu');

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
      database_path: card.querySelector('input[name="database_path"]').value.trim() || 'auto',
      reset_script: card.querySelector('input[name="reset_script"]').value.trim() || 'auto',
      binfile: card.querySelector('input[name="binfile"]').value.trim(),
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
  document.addEventListener('click', closeAllDirectoryMenus);
  try {
    const sessionResp = await fetch('/api/session');
    if (sessionResp.ok) currentUser = (await sessionResp.json()).user || 'user';
  } catch (_) {}

  try {
    const dirResp = await fetch('/api/directories');
    if (dirResp.ok) directoryOptions = (await dirResp.json()).directories || [];
  } catch (_) {
    directoryOptions = [];
  }

  createNewJobCard();
  refreshRecentJobs();
  setInterval(refreshRecentJobs, 2000);
}

form.addEventListener('submit', submitJobs);
bootstrap();
