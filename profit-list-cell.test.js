const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('node:vm');

require('./booking-format.js');

const html = require('./test-page').pageSource(path.join(__dirname, 'booking-form.html'), 'utf8');
const money = global.BookingFormat.formatMoney;

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

function loadCell() {
  const ctx = {
    DEFAULT_CURRENCY: 'GBP',
    formatMoney: money,
    normalizeCurrency() { return 'GBP'; },
    escapeHtml(str) {
      return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    },
  };
  vm.createContext(ctx);
  vm.runInContext(extractFunction('profitListCell'), ctx);
  return ctx;
}

test('money still due is shown as the full profit, with the outstanding part in orange', () => {
  const ctx = loadCell();
  const ahead = ctx.profitListCell({ totalprofit: 500, left_to_pay: 700 });
  assert.equal(ahead.cls, ' positive');
  assert.equal(ahead.text, money(1200) + ' <span class="profit-to-come">(+' + money(700) + ' to come)</span>');

  const behind = ctx.profitListCell({ totalprofit: -200, left_to_pay: 900 });
  assert.equal(behind.cls, ' positive');
  assert.equal(behind.text, money(700) + ' <span class="profit-to-come">(+' + money(900) + ' to come)</span>');

  const loss = ctx.profitListCell({ totalprofit: -500, left_to_pay: 100 });
  assert.equal(loss.cls, ' negative');
  assert.equal(loss.text, money(-400));
  assert.equal(loss.text.includes('profit-to-come'), false);

  const settled = ctx.profitListCell({ totalprofit: 500, left_to_pay: 0 });
  assert.equal(settled.cls, ' positive');
  assert.equal(settled.text, '500');

  const odd = ctx.profitListCell({ totalprofit: '<b>', left_to_pay: 10 });
  assert.equal(odd.text, '&lt;b&gt;');
  assert.match(html, /\.data-table \.profit-to-come \{[^}]*color: var\(--warning\)/);
});
