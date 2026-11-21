/*
 * Keith's ratings on public.hotel_ratings.
 * The table is already in Supabase. This file only reads and writes rows
 * for a signed-in session. It does not create the table.
 */
(function (root) {
  'use strict';

  function blankToNull(value) {
    if (value == null) return null;
    var text = String(value).trim();
    return text ? text : null;
  }

  function intOrNull(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    if (!isFinite(n) || Math.round(n) !== n) return null;
    return n;
  }

  function normaliseWrite(row) {
    var src = row || {};
    var hotel = String(src.hotel_name == null ? src.hotelName || '' : src.hotel_name).trim();
    if (!hotel) throw new Error('A hotel name is required');
    var stars = Number(src.stars);
    if (!isFinite(stars) || Math.round(stars) !== stars || stars < 1 || stars > 5) {
      throw new Error('Stars must be a whole number from 1 to 5');
    }
    var note = src.note == null ? '' : String(src.note).trim();
    if (note.length > 240) note = note.slice(0, 240);
    var placeId = intOrNull(src.place_id != null ? src.place_id : src.placeId);
    var bookingId = intOrNull(src.booking_id != null ? src.booking_id : src.bookingId);
    var memberId = intOrNull(src.member_id != null ? src.member_id : src.memberId);
    return {
      place_id: placeId,
      hotel_name: hotel,
      booking_id: bookingId,
      member_id: memberId,
      stars: stars,
      note: note || null,
    };
  }

  function unwrap(result) {
    var res = result || {};
    if (res.error) throw res.error;
    return res.data;
  }

  async function list(sb) {
    var res = await sb.from('hotel_ratings').select('*').order('created_at', { ascending: false });
    return unwrap(res) || [];
  }

  async function create(sb, row) {
    var payload = normaliseWrite(row);
    var res = await sb.from('hotel_ratings').insert(payload).select('*');
    var data = unwrap(res);
    return Array.isArray(data) ? data[0] : data;
  }

  async function update(sb, id, row) {
    var ratingId = intOrNull(id);
    if (ratingId == null) throw new Error('A rating id is required');
    var payload = normaliseWrite(row);
    payload.updated_at = new Date().toISOString();
    var res = await sb.from('hotel_ratings').update(payload).eq('id', ratingId).select('*');
    var data = unwrap(res);
    return Array.isArray(data) ? data[0] : data;
  }

  async function remove(sb, id) {
    var ratingId = intOrNull(id);
    if (ratingId == null) throw new Error('A rating id is required');
    unwrap(await sb.from('hotel_ratings').delete().eq('id', ratingId));
    return { id: ratingId };
  }

  root.PragueHotelRatings = {
    normaliseWrite: normaliseWrite,
    list: list,
    create: create,
    update: update,
    remove: remove,
  };
})(typeof window !== 'undefined' ? window : globalThis);
