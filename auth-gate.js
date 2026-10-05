/*
 * auth-gate.js — shared sign-in box for the planner pages on GitHub Pages.
 *
 * Uses the same Supabase email/password login as the booking form (same project),
 * so Keith's existing account works. The session is stored by supabase-js in
 * localStorage, so signing in once on any page of this site signs in all of them
 * (booking-form.html, tour-planner.html, hotels.html, places-stats.html, analytics.html).
 *
 * Usage:  AuthGate.require(sb, { title: 'Tour planner' }).then(session => init());
 */
(function () {
  'use strict';

  const STYLE_ID = 'auth-gate-style';
  const CSS = `
  .ag-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;
    padding:20px;background:var(--bg,#f4f5f7);font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;}
  .ag-card{width:100%;max-width:380px;background:var(--surface,#fff);color:var(--text,#1a1d26);
    border:1px solid var(--border,#e2e4e9);border-radius:14px;padding:28px 24px;box-shadow:0 10px 30px rgba(0,0,0,.08);}
  .ag-card h2{font-size:1.3rem;margin:0 0 6px;}
  .ag-card p.ag-sub{margin:0 0 18px;color:var(--text-secondary,#6b7280);font-size:.92rem;line-height:1.4;}
  .ag-field{margin-bottom:14px;}
  .ag-field label{display:block;font-size:.85rem;font-weight:600;margin-bottom:5px;}
  .ag-field input{width:100%;padding:10px 12px;font-size:1rem;border-radius:8px;border:1px solid var(--border,#e2e4e9);
    background:var(--input-bg,#fff);color:var(--text,#1a1d26);box-sizing:border-box;}
  .ag-btn{width:100%;padding:11px 14px;font-size:1rem;font-weight:700;border:0;border-radius:8px;cursor:pointer;
    background:var(--accent,#4f46e5);color:#fff;}
  .ag-btn[disabled]{opacity:.6;cursor:wait;}
  .ag-error{display:none;margin-bottom:14px;padding:9px 11px;border-radius:8px;font-size:.9rem;
    background:#fdecec;color:#9b1c1c;border:1px solid #f5c2c2;}
  .ag-error.ag-show{display:block;}
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  async function sessionIsUsable(sb, session) {
    if (!session) return false;
    try {
      const { data: profile } = await sb.from('profiles')
        .select('status')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profile && profile.status === 'disabled') {
        await sb.auth.signOut();
        return false;
      }
    } catch (_) { /* profile lookup is best-effort */ }
    return true;
  }

  function hasStoredSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (/^sb-.*-auth-token$/.test(k)) return true;
      }
    } catch (_) { /* ignore */ }
    return false;
  }

  function showBox(sb, opts, message) {
    injectStyle();
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ag-overlay';
      overlay.id = 'authGate';
      overlay.innerHTML = `
        <div class="ag-card" role="dialog" aria-modal="true" aria-labelledby="agTitle">
          <h2 id="agTitle"></h2>
          <p class="ag-sub">Please sign in with the same email and password you use for the booking form.</p>
          <div class="ag-error" id="agError"></div>
          <form id="agForm" novalidate>
            <div class="ag-field">
              <label for="agEmail">Email</label>
              <input type="email" id="agEmail" autocomplete="email" required>
            </div>
            <div class="ag-field">
              <label for="agPassword">Password</label>
              <input type="password" id="agPassword" autocomplete="current-password" required>
            </div>
            <button type="submit" class="ag-btn" id="agBtn">Sign in</button>
          </form>
        </div>`;
      overlay.querySelector('#agTitle').textContent = (opts && opts.title) ? opts.title : 'Sign in';
      document.body.appendChild(overlay);

      const errEl = overlay.querySelector('#agError');
      const btn = overlay.querySelector('#agBtn');
      const showErr = msg => { errEl.textContent = msg; errEl.classList.add('ag-show'); };
      if (message) showErr(message);
      overlay.querySelector('#agEmail').focus();

      overlay.querySelector('#agForm').addEventListener('submit', async e => {
        e.preventDefault();
        const email = overlay.querySelector('#agEmail').value.trim();
        const password = overlay.querySelector('#agPassword').value;
        if (!email || !password) { showErr('Please enter your email and password.'); return; }
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        errEl.classList.remove('ag-show');
        try {
          const { data, error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          if (!(await sessionIsUsable(sb, data.session))) throw new Error('Your account has been disabled.');
          overlay.remove();
          resolve(data.session);
        } catch (err) {
          showErr((err && err.message) || 'Sign-in failed. Please try again.');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Sign in';
        }
      });
    });
  }

  async function require(sb, opts) {
    let session = null;
    try {
      const res = await sb.auth.getSession();
      session = res && res.data ? res.data.session : null;
    } catch (_) { session = null; }

    if (!(session && await sessionIsUsable(sb, session))) {
      // Offline on the road with a saved (but expired) sign-in: let the page open in
      // local mode rather than lock Keith out; it will ask to sign in again once online.
      if (!navigator.onLine && hasStoredSession()) return null;
      session = await showBox(sb, opts);
    }

    // If Keith signs out (here or on another page of this site), show the sign-in box again.
    try {
      sb.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') window.location.reload();
      });
    } catch (_) { /* ignore */ }

    return session;
  }

  window.AuthGate = { require };
})();
