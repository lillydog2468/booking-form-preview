const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const planner = fs.readFileSync(path.join(__dirname, 'tour-planner.js'), 'utf8');

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

function loadLending() {
  const source = [
    'let n = 0; function uid(prefix) { n += 1; return (prefix || "id") + n; }',
    'function todayISO() { return "2026-11-02"; }',
    extractFunction(planner, 'roundPounds'),
    extractFunction(planner, 'parseLoanAmount'),
    extractFunction(planner, 'loanTotal'),
    extractFunction(planner, 'lendingIsoDay'),
    extractFunction(planner, 'shortWeekDate'),
    extractFunction(planner, 'loanWhenLabel'),
    extractFunction(planner, 'ensureGuestDebt'),
    extractFunction(planner, 'recordGuestLoan'),
    extractFunction(planner, 'recordGuestRepayment'),
    extractFunction(planner, 'repaymentWhenLabel'),
    extractFunction(planner, 'lendingHistory'),
    extractFunction(planner, 'guestPaidBack'),
    extractFunction(planner, 'guestOwes'),
    extractFunction(planner, 'formatAmount'),
  ].join('\n');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'lending.js' });
  return ctx;
}

test('an existing lent total becomes one undated entry and repayments still reduce what is owed', () => {
  const api = loadLending();
  const kay = { id: 'kay', name: 'Kay', lent: 40, repayments: [{ id: 'r1', date: '2026-05-10', amount: 15 }] };
  api.ensureGuestDebt(kay);
  assert.equal(kay.loans.length, 1);
  assert.equal(kay.loans[0].amount, 40);
  assert.equal(kay.loans[0].at, '');
  assert.equal(kay.loans[0].legacy, true);
  assert.equal(kay.lent, 40);
  assert.equal(api.guestOwes(kay), 25);
  assert.equal(api.loanWhenLabel(kay.loans[0]), 'Earlier');
  api.ensureGuestDebt(kay);
  assert.equal(kay.loans.length, 1);
});

test('pressing Enter stores the amount with a timestamp and hides the date from the summary', () => {
  const api = loadLending();
  const gail = { id: 'gail', name: 'Gail', lent: 0, repayments: [] };
  assert.equal(api.recordGuestLoan(gail, 12.5, '2026-11-02T21:05:00.000Z'), true);
  assert.equal(api.recordGuestLoan(gail, 0, '2026-11-02T21:06:00.000Z'), false);
  assert.equal(gail.loans.length, 1);
  assert.equal(gail.loans[0].amount, 12.5);
  assert.equal(gail.loans[0].at, '2026-11-02T21:05:00.000Z');
  assert.equal(gail.lent, 12.5);
  assert.equal(api.guestOwes(gail), 12.5);
  assert.equal(api.loanWhenLabel(gail.loans[0]), 'Mon 2 Nov');
  assert.match(planner, /data-lent-entry/);
  assert.match(planner, /data-lent-add/);
  assert.match(planner, /e\.key !== 'Enter'/);
  assert.match(planner, /function commitVisibleLoan\(/);
  assert.match(planner, /function bindLendingOnce\(/);
  assert.match(planner, /document\.addEventListener\('keydown'/);
  assert.match(planner, /document\.addEventListener\('click'/);
});

test('lending amounts are typed in several ways and shown as whole crowns', () => {
  const api = loadLending();
  const jenny = { name: 'Jennifer Lindsay', personId: 'person-jenny', lent: 0, repayments: [] };
  api.ensureGuestDebt(jenny);
  assert.ok(jenny.id);
  assert.equal(api.parseLoanAmount('1000'), 1000);
  assert.equal(api.parseLoanAmount('1 000'), 1000);
  assert.equal(api.parseLoanAmount('1,000'), 1000);
  assert.equal(api.parseLoanAmount('1000 Kč'), 1000);
  assert.equal(api.parseLoanAmount('1000 CZK'), 1000);
  assert.equal(api.parseLoanAmount('£1000'), 1000);
  assert.equal(api.parseLoanAmount('£1,000.00'), 1000);
  assert.equal(api.formatAmount(1000), '1 000 Kč');
  assert.equal(api.formatAmount(40), '40 Kč');
  assert.equal(api.formatAmount(12.5), '13 Kč');
  assert.equal(api.recordGuestLoan(jenny, '1 000 Kč', '2026-11-02T21:47:00.000Z'), true);
  assert.equal(jenny.loans[jenny.loans.length - 1].amount, 1000);
  assert.equal(jenny.loans[jenny.loans.length - 1].currency, 'CZK');
  assert.equal(jenny.loans[jenny.loans.length - 1].at, '2026-11-02T21:47:00.000Z');
  assert.equal(api.guestOwes(jenny), 1000);
  const older = { id: 'kay', name: 'Kay', lent: 40, repayments: [{ id: 'r1', date: '2026-05-10', amount: 15 }] };
  api.ensureGuestDebt(older);
  assert.equal(older.loans[0].amount, 40);
  assert.equal(older.loans[0].currency, undefined);
  assert.equal(api.formatAmount(api.guestOwes(older)), '25 Kč');
  const saved = JSON.parse(JSON.stringify(jenny));
  api.ensureGuestDebt(saved);
  assert.equal(saved.loans.some(row => row.amount === 1000 && row.at === '2026-11-02T21:47:00.000Z'), true);
  assert.equal(api.guestOwes(saved), 1000);
  const line = planner.slice(planner.indexOf('class="lent-line"'), planner.indexOf('class="lent-history"'));
  assert.equal(line.includes('loanWhenLabel'), false);
  assert.equal(line.includes('email'), false);
  const groupCard = planner.slice(planner.indexOf('<h2>Group</h2>'), planner.indexOf('renderGuestsCard(false)'));
  assert.match(groupCard, /\$\{groupTools\}/);
  assert.equal(groupCard.includes('groupIdentity'), false);
  const tools = planner.slice(planner.indexOf('const groupTools'), planner.indexOf('const tripOrgName'));
  assert.match(tools, /id="btnRebuildDays"/);
  assert.match(tools, /Suggest a rough week/);
  assert.equal(tools.includes('renderTourHotelSelect'), false);
  assert.equal(tools.includes('id="organiserName"'), false);
  assert.equal(tools.includes('id="groupName"'), false);
  assert.equal(tools.includes('id="arrivalDate"'), false);
  const phone = planner.slice(planner.indexOf('const plannerPhone'), planner.indexOf('const plannerDesktop'));
  const desk = planner.slice(planner.indexOf('const plannerDesktop'), planner.indexOf('const placesView'));
  const guestList = planner.slice(planner.indexOf('function renderGuestNameChips('), planner.indexOf('function renderSharedAlbumsEditor('));
  assert.match(guestList, /function renderGuestNameChips\(/);
  assert.match(guestList, /class="guest-chip"/);
  assert.equal(guestList.includes('data-guest-name'), false);
  assert.equal(guestList.includes('data-guest-email'), false);
  assert.equal(guestList.includes('type="email"'), false);
  assert.match(phone, /renderGuestsCard\(true\)/);
  assert.equal(phone.includes('renderLendingSection'), false);
  assert.match(desk, /renderGuestsCard\(false\)/);
  assert.match(desk, /renderLendingSection\(\)/);
  assert.match(planner, /<details class="lending-desk"\$\{open\}><summary>Lending<\/summary>/);
  const lendingFns = planner.slice(planner.indexOf('function formatAmount('), planner.indexOf('function albumIdFromICloudUrl('));
  assert.match(lendingFns, /Kč/);
  assert.equal(lendingFns.includes('GBP'), false);
  assert.equal(lendingFns.includes('£'), false);
  const lady = planner.slice(planner.indexOf('function renderGuestLending('), planner.indexOf('function renderLendingSection('));
  assert.equal(lady.includes('£'), false);
  assert.equal(lady.includes('placeholder'), false);
  assert.match(lady, /formatAmount\(row\.amount\)/);
  assert.match(lady, /formatAmount\(owes\)/);
  assert.match(planner, /state\.lendingOpen \? ' open' : ''/);
  const summary = planner.slice(planner.indexOf('const tripSummary'), planner.indexOf('const renderGuestsCard'));
  assert.equal(summary.includes('trip-dates'), false);
  assert.match(summary, /Staying at:/);
  const hotelSelect = planner.slice(planner.indexOf('function renderTourHotelSelect('), planner.indexOf('function renderDayOrigin('));
  assert.equal(hotelSelect.includes('tourHotelMapsButtonHtml'), false);
  assert.equal(planner.includes('look-range'), false);
});

test('Paid back uses the same amount box and can clear or exceed what is owed', () => {
  const api = loadLending();
  const jenny = { id: 'jenny', name: 'Jenny Lindsay', lent: 0, loans: [], repayments: [] };
  assert.equal(api.recordGuestLoan(jenny, '3000', '2026-11-02T22:00:00.000Z'), true);
  assert.equal(api.parseLoanAmount('3 000'), 3000);
  assert.equal(api.parseLoanAmount('3000 Kč'), 3000);
  assert.equal(api.recordGuestRepayment(jenny, '3000 Kč'), true);
  assert.equal(jenny.repayments.length, 1);
  assert.equal(jenny.repayments[0].amount, 3000);
  assert.equal(jenny.repayments[0].date, '2026-11-02');
  assert.equal(jenny.repayments[0].currency, 'CZK');
  assert.equal(api.guestOwes(jenny), 0);
  assert.equal(api.formatAmount(0), '0 Kč');
  assert.equal(api.recordGuestRepayment(jenny, '500'), true);
  assert.equal(api.guestOwes(jenny), -500);
  assert.equal(api.formatAmount(api.guestOwes(jenny)), '-500 Kč');

  const kay = { id: 'kay', name: 'Kay', lent: 40, repayments: [{ id: 'r1', date: '2026-05-10', amount: 15 }] };
  const history = api.lendingHistory(kay);
  assert.equal(history.some(row => row.kind === 'loan' && row.amount === 40), true);
  assert.equal(history.some(row => row.kind === 'repay' && row.amount === 15), true);
  assert.equal(history.find(row => row.kind === 'repay').when, 'Sun 10 May');

  const lady = planner.slice(planner.indexOf('function renderGuestLending('), planner.indexOf('function renderLendingSection('));
  assert.match(lady, /data-lent-repay/);
  assert.match(lady, />Paid back</);
  assert.match(lady, /− /);
  assert.match(lady, /paid back/);
  assert.match(lady, /lendingHistory\(g\)/);
  assert.equal(lady.includes('Daily repayments'), false);
  assert.equal(lady.includes('data-add-repay'), false);
  assert.equal(lady.includes('type="number"'), false);
  assert.equal(lady.includes('type="date"'), false);
  const bind = extractFunction(planner, 'bindLendingOnce');
  const keys = bind.slice(bind.indexOf('keydown'), bind.indexOf("addEventListener('click'"));
  assert.match(keys, /commitVisibleLoan/);
  assert.equal(keys.includes('commitVisibleRepayment'), false);
  assert.match(bind, /data-lent-repay/);
  assert.match(bind, /commitVisibleRepayment/);
  assert.equal(planner.includes("querySelectorAll('[data-repay-amount]')"), false);
  assert.equal(planner.includes("querySelectorAll('[data-add-repay]')"), false);
  const phone = planner.slice(planner.indexOf('const plannerPhone'), planner.indexOf('const plannerDesktop'));
  const desk = planner.slice(planner.indexOf('const plannerDesktop'), planner.indexOf('const placesView'));
  assert.match(phone, /renderGuestsCard\(true\)/);
  assert.match(desk, /renderLendingSection\(\)/);
});

test('history dates are smaller and quieter on the shared planner stylesheet', () => {
  const css = fs.readFileSync(path.join(__dirname, 'tour-planner.css'), 'utf8');
  const when = css.match(/\.lent-when\s*\{[^}]*\}/);
  assert.ok(when, 'missing .lent-when');
  assert.match(when[0], /font-size:\s*0\.75em/);
  assert.match(when[0], /color:\s*var\(--text-secondary\)/);
  const amt = css.match(/\.lent-amt\s*\{[^}]*\}/);
  assert.ok(amt, 'missing .lent-amt');
  assert.match(amt[0], /font-weight:\s*800/);
  assert.match(amt[0], /color:\s*var\(--text\)/);
  assert.equal(css.includes('.view-phone .lent-when'), false);
});

test('history repayments use the same compact row as loans, and the lending line does not wrap', () => {
  const lady = planner.slice(planner.indexOf('function renderGuestLending('), planner.indexOf('function renderLendingSection('));
  const row = lady.slice(lady.indexOf('<li class="lent-entry">'), lady.indexOf('</li>') + 5);
  assert.match(row, /class="lent-when"/);
  assert.match(row, /class="lent-amt"/);
  assert.match(row, /class="lent-remove"/);
  assert.equal(row.includes('icon-btn'), false);
  assert.equal(lady.includes('repay-row'), false);
  assert.equal(lady.includes('type="date"'), false);
  assert.equal(lady.includes('type="number"'), false);
  assert.equal(lady.includes('Daily repayments'), false);
  const css = fs.readFileSync(path.join(__dirname, 'tour-planner.css'), 'utf8');
  assert.equal(css.includes('.repay-row'), false);
  assert.equal(css.includes('.repay-list'), false);
  assert.match(css, /\.lent-line \{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.lent-entry \{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.lent-amt \{[^}]*font-size:\s*12px/);
  assert.match(css, /\.lent-amt \{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.lent-when \{[^}]*font-size:\s*0\.75em/);
});

test('new loans and repayments keep today, and older dates stay put', () => {
  const api = loadLending();
  const jenny = { id: 'jenny', name: 'Jenny Lindsay', lent: 0, loans: [], repayments: [] };
  assert.equal(api.recordGuestLoan(jenny, '1000'), true);
  assert.equal(jenny.loans[0].at, '2026-11-02');
  assert.equal(jenny.loans[0].currency, 'CZK');
  assert.equal(api.loanWhenLabel(jenny.loans[0]), 'Mon 2 Nov');
  assert.equal(api.recordGuestRepayment(jenny, '200'), true);
  assert.equal(jenny.repayments[0].date, '2026-11-02');
  assert.equal(api.repaymentWhenLabel(jenny.repayments[0].date), 'Mon 2 Nov');

  const saved = {
    id: 'jenny',
    name: 'Jenny Lindsay',
    lent: 3500,
    loans: [
      { id: 'l1', amount: 3000, at: '2026-11-02T21:05:00.000Z', currency: 'CZK' },
      { id: 'l2', amount: 400, at: '2026-11-03T09:00:00.000Z', currency: 'CZK' },
      { id: 'l3', amount: 100, at: '2027-05-12T09:30:00.000Z', currency: 'CZK' },
      { id: 'l4', amount: 40, at: '', legacy: true },
    ],
    repayments: [{ id: 'r1', date: '2026-11-03', amount: 500, currency: 'CZK' }],
  };
  const history = api.lendingHistory(saved);
  assert.equal(history.find(row => row.id === 'l1').when, 'Mon 2 Nov');
  assert.equal(history.find(row => row.id === 'l2').when, 'Tue 3 Nov');
  assert.equal(history.find(row => row.id === 'r1').when, 'Tue 3 Nov');
  assert.equal(history.find(row => row.id === 'l3').when, 'Wed 12 May 2027');
  assert.equal(history.find(row => row.id === 'l4').when, 'Earlier');
  assert.equal(saved.loans[0].at, '2026-11-02T21:05:00.000Z');
  assert.equal(saved.loans[1].at, '2026-11-03T09:00:00.000Z');
  assert.equal(saved.loans[2].at, '2027-05-12T09:30:00.000Z');
  assert.equal(saved.loans[3].at, '');
  assert.equal(saved.repayments[0].date, '2026-11-03');
  assert.equal(api.shortWeekDate('2025-05-10'), 'Sat 10 May 2025');
  assert.equal(planner.includes('clampLendingDates'), false);
  assert.equal(planner.includes('chooseLendingDate'), false);
  const loan = extractFunction(planner, 'commitVisibleLoan');
  const repay = extractFunction(planner, 'commitVisibleRepayment');
  assert.match(loan, /recordGuestLoan\(guest, raw\)/);
  assert.match(repay, /recordGuestRepayment\(guest, raw\)/);
  assert.equal(loan.includes('state.plan'), false);
  assert.equal(repay.includes('state.plan'), false);
});
