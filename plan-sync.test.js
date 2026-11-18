const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'plan-sync.js'), 'utf8');
const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, 'sql/31_planner_plans_realtime.sql'), 'utf8');

function load(userAgent, touch) {
  const context = {
    navigator: { userAgent: userAgent, platform: 'MacIntel', maxTouchPoints: touch ? 2 : 0 },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    addEventListener() {},
    removeEventListener() {},
    Intl: Intl,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(src, context);
  return context.PlanSync;
}

test('the status names the device and Prague time, and a differing day is not the same plan', () => {
  const ipad = load('Mozilla/5.0 (iPad)', true);
  const mac = load('Mozilla/5.0 (Macintosh)', false);
  assert.equal(ipad.deviceLabel(), 'iPad');
  assert.equal(mac.deviceLabel(), 'Mac');
  assert.equal(load('Mozilla/5.0 (iPhone)', false).deviceLabel(), 'iPhone');
  const line = mac.currentLine('2026-11-18T17:50:15.000Z', 'iPad');
  assert.match(line, /^Last saved \d{2}:\d{2} \(Prague\) from iPad — this is the current version$/);
  assert.equal(ipad.NEWER, 'Newer version saved on another device — updated');
  assert.equal(ipad.UNSAVED, 'Not saved to cloud — tap to retry');
  const moved = { days: [{ date: '2027-05-12', blocks: [{ id: 'gb', time: '09:30', title: 'GB Beads' }] }] };
  const cloud = { days: [{ date: '2027-05-11', blocks: [{ id: 'gb', time: '09:15', title: 'GB Beads' }] }] };
  assert.equal(ipad.sameSchedule(moved, cloud), false);
  assert.equal(ipad.sameSchedule(cloud, JSON.parse(JSON.stringify(cloud))), true);
  const plan = {};
  ipad.stamp(plan);
  assert.equal(plan.lastSavedFrom, 'iPad');
  assert.match(plan.lastSavedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('a drop looks under the finger, and a cloud save is only saved when a row comes back', () => {
  const hit = planner.slice(planner.indexOf('function overviewColumnAt'), planner.indexOf('function overviewAutoScroll'));
  assert.match(hit, /pointerEvents = 'none'/);
  assert.match(hit, /\.ov-ghost/);
  assert.match(planner, /setTimeout\(\(\) => lift\(lastX, lastY\), 300\)/);
  assert.match(planner, /placeOverviewStop\(/);
  assert.match(planner, /const held = planSyncByKey\[key\]/);
  assert.equal(/if \(!baseline\) \{\s*rememberPlanBaseline\(plan\);/.test(planner), false);
  assert.match(planner, /planResult\.wrote/);
  assert.match(planner, /paintPlanStatus\('unsaved'\)/);
  assert.match(planner, /PlanSync\.watch/);
  assert.match(src, /postgres_changes/);
  assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.planner_plans;/);
  assert.equal(/GRANT/i.test(sql), false);
});
