const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

test('table headers have a resize handle and only a chosen width overrides the 200px cap', () => {
  assert.match(html, /keith_table_col_widths_v1/);
  assert.match(html, /TABLE_COL_MIN_PX = 50/);
  assert.match(html, /class="col-resize"/);
  assert.match(html, /onpointerdown="beginTableColumnResize/);
  assert.match(html, /ondblclick="resetTableColumnWidth/);
  assert.match(html, /touch-action: none/);
  assert.match(html, /\.data-table td \{[^}]*max-width: 200px;/);
  const head = extractFunction('renderTableHead');
  assert.match(head, /data-table-col/);
  assert.match(head, /tableColSizeStyle\(col\.key\)/);
  const drag = extractFunction('onTableHeaderDragStart');
  assert.match(drag, /\.col-resize/);
  assert.match(drag, /preventDefault\(\)/);
});

function loadWidths() {
  const store = {};
  const cells = [];
  function makeCell(tag, key, width) {
    const cell = {
      tag,
      key,
      style: {},
      getBoundingClientRect() { return { width: width || 160 }; },
    };
    cells.push(cell);
    return cell;
  }
  const ctx = {
    TABLE_COLUMNS: [
      { key: 'group_name', label: 'Group Name' },
      { key: 'id', label: 'ID' },
    ],
    TABLE_COL_WIDTHS_KEY: 'keith_table_col_widths_v1',
    TABLE_COL_MIN_PX: 50,
    tableColumnWidths: {},
    tableColResizeDrag: null,
    allBookings: [{ id: 1, group_name: 'Dorris 2027' }],
    rendered: 0,
    cells,
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
    },
    document: {
      listeners: {},
      querySelector(sel) {
        const key = /data-table-col="([^"]+)"/.exec(sel);
        if (!key) return null;
        return cells.find(cell => cell.tag === 'th' && cell.key === key[1]) || null;
      },
      querySelectorAll(sel) {
        const key = /data-table-col="([^"]+)"/.exec(sel);
        const found = key ? cells.filter(cell => cell.key === key[1]) : [];
        return found;
      },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      removeEventListener(type, fn) {
        if (this.listeners[type] === fn) delete this.listeners[type];
      },
    },
    renderTable() { ctx.rendered += 1; },
  };
  ctx.makeCell = makeCell;
  ctx.store = store;
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('loadTableColumnWidths'),
    extractFunction('saveTableColumnWidths'),
    extractFunction('tableColWidthPx'),
    extractFunction('tableColSizeStyle'),
    extractFunction('applyLiveTableColumnWidth'),
    extractFunction('beginTableColumnResize'),
    extractFunction('resetTableColumnWidth'),
    extractFunction('onTableHeaderDragStart'),
  ].join('\n'), ctx);
  return ctx;
}

test('a resized column is stored by its key and a short drag cannot go under 50px', () => {
  const ctx = loadWidths();
  ctx.store.keith_table_col_widths_v1 = JSON.stringify({
    group_name: 340,
    id: 12,
    not_a_column: 900,
  });
  ctx.loadTableColumnWidths();
  assert.equal(ctx.tableColumnWidths.group_name, 340);
  assert.equal(ctx.tableColumnWidths.id, undefined);
  assert.equal(ctx.tableColSizeStyle('group_name'), 'width:340px;min-width:340px;max-width:340px;');
  assert.equal(ctx.tableColSizeStyle('id'), '');

  const th = ctx.makeCell('th', 'group_name', 180);
  const td = ctx.makeCell('td', 'group_name', 180);
  ctx.makeCell('td', 'id', 80);
  const handle = {
    setPointerCapture() {},
  };
  ctx.beginTableColumnResize({
    preventDefault() {},
    stopPropagation() {},
    clientX: 100,
    pointerId: 7,
    currentTarget: handle,
  }, 'group_name');
  ctx.document.listeners.pointermove({
    pointerId: 7,
    clientX: -200,
    preventDefault() {},
  });
  ctx.document.listeners.pointerup({ pointerId: 7 });
  assert.equal(ctx.tableColumnWidths.group_name, 50);
  assert.equal(td.style.maxWidth, '50px');
  assert.equal(th.style.width, '50px');
  assert.equal(ctx.cells.find(cell => cell.key === 'id').style.width, undefined);
  const saved = JSON.parse(ctx.store.keith_table_col_widths_v1);
  assert.deepEqual(saved, { group_name: 50 });
});

test('double-click clears one column and a resize handle does not start a reorder drag', () => {
  const ctx = loadWidths();
  ctx.tableColumnWidths = { group_name: 280, id: 90 };
  ctx.resetTableColumnWidth({ preventDefault() {}, stopPropagation() {} }, 'group_name');
  assert.equal(ctx.tableColumnWidths.group_name, undefined);
  assert.equal(ctx.tableColumnWidths.id, 90);
  assert.equal(ctx.rendered, 1);
  assert.equal(JSON.parse(ctx.store.keith_table_col_widths_v1).id, 90);

  let prevented = false;
  let transferred = false;
  ctx.onTableHeaderDragStart({
    target: { closest(sel) { return sel === '.col-resize' ? {} : null; } },
    preventDefault() { prevented = true; },
    dataTransfer: { set effectAllowed(v) { transferred = v; } },
  }, 'group_name');
  assert.equal(prevented, true);
  assert.equal(transferred, false);
});
