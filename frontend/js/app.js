/**
 * Main Application Logic for Inspectra Dashboard
 * Handles UI, Navigation, Charts — with real data from database.
 */

let allData = [];
let currentUser = null;

// ══════════════════════════════
// NAVIGATION
// ══════════════════════════════
function showPage(id, el) {
  if (currentUser && !currentUser.access.includes(id)) {
    const nav = document.getElementById('navReport');
    if (nav) { nav.style.opacity = '.2'; setTimeout(() => { nav.style.opacity = ''; }, 600); }
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');
  if (el) el.classList.add('active');
}
window.showPage = showPage;

// ══════════════════════════════
// KPI RENDERING (from real DB stats)
// ══════════════════════════════
async function renderKPIs() {
  try {
    const stats = await apiClient.fetchStats();
    const t = stats.today;
    const c = stats.comparison;

    document.getElementById('kpiTotal').textContent = t.total;
    document.getElementById('kpiOkRate').textContent = t.okRate + '%';
    document.getElementById('kpiNG').textContent = t.totalNG;
    document.getElementById('kpiAvgTime').innerHTML = t.avgProcTime + '<span style="font-size:16px;font-weight:500;color:var(--slate-400)">s</span>';

    // Comparison badges
    const totalBadge = document.getElementById('kpiBadgeTotal');
    totalBadge.textContent = `${c.totalDiff >= 0 ? '↑' : '↓'} ${Math.abs(c.totalDiff)}% vs kemarin`;
    totalBadge.className = 'kpi-badge ' + (c.totalDiff >= 0 ? 'badge-up' : 'badge-down');

    const okBadge = document.getElementById('kpiBadgeOk');
    okBadge.textContent = `${c.okRateDiff >= 0 ? '↑' : '↓'} ${Math.abs(c.okRateDiff)}% vs kemarin`;
    okBadge.className = 'kpi-badge ' + (c.okRateDiff >= 0 ? 'badge-up' : 'badge-down');

    const ngBadge = document.getElementById('kpiBadgeNG');
    ngBadge.textContent = `${c.ngDiff >= 0 ? '↑' : '↓'} ${Math.abs(c.ngDiff)} vs kemarin`;
    ngBadge.className = 'kpi-badge ' + (c.ngDiff <= 0 ? 'badge-up' : 'badge-down');

    // Donut center
    const donutPct = document.getElementById('donutPct');
    const donutOk = document.getElementById('donutOkCount');
    const donutNg = document.getElementById('donutNgCount');
    if (donutPct) donutPct.textContent = t.okRate + '%';
    if (donutOk) donutOk.textContent = `OK (${t.totalOK})`;
    if (donutNg) donutNg.textContent = `NOT OK (${t.totalNG})`;

    // Alert bar
    if (stats.recentNGCount > 0) {
      document.getElementById('alertText').innerHTML = `<strong>${stats.recentNGCount} kemasan NOT OK</strong> terdeteksi dalam 30 menit terakhir. Tindak lanjut diperlukan.`;
      document.getElementById('alertBar').style.display = 'flex';
    } else {
      document.getElementById('alertBar').style.display = 'none';
    }
  } catch (err) {
    console.warn('[KPI] Failed to load stats:', err);
  }
}

// ══════════════════════════════
// RENDER FUNCTIONS
// ══════════════════════════════
function renderFeed() {
  const feedEl = document.getElementById('feedList');
  if (!feedEl) return;
  const items = allData.slice(0, 8);
  feedEl.innerHTML = items.map(r => `
    <div class="feed-item" onclick="openModal('${r.id}')">
      <div class="feed-status ${r.status === 'OK' ? 'ok' : 'ng'}"></div>
      <div class="feed-info">
        <div class="feed-part">${r.part}</div>
        <div class="feed-meta">${r.vendor} · ${r.tsStr}</div>
      </div>
      <span class="status-pill ${r.status === 'OK' ? 'pill-ok' : 'pill-ng'}">${r.status}</span>
    </div>`).join('');
}

function renderTable(data) {
  const tbody = document.getElementById('inspectionTbody');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty">Tidak ada data ditemukan</div></td></tr>';
    return;
  }
  tbody.innerHTML = data.slice(0, 20).map(r => `
    <tr onclick="openModal('${r.id}')">
      <td class="mono">${r.tsStr}</td>
      <td style="font-weight:600">${r.part}</td>
      <td class="mono">${r.code}</td>
      <td>${r.vendor}</td>
      <td style="text-align:center">${r.target}</td>
      <td style="text-align:center;font-weight:600;color:${r.actual === r.target ? 'var(--green-600)' : 'var(--red-600)'}">${r.actual}</td>
      <td class="mono">${r.weight}g</td>
      <td><span class="status-pill ${r.status === 'OK' ? 'pill-ok' : 'pill-ng'}">${r.status}</span></td>
    </tr>`).join('');
  const tableInfo = document.getElementById('tableInfo');
  if (tableInfo) tableInfo.textContent = `Menampilkan 1–${Math.min(20, data.length)} dari ${data.length} data`;
}

async function renderVendors() {
  const el = document.getElementById('vendorList');
  if (!el) return;
  const vendorData = await apiClient.fetchVendors();
  el.innerHTML = vendorData.sort((a, b) => a.rate - b.rate).map((v, i) => {
    const color = v.rate < 2 ? 'var(--green-500)' : v.rate < 4 ? 'var(--amber-500)' : 'var(--red-500)';
    return `<div class="vendor-row">
      <div class="vendor-rank">#${i + 1}</div>
      <div class="vendor-info"><div class="vendor-name">${v.name}</div><div class="vendor-meta">${v.total} inspeksi · ${v.ng} NOT OK</div></div>
      <div class="vendor-bar-wrap"><div class="vendor-bar"><div class="vendor-bar-fill" style="width:${Math.min(v.rate / 6 * 100, 100)}%;background:${color}"></div></div></div>
      <div class="vendor-rate" style="color:${color}">${v.rate}%</div>
    </div>`;
  }).join('');
}

async function renderPartList() {
  const el = document.getElementById('partList');
  if (!el) return;
  const partTop = await apiClient.fetchTopParts();
  el.innerHTML = partTop.map(p => `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <span style="font-size:13px;font-weight:600;color:var(--slate-700)">${p.name}</span>
        <span style="font-size:12px;font-family:'DM Mono',monospace;color:var(--slate-500)">${p.count} pcs</span>
      </div>
      <div class="progress-wrap"><div class="progress-fill ok" style="width:${p.pct}%"></div></div>
    </div>`).join('');
}

function renderNGList() {
  const el = document.getElementById('ngList');
  if (!el) return;
  const ngs = allData.filter(r => r.status === 'NOT OK').slice(0, 5);
  el.innerHTML = ngs.map(r => `
    <div class="feed-item" onclick="openModal('${r.id}')" style="cursor:pointer">
      <div class="feed-status ng"></div>
      <div class="feed-info">
        <div class="feed-part">${r.part}</div>
        <div class="feed-meta">${r.vendor} · Target ${r.target} → Aktual ${r.actual}</div>
      </div>
    </div>`).join('');
}

async function renderRPP() {
  const tbody = document.getElementById('rppTbody');
  if (!tbody) return;
  const rppData = await apiClient.fetchRPP();
  tbody.innerHTML = rppData.map(r => `
    <tr>
      <td style="font-family:'DM Mono',monospace;font-size:12px;padding:10px 0;color:var(--slate-600)">${r.id}</td>
      <td style="padding:10px 8px">
        <div style="font-size:13px;font-weight:600;color:var(--slate-800)">${r.part}</div>
        <div style="font-size:11px;color:var(--slate-400)">${r.vendor}</div>
      </td>
      <td style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;padding:10px 8px;color:${r.selisih.startsWith('-') ? 'var(--red-600)' : 'var(--amber-600)'}">${r.selisih}</td>
      <td style="padding:10px 8px"><span class="rpp-status ${r.status === 'open' ? 'rpp-open' : r.status === 'confirmed' ? 'rpp-confirmed' : 'rpp-closed'}">${r.status}</span></td>
    </tr>`).join('');
}

// ══════════════════════════════
// ACTIONS
// ══════════════════════════════
window.filterTable = function() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const s = document.getElementById('filterStatus').value;
  const v = document.getElementById('filterVendor').value;
  const p = document.getElementById('filterPart').value;
  const filtered = allData.filter(r => {
    return (!q || r.part.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.vendor.toLowerCase().includes(q))
      && (!s || r.status === s)
      && (!v || r.vendor === v)
      && (!p || r.part === p);
  });
  renderTable(filtered);
};

window.submitRPP = async function() {
  const part = document.getElementById('rppPart').value || 'N/A';
  const vendor = document.getElementById('rppVendor').value;
  const qty = document.getElementById('rppQty').value || '?';
  const type = document.getElementById('rppType').value;
  await apiClient.submitRPP({ part, vendor, qty, type });
  renderRPP();
  document.getElementById('rppForm').style.display = 'none';
  document.getElementById('rppPart').value = '';
  document.getElementById('rppQty').value = '';
  alert('RPP berhasil dibuat dan dikirimkan ke vendor!');
};

window.exportCSV = function() {
  const rows = [['ID', 'Timestamp', 'Part Name', 'Part Code', 'Vendor', 'Qty Target', 'Qty Aktual', 'Berat (g)', 'Status']];
  allData.forEach(r => rows.push([r.id, r.tsStr, r.part, r.code, r.vendor, r.target, r.actual, r.weight, r.status]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'inspectra-export.csv';
  a.click();
};

// ══════════════════════════════
// MODAL
// ══════════════════════════════
window.openModal = function(id) {
  const r = allData.find(x => x.id === id);
  if (!r) return;
  document.getElementById('modalTitle').textContent = `Detail — ${r.part}`;
  document.getElementById('modalSub').textContent = `${r.id} · ${r.tsStr}`;
  const accuracy = Math.abs(r.actual - r.target) === 0 ? 100 : Math.max(0, 100 - Math.abs(r.actual - r.target) / r.target * 100);
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Part Code</div><div class="detail-value" style="font-family:'DM Mono',monospace;font-size:13px">${r.code}</div></div>
      <div class="detail-item"><div class="detail-label">Vendor</div><div class="detail-value">${r.vendor}</div></div>
      <div class="detail-item"><div class="detail-label">Qty Target</div><div class="detail-value">${r.target} pcs</div></div>
      <div class="detail-item"><div class="detail-label">Qty Aktual</div><div class="detail-value" style="color:${r.status === 'OK' ? 'var(--green-600)' : 'var(--red-600)'}">${r.actual} pcs ${r.status === 'OK' ? '✓' : '⚠'}</div></div>
      <div class="detail-item"><div class="detail-label">Berat Aktual</div><div class="detail-value" style="font-family:'DM Mono',monospace">${r.weight}g</div></div>
      <div class="detail-item"><div class="detail-label">Waktu Proses</div><div class="detail-value" style="font-family:'DM Mono',monospace">${r.procTime}s</div></div>
    </div>
    <div style="margin-bottom:10px"><span class="status-pill ${r.status === 'OK' ? 'pill-ok' : 'pill-ng'}" style="font-size:13px;padding:6px 16px">STATUS: ${r.status}</span></div>
    <div class="sensor-bar"><div class="sensor-title">Hasil Computer Vision (Kamera AI)</div><div class="sensor-row"><span class="sensor-label">Qty estimasi visual</span><span class="sensor-val">${r.cvQty} pcs</span></div><div class="sensor-row"><span class="sensor-label">Akurasi model</span><span class="sensor-val">${accuracy.toFixed(1)}%</span></div><div class="progress-wrap"><div class="progress-fill ${accuracy >= 95 ? 'ok' : 'ng'}" style="width:${accuracy}%"></div></div></div>
    <div class="sensor-bar"><div class="sensor-title">Hasil Load Cell (Sensor Berat)</div><div class="sensor-row"><span class="sensor-label">Qty estimasi massa</span><span class="sensor-val">${r.loadQty} pcs</span></div><div class="sensor-row"><span class="sensor-label">Berat terukur</span><span class="sensor-val">${r.weight}g</span></div><div class="sensor-row"><span class="sensor-label">Toleransi</span><span class="sensor-val">± 1g ✓</span></div></div>
    <div class="sensor-bar"><div class="sensor-title">Sensor Fusion — Keputusan Akhir</div><div class="sensor-row"><span class="sensor-label">Hasil CV</span><span class="sensor-val">${r.cvQty} pcs</span></div><div class="sensor-row"><span class="sensor-label">Hasil Load Cell</span><span class="sensor-val">${r.loadQty} pcs</span></div><div class="sensor-row"><span class="sensor-label">Target</span><span class="sensor-val">${r.target} pcs</span></div><div class="sensor-row" style="margin-top:8px;border-top:1px solid var(--slate-200);padding-top:8px"><span class="sensor-label" style="font-weight:700">Keputusan</span><span class="sensor-val" style="color:${r.status === 'OK' ? 'var(--green-600)' : 'var(--red-600)'};font-size:15px">${r.status}</span></div></div>
    ${r.status === 'NOT OK' ? `<button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="closeModal();showPage('report',document.querySelectorAll('.nav-item')[2])">Buat RPP untuk Kasus Ini</button>` : ''}
  `;
  document.getElementById('detailModal').classList.add('open');
};
window.closeModal = function() { document.getElementById('detailModal').classList.remove('open'); };

// ══════════════════════════════
// CHARTS (with real data from API)
// ══════════════════════════════
const chartDefaults = { font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 }, color: '#94A3B8' };
if (window.Chart) { Chart.defaults.font = chartDefaults.font; Chart.defaults.color = chartDefaults.color; }

async function initCharts() {
  // --- Trend chart from real hourly data ---
  try {
    const trend = await apiClient.fetchTrend();
    const labels = trend.map(t => t.hour);
    const okData = trend.map(t => t.ok_count);
    const ngData = trend.map(t => t.ng_count);

    new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00'],
        datasets: [
          { label: 'OK', data: okData.length ? okData : [0], borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,.08)', tension: .4, fill: true, pointRadius: 3, pointBackgroundColor: '#22C55E' },
          { label: 'NOT OK', data: ngData.length ? ngData : [0], borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,.08)', tension: .4, fill: true, pointRadius: 3, pointBackgroundColor: '#EF4444' }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 16, font: { size: 12 } } } }, scales: { x: { grid: { color: 'rgba(0,0,0,.04)' } }, y: { grid: { color: 'rgba(0,0,0,.04)' }, beginAtZero: true } } }
    });
  } catch (e) { console.warn('Trend chart error:', e); }

  // --- Donut chart from stats ---
  try {
    const stats = await apiClient.fetchStats();
    new Chart(document.getElementById('donutChart'), {
      type: 'doughnut',
      data: { labels: ['OK', 'NOT OK'], datasets: [{ data: [stats.today.totalOK, stats.today.totalNG], backgroundColor: ['#22C55E', '#EF4444'], borderWidth: 0, hoverOffset: 4 }] },
      options: { responsive: true, cutout: '72%', plugins: { legend: { display: false } } }
    });
  } catch (e) { console.warn('Donut chart error:', e); }

  // --- Defect trend (report page) ---
  try {
    const defectTrend = await apiClient.fetchDefectTrend();
    const days = defectTrend.map(d => { const p = d.day_label.split(' '); return `${p[0]} ${['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'][parseInt(p[1])] || p[1]}`; });
    const defRates = defectTrend.map(d => d.defect_rate);

    new Chart(document.getElementById('defectTrendChart'), {
      type: 'bar',
      data: { labels: days, datasets: [{ label: 'Defect Rate (%)', data: defRates, backgroundColor: defRates.map(v => v > 4 ? 'rgba(239,68,68,.7)' : v > 3 ? 'rgba(245,158,11,.7)' : 'rgba(34,197,94,.7)'), borderRadius: 4, borderSkipped: false }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: 'rgba(0,0,0,.04)' }, ticks: { callback: v => v + '%' }, beginAtZero: true } } }
    });
  } catch (e) { console.warn('Defect trend chart error:', e); }

  // --- Category chart ---
  try {
    const cats = await apiClient.fetchDefectCategories();
    const catLabels = cats.map(c => c.category);
    const catData = cats.map(c => c.count);
    const catColors = ['rgba(239,68,68,.7)', 'rgba(245,158,11,.7)', 'rgba(59,130,246,.7)', 'rgba(139,92,246,.7)'];

    new Chart(document.getElementById('categoryChart'), {
      type: 'bar',
      data: { labels: catLabels, datasets: [{ label: 'Kasus', data: catData, backgroundColor: catColors.slice(0, catLabels.length), borderRadius: 4, borderSkipped: false }] },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(0,0,0,.04)' }, beginAtZero: true }, y: { grid: { display: false } } } }
    });
  } catch (e) { console.warn('Category chart error:', e); }
}

// ══════════════════════════════
// AUTH
// ══════════════════════════════
window.selectAccount = function(type) {
  window.selectedAccountType = type;
  document.querySelectorAll('.account-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById('card' + type.charAt(0).toUpperCase() + type.slice(1));
  if (card) card.classList.add('selected');
  const passwordArea = document.getElementById('passwordArea');
  const roleName = document.getElementById('selectedRoleName');
  const loginError = document.getElementById('loginError');
  if (passwordArea) {
    passwordArea.style.display = 'block';
    roleName.textContent = type === 'supervisor' ? 'Supervisor' : 'Operator';
    loginError.style.display = 'none';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginPassword').focus();
  }
  document.getElementById('loginBtn').disabled = false;
};

window.doLogin = async function() {
  if (!window.selectedAccountType) return;
  const passwordInput = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  const password = passwordInput.value;

  try {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Memverifikasi...';
    loginError.style.display = 'none';

    currentUser = await apiClient.login(window.selectedAccountType, password);

    document.getElementById('sidebarAvatar').textContent = currentUser.initials;
    document.getElementById('sidebarAvatar').style.background = currentUser.avatarBg;
    document.getElementById('sidebarName').textContent = currentUser.name;
    document.getElementById('sidebarRole').textContent = currentUser.role;

    const badge = document.getElementById('topbarRoleBadge');
    badge.className = 'role-badge ' + currentUser.badgeClass;
    badge.textContent = currentUser.badgeLabel;

    const navReport = document.getElementById('navReport');
    if (!currentUser.access.includes('report')) {
      navReport.classList.add('locked');
      navReport.title = 'Akses terbatas — Supervisor QC only';
    } else {
      navReport.classList.remove('locked');
      navReport.title = '';
    }

    document.querySelectorAll('.supervisor-only').forEach(el => {
      el.style.display = currentUser.access.includes('report') ? '' : 'none';
    });

    document.getElementById('loginScreen').classList.add('hidden');

    // Fetch and render everything from database
    allData = await apiClient.fetchInspections();
    await renderKPIs();
    renderFeed();
    renderTable(allData);
    renderVendors();
    renderPartList();
    renderNGList();
    renderRPP();
    renderWeightPanel(); // Initial weight panel from loaded data
    showPage('dashboard', document.querySelectorAll('.nav-item')[0]);
    initCharts();
    startPolling();

  } catch (err) {
    loginError.style.display = 'block';
    loginError.textContent = err.message;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Masuk ke Dashboard';
  }
};

window.doLogout = function() {
  currentUser = null;
  document.querySelectorAll('.account-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('loginBtn').disabled = true;
  document.getElementById('loginScreen').classList.remove('hidden');
  ['trendChart','donutChart','defectTrendChart','categoryChart'].forEach(id => { const c = Chart.getChart(id); if (c) c.destroy(); });
};

// ══════════════════════════════
// WEIGHT MONITOR (from inspection data)
// ══════════════════════════════
function renderWeightPanel() {
  if (!allData || !allData.length) return;
  const latest = allData[0]; // most recent inspection
  if (!latest) return;

  const weight = parseFloat(latest.weight) || 0;
  const loadQty = latest.loadQty || '?';
  const part = latest.part || '—';

  // Estimate target weight: weight / loadQty * target
  const targetQty = latest.target || 1;
  const unitWeight = loadQty > 0 ? weight / loadQty : 0;
  const targetWeight = +(unitWeight * targetQty).toFixed(1);
  const maxBar = Math.max(targetWeight * 1.5, weight * 1.2, 1);
  const pct = Math.min((weight / maxBar) * 100, 100);

  // Determine status
  const tolerance = targetWeight * 0.05; // 5% tolerance
  let statusClass = 'weight-ok';
  let statusLabel = '✓ Sesuai Target';
  let barClass = '';
  if (weight < targetWeight - tolerance) { statusClass = 'weight-under'; statusLabel = '↓ Kurang'; barClass = 'under'; }
  else if (weight > targetWeight + tolerance) { statusClass = 'weight-over'; statusLabel = '↑ Melebihi'; barClass = 'over'; }

  const delta = +(weight - targetWeight).toFixed(1);
  const deltaStr = delta === 0 ? '±0.0 g' : (delta > 0 ? `+${delta} g` : `${delta} g`);

  // Format timestamp
  const ts = latest.tsStr || '—';

  // Update DOM
  document.getElementById('weightValueBig').textContent = weight.toFixed(1);

  const badge = document.getElementById('weightStatusBadge');
  badge.className = 'weight-status-badge ' + statusClass;
  badge.textContent = statusLabel;

  const fill = document.getElementById('weightBarFill');
  fill.style.width = pct + '%';
  fill.className = 'weight-bar-fill' + (barClass ? ' ' + barClass : '');

  document.getElementById('weightBarLabel').textContent = `Target: ${targetWeight > 0 ? targetWeight + ' g' : '—'}`;
  document.getElementById('weightBarMax').textContent = maxBar.toFixed(0) + ' g';

  const dot = document.getElementById('weightStableDot');
  dot.className = 'weight-stable-dot stable';
  document.getElementById('weightStableText').textContent = 'Pembacaan stabil';
  document.getElementById('weightDeltaText').textContent = deltaStr;
  document.getElementById('weightTimestamp').textContent = ts;

  document.getElementById('weightCellRaw').textContent = weight.toFixed(2) + ' g';
  document.getElementById('weightCellQty').textContent = loadQty + ' pcs';
  document.getElementById('weightCellTarget').textContent = targetWeight > 0 ? targetWeight + ' g' : '—';
  document.getElementById('weightCellPart').textContent = part;
}

// ══════════════════════════════
// CAMERA FEED POLLING
// ══════════════════════════════
let cameraTimer = null;

function startCameraPolling() {
  if (cameraTimer) return;
  cameraTimer = setInterval(async () => {
    try {
      const data = await apiClient.fetchCameraFrame();
      if (data && data.frame) {
        const img = document.getElementById('cameraFeedImg');
        const placeholder = document.getElementById('cameraPlaceholder');
        const liveBadge = document.getElementById('cameraLiveBadge');
        const tsEl = document.getElementById('cameraTimestamp');
        const statusBadge = document.getElementById('cameraStatusBadge');

        img.src = data.frame;
        img.style.display = 'block';
        placeholder.style.display = 'none';
        liveBadge.style.display = 'flex';
        tsEl.style.display = 'block';

        // Format timestamp
        const ts = data.timestamp ? new Date(data.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
        tsEl.textContent = ts + (data.fps ? ` · ${data.fps} fps` : '');

        // Update camera status badge
        statusBadge.style.background = 'var(--green-50)';
        statusBadge.style.color = 'var(--green-600)';
        statusBadge.style.border = '1px solid rgba(34,197,94,.2)';
        statusBadge.innerHTML = '<div class="live-dot"></div> Live Feed';

      }
    } catch (err) {
      // silently fail — camera may not be connected
    }
  }, 500);
}

// ══════════════════════════════
// REAL-TIME POLLING
// ══════════════════════════════
let pollingTimer = null;

async function startPolling() {
  if (pollingTimer) return;

  // Start camera feed polling (independent, faster)
  startCameraPolling();

  pollingTimer = setInterval(async () => {
    try {
      const status = await apiClient.fetchStatus();
      updateHardwareStatusUI(status.online);

      const newData = await apiClient.fetchInspections();
      if (newData.length > allData.length) {
        const countNew = newData.length - allData.length;
        allData = newData;
        renderFeed();
        renderNGList();
        renderWeightPanel(); // Update weight panel with latest inspection
        await renderKPIs();

        const isInspectionPage = document.getElementById('page-inspection').classList.contains('active');
        if (isInspectionPage) filterTable();

        console.log(`[Real-time] ${countNew} data baru diterima.`);
      }
    } catch (err) {
      console.warn('[Polling] Koneksi terputus...', err);
      updateHardwareStatusUI(false);
    }
  }, 3500);
}

function updateHardwareStatusUI(online) {
  const badge = document.getElementById('hwStatusBadge');
  if (!badge) return;
  if (online) {
    badge.style.background = 'var(--green-50)';
    badge.style.color = 'var(--green-600)';
    badge.style.borderColor = 'rgba(34,197,94,.2)';
    badge.innerHTML = '<div class="live-dot"></div> Hardware: Online';
  } else {
    badge.style.background = 'var(--slate-100)';
    badge.style.color = 'var(--slate-400)';
    badge.style.borderColor = 'var(--slate-200)';
    badge.innerHTML = '<div class="live-dot" style="background:var(--slate-300);animation:none"></div> Hardware: Offline';
  }
}
