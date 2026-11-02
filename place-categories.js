/*
 * Place categories for the tour planner.
 *
 * A place keeps one primary category in planner_places.place_type (the value
 * already stored for existing rows). Further categories live in place_types.
 * A null place_types list means the place only has that single place_type.
 */
(function (root) {
  'use strict';

  const CATALOGUE_TYPES = [
    { id: 'hotel', label: 'Hotels', singular: 'Hotel' },
    { id: 'factory', label: 'Factories', singular: 'Factory' },
    { id: 'shop', label: 'Shops', singular: 'Shop' },
    { id: 'antique', label: 'Antiques', singular: 'Antique' },
    { id: 'restaurant', label: 'Restaurants', singular: 'Restaurant' },
    { id: 'snack', label: 'Snacks', singular: 'Snack', hint: 'A supermarket or a bakery, not a restaurant.' },
    { id: 'experience', label: 'Experiences', singular: 'Experience' },
    { id: 'museum', label: 'Museums', singular: 'Museum' },
    { id: 'school', label: 'Schools', singular: 'School' },
    { id: 'viewpoint', label: 'Viewpoints', singular: 'Viewpoint' },
    { id: 'other', label: 'Other', singular: 'Other' },
  ];

  const ID_SET = new Set(CATALOGUE_TYPES.map(function (t) { return t.id; }));
  const BY_ID = {};
  CATALOGUE_TYPES.forEach(function (t) { BY_ID[t.id] = t; });

  const STOP_ONLY = {
    meal: 'Meal',
    travel: 'Travel',
    pickup: 'Hotel pickup',
  };

  function cleanId(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function knownCatalogueId(value) {
    const id = cleanId(value);
    return ID_SET.has(id) ? id : '';
  }

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    const s = value.trim();
    if (!s) return [];
    if (s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') {
      return s.slice(1, -1).split(',').map(function (part) {
        return part.trim().replace(/^"|"$/g, '');
      }).filter(Boolean);
    }
    if (s.charAt(0) === '[') {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) { /* single id */ }
    }
    return [s];
  }

  function collectIds(value) {
    const out = [];
    asList(value).forEach(function (item) {
      const id = knownCatalogueId(item);
      if (id && out.indexOf(id) === -1) out.push(id);
    });
    return out;
  }

  /**
   * Categories for a place, primary first.
   * Accepts a place object ({ type, types } or { place_type, place_types }),
   * an array of ids, or a single id string.
   * previousPrimary stays first when it is still selected, so adding a second
   * category does not change the stored place_type.
   */
  function placeCategories(place, previousPrimary) {
    let fromList = [];
    let fromPrimary = '';
    if (Array.isArray(place) || typeof place === 'string') {
      fromList = collectIds(place);
    } else if (place && typeof place === 'object') {
      if (place.types != null && asList(place.types).length) fromList = collectIds(place.types);
      else if (place.place_types != null && asList(place.place_types).length) fromList = collectIds(place.place_types);
      const primarySrc = (place.type != null && String(place.type).trim() !== '')
        ? place.type
        : place.place_type;
      fromPrimary = knownCatalogueId(primarySrc);
    }
    let ids = fromList.length ? fromList.slice() : (fromPrimary ? [fromPrimary] : ['other']);
    const keep = knownCatalogueId(previousPrimary) || fromPrimary;
    if (keep && ids.indexOf(keep) !== -1) {
      ids = [keep].concat(ids.filter(function (id) { return id !== keep; }));
    }
    return ids;
  }

  function primaryCategory(place) {
    return placeCategories(place)[0] || 'other';
  }

  function placeHasCategory(place, typeId) {
    const id = knownCatalogueId(typeId);
    if (!id) return false;
    return placeCategories(place).indexOf(id) !== -1;
  }

  function singularLabel(typeId) {
    const id = cleanId(typeId);
    if (BY_ID[id]) return BY_ID[id].singular;
    if (STOP_ONLY[id]) return STOP_ONLY[id];
    if (!id) return 'Stop';
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  function groupLabel(typeId) {
    const id = cleanId(typeId);
    if (id === 'all') return 'All';
    if (BY_ID[id]) return BY_ID[id].label;
    return singularLabel(id);
  }

  function categoriesLabel(place) {
    return placeCategories(place).map(singularLabel).join(' · ');
  }

  // Glance cues. First stored category wins, then the name tests, in this order.
  // Add a row here to cover another kind of place.
  var STOP_CUES = [
    { id: 'airport', emoji: '✈️', label: 'Airport', tone: 'pickup', types: ['airport'], test: function (blob) { return /airport|terminal/.test(blob); } },
    { id: 'dropoff', emoji: '🏁', label: 'Drop-off', tone: 'pickup', types: ['dropoff'], test: function (blob) { return /drop-?off/.test(blob); } },
    { id: 'pickup', emoji: '🚐', label: 'Pick-up', tone: 'pickup', types: ['pickup', 'handover'], test: function (blob) { return /pick-?up/.test(blob); } },
    { id: 'travel', emoji: '🚌', label: 'Travel', tone: 'travel', types: ['travel'], test: function (blob) { return /\bdrive\b|\btravel\b/.test(blob); } },
    { id: 'hotel', emoji: '🏨', label: 'Hotel', tone: 'hotel', types: ['hotel'], test: function (blob) { return /\bhotel\b/.test(blob); } },
    { id: 'glass', emoji: '💎', label: 'Glass', tone: 'factory', test: function (blob) { return /glass/.test(blob); } },
    { id: 'factory', emoji: '🏭', label: 'Factory', tone: 'factory', types: ['factory'], test: function (blob) { return /factory|\bworks\b/.test(blob); } },
    { id: 'shop', emoji: '🏪', label: 'Bead shop', tone: 'shop', types: ['shop', 'antique'], test: function (blob) { return /bead|antik|\bshop\b/.test(blob); } },
    { id: 'museum', emoji: '🏛️', label: 'Museum', tone: 'museum', types: ['museum'], test: function (blob) { return /museum/.test(blob); } },
    { id: 'restaurant', emoji: '🍽️', label: 'Lunch', tone: 'restaurant', types: ['restaurant', 'meal'], test: function (blob) { return /lunch|dinner|restaurant|cafe|café/.test(blob); } },
    { id: 'snack', emoji: '🥐', label: 'Snack', tone: 'snack', types: ['snack'] },
    { id: 'sightseeing', emoji: '🗺️', label: 'Town', tone: 'viewpoint', types: ['viewpoint', 'experience'], test: function (blob) { return /town|square|castle|church|sight/.test(blob); } },
    { id: 'school', emoji: '🏫', label: 'School', tone: 'school', types: ['school'] },
  ];
  var STOP_PIN = { id: 'other', emoji: '📍', label: 'Place', tone: 'other' };

  function cueFrom(cue) {
    return { id: cue.id, emoji: cue.emoji, label: cue.label, tone: cue.id };
  }

  // Soft card wash, left stripe, and chip. Ink is for the chip text.
  // Dark values stay deep so the page’s light text still reads.
  var STOP_PALETTE = {
    airport:     { wash: '#e7f2fb', stripe: '#7eb0d6', chip: '#d6eaf8', ink: '#1a3d5c', darkWash: '#163044', darkStripe: '#8eb8dc', darkChip: '#1c3c56', darkInk: '#e7f2fb' },
    dropoff:     { wash: '#e7f6ef', stripe: '#7dbea0', chip: '#d7f0e4', ink: '#1a4a38', darkWash: '#14382c', darkStripe: '#8dccb0', darkChip: '#1a4636', darkInk: '#e7f6ef' },
    pickup:      { wash: '#eceeff', stripe: '#9aa3e8', chip: '#e0e3fb', ink: '#2c3270', darkWash: '#22264a', darkStripe: '#b0b6f0', darkChip: '#2c3260', darkInk: '#eceeff' },
    travel:      { wash: '#eef1f4', stripe: '#9aa6b4', chip: '#e4e9ee', ink: '#2f3a46', darkWash: '#2a3138', darkStripe: '#b4c0cc', darkChip: '#343c46', darkInk: '#eef1f4' },
    hotel:       { wash: '#fbf3e4', stripe: '#e0b56a', chip: '#f8e8c8', ink: '#5c3d12', darkWash: '#3a2e18', darkStripe: '#e8c48a', darkChip: '#4a3a1e', darkInk: '#fbf3e4' },
    glass:       { wash: '#f3eefb', stripe: '#b59ad6', chip: '#ebe3f7', ink: '#3d2a5c', darkWash: '#2c2440', darkStripe: '#c8b4e4', darkChip: '#382e52', darkInk: '#f3eefb' },
    factory:     { wash: '#f1eefc', stripe: '#a894e0', chip: '#e6e0f8', ink: '#33245c', darkWash: '#261f3e', darkStripe: '#c0b0ec', darkChip: '#322850', darkInk: '#f1eefc' },
    shop:        { wash: '#e8f0ff', stripe: '#8aade0', chip: '#dce8fb', ink: '#1c3a6e', darkWash: '#1a2c4a', darkStripe: '#a8c4ee', darkChip: '#223860', darkInk: '#e8f0ff' },
    antique:     { wash: '#f6efe6', stripe: '#c4a882', chip: '#f0e4d4', ink: '#4a3418', darkWash: '#3a2c1c', darkStripe: '#d4bc9a', darkChip: '#4a3824', darkInk: '#f6efe6' },
    museum:      { wash: '#fbf6e6', stripe: '#d4bc6a', chip: '#f6edd0', ink: '#5a4810', darkWash: '#3a3418', darkStripe: '#e0cc86', darkChip: '#4a421e', darkInk: '#fbf6e6' },
    restaurant:  { wash: '#fbeee8', stripe: '#e0a08a', chip: '#f8e0d6', ink: '#6a3220', darkWash: '#3e261e', darkStripe: '#ecc0b0', darkChip: '#523026', darkInk: '#fbeee8' },
    meal:        { wash: '#fbeee8', stripe: '#e0a08a', chip: '#f8e0d6', ink: '#6a3220', darkWash: '#3e261e', darkStripe: '#ecc0b0', darkChip: '#523026', darkInk: '#fbeee8' },
    snack:       { wash: '#f3f6e4', stripe: '#b4c56e', chip: '#e8f0cc', ink: '#3d4a14', darkWash: '#2c3418', darkStripe: '#c8d890', darkChip: '#384420', darkInk: '#f3f6e4' },
    sightseeing: { wash: '#e7f6f6', stripe: '#7ebdbd', chip: '#d6f0f0', ink: '#164848', darkWash: '#143838', darkStripe: '#96d0d0', darkChip: '#1c4848', darkInk: '#e7f6f6' },
    viewpoint:   { wash: '#e7f4f8', stripe: '#7eb4c8', chip: '#d6eef4', ink: '#164454', darkWash: '#143440', darkStripe: '#96c8d8', darkChip: '#1c4454', darkInk: '#e7f4f8' },
    experience:  { wash: '#e8f6f2', stripe: '#7eb8a8', chip: '#d8f0e8', ink: '#164838', darkWash: '#14382e', darkStripe: '#96d0bc', darkChip: '#1c483c', darkInk: '#e8f6f2' },
    school:      { wash: '#fbeaf1', stripe: '#dba0b8', chip: '#f6dce8', ink: '#5c2440', darkWash: '#3a2030', darkStripe: '#e8b8cc', darkChip: '#4c2a3c', darkInk: '#fbeaf1' },
    other:       { wash: '#f3f2f4', stripe: '#b3aeb8', chip: '#eae8ec', ink: '#3a3640', darkWash: '#2e2c32', darkStripe: '#c4c0c8', darkChip: '#3c3942', darkInk: '#f3f2f4' },
  };

  function paletteFor(id) {
    return STOP_PALETTE[id] || STOP_PALETTE.other;
  }

  function paletteCss() {
    var cardBits = '.rough-stop,.day-glance-item,.stop,.phone-week-stop,.look-stop';
    var light = [];
    var dark = [];
    Object.keys(STOP_PALETTE).forEach(function (id) {
      var tone = STOP_PALETTE[id];
      var cards = cardBits.split(',').map(function (sel) { return sel + '.stop-tone-' + id; }).join(',');
      light.push(cards + '{background:' + tone.wash + ';box-shadow:inset 4px 0 0 ' + tone.stripe + ';}');
      light.push('.type-icon-badge.type-' + id + '{color:' + tone.ink + ';background:' + tone.chip + ';border-color:' + tone.stripe + ';}');
      var darkCards = cardBits.split(',').map(function (sel) { return '[data-theme="dark"] ' + sel + '.stop-tone-' + id; }).join(',');
      dark.push(darkCards + '{background:' + tone.darkWash + ';box-shadow:inset 4px 0 0 ' + tone.darkStripe + ';}');
      dark.push('[data-theme="dark"] .type-icon-badge.type-' + id + '{color:' + tone.darkInk + ';background:' + tone.darkChip + ';border-color:' + tone.darkStripe + ';}');
    });
    return light.concat(dark).join('\n');
  }

  function installStopPalette() {
    if (typeof document === 'undefined' || !document.head) return;
    var style = document.getElementById('stop-palette');
    if (!style) {
      style = document.createElement('style');
      style.id = 'stop-palette';
      document.head.appendChild(style);
    }
    style.textContent = paletteCss();
  }

  function stopCue(info) {
    var row = info || {};
    var types = [];
    function addType(id) {
      var clean = cleanId(id);
      if (clean && types.indexOf(clean) === -1) types.push(clean);
    }
    addType(row.placeKind === 'airport' ? 'airport' : '');
    if (row.handoverKind === 'dropoff') addType('dropoff');
    if (row.handoverKind === 'pickup' || row.type === 'handover') addType('pickup');
    addType(row.type);
    asList(row.types).forEach(addType);
    var blob = [row.title, row.name, row.hotelName, row.notes].join(' ').toLowerCase();
    var i;
    var cue;
    for (i = 0; i < STOP_CUES.length; i++) {
      cue = STOP_CUES[i];
      if (cue.types && cue.types.some(function (id) { return types.indexOf(id) !== -1; })) return cueFrom(cue);
    }
    if (blob.trim()) {
      for (i = 0; i < STOP_CUES.length; i++) {
        cue = STOP_CUES[i];
        if (cue.test && cue.test(blob)) return cueFrom(cue);
      }
    }
    return cueFrom(STOP_PIN);
  }

  function foodCategory(place) {
    return placeCategories(place).some(function (id) {
      return id === 'restaurant' || id === 'snack';
    });
  }

  root.PlaceCategories = {
    CATALOGUE_TYPES: CATALOGUE_TYPES,
    placeCategories: placeCategories,
    primaryCategory: primaryCategory,
    placeHasCategory: placeHasCategory,
    singularLabel: singularLabel,
    groupLabel: groupLabel,
    categoriesLabel: categoriesLabel,
    foodCategory: foodCategory,
    knownCatalogueId: knownCatalogueId,
    STOP_CUES: STOP_CUES,
    STOP_PALETTE: STOP_PALETTE,
    stopCue: stopCue,
    paletteFor: paletteFor,
    paletteCss: paletteCss,
  };
  installStopPalette();
})(typeof globalThis !== 'undefined' ? globalThis : this);
