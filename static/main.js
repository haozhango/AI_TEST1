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

async function browseViaFileSystem(target, mode = 'file') {
  if (mode === 'directory' && window.showDirectoryPicker) {
    try {
      const handle = await window.showDirectoryPicker();
      target.value = handle.name;
      return;
    } catch (_) {
      return;
    }
  }

  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ multiple: false });
      if (handle) target.value = handle.name;
      return;
    } catch (_) {
      return;
    }
  }

  const chooser = document.createElement('input');
  chooser.type = 'file';
  if (mode === 'directory') chooser.setAttribute('webkitdirectory', '');
  chooser.addEventListener('change', () => {
    if (!chooser.files || !chooser.files.length) return;
    const file = chooser.files[0];
    target.value = file.webkitRelativePath || file.name;
  });
  chooser.click();
}

function bindFileSystemBrowse(card, btnSelector, inputSelector, mode = 'file') {
  const btn = card.querySelector(btnSelector);
  const target = card.querySelector(inputSelector);
  if (!btn || !target) return;

  btn.addEventListener('click', async () => {
    await browseViaFileSystem(target, mode);
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
  bindFileSystemBrowse(node, '.database-browse-btn', '.database-path', 'directory');
  bindFileSystemBrowse(node, '.reset-browse-btn', '.reset-script-path', 'file');
  bindFileSystemBrowse(node, '.imgload-browse-btn', '.imgload-script-path', 'file');

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
      imgload_script: card.querySelector('input[name="imgload_script"]').value.trim() || 'auto',
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
