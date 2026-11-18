const test = require('node:test');
const assert = require('node:assert/strict');

require('./drag-label.js');

const D = globalThis.DragLabel;

test('the drag label sits above and to the right of the finger', () => {
  const box = D.place({ x: 100, y: 200, width: 80, height: 24, viewW: 800, viewH: 900 });
  assert.equal(box.left, 130);
  assert.equal(box.top, 136);
});

test('the drag label flips before it leaves the right or top edge', () => {
  const right = D.place({ x: 360, y: 200, width: 80, height: 24, viewW: 400, viewH: 800 });
  assert.equal(right.left, 250);
  assert.ok(right.left + 80 <= 400);
  const top = D.place({ x: 100, y: 20, width: 80, height: 24, viewW: 400, viewH: 800 });
  assert.equal(top.top, 60);
  assert.ok(top.top >= 0);
});
