const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const config = fs.readFileSync(path.join(root, 'booking-config.js'), 'utf8');
const hide = fs.readFileSync(path.join(root, 'planning-hide.js'), 'utf8');
const planner = fs.readFileSync(path.join(root, 'tour-planner.js'), 'utf8');
const plannerHtml = fs.readFileSync(path.join(root, 'tour-planner.html'), 'utf8');
const formHtml = fs.readFileSync(path.join(root, 'booking-form.html'), 'utf8');
const form = fs.readFileSync(path.join(root, 'booking-form.js'), 'utf8');
const planner2 = fs.readFileSync(path.join(root, 'planner2.html'), 'utf8');
const booking2 = fs.readFileSync(path.join(root, 'booking2.html'), 'utf8');

test('the old planner is off unless the config switch is true', () => {
  assert.match(config, /Switch the old planner back on by setting this to false/);
  assert.match(config, /root\.HIDE_OLD_PLANNING = false/);
  assert.match(hide, /HIDE_OLD_PLANNING === true/);
  assert.match(hide, /Temporarily hidden, use the/);
  assert.match(hide, /href="booking-form\.html"/);
  assert.match(hide, /a\[href\^="tour-planner\.html"\]/);
  assert.match(hide, /onOldPlannerPage/);
  assert.equal(hide.includes('a[href^="planner2.html"]'), false);

  const gate = planner.indexOf('PlanningHide.oldPlanningHidden()');
  const boot = planner.indexOf("AuthGate.require(sb, { title: 'Tour planner' })");
  assert.ok(gate >= 0 && gate < boot);
  assert.match(planner, /PlanningHide\.showNote\(document\.body\)/);
  assert.ok(planner.trimEnd().endsWith('}'));

  assert.match(plannerHtml, /src="planning-hide\.js"/);
  assert.match(plannerHtml, /src="tour-planner\.js"/);
  assert.match(formHtml, /src="planning-hide\.js"/);
  assert.match(formHtml, /href="tour-planner\.html"/);
  assert.match(form, />Start planning</);
  assert.match(form, />Day planner</);
  assert.match(planner2, /booking2\.html/);
  assert.equal(planner2.includes('planning-hide.js'), false);
  assert.match(booking2, /planner2\.js/);
});

test('a true switch replaces the old planner and keeps planner2', () => {
  const previous = global.HIDE_OLD_PLANNING;
  global.HIDE_OLD_PLANNING = true;
  delete require.cache[require.resolve('./planning-hide.js')];
  const api = require('./planning-hide.js');
  assert.equal(global.PlanningHide.oldPlanningHidden(), true);
  const host = { innerHTML: '', classList: { add() {} } };
  global.PlanningHide.showNote(host);
  assert.match(host.innerHTML, /Temporarily hidden, use the <a href="booking-form\.html">booking form<\/a>\./);
  global.HIDE_OLD_PLANNING = false;
  assert.equal(global.PlanningHide.oldPlanningHidden(), false);
  global.HIDE_OLD_PLANNING = previous;
  assert.equal(typeof api.oldPlanningHidden, 'undefined');
});
