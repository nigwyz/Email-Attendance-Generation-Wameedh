/* ==========================================
   WAMEEDH SC BOOTCAMP — ATTENDANCE SYSTEM
   app.js
   ========================================== */

// ─── State ────────────────────────────────────────────────────────────────────
let participants = [];   // [{email, first, last, checked, checkedAt}]
let qrDataURLs   = {};   // name → dataURL

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const tableBody      = document.getElementById('tableBody');
const tableEmpty     = document.getElementById('tableEmpty');
const statTotal      = document.getElementById('statTotal');
const statChecked    = document.getElementById('statChecked');
const searchInput    = document.getElementById('searchInput');
const sendLog        = document.getElementById('sendLog');
const qrPreviewArea  = document.getElementById('qrPreviewArea');
const configPreview  = document.getElementById('configPreview');

// ─── Navigation ───────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const page = item.dataset.page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('page-' + page).classList.add('active');

    if (page === 'qr') refreshConfigPreview();
  });
});

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3400);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeRow() {
  return { email: '', first: '', last: '', checked: false, checkedAt: null };
}

function fullName(p) { return `${p.first} ${p.last}`.trim(); }

function updateStats() {
  statTotal.textContent  = participants.length;
  statChecked.textContent = participants.filter(p => p.checked).length;
}

// ─── Render Table ─────────────────────────────────────────────────────────────
function renderTable() {
  const search  = searchInput.value.toLowerCase();

  const filtered = participants.filter((p, i) => {
    const matchSearch = !search ||
      fullName(p).toLowerCase().includes(search) ||
      p.email.toLowerCase().includes(search);
    return matchSearch;
  });

  tableBody.innerHTML = '';
  updateStats();

  if (participants.length === 0) {
    tableEmpty.classList.add('show');
    return;
  }
  tableEmpty.classList.remove('show');

  filtered.forEach((p, displayIdx) => {
    const realIdx = participants.indexOf(p);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="row-num">${realIdx + 1}</td>
      <td><input type="email" value="${esc(p.email)}" data-field="email" data-idx="${realIdx}" placeholder="email@example.com" /></td>
      <td><input type="text"  value="${esc(p.first)}" data-field="first" data-idx="${realIdx}" placeholder="First" /></td>
      <td><input type="text"  value="${esc(p.last)}"  data-field="last"  data-idx="${realIdx}" placeholder="Last" /></td>
      <td class="status-col">${p.checked ? 'Checked' : ''}</td>
      <td>
        <button class="delete-btn" data-idx="${realIdx}" title="Delete">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Events
  tableBody.querySelectorAll('input[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      const idx   = +el.dataset.idx;
      const field = el.dataset.field;
      participants[idx][field] = el.type === 'checkbox' ? (el.checked ? true : false) : el.value;
      if (['email','first','last'].includes(field)) updateStats();
    });
    el.addEventListener('input', () => {
      const idx   = +el.dataset.idx;
      const field = el.dataset.field;
      if (el.type !== 'checkbox') participants[idx][field] = el.value;
    });
  });

  tableBody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      participants.splice(+btn.dataset.idx, 1);
      renderTable();
      toast('Row deleted', 'info');
    });
  });
}

function esc(s) { return String(s).replace(/"/g, '&quot;'); }

// ─── Add Row ──────────────────────────────────────────────────────────────────
document.getElementById('addRowBtn').addEventListener('click', () => {
  participants.push(makeRow());
  searchInput.value = '';
  renderTable();
  // Scroll to bottom of table
  const wrap = document.querySelector('.table-wrap');
  wrap.scrollTop = wrap.scrollHeight;
});

// ─── Search / Filter ──────────────────────────────────────────────────────────
searchInput.addEventListener('input', renderTable);

// ─── CSV Import ───────────────────────────────────────────────────────────────
document.getElementById('csvUpload').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      const cols = line.split(',').map(c => c.trim());
      if (cols.length < 3) continue;
      const checked = [cols[4], cols[5], cols[6], cols[7]].some(c => String(c).trim() === '1');
      parsed.push({
        email: cols[0] || '',
        first: cols[1] || '',
        last:  cols[2] || '',
        checked: !!checked,
        checkedAt: null,
      });
    }
    participants = parsed;
    renderTable();
    toast(`Imported ${parsed.length} participants`, 'success');
  };
  reader.readAsText(file);
  this.value = '';
});

// ─── CSV Export ───────────────────────────────────────────────────────────────
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!participants.length) { toast('Nothing to export', 'error'); return; }
  const rows = participants.map(p =>
    [p.email, p.first, p.last, p.checked ? '1' : '0', p.checkedAt || ''].join(',')
  );
  downloadText(rows.join('\n'), 'participants.csv', 'text/csv');
  toast('CSV exported!', 'success');
});

// ─── QR Generation (browser-side via QR API) ──────────────────────────────────
document.getElementById('generateQrBtn').addEventListener('click', async () => {
  if (!participants.length) { toast('No participants to generate QR for', 'error'); return; }

  qrPreviewArea.innerHTML = '<div class="qr-placeholder"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span>Generating…</span></div>';
  qrDataURLs = {};

  // Use QR Server API to generate QR codes
  await new Promise(r => setTimeout(r, 100));

  qrPreviewArea.innerHTML = '';
  let count = 0;

  for (const p of participants) {
    const name = fullName(p);
    if (!name.trim()) continue;

    const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(name)}`;

    const item = document.createElement('div');
    item.className = 'qr-item';

    const img = document.createElement('img');
    img.src = url;
    img.alt = name;
    img.crossOrigin = 'anonymous';

    const label = document.createElement('span');
    label.textContent = name;

    item.appendChild(img);
    item.appendChild(label);
    qrPreviewArea.appendChild(item);

    // On click: download this QR
    item.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = name.replace(/ /g, '_') + '.png';
      a.target = '_blank';
      a.click();
    });

    // Store for ZIP download
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      qrDataURLs[name] = canvas.toDataURL('image/png');
    };

    count++;
  }

  toast(`Generated ${count} QR codes`, 'success');
  document.getElementById('downloadAllBtn').style.display = 'flex';
});

// ─── Download All QRs as ZIP ──────────────────────────────────────────────────
document.getElementById('downloadAllBtn').addEventListener('click', async () => {
  if (!Object.keys(qrDataURLs).length) { toast('Generate QR codes first', 'error'); return; }

  // Use JSZip if available via CDN, otherwise download individually
  if (typeof JSZip === 'undefined') {
    // fallback: download each one individually (just first 5 to avoid spam)
    const entries = Object.entries(qrDataURLs);
    for (const [name, dataURL] of entries) {
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = name.replace(/ /g, '_') + '.png';
      a.click();
      await new Promise(r => setTimeout(r, 200));
    }
    toast('QR codes downloaded individually', 'success');
    return;
  }

  const zip = new JSZip();
  for (const [name, dataURL] of Object.entries(qrDataURLs)) {
    const base64 = dataURL.split(',')[1];
    zip.file(name.replace(/ /g, '_') + '.png', base64, { base64: true });
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'qr_codes.zip';
  a.click();
  URL.revokeObjectURL(url);
  toast('ZIP downloaded!', 'success');
});

// ─── Email Config ─────────────────────────────────────────────────────────────
function getEmailConfig() {
  return {
    smtp_host:    document.getElementById('smtpHost').value.trim(),
    smtp_port:    +document.getElementById('smtpPort').value,
    smtp_use_ssl: document.getElementById('smtpSSL').checked,
    smtp_user:    document.getElementById('smtpSender').value.trim(),
    smtp_pass:    document.getElementById('smtpPass').value,
    sender:       document.getElementById('smtpSender').value.trim(),
    subject:      document.getElementById('emailSubject').value.trim(),
    headline:     document.getElementById('emailHeadline').value.trim(),
    greeting:     document.getElementById('emailGreeting').value.trim(),
  };
}

function logLine(msg, type = 'info') {
  sendLog.style.display = 'flex';
  const div = document.createElement('div');
  div.textContent = msg;
  div.className = `log-${type}`;
  sendLog.appendChild(div);
  sendLog.scrollTop = sendLog.scrollHeight;
}

const API = 'http://localhost:5000';
const FLASK_API = 'http://localhost:5000';

async function apiCall(endpoint, body) {
  const r = await fetch(API + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

document.getElementById('testEmailBtn').addEventListener('click', async () => {
  const cfg = getEmailConfig();
  if (!cfg.smtp_user || !cfg.smtp_pass) {
    toast('Fill in sender email and password first', 'error');
    return;
  }
  sendLog.innerHTML = '';
  logLine(`ℹ Connecting to ${cfg.smtp_host}:${cfg.smtp_port}…`, 'info');
  document.getElementById('testEmailBtn').disabled = true;
  try {
    const res = await apiCall('/test', { email: cfg });
    if (res.ok) {
      logLine('✓ SMTP connection successful!', 'ok');
      toast('SMTP connection OK', 'success');
    } else {
      logLine('✗ ' + res.error, 'err');
      toast('Connection failed', 'error');
    }
  } catch (e) {
    logLine('✗ Could not reach local server.', 'err');
    logLine('ℹ Make sure the server is running:  python flask_server.py', 'info');
    toast('Local server not running — see log', 'error');
  } finally {
    document.getElementById('testEmailBtn').disabled = false;
  }
});

document.getElementById('sendAllBtn').addEventListener('click', async () => {
  if (!participants.length) { toast('No participants loaded', 'error'); return; }
  const cfg = getEmailConfig();
  if (!cfg.smtp_user || !cfg.smtp_pass) {
    toast('Fill in sender email and password first', 'error');
    return;
  }
  sendLog.innerHTML = '';
  document.getElementById('sendAllBtn').disabled = true;
  const toSend = participants.filter(p => p.email && p.email.includes('@'));
  logLine(`ℹ Sending to ${toSend.length} recipients…`, 'info');
  try {
    const res = await apiCall('/send', {
      email: cfg,
      participants: toSend.map(p => ({
        email: p.email.trim(),
        name: `${p.first} ${p.last}`.trim()
      })),
      qr_dir: document.getElementById('outputDir').value.trim() || 'qr_out'
    });
    if (res.results) {
      res.results.forEach(r => {
        if (r.ok) logLine(`✓ ${r.name} <${r.email}>`, 'ok');
        else      logLine(`✗ ${r.name}: ${r.error}`, 'err');
      });
      const ok  = res.results.filter(r => r.ok).length;
      const err = res.results.filter(r => !r.ok).length;
      logLine(`─ Done: ${ok} sent, ${err} failed`, 'info');
      toast(`${ok} emails sent, ${err} failed`, ok > 0 ? 'success' : 'error');
    } else {
      logLine('✗ ' + (res.error || 'Unknown error'), 'err');
      toast('Send failed', 'error');
    }
  } catch (e) {
    logLine('✗ Could not reach local server.', 'err');
    logLine('ℹ Run:  python flask_server.py', 'info');
    toast('Local server not running — see log', 'error');
  } finally {
    document.getElementById('sendAllBtn').disabled = false;
  }
});

// ─── Config JSON ──────────────────────────────────────────────────────────────
function buildConfig() {
  const email = getEmailConfig();
  return {
    csvfile:    'participants.csv',
    session:    document.getElementById('globalSession').value,
    output_dir: document.getElementById('outputDir').value.trim() || 'qr_out',
    email: {
      smtp_host:        email.smtp_host,
      smtp_port:        email.smtp_port,
      smtp_use_ssl:     email.smtp_use_ssl,
      smtp_user:        email.smtp_user,
      smtp_pass:        email.smtp_pass,
      sender:           email.sender,
      subject:          email.subject,
      headline:         email.headline,
      greeting:         email.greeting,
      logo_path:        'logoBootcamp.png',
      brand_name:       'Wameedh SC Bootcamp',
      brand_primary:    '#0B4F6C',
      brand_accent:     '#F5B700',
      brand_background: '#F6F7FB',
      brand_text:       '#1F2933',
    }
  };
}

function refreshConfigPreview() {
  configPreview.textContent = JSON.stringify(buildConfig(), null, 2);
}

document.getElementById('refreshConfigBtn').addEventListener('click', refreshConfigPreview);

document.getElementById('downloadConfigBtn').addEventListener('click', () => {
  const cfg = buildConfig();
  downloadText(JSON.stringify(cfg, null, 2), 'config.json', 'application/json');
  toast('config.json downloaded!', 'success');
});

document.getElementById('downloadParticipantsBtn').addEventListener('click', () => {
  if (!participants.length) { toast('No participants to export', 'error'); return; }
  const rows = participants.map(p =>
    [p.email, p.first, p.last, p.checked ? '1' : '0', p.checkedAt || ''].join(',')
  );
  downloadText(rows.join('\n'), 'participants.csv', 'text/csv');
  toast('participants.csv downloaded!', 'success');
});

// ─── Util ─────────────────────────────────────────────────────────────────────
function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
renderTable();
tryLoadParticipantsCSV();

// ─────────────────────────────────────────────────────────────────────────────
// SCANNER
// ─────────────────────────────────────────────────────────────────────────────

let camStream       = null;
let scanInterval    = null;
let lastScanned     = '';
let lastScannedTime = 0;
let scanCounts      = { ok: 0, absent: 0 };
let statusPoller    = null;
let lastStatusTime  = 0;
let lastName         = null;
let lastNameLogCount = 0;
let lastNameStatus   = null;

const camVideo         = document.getElementById('camVideo');
const camCanvas        = document.getElementById('camCanvas');
const camStatus        = document.getElementById('camStatus');
const scanResultOverlay= document.getElementById('scanResultOverlay');
const scanResultIcon   = document.getElementById('scanResultIcon');
const scanResultName   = document.getElementById('scanResultName');
const scanResultMsg    = document.getElementById('scanResultMsg');
const scanLogList      = document.getElementById('scanLogList');
const startCamBtn      = document.getElementById('startCamBtn');
const stopCamBtn       = document.getElementById('stopCamBtn');
const cameraSelect     = document.getElementById('cameraSelect');
const scanCheckedIn    = document.getElementById('scanCheckedIn');
const scanAbsent       = document.getElementById('scanAbsent');
// scanWrong removed — simplified stats

// Enumerate cameras on page load
async function populateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    cameraSelect.innerHTML = '';
    cams.forEach((cam, i) => {
      const opt = document.createElement('option');
      opt.value = cam.deviceId;
      opt.textContent = cam.label || `Camera ${i + 1}`;
      cameraSelect.appendChild(opt);
    });
    if (!cams.length) {
      const opt = document.createElement('option');
      opt.textContent = 'No cameras found';
      cameraSelect.appendChild(opt);
    }
  } catch (e) {
    console.warn('Could not enumerate cameras:', e);
  }
}

// Server-driven preview: show server frame image and avoid client-side decoding
startCamBtn.addEventListener('click', async () => {
  const viewport = document.getElementById('camViewport');
  // hide local video/canvas if present
  const v = document.getElementById('camVideo');
  const c = document.getElementById('camCanvas');
  if (v) v.style.display = 'none';
  if (c) c.style.display = 'none';

  try {
    const res = await fetch(FLASK_API + '/camera/start', { method: 'POST' });
    const json = await res.json();
    if (!json.ok) throw new Error('Failed to start camera');
  } catch (e) {
    toast('Could not start camera on server', 'error');
    return;
  }

  if (!document.getElementById('serverFrameImg')) {
    const img = document.createElement('img');
    img.id = 'serverFrameImg';
    img.src = FLASK_API + '/stream.mjpg';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    viewport.insertBefore(img, viewport.firstChild);
  }

  camStatus.classList.add('hidden');
  startCamBtn.disabled = true;
  stopCamBtn.disabled  = false;
  document.querySelector('.cam-viewport').classList.add('scanning');

  // Poll server for decoded QR results
  if (!statusPoller) {
    statusPoller = setInterval(async () => {
      try {
        const res = await fetch(FLASK_API + '/status');
        const json = await res.json();
        if (!json || !json.last || !json.last.time) return;
        if (json.last.time <= lastStatusTime) return;
        lastStatusTime = json.last.time;
        const name = String(json.last.data || '').trim();
        if (!name) return;
        handleScan(name);
      } catch (e) {
        // ignore transient polling failures
      }
    }, 350);
  }

  toast('Server-side camera preview started', 'success');
});

stopCamBtn.addEventListener('click', stopCamera);

async function stopCamera() {
  // Stop server polling and remove preview image
  if (statusPoller) {
    clearInterval(statusPoller);
    statusPoller = null;
  }
  try {
    await fetch(FLASK_API + '/camera/stop', { method: 'POST' });
  } catch (e) {
    // ignore
  }
  const img = document.getElementById('serverFrameImg');
  if (img) img.remove();
  camStatus.classList.remove('hidden');
  camStatus.querySelector('span').textContent = 'Click Start Camera to begin scanning';
  startCamBtn.disabled = false;
  stopCamBtn.disabled  = true;
  document.querySelector('.cam-viewport').classList.remove('scanning');
}

// Stop camera when leaving scanner page
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const hasPreview = !!document.getElementById('serverFrameImg');
    if (item.dataset.page !== 'scanner' && hasPreview) stopCamera();
  });
});

// decodeFrame removed: scanning/decoding now happens server-side in Flask.

// Try to auto-load participants.csv from server root (if present)
async function tryLoadParticipantsCSV() {
  try {
    const r = await fetch(FLASK_API + '/participants.csv');
    if (!r.ok) return;
    const text = await r.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      const cols = line.split(',').map(c => c.trim());
      if (cols.length < 3) continue;
      const checked = [cols[4], cols[5], cols[6], cols[7]].some(c => String(c).trim() === '1');
      parsed.push({
        email: cols[0] || '',
        first: cols[1] || '',
        last: cols[2] || '',
        checked: !!checked,
        checkedAt: null,
      });
    }
    if (parsed.length) {
      participants = parsed;
      renderTable();
      toast(`Loaded ${parsed.length} participants from participants.csv`, 'success');
    }
  } catch (e) {
    // ignore
    console.warn('Could not auto-load participants.csv', e);
  }
}

function removeSpaces(s) { return s.replace(/\s+/g, '').toLowerCase(); }
// group/room logic removed — scanning is a simple check-in now

async function persistAttendance(p) {
  try {
    const res = await fetch(FLASK_API + '/attendance/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: p.email, first: p.first, last: p.last, time: p.checkedAt,
        session: document.getElementById('globalSession').value
      })
    });
    return await res.json();
  } catch (e) {
    console.warn('Could not persist attendance:', e);
    return null;
  }
}

async function handleScan(name) {
  if (name !== lastName) {
    lastName = name;
    lastNameLogCount = 0;
    lastNameStatus = null;
  }

  if (!participants.length) {
    maybeLogOnce(name, 'err', 'No participants loaded. Go to Participants page first.');
    showResultFlash('⚠', name, 'No participants loaded. Go to Participants page first.', 'err');
    return;
  }

  // Find participant by full name (case + space insensitive)
  const idx = participants.findIndex(p => {
    const full = `${p.first} ${p.last}`;
    return removeSpaces(full) === removeSpaces(name);
  });

  if (idx === -1) {
    // Not in list
    scanCounts.absent++;
    updateScanStats();
    maybeLogOnce(name, 'err', 'Not in participant list');
    showResultFlash('✗', name, 'Not in participant list', 'err');
    return;
  }

  const p = participants[idx];

  if (p.checked) {
    // Already checked in
    maybeLogOnce(name, 'ok', 'Already checked in ✓');
    showResultFlash('✓', name, 'Already checked in', 'ok');
    return;
  }

  // Mark checked and persist
  p.checked = true;
  p.checkedAt = new Date().toISOString();
  scanCounts.ok++;
  updateStats();
  updateScanStats();
  maybeLogOnce(name, 'ok', 'Checked in ✓');
  showResultFlash('✓', name, 'Welcome! Checked in', 'ok');
  renderTable();
  const saved = await persistAttendance(p);
  if (saved && saved.duplicate) {
    const at = (saved.first_seen || '').slice(11, 16);
    maybeLogOnce(name, 'ok', `Duplicate blocked — already logged${at ? ' at ' + at : ''}`);
    showResultFlash('⏱', name, 'Already logged on server — duplicate blocked', 'ok');
  }
}

function maybeLogOnce(name, type, status) {
  if (lastNameLogCount >= 2) return;
  if (lastNameLogCount === 1 && status === lastNameStatus) return;
  addLogEntry(name, type, status);
  lastNameLogCount += 1;
  lastNameStatus = status;
}

function updateScanStats() {
  scanCheckedIn.textContent = scanCounts.ok;
  scanAbsent.textContent    = scanCounts.absent;
}

function showResultFlash(icon, name, msg, type) {
  scanResultOverlay.className = 'scan-result-overlay show ' + (type === 'ok' ? 'ok-bg' : 'err-bg');
  scanResultIcon.textContent = icon;
  scanResultName.textContent = name;
  scanResultMsg.textContent  = msg;

  clearTimeout(scanResultOverlay._timer);
  scanResultOverlay._timer = setTimeout(() => {
    scanResultOverlay.className = 'scan-result-overlay hidden';
  }, 3000);
}

function addLogEntry(name, type, status) {
  const empty = scanLogList.querySelector('.scan-log-empty');
  if (empty) empty.remove();

  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const item = document.createElement('div');
  item.className = 'scan-log-item';
  item.innerHTML = `
    <div class="log-dot ${type}"></div>
    <div class="log-item-info">
      <div class="log-item-name">${name}</div>
      <div class="log-item-status">${status}</div>
    </div>
    <div class="log-item-time">${time}</div>
  `;

  scanLogList.insertBefore(item, scanLogList.firstChild);
}

document.getElementById('clearLogBtn').addEventListener('click', () => {
  scanLogList.innerHTML = '<div class="scan-log-empty">No scans yet</div>';
  scanCounts = { ok: 0, absent: 0 };
  updateScanStats();
});
document.getElementById('exportAttendanceBtn').addEventListener('click', async () => {
  // Try to download persisted attendance first, otherwise export local checked list
  try {
    const r = await fetch(FLASK_API + '/attendance/list');
    if (r.ok) {
      const data = await r.json();
      const items = data.items || (Array.isArray(data) ? data : []);
      if (items.length) {
        const rows = items.map(it => [it.email, it.first, it.last, it.time || '', it.session || ''].join(','));
        downloadText(rows.join('\n'), 'attendance.csv', 'text/csv');
        toast('Saved attendance.csv downloaded', 'success');
        return;
      }
    }
  } catch (e) {
    // ignore and fallback
  }

  // Fallback: export local participants checked state
  const rows = participants.map(p => [p.email, p.first, p.last, p.checked ? '1' : '0', p.checkedAt || ''].join(','));
  downloadText(rows.join('\n'), 'attendance_local.csv', 'text/csv');
  toast('Local attendance exported', 'success');
});

// Init cameras list (no labels until permission)
populateCameras();

// ─── Load config.json into Email Settings ────────────────────────────────────
document.getElementById('configJsonUpload').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const cfg = JSON.parse(e.target.result);
      const em  = cfg.email || {};

      // Top-level fields
      if (cfg.session) document.getElementById('globalSession').value = cfg.session;

      // Email fields
      if (em.smtp_host !== undefined) document.getElementById('smtpHost').value    = em.smtp_host;
      if (em.smtp_port !== undefined) document.getElementById('smtpPort').value    = em.smtp_port;
      if (em.smtp_use_ssl !== undefined) document.getElementById('smtpSSL').checked = !!em.smtp_use_ssl;
      if (em.sender    !== undefined) document.getElementById('smtpSender').value  = em.sender;
      if (em.smtp_pass !== undefined) document.getElementById('smtpPass').value    = em.smtp_pass;
      if (em.subject   !== undefined) document.getElementById('emailSubject').value = em.subject;
      if (em.headline  !== undefined) document.getElementById('emailHeadline').value = em.headline;
      if (em.greeting  !== undefined) document.getElementById('emailGreeting').value = em.greeting;

      // Output dir if present
      if (cfg.output_dir) document.getElementById('outputDir').value = cfg.output_dir;

      refreshConfigPreview();
      toast('config.json loaded ✓', 'success');
    } catch (err) {
      toast('Invalid JSON file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  this.value = '';
});
