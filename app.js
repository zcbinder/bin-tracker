/* ============================================================
   BINTRACKER — app.js
   Single-page storage organization app
   ============================================================ */

'use strict';

// ─── GLOBALS ─────────────────────────────────────────────────
let db;

const state = {
  view: 'home',
  locationId: null,
  binId: null,
  searchQuery: '',
  searchTimeout: null,
  pendingUploadBinId: null,
};

const COLORS = [
  { label: 'Indigo',  value: '#6366f1' },
  { label: 'Blue',    value: '#3b82f6' },
  { label: 'Teal',    value: '#14b8a6' },
  { label: 'Green',   value: '#22c55e' },
  { label: 'Orange',  value: '#f97316' },
  { label: 'Rose',    value: '#f43f5e' },
  { label: 'Purple',  value: '#a855f7' },
  { label: 'Slate',   value: '#64748b' },
];

// ─── INIT ─────────────────────────────────────────────────────
async function init() {
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    renderSetupGuide();
    return;
  }

  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Event delegation
  const app = document.getElementById('app');
  app.addEventListener('click', handleClick);
  app.addEventListener('submit', handleSubmit);
  document.getElementById('modal-overlay').addEventListener('click', handleModalBackdrop);

  // Global search
  document.getElementById('global-search').addEventListener('input', e => {
    clearTimeout(state.searchTimeout);
    const q = e.target.value.trim();
    state.searchTimeout = setTimeout(() => {
      if (q.length >= 2) {
        window.location.hash = `#/search?q=${encodeURIComponent(q)}`;
      } else if (q === '') {
        window.location.hash = '#/';
      }
    }, 300);
  });

  // Image file input
  document.getElementById('image-file-input').addEventListener('change', handleImageFiles);

  // Hash routing
  window.addEventListener('hashchange', handleHashChange);

  // Check for QR code scan (?bin=UUID in query string)
  const params = new URLSearchParams(window.location.search);
  const directBinId = params.get('bin');
  if (directBinId) {
    state.view = 'bin';
    state.binId = directBinId;
    await render();
    return;
  }

  handleHashChange();
}

// ─── ROUTER ──────────────────────────────────────────────────
function handleHashChange() {
  const hash = decodeURIComponent(window.location.hash.slice(1) || '/');
  const [path, qs] = hash.split('?');
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'location' && parts[1]) {
    state.view = 'location';
    state.locationId = parts[1];
  } else if (parts[0] === 'bin' && parts[1]) {
    state.view = 'bin';
    state.binId = parts[1];
  } else if (parts[0] === 'search') {
    state.view = 'search';
    state.searchQuery = qs ? (new URLSearchParams(qs).get('q') || '') : '';
    const input = document.getElementById('global-search');
    if (input && document.activeElement !== input) {
      input.value = state.searchQuery;
    }
  } else if (parts[0] === 'print') {
    state.view = 'print';
  } else {
    state.view = 'home';
    document.getElementById('global-search').value = '';
  }

  render();
}

function navigate(path) {
  window.location.hash = path;
}

// ─── MAIN RENDER ─────────────────────────────────────────────
async function render() {
  const backBtn = document.getElementById('back-btn');

  // Show back button for non-home views
  if (state.view === 'home' || state.view === 'print') {
    backBtn.classList.add('hidden');
  } else {
    backBtn.classList.remove('hidden');
  }

  showLoading();
  try {
    switch (state.view) {
      case 'home':     await renderHome();                    break;
      case 'location': await renderLocation(state.locationId); break;
      case 'bin':      await renderBin(state.binId);          break;
      case 'search':   await renderSearch(state.searchQuery); break;
      case 'print':    await renderPrint();                   break;
    }
  } catch (err) {
    console.error(err);
    setContent(`<div class="empty-state"><p style="color:var(--danger)">Error: ${esc(err.message)}</p></div>`);
  }
}

// ─── BACK BUTTON ─────────────────────────────────────────────
document.getElementById('back-btn').addEventListener('click', () => {
  if (state.view === 'bin' && state.locationId) {
    navigate(`#/location/${state.locationId}`);
  } else if (state.view === 'location') {
    navigate('#/');
  } else if (state.view === 'search') {
    navigate('#/');
  } else {
    navigate('#/');
  }
});

// ─── HOME VIEW ───────────────────────────────────────────────
async function renderHome() {
  const { data: locations, error } = await db
    .from('locations')
    .select('*, bins(count)')
    .order('name');

  if (error) throw error;

  let html = `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Storage Locations</h1>
        <p class="page-subtitle">${locations.length} location${locations.length !== 1 ? 's' : ''}</p>
      </div>
    </div>
    <div class="locations-grid">
  `;

  for (const loc of locations) {
    const binCount = loc.bins?.[0]?.count ?? 0;
    html += `
      <div class="location-card" data-action="navigate" data-path="/location/${loc.id}">
        <div class="location-card-accent" style="background:${esc(loc.color)}"></div>
        <div class="location-card-body">
          <div class="location-card-header">
            <div class="location-name">${esc(loc.name)}</div>
            <div style="display:flex;gap:4px;flex-shrink:0" onclick="event.stopPropagation()">
              <button class="btn-icon btn-sm" data-action="edit-location" data-id="${loc.id}" title="Edit">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon btn-sm" data-action="delete-location" data-id="${loc.id}" data-name="${esc(loc.name)}" title="Delete" style="color:var(--danger)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </div>
          <div class="location-card-desc">${esc(loc.description) || '<span style="font-style:italic;color:var(--text-muted)">No description</span>'}</div>
          <div class="location-stats">
            <div class="stat">
              <span class="stat-value" style="color:${esc(loc.color)}">${binCount}</span>
              <span class="stat-label">Bin${binCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="stat">
              <span class="stat-value" style="font-family:monospace;font-size:.9rem">${esc(loc.prefix)}</span>
              <span class="stat-label">Prefix</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  html += `
      <div class="add-location-card" data-action="add-location">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
        Add Location
      </div>
    </div>
  `;

  setContent(html);
}

// ─── LOCATION VIEW ────────────────────────────────────────────
async function renderLocation(locationId) {
  const [{ data: loc, error: locErr }, { data: bins, error: binsErr }] = await Promise.all([
    db.from('locations').select('*').eq('id', locationId).single(),
    db.from('bins').select('*, items(count)').eq('location_id', locationId).order('display_id'),
  ]);

  if (locErr) throw locErr;
  if (binsErr) throw binsErr;

  // Save locationId in state for back button from bin view
  state.locationId = locationId;

  let html = `
    <div class="breadcrumb">
      <a data-action="navigate" data-path="/">Home</a>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
      <span>${esc(loc.name)}</span>
    </div>
    <div class="page-header">
      <div class="page-header-left">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <div style="width:14px;height:14px;border-radius:50%;background:${esc(loc.color)};flex-shrink:0"></div>
          <h1 class="page-title">${esc(loc.name)}</h1>
        </div>
        ${loc.description ? `<p class="page-subtitle">${esc(loc.description)}</p>` : ''}
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit-location" data-id="${loc.id}">Edit</button>
        <button class="btn btn-primary btn-sm" data-action="add-bin" data-location-id="${loc.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/></svg>
          Add Bin
        </button>
      </div>
    </div>
    <div class="bins-grid">
  `;

  for (const bin of bins) {
    const itemCount = bin.items?.[0]?.count ?? 0;
    html += `
      <div class="bin-card" data-action="navigate" data-path="/bin/${bin.id}">
        <span class="bin-card-id" style="background:${hexWithAlpha(loc.color, .12)};color:${esc(loc.color)}">${esc(bin.display_id)}</span>
        <div class="bin-card-label">${esc(bin.label) || '<span style="color:var(--text-muted);font-style:italic">Unlabeled</span>'}</div>
        ${bin.description ? `<div class="bin-card-desc">${esc(bin.description)}</div>` : ''}
        <div class="bin-card-footer">
          <span class="item-count">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            ${itemCount} item${itemCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    `;
  }

  html += `
      <div class="add-bin-card" data-action="add-bin" data-location-id="${loc.id}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/></svg>
        Add Bin
      </div>
    </div>
  `;

  setContent(html);
}

// ─── BIN DETAIL VIEW ──────────────────────────────────────────
async function renderBin(binId) {
  const [
    { data: bin, error: binErr },
    { data: items, error: itemsErr },
    { data: images, error: imagesErr },
  ] = await Promise.all([
    db.from('bins').select('*, locations(*)').eq('id', binId).single(),
    db.from('items').select('*').eq('bin_id', binId).order('created_at'),
    db.from('bin_images').select('*').eq('bin_id', binId).order('created_at'),
  ]);

  if (binErr) throw binErr;

  const loc = bin.locations;
  const color = loc?.color || '#6366f1';

  let html = ``;

  // Breadcrumb
  if (loc) {
    html += `
      <div class="breadcrumb">
        <a data-action="navigate" data-path="/">Home</a>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        <a data-action="navigate" data-path="/location/${loc.id}">${esc(loc.name)}</a>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        <span>${esc(bin.display_id)}</span>
      </div>
    `;
  }

  // Header
  html += `
    <div class="bin-detail-header">
      <div class="bin-detail-meta">
        <span class="bin-display-id" style="background:${hexWithAlpha(color,.12)};color:${esc(color)}">${esc(bin.display_id)}</span>
        <div class="bin-detail-label">${esc(bin.label) || 'Unlabeled Bin'}</div>
        ${bin.description ? `<div class="bin-detail-desc">${esc(bin.description)}</div>` : ''}
        ${loc ? `<span class="location-badge" style="background:${hexWithAlpha(color,.1)};color:${esc(color)};border:1px solid ${hexWithAlpha(color,.25)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          ${esc(loc.name)}
        </span>` : ''}
      </div>
      <div id="qr-thumb-${binId}" class="bin-qr-thumb" data-action="show-qr" data-bin-id="${binId}" title="View QR Code"></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:28px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" data-action="edit-bin" data-id="${binId}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit Bin
      </button>
      <button class="btn btn-secondary btn-sm" data-action="show-qr" data-bin-id="${binId}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="4" height="4"/></svg>
        QR Code
      </button>
      <button class="btn btn-danger btn-sm" data-action="delete-bin" data-id="${binId}" data-name="${esc(bin.display_id)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        Delete
      </button>
    </div>
  `;

  // Photos section
  html += `
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Photos
          <span class="section-count">${(images || []).length}</span>
        </h2>
      </div>
      <div class="image-gallery" id="image-gallery-${binId}">
        ${(images || []).map(img => `
          <div class="gallery-item">
            <img src="${esc(img.public_url)}" alt="${esc(img.caption)}" loading="lazy" />
            <button class="gallery-item-delete" data-action="delete-image" data-id="${img.id}" data-path="${esc(img.storage_path)}" title="Delete photo">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        `).join('')}
        <div class="gallery-add" data-action="upload-image" data-bin-id="${binId}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/><path d="M12 2v4M2 12h4"/></svg>
          Add Photo
        </div>
      </div>
    </div>
  `;

  // Items section
  html += `
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
          Items
          <span class="section-count">${(items || []).length}</span>
        </h2>
        <button class="btn btn-primary btn-sm" data-action="show-add-item" data-bin-id="${binId}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/></svg>
          Add Item
        </button>
      </div>
      <div id="items-container-${binId}">
        ${renderItemsList(items || [], binId)}
      </div>
    </div>
  `;

  setContent(html);

  // Render QR code thumbnail
  renderQrCanvas(`qr-thumb-${binId}`, binId, 64);
}

function renderItemsList(items, binId) {
  if (!items.length) {
    return `<div class="empty-state" style="padding:32px 0">
      <p>No items yet. Add items to track what's in this bin.</p>
    </div>`;
  }

  return `<div class="items-list">
    ${items.map(item => `
      <div class="item-row" data-item-id="${item.id}">
        <div class="item-info">
          <div class="item-name">${esc(item.name)}</div>
          ${item.description ? `<div class="item-desc">${esc(item.description)}</div>` : ''}
        </div>
        ${item.quantity ? `<span class="item-qty">${esc(item.quantity)}</span>` : ''}
        <div class="item-actions">
          <button class="item-action-btn" data-action="edit-item" data-id="${item.id}" data-bin-id="${binId}" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="item-action-btn delete" data-action="delete-item" data-id="${item.id}" data-bin-id="${binId}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
    `).join('')}
  </div>`;
}

// ─── SEARCH VIEW ─────────────────────────────────────────────
async function renderSearch(query) {
  if (!query || query.length < 2) {
    setContent(`<div class="empty-state">
      <div class="empty-state-icon">🔍</div>
      <h3>Search Items</h3>
      <p>Type at least 2 characters in the search bar above to find items across all bins.</p>
    </div>`);
    return;
  }

  const { data: items, error } = await db
    .from('items')
    .select('*, bins(id, display_id, label, location_id, locations(id, name, color))')
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(100);

  if (error) throw error;

  // Also search by bin label / display_id
  const { data: binMatches } = await db
    .from('bins')
    .select('id, display_id, label, location_id, locations(id, name, color)')
    .or(`display_id.ilike.%${query}%,label.ilike.%${query}%`)
    .limit(50);

  let html = `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Search Results</h1>
        <p class="page-subtitle">Searching for "${esc(query)}"</p>
      </div>
    </div>
  `;

  const totalResults = (items?.length || 0) + (binMatches?.length || 0);

  if (totalResults === 0) {
    html += `<div class="empty-state">
      <div class="empty-state-icon">😕</div>
      <h3>No results found</h3>
      <p>Nothing matched "${esc(query)}". Try a different search term.</p>
    </div>`;
    setContent(html);
    return;
  }

  html += `<div class="search-results">`;

  // Bin matches (by ID or label)
  if (binMatches?.length) {
    html += `<div style="font-size:.8rem;font-weight:600;color:var(--text-muted);letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px;padding-left:2px">Bins</div>`;
    for (const bin of binMatches) {
      const loc = bin.locations;
      const color = loc?.color || '#6366f1';
      html += `
        <div class="search-result-card" data-action="navigate" data-path="/bin/${bin.id}">
          <div class="search-result-icon" style="background:${hexWithAlpha(color,.12)};color:${esc(color)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2"/></svg>
          </div>
          <div class="search-result-info">
            <div class="search-result-name">${highlightMatch(bin.label || bin.display_id, query)}</div>
            <div class="search-result-meta">
              <span class="meta-tag" style="color:${esc(color)};border-color:${hexWithAlpha(color,.25)};background:${hexWithAlpha(color,.08)}">${esc(bin.display_id)}</span>
              ${loc ? `<span class="meta-tag">${esc(loc.name)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }
  }

  // Item matches
  if (items?.length) {
    html += `<div style="font-size:.8rem;font-weight:600;color:var(--text-muted);letter-spacing:.05em;text-transform:uppercase;margin:8px 0 4px;padding-left:2px">Items</div>`;
    for (const item of items) {
      const bin = item.bins;
      const loc = bin?.locations;
      const color = loc?.color || '#6366f1';
      html += `
        <div class="search-result-card" data-action="navigate" data-path="/bin/${bin?.id}">
          <div class="search-result-icon" style="background:${hexWithAlpha(color,.12)};color:${esc(color)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
          </div>
          <div class="search-result-info">
            <div class="search-result-name">${highlightMatch(item.name, query)}</div>
            ${item.description ? `<div class="search-result-desc">${esc(item.description)}</div>` : ''}
            <div class="search-result-meta">
              ${bin ? `<span class="meta-tag" style="color:${esc(color)};border-color:${hexWithAlpha(color,.25)};background:${hexWithAlpha(color,.08)}">${esc(bin.display_id)}</span>` : ''}
              ${bin?.label ? `<span class="meta-tag">${esc(bin.label)}</span>` : ''}
              ${loc ? `<span class="meta-tag">${esc(loc.name)}</span>` : ''}
              ${item.quantity ? `<span class="meta-tag">Qty: ${esc(item.quantity)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }
  }

  html += `</div>`;
  setContent(html);
}

// ─── PRINT VIEW ───────────────────────────────────────────────
async function renderPrint() {
  const [{ data: locations }, { data: bins }] = await Promise.all([
    db.from('locations').select('*').order('name'),
    db.from('bins').select('*, locations(name, color)').order('display_id'),
  ]);

  let html = `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Print Labels</h1>
        <p class="page-subtitle">Select bins and print QR code labels</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="printSelectedLabels()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print Selected
        </button>
      </div>
    </div>

    <div class="print-controls">
      <label style="font-size:.875rem;font-weight:500">Filter by location:</label>
      <select class="form-select" id="print-location-filter" onchange="filterPrintBins()">
        <option value="">All Locations</option>
        ${(locations || []).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px;margin-left:auto">
        <button class="btn btn-secondary btn-sm" onclick="toggleAllBins(true)">Select All</button>
        <button class="btn btn-secondary btn-sm" onclick="toggleAllBins(false)">Deselect All</button>
      </div>
    </div>

    <div class="print-bin-list" id="print-bin-list">
  `;

  for (const bin of (bins || [])) {
    const loc = bin.locations;
    const color = loc?.color || '#6366f1';
    html += `
      <div class="print-bin-row" data-location-id="${bin.location_id || ''}">
        <label>
          <input type="checkbox" class="print-bin-check" value="${bin.id}" checked />
          <span class="print-bin-id" style="background:${hexWithAlpha(color,.12)};color:${esc(color)}">${esc(bin.display_id)}</span>
          <span class="print-bin-name">${esc(bin.label || '—')}</span>
        </label>
        <span class="print-bin-location">${loc ? esc(loc.name) : ''}</span>
      </div>
    `;
  }

  html += `</div>`;

  // Hidden print sheet (populated when printing)
  html += `<div class="print-labels-sheet" id="print-labels-sheet"></div>`;

  setContent(html);
}

window.filterPrintBins = function () {
  const locId = document.getElementById('print-location-filter').value;
  document.querySelectorAll('.print-bin-row').forEach(row => {
    row.style.display = (!locId || row.dataset.locationId === locId) ? '' : 'none';
  });
};

window.toggleAllBins = function (checked) {
  document.querySelectorAll('.print-bin-check').forEach(cb => {
    if (cb.closest('.print-bin-row').style.display !== 'none') {
      cb.checked = checked;
    }
  });
};

window.printSelectedLabels = async function () {
  const checked = [...document.querySelectorAll('.print-bin-check:checked')];
  if (!checked.length) { showToast('Select at least one bin', 'error'); return; }

  const binIds = checked.map(cb => cb.value);
  const { data: bins } = await db
    .from('bins')
    .select('*, locations(name, color)')
    .in('id', binIds);

  const sheet = document.getElementById('print-labels-sheet');
  sheet.innerHTML = '';

  for (const bin of (bins || [])) {
    const div = document.createElement('div');
    div.className = 'print-label';
    const canvas = document.createElement('canvas');
    const idEl = document.createElement('div');
    idEl.className = 'print-label-id';
    idEl.textContent = bin.display_id;
    const nameEl = document.createElement('div');
    nameEl.className = 'print-label-name';
    nameEl.textContent = bin.label || '';
    const locEl = document.createElement('div');
    locEl.className = 'print-label-location';
    locEl.textContent = bin.locations?.name || '';
    div.appendChild(canvas);
    div.appendChild(idEl);
    div.appendChild(nameEl);
    div.appendChild(locEl);
    sheet.appendChild(div);

    const url = `${SITE_URL}?bin=${bin.id}`;
    await QRCode.toCanvas(canvas, url, { width: 120, margin: 1 });
  }

  window.print();
};

// ─── EVENT HANDLERS ───────────────────────────────────────────
function handleClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const action = el.dataset.action;

  switch (action) {
    case 'navigate':
      navigate(`#${el.dataset.path}`);
      break;

    case 'add-location':
      showLocationModal();
      break;

    case 'edit-location':
      showLocationModal(el.dataset.id);
      break;

    case 'delete-location':
      confirmDelete('location', el.dataset.id, el.dataset.name, async () => {
        await db.from('locations').delete().eq('id', el.dataset.id);
        navigate('#/');
      });
      break;

    case 'add-bin':
      showBinModal(null, el.dataset.locationId);
      break;

    case 'edit-bin':
      showBinModal(el.dataset.id);
      break;

    case 'delete-bin':
      confirmDelete('bin', el.dataset.id, el.dataset.name, async () => {
        await db.from('bins').delete().eq('id', el.dataset.id);
        if (state.locationId) {
          navigate(`#/location/${state.locationId}`);
        } else {
          navigate('#/');
        }
      });
      break;

    case 'show-add-item':
      showItemModal(null, el.dataset.binId);
      break;

    case 'edit-item':
      showItemModal(el.dataset.id, el.dataset.binId);
      break;

    case 'delete-item': {
      const { id, binId } = el.dataset;
      confirmDelete('item', id, '', async () => {
        await db.from('items').delete().eq('id', id);
        await refreshItems(binId);
      });
      break;
    }

    case 'upload-image':
      state.pendingUploadBinId = el.dataset.binId;
      document.getElementById('image-file-input').click();
      break;

    case 'delete-image': {
      const { id, path } = el.dataset;
      confirmDelete('photo', id, '', async () => {
        await db.storage.from('bin-images').remove([path]);
        await db.from('bin_images').delete().eq('id', id);
        await renderBin(state.binId);
      });
      break;
    }

    case 'show-qr':
      showQrModal(el.dataset.binId);
      break;

    case 'close-modal':
      closeModal();
      break;
  }
}

function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const action = form.dataset.action;

  if (action === 'save-location') saveLocation(form);
  if (action === 'save-bin') saveBin(form);
  if (action === 'save-item') saveItem(form);
}

function handleModalBackdrop(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

async function handleImageFiles(e) {
  const binId = state.pendingUploadBinId;
  if (!binId) return;

  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;

  const gallery = document.getElementById(`image-gallery-${binId}`);
  if (!gallery) return;

  for (const file of files) {
    // Show upload placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'gallery-uploading';
    placeholder.innerHTML = '<div class="spinner"></div>';
    gallery.insertBefore(placeholder, gallery.lastElementChild);

    try {
      const ext = file.name.split('.').pop();
      const path = `${binId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await db.storage.from('bin-images').upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = db.storage.from('bin-images').getPublicUrl(path);
      const { error: dbErr } = await db.from('bin_images').insert({
        bin_id: binId,
        storage_path: path,
        public_url: urlData.publicUrl,
      });
      if (dbErr) throw dbErr;

      placeholder.remove();

      // Add real gallery item
      const item = document.createElement('div');
      item.className = 'gallery-item';
      // We need the id, refetch last inserted
      const { data: imgs } = await db.from('bin_images').select('*').eq('bin_id', binId).order('created_at', { ascending: false }).limit(1);
      const img = imgs?.[0];
      if (img) {
        item.innerHTML = `
          <img src="${esc(img.public_url)}" alt="" loading="lazy" />
          <button class="gallery-item-delete" data-action="delete-image" data-id="${img.id}" data-path="${esc(img.storage_path)}" title="Delete photo">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        `;
        gallery.insertBefore(item, gallery.lastElementChild);
      }

      // Update count
      const countEl = document.querySelector(`#image-gallery-${binId}`)?.closest('.section')?.querySelector('.section-count');
      if (countEl) {
        const { count } = await db.from('bin_images').select('*', { count: 'exact', head: true }).eq('bin_id', binId);
        countEl.textContent = count;
      }
    } catch (err) {
      placeholder.remove();
      showToast('Upload failed: ' + err.message, 'error');
    }
  }
}

// ─── LOCATION MODAL ───────────────────────────────────────────
async function showLocationModal(id = null) {
  let loc = null;
  if (id) {
    const { data } = await db.from('locations').select('*').eq('id', id).single();
    loc = data;
  }

  const selectedColor = loc?.color || COLORS[0].value;

  const html = `
    <h2 class="modal-title">${id ? 'Edit Location' : 'Add Location'}</h2>
    <form data-action="save-location">
      <input type="hidden" name="id" value="${id || ''}" />
      <div class="form-group">
        <label class="form-label">Location Name *</label>
        <input class="form-input" name="name" placeholder="e.g. Storage Closet, Garage" value="${esc(loc?.name || '')}" required autofocus />
      </div>
      <div class="form-input-row">
        <div class="form-group">
          <label class="form-label">Bin ID Prefix *</label>
          <p class="form-sublabel">Used to generate bin IDs (e.g. SC → SC-001)</p>
          <input class="form-input" name="prefix" placeholder="e.g. SC" maxlength="6"
            value="${esc(loc?.prefix || '')}" required style="text-transform:uppercase;font-family:monospace;font-weight:700" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input class="form-input" name="description" placeholder="Optional description" value="${esc(loc?.description || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-picker-row" id="color-picker">
          ${COLORS.map(c => `
            <div class="color-swatch ${c.value === selectedColor ? 'selected' : ''}"
              style="background:${c.value}"
              data-color="${c.value}"
              title="${c.label}"
              onclick="selectColor('${c.value}')"></div>
          `).join('')}
        </div>
        <input type="hidden" name="color" value="${selectedColor}" id="color-value" />
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? 'Save Changes' : 'Add Location'}</button>
      </div>
    </form>
  `;

  openModal(html);

  // Auto-suggest prefix from name
  const nameInput = document.querySelector('[data-action="save-location"] [name="name"]');
  const prefixInput = document.querySelector('[data-action="save-location"] [name="prefix"]');
  if (!id) {
    nameInput?.addEventListener('input', () => {
      const words = nameInput.value.trim().split(/\s+/);
      const prefix = words.map(w => w[0]?.toUpperCase() || '').join('').slice(0, 4);
      prefixInput.value = prefix;
    });
  }
}

window.selectColor = function (color) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === color));
  document.getElementById('color-value').value = color;
};

async function saveLocation(form) {
  const data = Object.fromEntries(new FormData(form));
  data.prefix = data.prefix.toUpperCase();

  const { error } = data.id
    ? await db.from('locations').update({ name: data.name, description: data.description, color: data.color, prefix: data.prefix }).eq('id', data.id)
    : await db.from('locations').insert({ name: data.name, description: data.description, color: data.color, prefix: data.prefix });

  if (error) { showToast(error.message, 'error'); return; }

  closeModal();
  showToast(data.id ? 'Location updated' : 'Location added');

  if (state.view === 'home') {
    await renderHome();
  } else if (state.view === 'location') {
    await renderLocation(state.locationId);
  }
}

// ─── BIN MODAL ────────────────────────────────────────────────
async function showBinModal(id = null, locationId = null) {
  const [
    { data: bin },
    { data: locations },
  ] = await Promise.all([
    id ? db.from('bins').select('*').eq('id', id).single() : Promise.resolve({ data: null }),
    db.from('locations').select('*').order('name'),
  ]);

  const effectiveLocId = bin?.location_id || locationId || '';

  let suggestedId = '';
  if (!id && effectiveLocId) {
    suggestedId = await generateDisplayId(effectiveLocId, locations);
  }

  const html = `
    <h2 class="modal-title">${id ? 'Edit Bin' : 'Add Bin'}</h2>
    <form data-action="save-bin">
      <input type="hidden" name="id" value="${id || ''}" />
      <div class="form-input-row">
        <div class="form-group" style="max-width:140px">
          <label class="form-label">Bin ID *</label>
          <input class="form-input" name="display_id" placeholder="SC-001"
            value="${esc(bin?.display_id || suggestedId)}" required
            style="font-family:monospace;font-weight:700;text-transform:uppercase" />
        </div>
        <div class="form-group">
          <label class="form-label">Location *</label>
          <select class="form-select" name="location_id" id="bin-location-select" required>
            <option value="">Select location…</option>
            ${(locations || []).map(l => `
              <option value="${l.id}" data-prefix="${esc(l.prefix)}" ${l.id === effectiveLocId ? 'selected' : ''}>${esc(l.name)}</option>
            `).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Label / Name</label>
        <input class="form-input" name="label" placeholder="e.g. Holiday Decorations, Winter Clothes"
          value="${esc(bin?.label || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" name="description" placeholder="Optional notes about this bin">${esc(bin?.description || '')}</textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? 'Save Changes' : 'Add Bin'}</button>
      </div>
    </form>
  `;

  openModal(html);

  // Auto-update suggested ID when location changes
  if (!id) {
    document.getElementById('bin-location-select')?.addEventListener('change', async function () {
      const opt = this.options[this.selectedIndex];
      const locId = this.value;
      if (locId) {
        const suggested = await generateDisplayId(locId, locations);
        document.querySelector('[data-action="save-bin"] [name="display_id"]').value = suggested;
      }
    });
  }
}

async function generateDisplayId(locationId, locations) {
  const loc = locations?.find(l => l.id === locationId);
  if (!loc) return '';

  const { data: existing } = await db
    .from('bins')
    .select('display_id')
    .eq('location_id', locationId);

  const nums = (existing || [])
    .map(b => parseInt(b.display_id.split('-').pop(), 10))
    .filter(n => !isNaN(n));

  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${loc.prefix}-${String(next).padStart(3, '0')}`;
}

async function saveBin(form) {
  const data = Object.fromEntries(new FormData(form));
  data.display_id = data.display_id.toUpperCase();

  const payload = {
    display_id: data.display_id,
    location_id: data.location_id || null,
    label: data.label,
    description: data.description,
  };

  const { error } = data.id
    ? await db.from('bins').update(payload).eq('id', data.id)
    : await db.from('bins').insert(payload);

  if (error) { showToast(error.message, 'error'); return; }

  closeModal();
  showToast(data.id ? 'Bin updated' : 'Bin added');

  if (state.view === 'location') {
    await renderLocation(state.locationId);
  } else if (state.view === 'bin') {
    await renderBin(state.binId);
  }
}

// ─── ITEM MODAL ───────────────────────────────────────────────
async function showItemModal(id = null, binId) {
  let item = null;
  if (id) {
    const { data } = await db.from('items').select('*').eq('id', id).single();
    item = data;
  }

  const html = `
    <h2 class="modal-title">${id ? 'Edit Item' : 'Add Item'}</h2>
    <form data-action="save-item">
      <input type="hidden" name="id" value="${id || ''}" />
      <input type="hidden" name="bin_id" value="${binId}" />
      <div class="form-group">
        <label class="form-label">Item Name *</label>
        <input class="form-input" name="name" placeholder="e.g. Christmas lights, Winter jacket"
          value="${esc(item?.name || '')}" required autofocus />
      </div>
      <div class="form-input-row">
        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input class="form-input" name="quantity" placeholder="e.g. 3, 1 box, set of 4"
            value="${esc(item?.quantity || '')}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description / Notes</label>
        <textarea class="form-textarea" name="description" placeholder="Additional details, condition, etc.">${esc(item?.description || '')}</textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? 'Save Changes' : 'Add Item'}</button>
      </div>
    </form>
  `;

  openModal(html);
}

async function saveItem(form) {
  const data = Object.fromEntries(new FormData(form));
  const payload = { name: data.name, description: data.description, quantity: data.quantity, bin_id: data.bin_id };

  const { error } = data.id
    ? await db.from('items').update(payload).eq('id', data.id)
    : await db.from('items').insert(payload);

  if (error) { showToast(error.message, 'error'); return; }

  closeModal();
  showToast(data.id ? 'Item updated' : 'Item added');
  await refreshItems(data.bin_id);
}

async function refreshItems(binId) {
  const { data: items } = await db.from('items').select('*').eq('bin_id', binId).order('created_at');
  const container = document.getElementById(`items-container-${binId}`);
  if (container) {
    container.innerHTML = renderItemsList(items || [], binId);
  }
  const countEl = container?.closest('.section')?.querySelector('.section-count');
  if (countEl) countEl.textContent = (items || []).length;
}

// ─── QR CODE MODAL ────────────────────────────────────────────
async function showQrModal(binId) {
  const { data: bin } = await db.from('bins').select('display_id, label').eq('id', binId).single();
  const url = `${SITE_URL}?bin=${binId}`;

  const html = `
    <h2 class="modal-title">QR Code — ${esc(bin?.display_id || binId)}</h2>
    <div class="qr-modal-body">
      <canvas id="qr-modal-canvas" class="qr-modal-canvas"></canvas>
      <div class="qr-modal-id">${esc(bin?.display_id || '')}</div>
      ${bin?.label ? `<div style="font-weight:500;font-size:.9rem">${esc(bin.label)}</div>` : ''}
      <div class="qr-modal-url">${esc(url)}</div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-secondary" onclick="downloadQr('${binId}', '${esc(bin?.display_id || '')}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download PNG
        </button>
      </div>
    </div>
  `;

  openModal(html);
  await QRCode.toCanvas(document.getElementById('qr-modal-canvas'), url, { width: 220, margin: 2 });
}

window.downloadQr = async function (binId, displayId) {
  const url = `${SITE_URL}?bin=${binId}`;
  const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2 });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${displayId || binId}-qr.png`;
  a.click();
};

async function renderQrCanvas(containerId, binId, size = 64) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const url = `${SITE_URL}?bin=${binId}`;
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, { width: size, margin: 1 });
  el.appendChild(canvas);
}

// ─── DELETE CONFIRM ───────────────────────────────────────────
function confirmDelete(type, id, name, onConfirm) {
  const label = name ? `"${esc(name)}"` : `this ${type}`;
  const html = `
    <h2 class="modal-title">Delete ${capitalize(type)}</h2>
    <p style="color:var(--text-muted);font-size:.9rem;line-height:1.5;margin-bottom:24px">
      Are you sure you want to delete ${label}? This cannot be undone.
      ${type === 'location' ? '<br><br><strong>All bins in this location will also be deleted.</strong>' : ''}
      ${type === 'bin' ? '<br><br><strong>All items and photos in this bin will also be deleted.</strong>' : ''}
    </p>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
      <button class="btn btn-danger" id="confirm-delete-btn">Delete</button>
    </div>
  `;
  openModal(html);
  document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    closeModal();
    await onConfirm();
    showToast(`${capitalize(type)} deleted`);
  });
}

// ─── MODAL HELPERS ────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
  document.body.style.overflow = '';
}

// ─── SETUP GUIDE ─────────────────────────────────────────────
function renderSetupGuide() {
  setContent(`
    <div class="setup-guide">
      <div class="page-header">
        <h1 class="page-title">Welcome to BinTracker!</h1>
        <p class="page-subtitle">Complete these steps to get started</p>
      </div>
      <div class="setup-step">
        <div class="setup-step-num">1</div>
        <h3>Create a Supabase project</h3>
        <p>Go to <strong>supabase.com</strong> and create a free account + new project. Wait for it to finish provisioning.</p>
      </div>
      <div class="setup-step">
        <div class="setup-step-num">2</div>
        <h3>Run the database setup</h3>
        <p>In your Supabase project, open <strong>SQL Editor → New Query</strong>, paste the contents of <code>setup.sql</code>, and run it.</p>
      </div>
      <div class="setup-step">
        <div class="setup-step-num">3</div>
        <h3>Create the storage bucket</h3>
        <p>Go to <strong>Storage</strong> in Supabase, create a bucket named <code>bin-images</code>, and set it to <strong>Public</strong>.</p>
      </div>
      <div class="setup-step">
        <div class="setup-step-num">4</div>
        <h3>Fill in config.js</h3>
        <p>Open <code>config.js</code> and paste your <strong>Project URL</strong> and <strong>anon key</strong> from Supabase → Settings → API. Also set your GitHub Pages URL.</p>
      </div>
      <div class="setup-step">
        <div class="setup-step-num">5</div>
        <h3>Upload to GitHub Pages</h3>
        <p>Create a new GitHub repo, upload all files, enable Pages from the repo settings, and you're live!</p>
      </div>
    </div>
  `);
}

// ─── TOAST ────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2200);
  setTimeout(() => t.remove(), 2500);
}

// ─── UTILITIES ───────────────────────────────────────────────
function setContent(html) {
  document.getElementById('app').innerHTML = html;
}

function showLoading() {
  setContent('<div class="spinner-wrap"><div class="spinner"></div></div>');
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hexWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function highlightMatch(text, query) {
  if (!text) return '';
  const escaped = esc(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<span class="highlight">$1</span>');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── START ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
