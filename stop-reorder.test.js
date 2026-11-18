const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');
const plannerHtml = fs.readFileSync(path.join(__dirname, 'tour-planner.html'), 'utf8');
const plannerCss = fs.readFileSync(path.join(__dirname, 'tour-planner.css'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function loadReorder() {
  const source = [
    'function seedTravelMinutes() {}',
    extractFunction(planner, 'keepFinalDropoffsLast'),
    extractFunction(planner, 'timeToMinutes'),
    extractFunction(planner, 'periodForTime'),
    extractFunction(planner, 'redistributeBlockTimes'),
    extractFunction(planner, 'dropInsertIndex'),
    extractFunction(planner, 'reorderStopsByDrop'),
    extractFunction(planner, 'reorderDayByDrop'),
  ].join('\n');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'stop-reorder.js' });
  return ctx;
}

function day() {
  return {
    blocks: [
      { id: 'a', time: '09:00', title: 'Airport' },
      { id: 'b', time: '11:00', title: 'Factory' },
      { id: 'c', time: '14:00', title: 'Museum' },
    ],
  };
}

test('dropping above or below a stop in the same day reorders and keeps the times in order', () => {
  const api = loadReorder();
  const down = day();
  assert.equal(api.reorderDayByDrop(down, 'a', 'b', true), true);
  assert.deepEqual(down.blocks.map(stop => stop.id), ['b', 'a', 'c']);
  assert.deepEqual(down.blocks.map(stop => stop.time), ['09:00', '11:00', '14:00']);

  const up = day();
  assert.equal(api.reorderDayByDrop(up, 'c', 'a', false), true);
  assert.deepEqual(up.blocks.map(stop => stop.id), ['c', 'a', 'b']);
  assert.deepEqual(up.blocks.map(stop => stop.time), ['09:00', '11:00', '14:00']);
  assert.equal(up.blocks[0].title, 'Museum');

  const same = day();
  assert.equal(api.reorderDayByDrop(same, 'b', 'b', false), false);
  assert.deepEqual(same.blocks.map(stop => stop.id), ['a', 'b', 'c']);
  assert.equal(api.dropInsertIndex(['a', 'b', 'c'], 'b', 'a', true), 1);
});

test('the rough plan and the day planner drag within a day by pointer', () => {
  assert.match(planner, /function reorderDayByDrop\(/);
  assert.match(planner, /fromDay === Number\(toDayIndex\)/);
  assert.match(planner, /reorderDayByDrop\(days\[fromDay\], stopId, targetId, !!after\)/);
  assert.match(planner, /class="plan-drag"/);
  assert.match(planner, /class="rough-drag"/);
  assert.match(planner, /bindPlanStopDrag\(\)/);
  assert.match(planner, /bindPointerReorder\(document\.querySelectorAll\('\.rough-drag'\)/);
  assert.match(planner, /bindPointerReorder\(list\.querySelectorAll\('\.day-glance-handle'\)/);
  assert.match(plannerCss, /\.rough-drag, \.plan-drag \{[\s\S]*touch-action: none/);
  assert.match(plannerCss, /\.day-glance-handle \{[\s\S]*touch-action: none/);
  assert.equal(plannerHtml.includes('Drag a stop by the handle to another day.'), false);
});
