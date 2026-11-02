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
    return { id: cue.id, emoji: cue.emoji, label: cue.label, tone: cue.tone };
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
    stopCue: stopCue,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
