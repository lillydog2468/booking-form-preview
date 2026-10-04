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
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
