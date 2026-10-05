/**
 * Global search — shared header search across Bookings, People and Places.
 * British English. Debounced. Uses in-memory data when provided, else Supabase.
 */
(function (global) {
  'use strict';

  /**
   * Hide legacy planner rows that are still in the database or on this device.
   * A row is legacy when its key or client_key is "demo", or when
   * payload.source or payload.bookingKey is "demo".
   * This does not create, seed, or label any tour.
   */
  function isLegacyDemoPlan(key, plan) {
    function token(value) {
      return String(value == null ? '' : value).trim().toLowerCase() === 'demo';
    }
    if (token(key)) return true;
    if (!plan || typeof plan !== 'object') return false;
    if (token(plan.client_key) || token(plan.bookingKey) || token(plan.source)) return true;
    var payload = plan.payload;
    if (payload && typeof payload === 'object') {
      if (token(payload.bookingKey) || token(payload.source) || token(payload.client_key)) return true;
    }
    return false;
  }
  global.isLegacyDemoPlan = isLegacyDemoPlan;

  const DEBOUNCE_MS = 220;
  const MAX_PER_GROUP = 8;
  const CACHE_TTL_MS = 60_000;

  const STYLE_ID = 'global-search-styles';
  const ROOT_ID = 'globalSearchRoot';

  let cfg = null;
  let debounceTimer = null;
  let cache = { at: 0, bookings: null, people: null, places: null, guests: null };
  let loadingIndex = null;
  let activeIndex = -1;
  let flatResults = [];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .global-search {
        position: relative;
        flex: 1 1 220px;
        min-width: 160px;
        max-width: 420px;
        z-index: 60;
      }
      .global-search-input-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--bg, #f4f5f7);
        border: 1px solid var(--border, #e2e5ea);
        border-radius: 10px;
        padding: 6px 10px;
        min-height: 38px;
        transition: border-color .15s, box-shadow .15s;
      }
      .global-search-input-wrap:focus-within {
        border-color: var(--accent, #4f46e5);
        box-shadow: 0 0 0 3px var(--accent-glow, rgba(79,70,229,.18));
      }
      .global-search-input-wrap svg {
        flex: 0 0 auto;
        color: var(--text-secondary, #6b7280);
      }
      .global-search input[type="search"] {
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        color: var(--text, #111827);
        padding: 0;
      }
      .global-search input[type="search"]::placeholder {
        color: var(--text-secondary, #9ca3af);
        font-weight: 500;
      }
      .global-search input[type="search"]::-webkit-search-cancel-button {
        -webkit-appearance: none;
      }
      .global-search-panel {
        display: none;
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        right: 0;
        min-width: 280px;
        max-height: min(70vh, 420px);
        overflow: auto;
        background: var(--surface, #fff);
        border: 1px solid var(--border, #e2e5ea);
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, .14);
        padding: 6px;
      }
      .global-search-panel.open { display: block; }
      .global-search-group-label {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .04em;
        text-transform: uppercase;
        color: var(--text-secondary, #6b7280);
        padding: 8px 10px 4px;
      }
      .global-search-item {
        display: block;
        width: 100%;
        text-align: left;
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: 8px;
        padding: 8px 10px;
        font-family: inherit;
        color: inherit;
        text-decoration: none;
      }
      .global-search-item:hover,
      .global-search-item.active {
        background: var(--bg, #f4f5f7);
      }
      .global-search-item-title {
        font-size: 13px;
        font-weight: 700;
        line-height: 1.25;
      }
      .global-search-item-snip {
        font-size: 11px;
        font-weight: 500;
        color: var(--text-secondary, #6b7280);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .global-search-empty,
      .global-search-hint,
      .global-search-loading {
        padding: 12px 10px;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary, #6b7280);
      }
      .global-search-locked {
        opacity: .72;
      }
      @media (max-width: 720px) {
        .global-search {
          flex: 1 1 100%;
          max-width: none;
          order: 5;
        }
        .global-search-panel {
          left: 0;
          right: 0;
          min-width: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function pageBase() {
    const path = location.pathname || '';
    if (path.includes('tour-planner')) return 'planner';
    if (path.includes('hotels')) return 'hotels';
    if (path.includes('analytics')) return 'analytics';
    if (path.includes('places-stats')) return 'places-stats';
    if (path.includes('admin')) return 'admin';
    return 'booking-form';
  }

  function hrefBooking(id) {
    const base = pageBase();
    if (base === 'planner') {
      return 'tour-planner.html?booking=' + encodeURIComponent(String(id));
    }
    return 'booking-form.html?booking=' + encodeURIComponent(String(id));
  }

  function hrefPerson(id) {
    return 'tour-planner.html?tab=people&person=' + encodeURIComponent(String(id));
  }

  function hrefPlace(id) {
    return 'tour-planner.html?tab=places&place=' + encodeURIComponent(String(id));
  }

  function norm(s) {
    return String(s || '').toLowerCase().trim();
  }

  function hayMatch(hay, q) {
    if (!q) return false;
    return norm(hay).includes(q);
  }

  function snippetFrom(parts, q) {
    const clean = parts.map(p => String(p || '').trim()).filter(Boolean);
    if (!clean.length) return '';
    if (!q) return clean.slice(0, 3).join(' · ');
    const hit = clean.find(p => norm(p).includes(q));
    const rest = clean.filter(p => p !== hit).slice(0, 2);
    return [hit || clean[0], ...rest].filter(Boolean).join(' · ');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return String(iso);
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function visitRefsText(refs) {
    if (!Array.isArray(refs)) return '';
    return refs.map(r => {
      if (typeof r === 'string' || typeof r === 'number') return String(r);
      const bits = [];
      if (r && r.date) bits.push(r.date);
      if (r && r.label) bits.push(r.label);
      if (r && r.booking_id != null) bits.push('#' + r.booking_id);
      return bits.join(' ');
    }).join(' ');
  }

  function callGetter(fn) {
    if (typeof fn !== 'function') return null;
    try {
      const v = fn();
      return Array.isArray(v) ? v : null;
    } catch (_) {
      return null;
    }
  }

  async function ensureSignedIn() {
    if (typeof cfg.isSignedIn === 'function') {
      try {
        const v = await cfg.isSignedIn();
        if (v) return true;
        return false;
      } catch (_) { /* fall through */ }
    }
    if (!cfg.supabase || !cfg.supabase.auth) return false;
    try {
      const { data } = await cfg.supabase.auth.getSession();
      return !!(data && data.session);
    } catch (_) {
      return false;
    }
  }

  async function fetchIndex() {
    const now = Date.now();
    if (cache.bookings && cache.people && cache.places && (now - cache.at) < CACHE_TTL_MS) {
      return cache;
    }

    const localBookings = callGetter(cfg.getBookings);
    const localPeople = callGetter(cfg.getPeople);
    const localPlaces = callGetter(cfg.getPlaces);
    const localGuests = callGetter(cfg.getPlanGuests);

    const sb = cfg.supabase;
    let bookings = localBookings;
    let people = localPeople;
    let places = localPlaces;
    let guests = localGuests || [];

    if (sb) {
      const tasks = [];
      if (!bookings) {
        tasks.push(
          sb.from('bookings')
            .select('id, group_name, tour_arrival_date, departure_date, hotel_id, extra_notes, other_hotel_nights, hotels(name)')
            .order('tour_arrival_date', { ascending: false })
            .limit(400)
            .then(({ data, error }) => {
              if (!error) {
                bookings = (data || []).map(b => ({
                  ...b,
                  hotel_name: b.hotels?.name || b.hotel_name || '',
                }));
              }
            })
        );
      }
      if (!people) {
        tasks.push(
          sb.from('planner_people')
            .select('client_id, name, email, notes, visit_refs, visit_count')
            .order('name', { ascending: true })
            .limit(800)
            .then(({ data, error }) => {
              if (!error) {
                people = (data || []).map(p => ({
                  id: p.client_id,
                  name: p.name,
                  email: p.email,
                  notes: p.notes,
                  visit_refs: p.visit_refs,
                  visit_count: p.visit_count,
                }));
              }
            })
        );
      }
      if (!places) {
        tasks.push((async () => {
          const base = 'client_id, name, nickname, address, notes, place_type';
          let res = await sb.from('planner_places')
            .select(base + ', place_types')
            .order('name', { ascending: true })
            .limit(800);
          if (res.error) {
            res = await sb.from('planner_places')
              .select(base)
              .order('name', { ascending: true })
              .limit(800);
          }
          if (!res.error) {
            places = (res.data || []).map(p => ({
              id: p.client_id,
              name: p.name,
              nickname: p.nickname,
              address: p.address,
              notes: p.notes,
              type: p.place_type,
              place_type: p.place_type,
              place_types: p.place_types || null,
              types: p.place_types || null,
            }));
          }
        })());
      }
      // Plan guests / organisers from payloads (supplement People)
      tasks.push(
        sb.from('planner_plans')
          .select('booking_id, client_key, payload')
          .limit(250)
          .then(({ data, error }) => {
            if (error || !data) return;
            const fromPlans = [];
            data.forEach(row => {
              const payload = row.payload || {};
              if (isLegacyDemoPlan(row.client_key, payload)) return;
              const orgName = payload.organiserName || '';
              const orgId = payload.organiserPersonId || '';
              if (orgName || orgId) {
                fromPlans.push({
                  id: orgId || ('guest-org-' + (row.booking_id || 'x')),
                  name: orgName || 'Organiser',
                  email: '',
                  notes: row.booking_id != null ? ('Organiser · booking #' + row.booking_id) : 'Organiser',
                  visit_refs: row.booking_id != null ? [{ booking_id: row.booking_id }] : [],
                  fromPlan: true,
                  booking_id: row.booking_id,
                });
              }
              (payload.guests || []).forEach(g => {
                if (!g || !(g.name || g.email)) return;
                fromPlans.push({
                  id: g.personId || g.id || ('guest-' + (g.name || '')),
                  name: g.name || '',
                  email: g.email || '',
                  notes: g.notes || (row.booking_id != null ? ('Guest · booking #' + row.booking_id) : 'Guest'),
                  visit_refs: row.booking_id != null ? [{ booking_id: row.booking_id }] : [],
                  fromPlan: true,
                  booking_id: row.booking_id,
                });
              });
            });
            guests = (guests || []).concat(fromPlans);
          })
      );
      await Promise.all(tasks);
    }

    cache = {
      at: Date.now(),
      bookings: bookings || [],
      people: people || [],
      places: places || [],
      guests: guests || [],
    };
    return cache;
  }

  function searchAll(index, rawQ) {
    const q = norm(rawQ);
    if (q.length < 2) return { people: [], places: [], bookings: [] };

    const peopleMap = new Map();
    (index.people || []).forEach(p => {
      const id = String(p.id || p.client_id || '');
      const hay = [p.name, p.email, p.notes, visitRefsText(p.visit_refs)].join(' ');
      if (!hayMatch(hay, q)) return;
      peopleMap.set(id || norm(p.name) + '|' + norm(p.email), {
        kind: 'person',
        id: id || null,
        title: p.name || '(unnamed)',
        snip: snippetFrom([p.email, p.notes, visitRefsText(p.visit_refs), p.visit_count != null ? (p.visit_count + ' visits') : ''], q),
        href: id ? hrefPerson(id) : (p.booking_id != null ? hrefBooking(p.booking_id) : hrefPerson('')),
      });
    });
    (index.guests || []).forEach(g => {
      const hay = [g.name, g.email, g.notes, visitRefsText(g.visit_refs)].join(' ');
      if (!hayMatch(hay, q)) return;
      const id = String(g.id || g.personId || '');
      const key = id || ('n:' + norm(g.name) + '|' + norm(g.email));
      if (peopleMap.has(key)) return;
      // Avoid duplicating a directory person matched by name+email
      let dup = false;
      peopleMap.forEach(existing => {
        if (norm(existing.title) === norm(g.name) && g.name) dup = true;
      });
      if (dup) return;
      peopleMap.set(key, {
        kind: 'person',
        id: id || null,
        title: g.name || '(guest)',
        snip: snippetFrom([g.email, g.notes, g.booking_id != null ? ('Booking #' + g.booking_id) : ''], q),
        href: id && !String(id).startsWith('guest')
          ? hrefPerson(id)
          : (g.booking_id != null ? ('tour-planner.html?booking=' + encodeURIComponent(String(g.booking_id)) + '&tab=people') : hrefPerson(id || '')),
      });
    });

    function categoryText(p) {
      const PC = global.PlaceCategories;
      if (PC) {
        const label = PC.categoriesLabel({
          type: PC.knownCatalogueId(p.type) ? p.type : (p.place_type || ''),
          place_type: p.place_type || (PC.knownCatalogueId(p.type) ? p.type : ''),
          types: p.types || p.place_types,
          place_types: p.place_types || p.types,
        });
        if (label && label !== 'Other') return label;
        if (p.types || p.place_types || PC.knownCatalogueId(p.type) || p.place_type) return label;
      }
      return String(p.type || p.place_type || '');
    }

    const places = [];
    (index.places || []).forEach(p => {
      const id = String(p.id || p.client_id || '');
      const categories = categoryText(p);
      const hay = [p.name, p.nickname, p.address, p.notes, categories].join(' ');
      if (!hayMatch(hay, q)) return;
      places.push({
        kind: 'place',
        id,
        title: p.name || p.nickname || '(place)',
        snip: snippetFrom([p.nickname && p.nickname !== p.name ? p.nickname : '', categories, p.address, p.notes], q),
        href: id ? hrefPlace(id) : 'tour-planner.html?tab=places',
      });
    });

    const bookings = [];
    (index.bookings || []).forEach(b => {
      const hotel = b.hotel_name || b.hotels?.name || '';
      const hay = [
        b.group_name,
        hotel,
        b.extra_notes,
        b.other_hotel_nights,
        b.tour_arrival_date,
        b.departure_date,
        b.id,
        // Organiser may live on enriched plans / members
        b.organiserName,
        b.organiser,
        ...(Array.isArray(b._members) ? b._members.map(m => [m.first_name, m.last_name, m.name, m.email].join(' ')) : []),
      ].join(' ');
      if (!hayMatch(hay, q)) return;
      const dates = [formatDate(b.tour_arrival_date), formatDate(b.departure_date)].filter(Boolean).join('–');
      bookings.push({
        kind: 'booking',
        id: b.id,
        title: b.group_name || ('Booking #' + b.id),
        snip: snippetFrom([dates, hotel, b.extra_notes, b.organiserName || b.organiser], q),
        href: hrefBooking(b.id),
      });
    });

    const people = Array.from(peopleMap.values()).slice(0, MAX_PER_GROUP);
    return {
      people,
      places: places.slice(0, MAX_PER_GROUP),
      bookings: bookings.slice(0, MAX_PER_GROUP),
    };
  }

  function flatten(grouped) {
    const out = [];
    ['people', 'places', 'bookings'].forEach(g => {
      (grouped[g] || []).forEach(item => out.push(item));
    });
    return out;
  }

  function renderPanel(grouped, opts) {
    const panel = document.getElementById('globalSearchPanel');
    if (!panel) return;
    if (opts && opts.locked) {
      panel.innerHTML = '<div class="global-search-hint">Sign in to search people, places and bookings.</div>';
      panel.classList.add('open');
      flatResults = [];
      activeIndex = -1;
      return;
    }
    if (opts && opts.loading) {
      panel.innerHTML = '<div class="global-search-loading">Searching…</div>';
      panel.classList.add('open');
      flatResults = [];
      activeIndex = -1;
      return;
    }
    if (opts && opts.hint) {
      panel.innerHTML = '<div class="global-search-hint">' + esc(opts.hint) + '</div>';
      panel.classList.add('open');
      flatResults = [];
      activeIndex = -1;
      return;
    }

    const sections = [
      { key: 'people', label: 'People' },
      { key: 'places', label: 'Places' },
      { key: 'bookings', label: 'Bookings' },
    ];
    let html = '';
    let any = false;
    let idx = 0;
    flatResults = [];
    sections.forEach(sec => {
      const items = grouped[sec.key] || [];
      if (!items.length) return;
      any = true;
      html += '<div class="global-search-group-label">' + esc(sec.label) + '</div>';
      items.forEach(item => {
        const i = idx++;
        flatResults.push(item);
        html +=
          '<a class="global-search-item" role="option" data-gs-idx="' + i + '" href="' + esc(item.href) + '">' +
          '<div class="global-search-item-title">' + esc(item.title) + '</div>' +
          (item.snip ? '<div class="global-search-item-snip">' + esc(item.snip) + '</div>' : '') +
          '</a>';
      });
    });
    if (!any) {
      html = '<div class="global-search-empty">No matches</div>';
    }
    panel.innerHTML = html;
    panel.classList.add('open');
    activeIndex = flatResults.length ? 0 : -1;
    updateActive();
  }

  function updateActive() {
    const panel = document.getElementById('globalSearchPanel');
    if (!panel) return;
    panel.querySelectorAll('.global-search-item').forEach(el => {
      const i = Number(el.getAttribute('data-gs-idx'));
      el.classList.toggle('active', i === activeIndex);
    });
    const active = panel.querySelector('.global-search-item.active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function closePanel() {
    const panel = document.getElementById('globalSearchPanel');
    if (panel) panel.classList.remove('open');
    activeIndex = -1;
    flatResults = [];
  }

  async function runSearch(q) {
    const signedIn = await ensureSignedIn();
    if (!signedIn && cfg.requireAuth !== false) {
      renderPanel({}, { locked: true });
      return;
    }
    const trimmed = String(q || '').trim();
    if (trimmed.length < 2) {
      renderPanel({}, { hint: 'Type at least 2 characters' });
      return;
    }
    renderPanel({}, { loading: true });
    try {
      if (!loadingIndex) loadingIndex = fetchIndex().finally(() => { loadingIndex = null; });
      const index = await loadingIndex;
      // Prefer freshest local getters on each search
      const localBookings = callGetter(cfg.getBookings);
      const localPeople = callGetter(cfg.getPeople);
      const localPlaces = callGetter(cfg.getPlaces);
      const merged = {
        bookings: localBookings || index.bookings,
        people: localPeople || index.people,
        places: localPlaces || index.places,
        guests: index.guests,
      };
      const grouped = searchAll(merged, trimmed);
      renderPanel(grouped);
    } catch (err) {
      console.warn('Global search failed', err);
      renderPanel({}, { hint: 'Search failed — try again' });
    }
  }

  function onInput(e) {
    const q = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(q), DEBOUNCE_MS);
  }

  function goTo(item) {
    if (!item || !item.href) return;
    closePanel();
    // Same-page deep links for planner tabs
    const base = pageBase();
    if (base === 'planner' && item.href.indexOf('tour-planner.html') === 0) {
      const url = new URL(item.href, location.href);
      const tab = url.searchParams.get('tab');
      const person = url.searchParams.get('person');
      const place = url.searchParams.get('place');
      const booking = url.searchParams.get('booking');
      if (typeof cfg.onNavigate === 'function') {
        const handled = cfg.onNavigate({ tab, person, place, booking, href: item.href });
        if (handled) return;
      }
      location.href = item.href;
      return;
    }
    location.href = item.href;
  }

  function onKeyDown(e) {
    const panel = document.getElementById('globalSearchPanel');
    if (!panel || !panel.classList.contains('open')) {
      if (e.key === 'Escape') closePanel();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!flatResults.length) return;
      activeIndex = (activeIndex + 1) % flatResults.length;
      updateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flatResults.length) return;
      activeIndex = (activeIndex - 1 + flatResults.length) % flatResults.length;
      updateActive();
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && flatResults[activeIndex]) {
        e.preventDefault();
        goTo(flatResults[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
    }
  }

  function mountUI() {
    if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'global-search';
    root.innerHTML =
      '<div class="global-search-input-wrap">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>' +
      '<input type="search" id="globalSearchInput" placeholder="Search people, places, bookings…" autocomplete="off" spellcheck="false" aria-label="Global search" aria-autocomplete="list" aria-controls="globalSearchPanel" />' +
      '</div>' +
      '<div class="global-search-panel" id="globalSearchPanel" role="listbox" aria-label="Search results"></div>';

    const preferred = document.getElementById('globalSearchMount');
    if (preferred) {
      preferred.appendChild(root);
    } else {
      const actions = document.querySelector('.topbar-actions');
      if (actions) {
        actions.insertBefore(root, actions.firstChild);
      } else {
        const inner = document.querySelector('.topbar .topbar-inner') || document.querySelector('.topbar');
        if (inner) inner.appendChild(root);
      }
    }

    const input = root.querySelector('#globalSearchInput');
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('focus', () => {
      const q = input.value.trim();
      if (q.length >= 2) runSearch(q);
      else if (q.length) renderPanel({}, { hint: 'Type at least 2 characters' });
    });

    root.querySelector('#globalSearchPanel').addEventListener('click', (e) => {
      const a = e.target.closest('.global-search-item');
      if (!a) return;
      const i = Number(a.getAttribute('data-gs-idx'));
      if (flatResults[i]) {
        e.preventDefault();
        goTo(flatResults[i]);
      }
    });

    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) closePanel();
    });

    return root;
  }

  function setSignedInUI(signedIn) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.classList.toggle('global-search-locked', !signedIn);
    const input = root.querySelector('#globalSearchInput');
    if (input) {
      input.placeholder = signedIn
        ? 'Search people, places, bookings…'
        : 'Sign in to search…';
    }
  }

  function init(options) {
    cfg = options || {};
    if (cfg.requireAuth == null) cfg.requireAuth = true;
    injectStyles();
    mountUI();
    const api = {
      refresh: () => { cache.at = 0; },
      setSignedIn: (v) => setSignedInUI(!!v),
    };
    Promise.resolve()
      .then(() => ensureSignedIn())
      .then((signedIn) => {
        setSignedInUI(signedIn);
        if (signedIn) {
          setTimeout(() => { fetchIndex().catch(() => {}); }, 800);
        }
      })
      .catch(() => setSignedInUI(false));
    return api;
  }

  global.GlobalSearch = { init };
})(typeof window !== 'undefined' ? window : globalThis);
