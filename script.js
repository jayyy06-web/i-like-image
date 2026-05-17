// ── State ──
const state = {
  compress: { files: [], processed: [] },
  convert:  { files: [], processed: [] },
  resize:   { files: [], processed: [] },
  custom:   { files: [], processed: [] }
};

// ── Compress Mode (smart | manual) ──
let compressMode = 'smart';

function setCompressMode(mode) {
  compressMode = mode;
  document.getElementById('smartSettings').style.display  = mode === 'smart'  ? 'grid' : 'none';
  document.getElementById('manualSettings').style.display = mode === 'manual' ? 'grid' : 'none';
  document.getElementById('modeBtn-smart').classList.toggle('active',  mode === 'smart');
  document.getElementById('modeBtn-manual').classList.toggle('active', mode === 'manual');
}

// ── KB / MB Unit Toggle ──
let targetUnit = 'KB';
function toggleTargetUnit() {
  targetUnit = targetUnit === 'KB' ? 'MB' : 'KB';
  const btn  = document.getElementById('unitToggleBtn');
  const hint = document.getElementById('unitHint');
  const inp  = document.getElementById('targetKB');
  btn.textContent  = targetUnit;
  hint.textContent = targetUnit;
  // Convert existing value so the user sees the equivalent in the new unit
  const val = parseFloat(inp.value);
  if (!isNaN(val) && val > 0) {
    inp.value = targetUnit === 'MB'
      ? parseFloat((val / 1024).toFixed(3))
      : Math.round(val * 1024);
  }
  inp.placeholder = targetUnit === 'MB' ? 'e.g. 0.5' : 'e.g. 500';
}

// ── KB / MB Unit Toggle (All-in-One panel) ──
let customTargetUnit = 'KB';
function toggleCustomUnit() {
  customTargetUnit = customTargetUnit === 'KB' ? 'MB' : 'KB';
  const btn  = document.getElementById('customUnitToggleBtn');
  const hint = document.getElementById('customUnitHint');
  const inp  = document.getElementById('custom-targetSize');
  btn.textContent  = customTargetUnit;
  hint.textContent = customTargetUnit;
  const val = parseFloat(inp.value);
  if (!isNaN(val) && val > 0) {
    inp.value = customTargetUnit === 'MB'
      ? parseFloat((val / 1024).toFixed(3))
      : Math.round(val * 1024);
  }
  inp.placeholder = customTargetUnit === 'MB' ? 'e.g. 2' : 'e.g. 500';
}

// ── Theme ──
let darkMode = true;
function toggleTheme() {
  darkMode = !darkMode;
  document.documentElement.setAttribute('data-theme', darkMode ? '' : 'light');
  document.getElementById('themeIcon').className = darkMode ? 'fa fa-moon' : 'fa fa-sun';
}

// ── Tab Switch ──
function switchTab(tab, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
  document.querySelectorAll('.mobile-nav-btn').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  document.querySelectorAll('[data-tab="' + tab + '"]').forEach(el => {
    el.classList.add('active');
    if (el.getAttribute('role') === 'tab') el.setAttribute('aria-selected','true');
  });
}

// ── File Input ──
function triggerInput(tab) {
  document.getElementById('fileInput-' + tab).click();
}

['compress','convert','resize','custom'].forEach(tab => {
  const input = document.getElementById('fileInput-' + tab);
  const zone  = document.getElementById('dropZone-' + tab);

  input.addEventListener('change', e => {
    addFiles(tab, [...e.target.files]);
    e.target.value = ''; // allow re-selecting same file
  });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    addFiles(tab, [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
  });

  // Rename preview — only for compress (smart mode uses renamePrefix-compress)
  const prefix = document.getElementById('renamePrefix-' + tab);
  if (prefix) prefix.addEventListener('input', () => updateRenamePreview(tab));

  // Manual rename preview for compress
  if (tab === 'compress') {
    const prefixManual = document.getElementById('renamePrefix-compress-manual');
    if (prefixManual) prefixManual.addEventListener('input', () => updateRenamePreview('compress-manual'));
  }
});

// ── Add Files ──
function addFiles(tab, files) {
  files = files.filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  files.forEach((file, i) => {
    const id = Date.now() + '_' + i;
    state[tab].files.push({ id, file, status: 'pending' });
    renderFileItem(tab, id, file);
  });

  updateCount(tab);
  document.getElementById('processBtn-' + tab).disabled = false;
  document.getElementById('fileListTitle-' + tab).style.display = 'flex';

  // show before preview for first file (compress panel)
  if (tab === 'compress' && state.compress.files.length >= 1) {
    showBeforePreview(state.compress.files[0].file);
  }
}

// ── Render File Item ──
function renderFileItem(tab, id, file) {
  const list = document.getElementById('fileList-' + tab);
  const div = document.createElement('div');
  div.className = 'file-item';
  div.id = 'fitem-' + id;

  const thumb = document.createElement('div');
  thumb.className = 'file-thumb';
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.createElement('img');
    img.src = e.target.result;
    thumb.innerHTML = '';
    thumb.appendChild(img);
  };
  reader.readAsDataURL(file);
  thumb.innerHTML = '<i class="fa fa-image"></i>';

  const meta = document.createElement('div');
  meta.className = 'file-meta';

  const nm = document.createElement('div');
  nm.className = 'file-name';
  nm.textContent = file.name;

  const info = document.createElement('div');
  info.className = 'file-info';
  info.textContent = formatSize(file.size) + ' · ' + file.type.split('/')[1].toUpperCase();

  meta.appendChild(nm); meta.appendChild(info);

  const statusDiv = document.createElement('div');
  statusDiv.className = 'file-status';
  statusDiv.id = 'fstatus-' + id;
  statusDiv.innerHTML = '<div class="status-dot pending"></div><span style="color:var(--text3);font-size:11px">Pending</span>';

  const sizeAfter = document.createElement('div');
  sizeAfter.className = 'file-size-after';
  sizeAfter.id = 'fsize-' + id;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'file-remove';
  removeBtn.innerHTML = '<i class="fa fa-times"></i>';
  removeBtn.onclick = () => removeFile(tab, id);

  div.appendChild(thumb);
  div.appendChild(meta);
  div.appendChild(statusDiv);
  div.appendChild(sizeAfter);
  div.appendChild(removeBtn);
  list.appendChild(div);
}

// ── Remove File ──
function removeFile(tab, id) {
  state[tab].files = state[tab].files.filter(f => f.id !== id);
  const el = document.getElementById('fitem-' + id);
  if (el) el.remove();
  updateCount(tab);
  if (!state[tab].files.length) {
    document.getElementById('processBtn-' + tab).disabled = true;
    document.getElementById('fileListTitle-' + tab).style.display = 'none';
    document.getElementById('downloadBar-' + tab).style.display = 'none';
    if (tab === 'compress') document.getElementById('statsBar-compress').style.display = 'none';
  }
}

// ── Update Count ──
function updateCount(tab) {
  document.getElementById('fileCountNum-' + tab).textContent = state[tab].files.length;
}

// ── Clear ──
function clearFiles(tab) {
  state[tab].files = [];
  state[tab].processed = [];
  document.getElementById('fileList-' + tab).innerHTML = '';
  document.getElementById('fileCountNum-' + tab).textContent = '0';
  document.getElementById('processBtn-' + tab).disabled = true;
  document.getElementById('fileListTitle-' + tab).style.display = 'none';
  document.getElementById('downloadBar-' + tab).style.display = 'none';
  document.getElementById('downloadBtn-' + tab).disabled = true;
  if (tab === 'compress') {
    document.getElementById('statsBar-compress').style.display = 'none';
    resetPreview();
  }
  document.getElementById('fileInput-' + tab).value = '';
}

// ── Before Preview ──
function showBeforePreview(file) {
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('beforeImgEl').src = e.target.result;
    document.getElementById('beforeSize').textContent = formatSize(file.size);
    const img = new Image();
    img.onload = () => { document.getElementById('beforeDims').textContent = img.width + 'x' + img.height + 'px'; };
    img.src = e.target.result;
    document.getElementById('beforeEmpty').style.display = 'none';
    document.getElementById('beforeImg').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function resetPreview() {
  document.getElementById('beforeEmpty').style.display = 'flex';
  document.getElementById('beforeImg').style.display = 'none';
  document.getElementById('afterEmpty').style.display = 'flex';
  document.getElementById('afterImg').style.display = 'none';
}

// ── Python Backend URL ──
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const API = isLocal ? 'http://localhost:5000' : '';

// ── Backend health check on load ──
let backendOnline = false;
async function checkBackend() {
  try {
    const r = await fetch(API + '/api/health', { signal: AbortSignal.timeout(2000) });
    backendOnline = r.ok;
  } catch { backendOnline = false; }
  const dot = document.getElementById('backendDot');
  const lbl = document.getElementById('backendLbl');
  if (dot && lbl) {
    dot.style.background = backendOnline ? 'var(--green)' : 'var(--red)';
    lbl.textContent = backendOnline ? 'Python backend online' : 'Backend offline — start server.py';
    lbl.style.color = backendOnline ? 'var(--green)' : 'var(--red)';
  }
}
checkBackend();

// ── Call Python API ──
async function callPythonAPI(endpoint, formData) {
  const resp = await fetch(API + endpoint, { method: 'POST', body: formData });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Server error' }));
    throw new Error(err.error || 'Server error');
  }
  const blob = await resp.blob();
  // Read metadata from response headers
  const meta = {
    origSize:   parseInt(resp.headers.get('X-Original-Size') || '0'),
    newSize:    parseInt(resp.headers.get('X-New-Size')      || '0'),
    width:      parseInt(resp.headers.get('X-Width')         || '0'),
    height:     parseInt(resp.headers.get('X-Height')        || '0'),
    ext:        resp.headers.get('X-Extension')   || '.jpg',
    formatUsed: resp.headers.get('X-Format-Used') || '',
    qualUsed:   resp.headers.get('X-Quality-Used') || '',
    mode:       resp.headers.get('X-Mode')         || '',
  };
  return { blob, meta };
}

// ── Process Files — calls Python backend ──
async function processFiles(tab) {
  if (!backendOnline) {
    await checkBackend();
    if (!backendOnline) {
      showToast('Python backend offline! Run: python server.py', 'error');
      return;
    }
  }

  const btn = document.getElementById('processBtn-' + tab);
  const progWrap = document.getElementById('progressWrap-' + tab);
  const progFill = document.getElementById('progressFill-' + tab);

  btn.disabled = true;
  progWrap.style.display = 'flex';
  progFill.style.width = '0%';
  state[tab].processed = [];

  const files = state[tab].files;

  // Determine rename prefix (smart mode has its own field)
  let prefix = '';
  if (tab === 'compress') {
    prefix = compressMode === 'smart'
      ? (document.getElementById('renamePrefix-compress').value || '').trim()
      : (document.getElementById('renamePrefix-compress-manual').value || '').trim();
  } else {
    prefix = (document.getElementById('renamePrefix-' + tab) || {}).value || '';
  }

  let origTotal = 0, newTotal = 0;

  for (let i = 0; i < files.length; i++) {
    const { id, file } = files[i];
    const statusEl = document.getElementById('fstatus-' + id);
    statusEl.innerHTML = '<div class="status-dot processing"></div><span style="color:var(--amber);font-size:11px">Processing</span>';

    try {
      let result;

      if (tab === 'compress') {
        const fd = new FormData();
        fd.append('file', file);

        if (compressMode === 'smart') {
          // ── SMART COMPRESS ──
          fd.append('max_quality', document.getElementById('smartQuality').value);
          const rawTarget = parseFloat(document.getElementById('targetKB').value);
          const targetKBval = (!isNaN(rawTarget) && rawTarget > 0)
            ? (targetUnit === 'MB' ? Math.round(rawTarget * 1024) : Math.round(rawTarget))
            : 0;
          fd.append('target_kb', targetKBval);
          result = await callPythonAPI('/api/smart-compress', fd);
        } else {
          // ── MANUAL COMPRESS ──
          fd.append('quality', document.getElementById('quality-compress').value);
          fd.append('format',  document.getElementById('format-compress').value);
          result = await callPythonAPI('/api/compress', fd);
        }

      } else if (tab === 'convert') {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('quality', document.getElementById('quality-convert').value);
        fd.append('format',  document.getElementById('format-convert').value);
        result = await callPythonAPI('/api/convert', fd);

      } else if (tab === 'resize') {
        const fd = new FormData();
        fd.append('file',       file);
        fd.append('width',      document.getElementById('resizeW').value || '0');
        fd.append('height',     document.getElementById('resizeH').value || '0');
        fd.append('keep_ratio', document.getElementById('keepRatio').checked ? 'true' : 'false');
        fd.append('quality',    document.getElementById('quality-resize').value);
        result = await callPythonAPI('/api/resize', fd);

      } else if (tab === 'custom') {
        const fd = new FormData();
        fd.append('file', file);
        
        fd.append('do_compress', document.getElementById('custom-do-compress').checked ? 'true' : 'false');
        fd.append('format',      document.getElementById('custom-format').value);
        fd.append('quality',     document.getElementById('custom-quality').value);
        // Target size: convert MB → KB if needed
        const rawCustomTarget = parseFloat(document.getElementById('custom-targetSize').value);
        const customTargetKB = (!isNaN(rawCustomTarget) && rawCustomTarget > 0)
          ? (customTargetUnit === 'MB' ? Math.round(rawCustomTarget * 1024) : Math.round(rawCustomTarget))
          : 0;
        fd.append('target_kb', customTargetKB);
        
        fd.append('do_resize',   document.getElementById('custom-do-resize').checked ? 'true' : 'false');
        fd.append('width',       document.getElementById('custom-width').value || '0');
        fd.append('height',      document.getElementById('custom-height').value || '0');
        fd.append('keep_ratio',  document.getElementById('custom-keep-ratio').checked ? 'true' : 'false');
        
        fd.append('do_enhance',  document.getElementById('custom-do-enhance').checked ? 'true' : 'false');
        fd.append('enhance_type',document.getElementById('custom-enhance-type').value);
        
        result = await callPythonAPI('/api/custom', fd);
      }

      const { blob, meta } = result;
      origTotal += meta.origSize || file.size;
      newTotal  += meta.newSize  || blob.size;

      // Build filename
      let baseName = file.name.replace(/\.[^.]+$/, '');
      if (prefix) baseName = prefix + '_' + (i + 1);
      const finalName = baseName + meta.ext;

      state[tab].processed.push({ blob, name: finalName });

      // Status label — show format used in smart mode
      const fmtLabel = meta.formatUsed ? ' (' + meta.formatUsed + (meta.qualUsed ? ' q' + meta.qualUsed : '') + ')' : '';
      statusEl.innerHTML = '<div class="status-dot done"></div><span style="color:var(--green);font-size:11px">Done' + fmtLabel + '</span>';

      const sizeEl = document.getElementById('fsize-' + id);
      const saving = meta.origSize ? Math.round((1 - meta.newSize / meta.origSize) * 100) : 0;
      sizeEl.innerHTML = '&rarr; ' + formatSize(blob.size) +
        (saving > 0 ? ' <span style="color:var(--green);font-size:10px">-' + saving + '%</span>' : '');

      // Before/After preview (compress tab, first file)
      if (tab === 'compress' && i === 0) {
        const prevSrc = document.getElementById('afterImgEl').src;
        if (prevSrc && prevSrc.startsWith('blob:')) URL.revokeObjectURL(prevSrc);
        const url = URL.createObjectURL(blob);
        document.getElementById('afterImgEl').src = url;
        document.getElementById('afterSize').textContent = formatSize(blob.size);
        document.getElementById('afterDims').textContent = meta.width + 'x' + meta.height + 'px';
        document.getElementById('afterEmpty').style.display = 'none';
        document.getElementById('afterImg').style.display = 'block';
      }

    } catch (err) {
      statusEl.innerHTML = '<div class="status-dot error"></div><span style="color:var(--red);font-size:11px" class="error-msg"></span>';
      statusEl.querySelector('.error-msg').textContent = err.message || 'Error';
    }

    progFill.style.width = Math.round(((i + 1) / files.length) * 100) + '%';
  }

  // Stats (compress only)
  if (tab === 'compress' && origTotal > 0) {
    const saved = Math.round(((origTotal - newTotal) / origTotal) * 100);
    document.getElementById('statsBar-compress').style.display = 'grid';
    document.getElementById('stat-saved').textContent = Math.max(0, saved) + '%';
    document.getElementById('stat-orig').textContent  = (origTotal / 1048576).toFixed(1);
    document.getElementById('stat-new').textContent   = (newTotal  / 1048576).toFixed(1);
  }

  const count = state[tab].processed.length;
  const total = files.length;

  document.getElementById('downloadBar-' + tab).style.display = count > 0 ? 'flex' : 'none';
  document.getElementById('downloadBtn-' + tab).disabled = count === 0;
  btn.disabled = false;

  showToast(
    count === total
      ? 'All ' + count + ' images processed!'
      : count + ' of ' + total + ' processed (' + (total - count) + ' failed)',
    count > 0 ? 'success' : 'error'
  );
}

// ── Preset ──
function applyPreset(w, h, btn, prefix = '') {
  const wEl = document.getElementById(prefix ? prefix + '-width' : 'resizeW');
  const hEl = document.getElementById(prefix ? prefix + '-height' : 'resizeH');
  if (w > 0) {
    wEl.value = w;
    hEl.value = h;
  } else {
    wEl.value = '';
    hEl.value = '';
    wEl.focus();
  }
  
  if (btn) {
    const row = btn.closest('.presets-row');
    if (row) {
      row.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    } else {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    }
    btn.classList.add('active');
  }
}

// ── Rename Preview ──
function updateRenamePreview(tab) {
  const inputEl = document.getElementById('renamePrefix-' + tab);
  const el = document.getElementById('renamePreview-' + tab);
  if (!inputEl || !el) return;
  const prefix = inputEl.value.trim();
  const span = el.querySelector('span') || document.createElement('span');
  if (prefix) {
    span.textContent = prefix + '_1.jpg'; // textContent prevents XSS
    el.textContent = 'Preview: ';
    el.appendChild(span);
  } else {
    el.textContent = 'Preview: original_name.jpg';
  }
}

// ── Download All (ZIP) ──
async function downloadAll(tab) {
  const processed = state[tab].processed;
  if (!processed.length) return;

  const btn = document.getElementById('downloadBtn-' + tab);
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Creating ZIP...';

  if (processed.length === 1) {
    // Single file — direct download
    const a = document.createElement('a');
    const url = URL.createObjectURL(processed[0].blob);
    a.href = url;
    a.download = processed[0].name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-download"></i> Download All (ZIP)';
    showToast('Download started!', 'success');
    return;
  }

  const zip = new JSZip();
  processed.forEach(({ blob, name }) => zip.file(name, blob));

  const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(content);
  a.href = url;
  a.download = 'i-like-image-' + tab + '.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);

  btn.disabled = false;
  btn.innerHTML = '<i class="fa fa-download"></i> Download All (ZIP)';
  showToast('ZIP downloaded!', 'success');
}

// ── Toast ──
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = `<i class="fa ${type==='success'?'fa-check-circle':'fa-exclamation-circle'}"></i>${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Format Size ──
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}
