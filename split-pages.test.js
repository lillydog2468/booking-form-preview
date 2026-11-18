const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const pages = ['booking-form', 'tour-planner', 'hotels'];

test('large pages load cached css and js from the same folder', () => {
  for (const name of pages) {
    const html = fs.readFileSync(path.join(__dirname, name + '.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, name + '.css'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8');
    assert.match(html, new RegExp('<link rel="stylesheet" href="' + name + '\\.css">'));
    assert.match(html, new RegExp('<script src="' + name + '\\.js" defer></script>'));
    assert.equal(html.includes('/booking-form-preview/'), false, name);
    assert.match(html, /localStorage\.getItem\('theme'\)/);
    assert.ok(css.length > 1000, name + ' css');
    assert.ok(js.includes('AuthGate.require'), name + ' still signs in');
    assert.ok(Buffer.byteLength(html) < 80000, name + ' html stays small');
  }
});
