/*
 * Supabase project used by every booking page.
 * The key is the public anon key. It is not a service-role secret.
 */
(function (root) {
  'use strict';
  root.BOOKING_SUPABASE_URL = 'https://ojulhplswtcmheonsnlv.supabase.co';
  root.BOOKING_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qdWxocGxzd3RjbWhlb25zbmx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTk3MDUsImV4cCI6MjA4ODk5NTcwNX0.n45cEd4soEC4gLDs2KSnBBvPs4nivDcSoj4GsG6u8IU';

  // Temporary switch for the GitHub Pages preview. false leaves the old tour
  // planner and every link to it in place. true shows a short note on
  // tour-planner.html and hides Day planner, Start planning, the Planner tab,
  // and the other old planner links. planner2.html is not affected.
  // Switch the old planner back on by setting this to false.
  root.HIDE_OLD_PLANNING = true;
})(typeof globalThis !== 'undefined' ? globalThis : this);
