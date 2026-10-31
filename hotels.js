    const SUPABASE_URL = BOOKING_SUPABASE_URL;
    const SUPABASE_ANON_KEY = BOOKING_SUPABASE_ANON_KEY;
    const sb = AuthGate.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    let cloudReady = false;
    const PLAN_STORAGE_KEY = 'keith_tour_planner_v1';
    const META_STORAGE_KEY = 'keith_hotel_stays_v1';
    const HOTEL_PROFILE_KEY = 'keith_hotel_profiles_v1';
    const LIVE_BOOKINGS_ORIGIN = 'https://keith-booking-form.netlify.app';

    let stays = [];
    let loadedBookings = [];
    let bookingListLoaded = false;
    let staysByBooking = new Map();
    let directoryHotels = [];
    let directoryPlaces = [];
    let directoryCatalogue = [];
    let yearFilter = '2027';
    const requestedYear = new URLSearchParams(location.search).get('year');
    if (requestedYear === 'all' || /^\d{4}$/.test(requestedYear || '')) yearFilter = requestedYear;
    let search = '';
    let fullOnly = false;
    let hotelNightsExpanded = false;
    let saveTimer = null;
    let hotelBaselines = {};
    let planHotelsByKey = {};

    function esc(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function setStatus(text, type) {
      document.getElementById('statusText').textContent = text;
      document.getElementById('statusDot').className = 'dot' + (type === 'ok' ? ' ok' : type === 'err' ? ' err' : '');
    }
    function parseISODateUTC(iso) {
      return BookingFormat.parseISODateUTC(iso);
    }
    function formatDateDMY(iso) {
      return BookingFormat.formatDateDMY(iso);
    }
    function yearFromIso(iso) {
      const d = parseISODateUTC(iso);
      return d ? String(d.getUTCFullYear()) : '';
    }
    function normName(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
    function isPragueName(name) { return /prague|praha/i.test(String(name || '')); }
    function guestNamesFromPlan(plan) {
      const details = plan && plan.bookingDetails;
      if (!details || typeof details !== 'object') return [];
      const names = [];
      (Array.isArray(details.guests) ? details.guests : []).forEach(guest => {
        if (!guest || typeof guest !== 'object') return;
        const name = [guest.firstName, guest.lastName].map(part => String(part || '').trim()).filter(Boolean).join(' ');
        if (!name) return;
        if (!names.some(existing => existing.toLowerCase() === name.toLowerCase())) names.push(name);
      });
      return names;
    }
    function loadHotelProfiles() {
      try { return JSON.parse(localStorage.getItem(HOTEL_PROFILE_KEY) || '{}') || {}; }
      catch { return {}; }
    }
    function saveHotelProfiles(profiles) {
      try { localStorage.setItem(HOTEL_PROFILE_KEY, JSON.stringify(profiles)); } catch {}
    }
    function deviceWebsites() {
      const profiles = loadHotelProfiles();
      const out = {};
      Object.keys(profiles).forEach(key => {
        const row = profiles[key];
        const website = row && typeof row === 'object' ? row.website : row;
        if (String(website || '').trim()) out[key] = String(website).trim();
      });
      return out;
    }
    function rebuildDirectory() {
      if (!window.HotelDirectory) {
        directoryHotels = [];
        return;
      }
      directoryHotels = HotelDirectory.buildDirectory({
        stays,
        catalogue: directoryCatalogue,
        places: directoryPlaces,
        deviceWebsites: deviceWebsites(),
      });
    }
    function directoryFieldFocused() {
      const active = document.activeElement;
      return !!(active && active.closest && active.closest('#hotelDirectory'));
    }
    function roleLabel(role) {
      if (role === 'prague') return 'Prague pick-up hotel';
      if (role === 'tour') return 'Tour-area hotel';
      return 'Other stay';
    }
    function stayKey(bookingKey, role, hotelName) {
      return String(bookingKey || '') + '|' + String(role || '') + '|' + normName(hotelName);
    }
    /** A planner hotel with no real name is not a stay. Do not replace it with a guessed name. */
    function isPlaceholderHotelName(name) {
      const n = normName(name);
      if (!n) return true;
      return n.includes('name not in notes');
    }
    function stayBookingId(stay) {
      const direct = stay && stay.bookingId != null ? String(stay.bookingId).trim() : '';
      if (/^\d+$/.test(direct)) return direct;
      const key = String(stay && stay.bookingKey || '').trim();
      if (/^\d+$/.test(key)) return key;
      const prefixed = /^booking:(\d+)$/.exec(key);
      return prefixed ? prefixed[1] : '';
    }
    function bookingStatusOf(booking) {
      const value = String(booking && booking.status || '').trim().toLowerCase();
      if (value === 'cancelled' || value === 'companion' || value === 'duplicate' || value === 'unconfirmed') return value;
      return '';
    }
    function compactHotelName(name) {
      return normName(name).replace(/[^a-z0-9]+/g, '');
    }
    /** Same stay when the plan overlay uses a longer form, e.g. Park hotel / Parkhotel Smržovka. */
    function looseHotelName(a, b) {
      const ca = compactHotelName(a);
      const cb = compactHotelName(b);
      if (ca.length < 8 || cb.length < 8) return false;
      return ca === cb || ca.startsWith(cb) || cb.startsWith(ca);
    }
    function isKelliBoyleBooking(bookingId) {
      return String(bookingId ?? '') === '27';
    }
    function isHotelParisName(name) {
      const n = normName(name);
      return n === 'hotel paris' || n === 'hotel paris prague';
    }
    /**
     * Booking 27, Kelli Boyle. Hotel Paris is only the morning pick-up, not a hotel
     * Keith booked. A later save must not put that unpaid stay back on this list.
     * The placeholder hotel named "day trip" is never listed.
     * Other groups' Hotel Paris stays are not affected. The pick-up stop is not touched.
     */
    function planRowMarksBookedOrPaid(row, stay) {
      if (!row) return false;
      const sameName = normName(row.hotelName) === normName(stay.hotelName)
        || (row.role === stay.role && looseHotelName(row.hotelName, stay.hotelName));
      if (!sameName) return false;
      return !!row.booked || row.paid === 'advance' || row.paid === 'on_day';
    }
    function omitUnpaidKelliStay(stay, planHotels) {
      if (!stay || !isKelliBoyleBooking(stay.bookingId || stay.bookingKey)) return false;
      const name = normName(stay.hotelName);
      if (name === 'day trip') return true;
      if (!isHotelParisName(stay.hotelName)) return false;
      const marked = (planHotels || []).some(h => planRowMarksBookedOrPaid(h, stay));
      return !marked;
    }
    function isDayTripHotelName(name) {
      return normName(name) === 'day trip';
    }
    /** A day trip has no hotel for Keith to book. The Prague name is only the pick-up. */
    function bookingIsDayTrip(booking, plan) {
      if (window.BookingExtras && BookingExtras.bookingIsDayTrip) return BookingExtras.bookingIsDayTrip(booking, plan);
      const hotelName = (booking && booking.hotels && booking.hotels.name) || (plan && plan.tourHotelName) || '';
      const group = (booking && booking.group_name) || (plan && plan.groupName) || '';
      if (isDayTripHotelName(hotelName)) return true;
      if (/\bday trip\b/i.test(String(group)) && !normName(hotelName)) return true;
      return false;
    }
    function stayLink(booking, plan) {
      if (window.BookingExtras && BookingExtras.bookingLink) return BookingExtras.bookingLink(booking, plan);
      return { year: '', people: [], hotel: '', places: [], dayTrip: false, roomsLabel: '' };
    }
    /** Guest rooms plus Keith’s own room when it is on. A day trip has no room demand. */
    function roomsNeededFor(booking, plan, dayTrip) {
      const link = stayLink(booking, plan);
      if (dayTrip || link.dayTrip) return '';
      if (link.roomsLabel) return link.roomsLabel;
      if (!window.BookingExtras) return '';
      let source = null;
      let column;
      if (booking) {
        const split = splitStayExtras(booking.extra_notes || '');
        source = (split && split.rawExtras && Object.keys(split.rawExtras).length) ? split.rawExtras : null;
        column = booking.keith_own_room;
      } else if (plan && plan.bookingDetails) {
        source = plan.bookingDetails;
      }
      return BookingExtras.roomsNeededLabel(source, column);
    }
    function omitHotelStay(stay, planHotels) {
      if (!stay) return false;
      if (isDayTripHotelName(stay.hotelName)) return true;
      if (stay.dayTrip) return true;
      if (stay.organiserBooksHotels) return true;
      return omitUnpaidKelliStay(stay, planHotels);
    }
    function loadMeta() {
      try { return JSON.parse(localStorage.getItem(META_STORAGE_KEY) || '{}') || {}; }
      catch { return {}; }
    }
    function saveMeta(meta) {
      try { localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta)); } catch {}
    }
    function loadLocalPlans() {
      try {
        const store = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || '{}') || {};
        const plans = store.plans && typeof store.plans === 'object' ? store.plans : {};
        let changed = false;
        Object.keys(plans).forEach(key => {
          if (!(window.isLegacyDemoPlan && window.isLegacyDemoPlan(key, plans[key]))) return;
          delete plans[key];
          changed = true;
        });
        if (changed) {
          store.plans = plans;
          localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(store));
        }
        return plans;
      } catch { return {}; }
    }
    function writeLocalPlanHotels(bookingKey, hotels) {
      try {
        const store = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || '{}') || {};
        store.plans = store.plans || {};
        const plan = store.plans[bookingKey];
        if (!plan || typeof plan !== 'object') return;
        const baseline = hotelBaselines[bookingKey];
        if (!window.BookingExtras || !baseline) return;
        const patched = BookingExtras.applyEditedPatch(
          { hotels: Array.isArray(plan.hotels) ? plan.hotels : [] },
          { hotels: baseline },
          { hotels: hotels }
        );
        if (!patched.changed) return;
        plan.hotels = patched.value.hotels;
        store.plans[bookingKey] = plan;
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(store));
      } catch {}
    }
    function normalizeHotelRow(h) {
      if (!h || typeof h !== 'object') return null;
      const hotelName = String(h.hotelName || h.name || '').trim();
      if (isPlaceholderHotelName(hotelName)) return null;
      const role = h.role === 'prague' || h.role === 'extra' ? h.role : 'tour';
      const paid = h.paid === 'advance' || h.paid === 'on_day' ? h.paid : '';
      return { hotelName, role, booked: !!h.booked, paid, notes: String(h.notes || '') };
    }

    function stayPeople(plan) {
      const out = [];
      const seen = new Set();
      const add = (name, personId) => {
        const clean = String(name || '').trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ name: clean, personId: String(personId || '').trim() });
      };
      if (plan) {
        add(plan.organiserName, plan.organiserPersonId);
        (plan.guests || []).forEach(guest => {
          if (guest) add(guest.name, guest.personId);
        });
      }
      return out;
    }
    function peopleLinks(people, fallback) {
      const rows = Array.isArray(people) ? people : [];
      if (!rows.length) return fallback ? esc(fallback) : '';
      return rows.map(person => {
        if (!person || !person.personId) return esc(person && person.name || '');
        const href = 'tour-planner.html?tab=people&person=' + encodeURIComponent(String(person.personId));
        return `<a href="${esc(href)}">${esc(person.name || 'Unnamed')}</a>`;
      }).join(', ');
    }
    function addStay(list, stay) {
      const hotelName = String(stay.hotelName || '').trim();
      if (isPlaceholderHotelName(hotelName)) return;
      const key = stayKey(stay.bookingKey, stay.role, hotelName);
      const existing = list.find(s => s.key === key);
      if (existing) {
        if (!existing.recordedAddress && stay.recordedAddress) existing.recordedAddress = String(stay.recordedAddress);
        if (!existing.explicitNights && stay.explicitNights) existing.explicitNights = String(stay.explicitNights);
        if (!existing.staySlot && stay.staySlot) existing.staySlot = stay.staySlot;
        if (!existing.stayHotelId && stay.stayHotelId) existing.stayHotelId = stay.stayHotelId;
        return;
      }
      list.push({
        key,
        bookingKey: String(stay.bookingKey || ''),
        bookingId: stay.deviceOnly ? '' : stayBookingId(stay),
        groupName: stay.groupName || 'Untitled group',
        hotelName,
        role: stay.role === 'prague' || stay.role === 'extra' ? stay.role : 'tour',
        arrivalDate: stay.arrivalDate || '',
        departureDate: stay.departureDate || '',
        booked: !!stay.booked,
        paid: stay.paid === 'advance' || stay.paid === 'on_day' ? stay.paid : '',
        notes: String(stay.notes || ''),
        hasCloudPlan: !!stay.hasCloudPlan,
        bookingStatus: stay.bookingStatus === 'cancelled' ? 'cancelled' : (stay.bookingStatus || ''),
        dayTrip: !!stay.dayTrip,
        guests: Array.isArray(stay.guests) ? stay.guests : [],
        explicitNights: stay.explicitNights || '',
        otherHotelNights: stay.otherHotelNights || '',
        headcount: stay.headcount || '',
        keithRoom: stay.keithRoom,
        extraNotes: stay.extraNotes || '',
        staySlot: stay.staySlot || '',
        stayHotelId: stay.stayHotelId || '',
        recordedAddress: stay.recordedAddress || '',
        organiserBooksHotels: !!stay.organiserBooksHotels,
        deviceOnly: !!stay.deviceOnly,
        tourFull: !!stay.tourFull,
        roomsNeededLabel: (stay.dayTrip || stay.organiserBooksHotels) ? '' : String(stay.roomsNeededLabel || ''),
        peopleLabel: String(stay.peopleLabel || ''),
        people: Array.isArray(stay.people) ? stay.people : [],
        hotelsUsedHref: stay.hotelsUsedHref || '',
      });
      const added = list[list.length - 1];
      if (typeof staysByBooking !== 'undefined' && staysByBooking) {
        const bucket = staysByBooking.get(added.bookingKey);
        if (bucket) bucket.push(added);
        else staysByBooking.set(added.bookingKey, [added]);
      }
    }

    const extrasSplitCache = new Map();
    function splitStayExtras(extraNotes) {
      const key = String(extraNotes || '');
      if (extrasSplitCache.has(key)) return extrasSplitCache.get(key);
      const split = window.BookingExtras ? BookingExtras.splitNotesAndExtras(key) : null;
      extrasSplitCache.set(key, split);
      return split;
    }
    function applyHotelStayersToStay(stay, membersByBooking) {
      if (!stay || !stay.staySlot || !window.BookingExtras || stay.dayTrip || stay.organiserBooksHotels) return;
      const splitSource = stay.extraNotes;
      if (!splitSource) return;
      const split = splitStayExtras(splitSource);
      const saved = BookingExtras.normaliseHotelStayers(split.extras && split.extras.hotelStayers);
      let row = saved.find(item => item.slot === stay.staySlot && item.guests.length);
      if (!row && stay.stayHotelId) {
        row = saved.find(item => item.hotelId != null && String(item.hotelId) === String(stay.stayHotelId) && item.guests.length);
      }
      if (!row) return;
      const members = membersByBooking.get(String(stay.bookingId)) || [];
      if (!members.length) return;
      const guestRows = members.map((member, index) => {
        const extra = (split.extras.guests || [])[index] || {};
        const name = [member.first_name, member.last_name].map(part => String(part || '').trim()).filter(Boolean).join(' ');
        return {
          id: member.id,
          personId: extra.personId || '',
          firstName: member.first_name || '',
          lastName: member.last_name || '',
          name: name,
        };
      }).filter(guest => guest.name);
      const staying = BookingExtras.guestsForHotel(guestRows, [row], row.slot);
      stay.guests = staying.map(guest => guest.name);
      stay.people = staying.map(guest => ({ name: guest.name, personId: guest.personId || '' }));
      stay.peopleLabel = staying.map(guest => guest.name).join(', ');
      stay.roomsNeededLabel = BookingExtras.roomsLabelForHotel(split.rawExtras, stay.keithRoom, staying.length, stay.headcount);
    }

    function applyOverlay(stay, planHotels, meta) {
      const rows = planHotels || [];
      let fromPlan = rows.find(h => h && h.role === stay.role && normName(h.hotelName) === normName(stay.hotelName));
      if (!fromPlan && stay.bookingStatus === 'cancelled') {
        const loose = rows.filter(h => h && h.role === stay.role && looseHotelName(h.hotelName, stay.hotelName));
        if (loose.length === 1) fromPlan = loose[0];
      }
      const fromMeta = meta[stay.key] || {};
      if (fromPlan) {
        stay.booked = !!fromPlan.booked;
        stay.paid = fromPlan.paid === 'advance' || fromPlan.paid === 'on_day' ? fromPlan.paid : '';
        stay.notes = String(fromPlan.notes || '');
      }
      // Device overlay only fills fields the plan has not set — never invents a hotel.
      if (!fromPlan) {
        if (typeof fromMeta.booked === 'boolean') stay.booked = fromMeta.booked;
        if (fromMeta.paid === 'advance' || fromMeta.paid === 'on_day' || fromMeta.paid === '') stay.paid = fromMeta.paid || '';
        if (fromMeta.notes != null) stay.notes = String(fromMeta.notes || '');
      }
    }

    function yieldToBrowser() {
      return new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
        else setTimeout(resolve, 0);
      });
    }

    async function fetchHotelSources() {
      let bookings = [];
      let live = false;
      try {
        let bookingCols = 'id, group_name, status, tour_arrival_date, departure_date, hotel_id, extra_notes, no_people, other_hotel_nights, keith_own_room, tour_full, hotels(name)';
        let bookingQuery = await sb.from('bookings')
          .select(bookingCols)
          .order('tour_arrival_date', { ascending: false })
          .limit(1000);
        if (bookingQuery.error && /tour_full/i.test(bookingQuery.error.message || '')) {
          bookingCols = 'id, group_name, status, tour_arrival_date, departure_date, hotel_id, extra_notes, no_people, other_hotel_nights, keith_own_room, hotels(name)';
          bookingQuery = await sb.from('bookings')
            .select(bookingCols)
            .order('tour_arrival_date', { ascending: false })
            .limit(1000);
        }
        if (bookingQuery.error && /no_people|other_hotel_nights|keith_own_room/i.test(bookingQuery.error.message || '')) {
          bookingQuery = await sb.from('bookings')
            .select('id, group_name, status, tour_arrival_date, departure_date, hotel_id, extra_notes, keith_own_room, hotels(name)')
            .order('tour_arrival_date', { ascending: false })
            .limit(1000);
        }
        if (bookingQuery.error && /keith_own_room/i.test(bookingQuery.error.message || '')) {
          bookingQuery = await sb.from('bookings')
            .select('id, group_name, status, tour_arrival_date, departure_date, hotel_id, extra_notes, hotels(name)')
            .order('tour_arrival_date', { ascending: false })
            .limit(1000);
        }
        if (bookingQuery.error && /status/i.test(bookingQuery.error.message || '')) {
          bookingQuery = await sb.from('bookings')
            .select('id, group_name, tour_arrival_date, departure_date, hotel_id, extra_notes, hotels(name)')
            .order('tour_arrival_date', { ascending: false })
            .limit(1000);
        }
        const { data, error } = bookingQuery;
        if (error) throw error;
        bookings = data || [];
        live = true;
      } catch (err) {
        console.warn(err);
        live = false;
      }

      const ids = bookings.map(b => b.id);
      const quiet = (promise) => Promise.resolve(promise).then(res => res || { data: [], error: true }).catch(err => {
        console.warn(err);
        return { data: [], error: err };
      });
      const [memberRes, stayRes, hotelRes, placeRes, planRes] = await Promise.all([
        quiet(sb.from('members').select('id, booking_id, first_name, last_name').limit(2000)),
        ids.length
          ? quiet(sb.from('booking_hotels').select('booking_id, hotel_id, custom_hotel_name, nights, hotels(name)').in('booking_id', ids))
          : Promise.resolve({ data: [], error: null }),
        quiet(sb.from('hotels').select('id, name').order('name').limit(300)),
        quiet(sb.from('planner_places').select('client_id, name, place_type, place_types, address, notes, contact_method, contact_detail').limit(500)),
        quiet(sb.from('planner_plans').select('booking_id, client_key, payload').limit(1000)),
      ]);
      return { bookings, live, memberRes, stayRes, hotelRes, placeRes, planRes };
    }

    let hotelsPrefetch = null;
    function beginHotelsPrefetch() {
      if (hotelsPrefetch) return hotelsPrefetch;
      hotelsPrefetch = (async () => {
        try {
          const res = await sb.auth.getSession();
          const session = res && res.data && res.data.session;
          if (!session || !session.user) return null;
          const sources = await fetchHotelSources();
          sources.userId = session.user.id;
          return sources;
        } catch (err) {
          console.warn(err);
          return null;
        }
      })();
      return hotelsPrefetch;
    }

    async function loadData(preset) {
      setStatus('Loading…', '');
      staysByBooking = new Map();
      extrasSplitCache.clear();
      const meta = loadMeta();
      const localPlans = loadLocalPlans();
      const list = [];
      const sources = preset || await fetchHotelSources();
      const bookings = sources.bookings || [];
      const live = !!sources.live;
      loadedBookings = bookings;
      bookingListLoaded = live;
      const memberRes = sources.memberRes || { data: [], error: true };
      const stayRes = sources.stayRes || { data: [], error: true };
      const hotelRes = sources.hotelRes || { data: [], error: true };
      const placeRes = sources.placeRes || { data: [], error: true };
      const planRes = sources.planRes || { data: [], error: true };

      const membersById = {};
      if (!memberRes.error) {
        (memberRes.data || []).forEach(m => {
          if (!m || m.booking_id == null) return;
          const id = String(m.booking_id);
          if (!membersById[id]) membersById[id] = [];
          membersById[id].push(m);
        });
      }
      bookings.forEach(b => { b._members = membersById[String(b.id)] || []; });

      const extraByBooking = new Map();
      if (!stayRes.error) {
        (stayRes.data || []).forEach(s => {
          const arr = extraByBooking.get(s.booking_id) || [];
          arr.push(s);
          extraByBooking.set(s.booking_id, arr);
        });
      }

      directoryCatalogue = [];
      directoryPlaces = [];
      const guestsByBooking = new Map();
      const membersByBooking = new Map();
      if (!hotelRes.error) directoryCatalogue = hotelRes.data || [];
      if (!placeRes.error) directoryPlaces = placeRes.data || [];
      if (!memberRes.error) {
        (memberRes.data || []).forEach(m => {
          const name = [m.first_name, m.last_name].map(part => String(part || '').trim()).filter(Boolean).join(' ');
          if (!name) return;
          const id = String(m.booking_id);
          const arr = guestsByBooking.get(id) || [];
          if (!arr.some(existing => existing.toLowerCase() === name.toLowerCase())) arr.push(name);
          guestsByBooking.set(id, arr);
          const people = membersByBooking.get(id) || [];
          people.push(m);
          membersByBooking.set(id, people);
        });
      }

      planHotelsByKey = {};
      const cloudPlans = new Map();
      if (!planRes.error) {
        (planRes.data || []).forEach(row => {
          const payload = row.payload || {};
          if (window.isLegacyDemoPlan && window.isLegacyDemoPlan(row.client_key, payload)) return;
          if (row.booking_id != null) cloudPlans.set(String(row.booking_id), payload);
          if (row.client_key) cloudPlans.set(String(row.client_key), payload);
        });
      }

      bookings.forEach(b => {
        const key = String(b.id);
        const plan = cloudPlans.get(key) || localPlans[key] || {};
        const planHotels = (plan.hotels || []).map(normalizeHotelRow).filter(Boolean);
        planHotelsByKey[key] = planHotels;
        const arrival = b.tour_arrival_date || plan.arrivalDate || '';
        const departure = b.departure_date || plan.departureDate || '';
        const groupName = b.group_name || plan.groupName || ('Booking #' + b.id);
        const bookingStatus = bookingStatusOf(b);
        const dayTrip = bookingIsDayTrip(b, plan);
        const organiserBooksHotels = window.BookingExtras && BookingExtras.organiserBooksHotelsOn
          ? BookingExtras.organiserBooksHotelsOn(b, null)
          : false;
        const tourName = (b.hotels && b.hotels.name) || plan.tourHotelName || '';
        const link = stayLink(b, plan);
        const roomBits = (dayTrip || organiserBooksHotels) ? '' : (link.roomsLabel || roomsNeededFor(b, plan, dayTrip));
        const year = link.year || yearFromIso(arrival);
        const base = {
          bookingKey: key, bookingId: b.id, groupName,
          arrivalDate: arrival, departureDate: departure, hasCloudPlan: cloudPlans.has(key),
          bookingStatus, dayTrip, organiserBooksHotels,
          headcount: b.no_people || '',
          tourFull: bookingIsTourFull(b),
          keithRoom: b.keith_own_room,
          extraNotes: b.extra_notes || '',
          otherHotelNights: b.other_hotel_nights || '',
          roomsNeededLabel: roomBits,
          peopleLabel: (link.people || []).join(', '),
          people: stayPeople(plan),
          hotelsUsedHref: 'tour-planner.html?booking=' + encodeURIComponent(String(b.id)) + '&tab=hotels' + (year ? '&year=' + encodeURIComponent(year) : ''),
        };
        addStay(list, Object.assign({}, base, { hotelName: tourName, role: 'tour', staySlot: 'primary' }));
        const extras = extraByBooking.get(b.id) || [];
        extras.forEach((s, index) => {
          const name = (s.hotels && s.hotels.name) || s.custom_hotel_name || '';
          const role = isPragueName(name) ? 'prague' : 'extra';
          const hotelId = s.hotel_id || '';
          addStay(list, Object.assign({}, base, {
            hotelName: name,
            role,
            explicitNights: s.nights || '',
            staySlot: hotelId ? ('hotel:' + hotelId + '#' + index) : ('extra:' + index),
            stayHotelId: hotelId,
          }));
        });
        const pragueName = (plan.pragueHotel && plan.pragueHotel.name) || '';
        const pragueAddress = (plan.pragueHotel && plan.pragueHotel.address) || '';
        addStay(list, Object.assign({}, base, { hotelName: pragueName, role: 'prague', recordedAddress: pragueAddress }));
        if (plan.tourHotelName && normName(plan.tourHotelName) !== normName(tourName)) {
          addStay(list, Object.assign({}, base, { hotelName: plan.tourHotelName, role: 'tour' }));
        }
        planHotels.forEach(h => {
          addStay(list, Object.assign({}, base, {
            hotelName: h.hotelName, role: h.role, booked: h.booked, paid: h.paid, notes: h.notes,
          }));
        });
        (staysByBooking.get(key) || []).forEach(s => applyOverlay(s, planHotels, meta));
      });

      Object.keys(localPlans).forEach(key => {
        const matchedBookingId = bookingIdFromPlanKey(key);
        if (matchedBookingId && loadedBookingHasId(bookings, matchedBookingId)) return;
        const plan = localPlans[key] || {};
        if (window.isLegacyDemoPlan && window.isLegacyDemoPlan(key, plan)) return;
        const planHotels = (plan.hotels || []).map(normalizeHotelRow).filter(Boolean);
        planHotelsByKey[key] = planHotels;
        const groupName = plan.groupName || 'Local plan';
        const dayTrip = bookingIsDayTrip(null, plan);
        const organiserBooksHotels = window.BookingExtras && BookingExtras.organiserBooksHotelsOn
          ? BookingExtras.organiserBooksHotelsOn(null, plan.bookingDetails || null)
          : false;
        const link = stayLink(null, plan);
        const year = link.year || yearFromIso(plan.arrivalDate || '');
        const deviceOnly = localPlanIsDeviceOnly(key, bookings, live);
        const base = {
          bookingKey: key, bookingId: deviceOnly ? '' : matchedBookingId, groupName,
          deviceOnly,
          arrivalDate: plan.arrivalDate || '', departureDate: plan.departureDate || '',
          dayTrip, organiserBooksHotels,
          roomsNeededLabel: (dayTrip || organiserBooksHotels) ? '' : (link.roomsLabel || roomsNeededFor(null, plan, dayTrip)),
          peopleLabel: (link.people || []).join(', '),
          people: stayPeople(plan),
          hotelsUsedHref: year ? ('tour-planner.html?tab=hotels&year=' + encodeURIComponent(year)) : 'tour-planner.html?tab=hotels',
        };
        addStay(list, Object.assign({}, base, { hotelName: plan.tourHotelName || '', role: 'tour' }));
        addStay(list, Object.assign({}, base, {
          hotelName: (plan.pragueHotel && plan.pragueHotel.name) || '',
          role: 'prague',
          recordedAddress: (plan.pragueHotel && plan.pragueHotel.address) || '',
        }));
        planHotels.forEach(h => {
          addStay(list, Object.assign({}, base, {
            hotelName: h.hotelName, role: h.role, booked: h.booked, paid: h.paid, notes: h.notes,
          }));
        });
        (staysByBooking.get(key) || []).forEach(s => applyOverlay(s, planHotels, meta));
      });

      list.forEach(s => {
        const fromMembers = guestsByBooking.get(String(s.bookingId)) || [];
        if (fromMembers.length) {
          s.guests = fromMembers;
          return;
        }
        const plan = cloudPlans.get(String(s.bookingKey)) || localPlans[String(s.bookingKey)] || {};
        s.guests = guestNamesFromPlan(plan);
      });
      list.forEach(s => applyHotelStayersToStay(s, membersByBooking));

      const listed = list.filter(s => !omitHotelStay(s, planHotelsByKey[String(s.bookingKey)]));
      stays = listed.sort(compareHotelStaysNewest);
      hotelBaselines = {};
      new Set(stays.map(s => s.bookingKey)).forEach(key => {
        hotelBaselines[key] = overlayForBooking(key);
      });
      fillYearOptions();
      render();
      setStatus(live ? totalHotelStaysLabel(stays.length) : 'Using plans saved on this device', live ? 'ok' : '');
      await yieldToBrowser();
      rebuildDirectory();
      renderHotelsUsed();
    }

    function fillYearOptions() {
      const years = new Set(stays.map(s => yearFromIso(s.arrivalDate)).filter(Boolean));
      years.add('2027');
      if (!years.has(yearFilter) && yearFilter !== 'all') years.add(yearFilter);
      const sel = document.getElementById('yearFilter');
      const current = yearFilter;
      sel.innerHTML = '<option value="all">All years</option>' +
        Array.from(years).sort().reverse().map(y => '<option value="' + esc(y) + '">' + esc(y) + '</option>').join('');
      sel.value = current;
    }

    function compareHotelStaysNewest(a, b) {
      const da = String(a.arrivalDate || '');
      const db = String(b.arrivalDate || '');
      if (da && db && da !== db) return da < db ? 1 : -1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      const byName = String(a.groupName || '').localeCompare(String(b.groupName || ''));
      if (byName) return byName;
      return String(a.role || '').localeCompare(String(b.role || ''));
    }
    function visibleStays() {
      const q = search.trim().toLowerCase();
      return stays.filter(s => {
        if (yearFilter !== 'all' && yearFromIso(s.arrivalDate) !== yearFilter) return false;
        if (fullOnly && !s.tourFull) return false;
        if (!q) return true;
        return (s.groupName + ' ' + s.hotelName).toLowerCase().includes(q);
      }).sort(compareHotelStaysNewest);
    }

    function bookingIsTourFull(booking) {
      const value = booking && booking.tour_full;
      return value === true || value === 'true' || value === 't' || value === 1 || value === '1';
    }

    function fullHotelFlag(stay) {
      if (!stay || !stay.tourFull) return '';
      if (stay.booked) return '<div class="tour-full-flag is-booked">Tour full · hotel booked ✓</div>';
      return '<div class="tour-full-flag">Tour full: make sure the hotel is booked</div>';
    }

    function fullTourCount(rows) {
      const ids = new Set();
      (rows || []).forEach(stay => {
        if (!stay || !stay.tourFull) return;
        const id = String(stay.bookingId || stay.bookingKey || '').trim();
        if (id) ids.add(id);
      });
      return ids.size;
    }

    function planKeyIsBookingId(key) {
      return !!bookingIdFromPlanKey(key);
    }

    function bookingIdFromPlanKey(key) {
      const s = String(key || '').trim();
      if (/^\d+$/.test(s)) return s;
      const prefixed = /^booking:(\d+)$/.exec(s);
      return prefixed ? prefixed[1] : '';
    }

    function loadedBookingHasId(bookings, id) {
      return (bookings || []).some(b => b && String(b.id) === String(id));
    }

    /** A local plan is device-only when its key is not a booking that was loaded. */
    function localPlanIsDeviceOnly(key, bookings, bookingsLoaded) {
      const id = bookingIdFromPlanKey(key);
      if (!id) return true;
      if (!bookingsLoaded) return false;
      return !loadedBookingHasId(bookings, id);
    }

    function removeDevicePlanFromStore(store, key) {
      const src = store && typeof store === 'object' ? store : {};
      const copy = {};
      Object.keys(src).forEach(name => { copy[name] = src[name]; });
      const plans = Object.assign({}, (src.plans && typeof src.plans === 'object') ? src.plans : {});
      copy.plans = plans;
      const id = String(key || '').trim();
      if (id) delete plans[id];
      return copy;
    }

    function deleteDevicePlan(key) {
      const id = String(key || '').trim();
      if (!id || !localPlanIsDeviceOnly(id, loadedBookings, bookingListLoaded)) return;
      const matches = stays.filter(s => String(s.bookingKey) === id);
      if (!matches.length || matches.some(s => !s.deviceOnly)) return;
      const name = matches[0].groupName || 'this plan';
      if (!window.confirm('Delete “' + name + '”? This plan is saved on this device only.')) return;
      try {
        const store = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || '{}') || {};
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(removeDevicePlanFromStore(store, id)));
      } catch (err) {
        console.warn(err);
        return;
      }
      stays = stays.filter(s => !(s.deviceOnly && String(s.bookingKey) === id));
      delete planHotelsByKey[id];
      delete hotelBaselines[id];
      fillYearOptions();
      render();
      rebuildDirectory();
      renderHotelsUsed();
      const status = document.getElementById('statusText');
      if (status && /hotel stay/.test(status.textContent || '')) {
        setStatus(totalHotelStaysLabel(stays.length), 'ok');
      }
    }

    function bookingHref(s) {
      const id = stayBookingId(s);
      if (id) return 'booking-form.html?booking=' + encodeURIComponent(id) + '&layout=layout';
      return 'booking-form.html';
    }
    function plannerHref(s) {
      if (s.bookingId) return 'tour-planner.html?booking=' + encodeURIComponent(String(s.bookingId));
      if (s.bookingKey && !(window.isLegacyDemoPlan && window.isLegacyDemoPlan(s.bookingKey, null))) return 'tour-planner.html?booking=' + encodeURIComponent(s.bookingKey);
      return 'tour-planner.html';
    }

    function totalHotelStaysLabel(count) {
      return count + ' total hotel stay' + (count === 1 ? '' : 's');
    }

    function stayRoomCount(stay) {
      const label = String((stay && stay.roomsNeededLabel) || '').trim();
      const match = /^(\d+)\s+rooms?\s+needed$/i.exec(label);
      if (!match) return null;
      const n = Number(match[1]);
      return Number.isFinite(n) ? n : null;
    }

    function stayViewSummary(rows, yearLabel) {
      const list = Array.isArray(rows) ? rows : [];
      let nights = 0;
      let roomNights = 0;
      let anyRoomNights = false;
      list.forEach(stay => {
        if (!stay || stay.bookingStatus === 'cancelled') return;
        const known = (typeof HotelDirectory !== 'undefined' && HotelDirectory && HotelDirectory.stayNights)
          ? HotelDirectory.stayNights(stay)
          : null;
        if (known == null) return;
        nights += known;
        const rooms = stayRoomCount(stay);
        if (rooms == null) return;
        anyRoomNights = true;
        roomNights += rooms * known;
      });
      const label = yearLabel || 'All years';
      const stayWord = list.length === 1 ? 'stay' : 'stays';
      const nightWord = nights === 1 ? 'hotel night' : 'hotel nights';
      const full = fullTourCount(list);
      const fullWord = full === 1 ? 'full tour' : 'full tours';
      let text = label + ': ' + list.length + ' ' + stayWord + ' · ' + nights + ' ' + nightWord;
      let title = "Hotel nights come from each stay's nights or dates. Cancelled stays are still listed and are not included in the nights.";
      if (anyRoomNights) {
        const roomWord = roomNights === 1 ? 'room-night' : 'room-nights';
        text += ' · ' + roomNights + ' ' + roomWord;
        title += ' Room-nights are rooms × nights from the rooms already shown. Cancelled stays are left out of those too.';
      }
      text += ' · ' + full + ' ' + fullWord;
      return { text: text, title: title };
    }

    function hotelNightPhrase(nights, name) {
      const n = Number(nights) || 0;
      return n + ' ' + (n === 1 ? 'night' : 'nights') + ' at ' + name;
    }

    function stayHotelLabel(stay) {
      const name = String(stay && stay.hotelName || '').trim();
      if (isPlaceholderHotelName(name)) return 'Hotel not named yet';
      return name;
    }

    function hotelNightRows(rows) {
      const list = Array.isArray(rows) ? rows : [];
      const buckets = new Map();
      list.forEach(stay => {
        if (!stay || stay.bookingStatus === 'cancelled') return;
        const known = (typeof HotelDirectory !== 'undefined' && HotelDirectory && HotelDirectory.stayNights)
          ? HotelDirectory.stayNights(stay)
          : null;
        if (known == null || known <= 0) return;
        const label = stayHotelLabel(stay);
        const key = label === 'Hotel not named yet'
          ? '\u0000unnamed'
          : ((typeof HotelDirectory !== 'undefined' && HotelDirectory && HotelDirectory.foldName)
            ? HotelDirectory.foldName(label)
            : label.toLowerCase());
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { nights: 0, spellings: {} };
          buckets.set(key, bucket);
        }
        bucket.nights += known;
        bucket.spellings[label] = (bucket.spellings[label] || 0) + known;
      });
      const items = Array.from(buckets.values()).filter(bucket => bucket.nights > 0).map(bucket => {
        const spellings = Object.keys(bucket.spellings).sort((a, b) =>
          (bucket.spellings[b] - bucket.spellings[a]) || a.localeCompare(b));
        const name = spellings[0] || 'Hotel not named yet';
        return { name: name, nights: bucket.nights, text: hotelNightPhrase(bucket.nights, name) };
      });
      items.sort((a, b) => b.nights - a.nights || a.name.localeCompare(b.name));
      return items;
    }

    function hotelNightPreview(items, expanded) {
      const rows = Array.isArray(items) ? items : [];
      const preview = 3;
      const shown = expanded ? rows : rows.slice(0, preview);
      const extra = rows.length - shown.length;
      let more = '';
      if (extra > 0) more = '+' + extra + ' more';
      else if (expanded && rows.length > preview) more = 'Show less';
      return { text: shown.map(item => item.text).join(' · '), more: more };
    }

    function paintStayHotelNights(rows) {
      const el = document.getElementById('stayHotelNights');
      if (!el) return;
      const view = hotelNightPreview(hotelNightRows(rows), hotelNightsExpanded);
      if (!view.text) {
        el.hidden = true;
        el.textContent = '';
        return;
      }
      const button = view.more
        ? ' <button type="button" class="stay-hotel-more" data-hotel-nights-more>' + esc(view.more) + '</button>'
        : '';
      el.hidden = false;
      el.innerHTML = esc(view.text) + button;
    }

    function paintStayStats(rows) {
      const el = document.getElementById('stayStats');
      if (!el) return;
      const yearLabel = yearFilter === 'all' ? 'All years' : String(yearFilter || 'All years');
      const summary = stayViewSummary(rows, yearLabel);
      el.hidden = false;
      el.textContent = summary.text;
      el.title = summary.title;
    }

    function render() {
      const rows = visibleStays();
      const chip = document.getElementById('fullOnlyChip');
      if (chip) chip.setAttribute('aria-pressed', fullOnly ? 'true' : 'false');
      paintStayStats(rows);
      paintStayHotelNights(rows);
      const el = document.getElementById('stayList');
      if (!rows.length) {
        el.innerHTML = '<p class="empty">No hotel names found for this year on bookings or plans.</p>';
        return;
      }
      el.innerHTML = rows.map(s => {
        const dates = (s.arrivalDate || s.departureDate)
          ? (formatDateDMY(s.arrivalDate) || '—') + ' – ' + (formatDateDMY(s.departureDate) || '—')
          : 'Dates not set';
        const year = yearFromIso(s.arrivalDate);
        const yearLink = year
          ? ` · <a href="tour-planner.html?tab=visits&amp;year=${encodeURIComponent(String(year))}&amp;hotel=${encodeURIComponent(s.hotelName)}">${esc(year)}</a>`
          : '';
        const people = peopleLinks(s.people, s.peopleLabel);
        const cancelled = s.bookingStatus === 'cancelled';
        const tag = cancelled ? '<span class="cancelled-tag">Cancelled</span>' : '';
        const deviceOnly = !!s.deviceOnly;
        const deviceNote = deviceOnly
          ? `<p class="device-only-note">Saved on this device only — no booking</p><div class="device-only-actions"><button type="button" class="btn btn-danger" data-delete-plan="${esc(s.bookingKey)}">Delete this test plan</button></div>`
          : '';
        return `<article class="stay${cancelled ? ' cancelled' : ''}${deviceOnly ? ' device-only' : ''}" data-stay-key="${esc(s.key)}" data-booking-status="${esc(s.bookingStatus || '')}">
          <div>
            <div class="tour-name"><a href="${esc(plannerHref(s))}">${esc(s.groupName)}</a>${tag}</div>
            <div class="hotel-name">${esc(s.hotelName)}</div>
            ${fullHotelFlag(s)}
            <div class="role">${esc(roleLabel(s.role))}</div>
            <div class="dates">${esc(dates)}${yearLink}</div>
            ${people ? `<div class="stay-people">${people}</div>` : ''}
            ${s.roomsNeededLabel ? `<div class="rooms-needed">${esc(s.roomsNeededLabel)}</div>` : ''}
            ${deviceNote}
            <div class="links">
              ${deviceOnly ? '' : `<a href="${esc(bookingHref(s))}">Open booking</a>`}
              <a href="${esc(plannerHref(s))}">Open planner</a>
              ${s.hotelsUsedHref ? `<a href="${esc(s.hotelsUsedHref)}">Hotels used</a>` : ''}
            </div>
          </div>
          <div class="stay-fields">
            <label class="tick${s.booked ? ' on' : ''}">
              <input type="checkbox" data-field="booked" ${s.booked ? 'checked' : ''}>
              Booked
            </label>
            <div class="field">
              <label>Payment</label>
              <select data-field="paid">
                <option value="" ${!s.paid ? 'selected' : ''}>Not set</option>
                <option value="advance" ${s.paid === 'advance' ? 'selected' : ''}>Paid in advance</option>
                <option value="on_day" ${s.paid === 'on_day' ? 'selected' : ''}>Paid on the day</option>
              </select>
            </div>
          </div>
          <div class="field" style="min-width:0;">
            <label>Notes</label>
            <textarea data-field="notes" rows="2" placeholder="Optional — only what you know">${esc(s.notes)}</textarea>
          </div>
        </article>`;
      }).join('');
      el.querySelectorAll('[data-field]').forEach(inp => {
        const ev = inp.matches('textarea') ? 'input' : 'change';
        inp.addEventListener(ev, () => {
          const card = inp.closest('[data-stay-key]');
          const stay = stays.find(x => x.key === card.getAttribute('data-stay-key'));
          if (!stay) return;
          const field = inp.getAttribute('data-field');
          if (field === 'booked') stay.booked = !!inp.checked;
          if (field === 'paid') stay.paid = inp.value === 'advance' || inp.value === 'on_day' ? inp.value : '';
          if (field === 'notes') stay.notes = inp.value;
          if (field === 'booked') {
            inp.closest('.tick').classList.toggle('on', stay.booked);
            const flag = card.querySelector('.tour-full-flag');
            const html = fullHotelFlag(stay);
            if (flag) flag.outerHTML = html;
            else if (html) {
              const name = card.querySelector('.hotel-name');
              if (name) name.insertAdjacentHTML('afterend', html);
            }
            rebuildDirectory();
            renderHotelsUsed();
          }
          scheduleSave(stay);
        });
      });
    }

    function overlayForBooking(bookingKey) {
      const planHotels = planHotelsByKey[String(bookingKey)] || [];
      return stays.filter(s => s.bookingKey === bookingKey && !omitHotelStay(s, planHotels)).map(s => ({
        hotelName: s.hotelName,
        role: s.role,
        booked: !!s.booked,
        paid: s.paid === 'advance' || s.paid === 'on_day' ? s.paid : '',
        notes: String(s.notes || ''),
      }));
    }

    function scheduleSave(stay) {
      const meta = loadMeta();
      meta[stay.key] = { booked: !!stay.booked, paid: stay.paid || '', notes: String(stay.notes || '') };
      saveMeta(meta);
      writeLocalPlanHotels(stay.bookingKey, overlayForBooking(stay.bookingKey));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => savePlanHotels(stay.bookingKey).catch(err => console.warn(err)), 600);
    }

    async function savePlanHotels(bookingKey) {
      const hotels = overlayForBooking(bookingKey);
      const baseline = hotelBaselines[bookingKey];
      writeLocalPlanHotels(bookingKey, hotels);
      if (!baseline || !window.BookingExtras) {
        setStatus('Saved on this device', '');
        return;
      }
      if (BookingExtras.sameJson(baseline, hotels)) return;
      const numeric = /^\d+$/.test(String(bookingKey));
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const q = numeric
            ? sb.from('planner_plans').select('id, payload, updated_at').eq('booking_id', Number(bookingKey)).maybeSingle()
            : sb.from('planner_plans').select('id, payload, updated_at').eq('client_key', String(bookingKey)).maybeSingle();
          const { data, error } = await q;
          if (error) throw error;
          if (!data || !data.payload) {
            setStatus('Saved on this device (no cloud plan for that tour yet)', '');
            return;
          }
          const patched = BookingExtras.applyEditedPatch(
            data.payload,
            Object.assign({}, data.payload, { hotels: baseline }),
            Object.assign({}, data.payload, { hotels })
          );
          if (!patched.changed) {
            hotelBaselines[bookingKey] = hotels;
            return;
          }
          let upd = sb.from('planner_plans').update({
            payload: patched.value,
            updated_at: new Date().toISOString(),
          }).eq('id', data.id).select('id');
          if (data.updated_at) {
            upd = sb.from('planner_plans').update({
              payload: patched.value,
              updated_at: new Date().toISOString(),
            }).eq('id', data.id).eq('updated_at', data.updated_at).select('id');
          }
          const { data: updated, error: upErr } = await upd;
          if (upErr) throw upErr;
          if (updated && updated.length) {
            hotelBaselines[bookingKey] = hotels;
            setStatus('Cloud plan updated', 'ok');
            return;
          }
        }
        setStatus('Saved on this device', '');
      } catch (err) {
        console.warn(err);
        setStatus('Saved on this device', '');
      }
    }

    function captureDirectoryEdits() {
      document.querySelectorAll('#hotelDirectory [data-hotel-key]').forEach(card => {
        const hotel = directoryHotels.find(h => h.key === card.getAttribute('data-hotel-key'));
        if (!hotel) return;
        const address = card.querySelector('[data-profile="address"]');
        const website = card.querySelector('[data-profile="website"]');
        const note = card.querySelector('[data-profile="note"]');
        if (address) hotel.address = address.value;
        if (website) hotel.website = website.value;
        if (note) hotel.note = note.value;
      });
    }

    function renderHotelsUsed() {
      const el = document.getElementById('hotelDirectory');
      if (!el || !window.HotelDirectory) return;
      if (directoryFieldFocused()) return;
      captureDirectoryEdits();
      const openKeys = new Set();
      el.querySelectorAll('details[open]').forEach(details => {
        const card = details.closest('[data-hotel-key]');
        if (card) openKeys.add(card.getAttribute('data-hotel-key'));
      });
      const query = document.getElementById('hotelSearch') ? document.getElementById('hotelSearch').value : '';
      el.innerHTML = HotelDirectory.renderDirectoryHtml(directoryHotels, query);
      openKeys.forEach(key => {
        const card = el.querySelector('[data-hotel-key="' + CSS.escape(key) + '"]');
        const details = card && card.querySelector('details');
        if (details) details.open = true;
      });
      bindHotelDirectory(el);
    }

    function bindHotelDirectory(root) {
      root.querySelectorAll('[data-action="save-hotel"]').forEach(btn => {
        btn.addEventListener('click', () => saveHotelCard(btn.closest('[data-hotel-key]')));
      });
      root.querySelectorAll('[data-profile]').forEach(inp => {
        inp.addEventListener('change', () => saveHotelCard(inp.closest('[data-hotel-key]')));
      });
    }

    async function saveHotelCard(card) {
      if (!card || !window.HotelDirectory || card.dataset.saving === '1') return;
      const hotel = directoryHotels.find(h => h.key === card.getAttribute('data-hotel-key'));
      const status = card.querySelector('[data-save-status]');
      const button = card.querySelector('[data-action="save-hotel"]');
      if (!hotel) return;
      card.dataset.saving = '1';
      if (button) button.disabled = true;
      try {
      const fields = {
        address: card.querySelector('[data-profile="address"]').value,
        website: card.querySelector('[data-profile="website"]').value,
        note: card.querySelector('[data-profile="note"]').value,
      };
      const plan = HotelDirectory.savePlan(hotel, fields, directoryPlaces);
      if (plan.action === 'none') {
        if (status) status.textContent = plan.message;
        return;
      }
      if (status) status.textContent = 'Saving…';
        if (plan.action === 'insert') {
          const { error } = await sb.from('planner_places').insert(plan.insert);
          if (error) throw error;
          const row = {
            client_id: plan.insert.client_id,
            name: plan.insert.name,
            place_type: plan.insert.place_type,
            place_types: plan.insert.place_types,
            address: plan.insert.address,
            notes: plan.insert.notes,
            contact_method: plan.insert.contact_method,
            contact_detail: plan.insert.contact_detail,
          };
          directoryPlaces.push(row);
          hotel.place = row;
        } else {
          const { error } = await sb.from('planner_places').update(plan.patch).eq('client_id', plan.clientId);
          if (error) throw error;
          const place = directoryPlaces.find(p => String(p.client_id) === String(plan.clientId));
          if (place) Object.assign(place, plan.patch);
          if (hotel.place) Object.assign(hotel.place, plan.patch);
        }
        hotel.address = fields.address.trim();
        hotel.website = fields.website.trim();
        hotel.note = fields.note.trim();
        if (plan.deviceWebsite != null) {
          const profiles = loadHotelProfiles();
          const key = HotelDirectory.foldName(hotel.name);
          if (plan.deviceWebsite) profiles[key] = { website: plan.deviceWebsite };
          else delete profiles[key];
          saveHotelProfiles(profiles);
          hotel.websiteOnDevice = !!plan.deviceWebsite;
        }
        if (status) status.textContent = plan.message;
      } catch (err) {
        console.warn(err);
        if (status) status.textContent = 'Could not save. Try again.';
      } finally {
        card.dataset.saving = '';
        if (button) button.disabled = false;
      }
    }

    function onDeletePlanClick(event) {
      const btn = event.target.closest('[data-delete-plan]');
      if (!btn) return;
      event.preventDefault();
      deleteDevicePlan(btn.getAttribute('data-delete-plan'));
    }
    document.getElementById('stayList').addEventListener('click', onDeletePlanClick);
    document.getElementById('hotelDirectory').addEventListener('click', onDeletePlanClick);
    document.getElementById('stayHotelNights').addEventListener('click', event => {
      const btn = event.target.closest('[data-hotel-nights-more]');
      if (!btn) return;
      hotelNightsExpanded = !hotelNightsExpanded;
      paintStayHotelNights(visibleStays());
    });
    document.getElementById('yearFilter').addEventListener('change', e => { yearFilter = e.target.value; render(); });
    document.getElementById('fullOnlyChip').addEventListener('click', () => { fullOnly = !fullOnly; render(); });
    document.getElementById('searchBox').addEventListener('input', e => { search = e.target.value; render(); });
    document.getElementById('hotelSearch').addEventListener('input', () => renderHotelsUsed());
    document.getElementById('refreshBtn').addEventListener('click', () => loadData());
    document.getElementById('themeBtn').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch {}
    });

    function initGlobalSearch() {
      if (!window.GlobalSearch) return;
      window.GlobalSearch.init({
        supabase: cloudReady ? sb : null,
        requireAuth: true,
        isSignedIn: async () => {
          if (!cloudReady) return true;
          try {
            const { data } = await sb.auth.getSession();
            return !!(data && data.session);
          } catch (_) { return false; }
        },
        getBookings: () => null,
        getPeople: () => cloudReady ? null : [],
        getPlaces: () => cloudReady ? null : [],
      });
    }

    async function probeSameOrigin(path) {
      try {
        const res = await fetch(path, { method: 'GET', cache: 'no-store', headers: { Range: 'bytes=0-0' } });
        return res.ok || res.status === 206;
      } catch { return false; }
    }
    async function fixExternalNavLinks() {
      if (!location.hostname.includes('github.io')) return;
      const bookings = document.getElementById('navBookings');
      const analytics = document.getElementById('navAnalytics');
      const [hasBooking, hasAnalytics] = await Promise.all([
        probeSameOrigin('booking-form.html'),
        probeSameOrigin('analytics.html'),
      ]);
      if (bookings) bookings.href = hasBooking ? 'booking-form.html' : (LIVE_BOOKINGS_ORIGIN + '/booking-form.html');
      if (analytics) analytics.href = hasAnalytics ? 'analytics.html' : (LIVE_BOOKINGS_ORIGIN + '/analytics.html');
    }

    fixExternalNavLinks();
    beginHotelsPrefetch();
    AuthGate.require(sb, { title: 'Hotels' }).then(async session => {
      cloudReady = !!session;
      if (!session) {
        AuthGate.useLocalData(sb);
        setStatus('Offline — showing what is saved on this device', '');
        hotelsPrefetch = null;
        initGlobalSearch();
        return loadData();
      }
      initGlobalSearch();
      const ready = await beginHotelsPrefetch();
      hotelsPrefetch = null;
      const sameUser = ready && session.user && ready.userId === session.user.id;
      return loadData(sameUser ? ready : null);
    }).catch(err => {
      console.error(err);
      setStatus(err.message || 'Failed to load', 'err');
    });
  
