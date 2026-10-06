/*
 * auth-gate.js — shared sign-in for the booking pages.
 *
 * Email and password on the same Supabase project. The session is kept in
 * localStorage, so signing in once on this device signs in every page here.
 *
 * Usage:
 *   const sb = AuthGate.createClient(url, anonKey);
 *   AuthGate.require(sb, { title: 'Booking form' }).then(session => {
 *     if (!session) AuthGate.useLocalData(sb); // offline, saved sign-in
 *     start();
 *   });
 *
 * Password reset emails must be allowed to return to this site. The Supabase
 * dashboard needs the Site URL and these redirect URLs (wildcards are enough):
 *   https://lillydog2468.github.io/booking-form-preview/**
 *   https://bookingkeith.netlify.app/**
 *   https://keith-booking-form.netlify.app/**
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
  .ag-error,.ag-note{display:none;margin-bottom:14px;padding:9px 11px;border-radius:8px;font-size:.9rem;}
  .ag-error{background:#fdecec;color:#9b1c1c;border:1px solid #f5c2c2;}
  .ag-note{background:#eef6ee;color:#14532d;border:1px solid #bbf7d0;}
  .ag-error.ag-show,.ag-note.ag-show{display:block;}
  .ag-link{display:block;width:100%;margin-top:12px;padding:0;border:0;background:none;cursor:pointer;
    color:var(--accent,#4f46e5);font:inherit;font-size:.9rem;font-weight:600;text-align:center;}
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function createClient(url, key) {
    return window.supabase.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        flowType: 'implicit',
      },
    });
  }

  function localQuery() {
    const result = { data: null, error: { message: 'Offline', code: 'OFFLINE' }, count: null };
    const promise = Promise.resolve(result);
    const handler = {
      get(_target, prop) {
        if (prop === 'then') return promise.then.bind(promise);
        if (prop === 'catch') return promise.catch.bind(promise);
        if (prop === 'finally') return promise.finally.bind(promise);
        return function () { return proxy; };
      },
    };
    const proxy = new Proxy(function () {}, handler);
    return proxy;
  }

  // Stops database calls. The page then uses what is already saved on the device.
  function useLocalData(sb) {
    if (!sb || sb.__localOnly) return sb;
    sb.__localOnly = true;
    sb.from = function () { return localQuery(); };
    return sb;
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

  function redirectToHere() {
    return window.location.origin + window.location.pathname;
  }

  function hashWantsRecovery() {
    try {
      const blob = String(window.location.hash || '') + '&' + String(window.location.search || '');
      return /(?:^|[&#?])type=recovery(?:&|$)/.test(blob);
    } catch (_) { return false; }
  }

  function clearAuthHash() {
    try {
      const url = new URL(window.location.href);
      url.hash = '';
      url.searchParams.delete('code');
      url.searchParams.delete('type');
      url.searchParams.delete('access_token');
      history.replaceState(null, '', url.pathname + url.search);
    } catch (_) { /* ignore */ }
  }

  function install(sb) {
    if (!sb || sb.__authGateInstalled) return;
    sb.__authGateInstalled = true;
    sb.__recoveryWanted = hashWantsRecovery();
    try {
      sb.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') sb.__recoveryWanted = true;
        if (event === 'SIGNED_OUT' && sb.__authGateWatchSignOut) window.location.reload();
      });
    } catch (_) { /* ignore */ }
  }

  function overlayEl() {
    return document.getElementById('authGate');
  }

  function mountOverlay() {
    injectStyle();
    const existing = overlayEl();
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'ag-overlay';
    overlay.id = 'authGate';
    document.body.appendChild(overlay);
    return overlay;
  }

  async function waitForSession(sb, ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      try {
        const res = await sb.auth.getSession();
        const session = res && res.data ? res.data.session : null;
        if (session) return session;
      } catch (_) { /* keep waiting */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  }

  function showNewPassword(sb) {
    const overlay = mountOverlay();
    return new Promise(resolve => {
      overlay.innerHTML = `
        <div class="ag-card" role="dialog" aria-modal="true" aria-labelledby="agTitle">
          <h2 id="agTitle">Choose a new password</h2>
          <p class="ag-sub">This replaces the password on the account.</p>
          <div class="ag-error" id="agError"></div>
          <form id="agForm" novalidate>
            <div class="ag-field">
              <label for="agPassword">New password</label>
              <input type="password" id="agPassword" autocomplete="new-password" required>
            </div>
            <div class="ag-field">
              <label for="agPassword2">Confirm password</label>
              <input type="password" id="agPassword2" autocomplete="new-password" required>
            </div>
            <button type="submit" class="ag-btn" id="agBtn">Save password</button>
          </form>
        </div>`;
      const errEl = overlay.querySelector('#agError');
      const btn = overlay.querySelector('#agBtn');
      const showErr = msg => { errEl.textContent = msg; errEl.classList.add('ag-show'); };
      overlay.querySelector('#agPassword').focus();
      overlay.querySelector('#agForm').addEventListener('submit', async e => {
        e.preventDefault();
        const password = overlay.querySelector('#agPassword').value;
        const again = overlay.querySelector('#agPassword2').value;
        if (password.length < 6) { showErr('Use at least 6 characters.'); return; }
        if (password !== again) { showErr('Those passwords do not match.'); return; }
        btn.disabled = true;
        btn.textContent = 'Saving…';
        errEl.classList.remove('ag-show');
        try {
          const { error } = await sb.auth.updateUser({ password });
          if (error) throw error;
          clearAuthHash();
          sb.__recoveryWanted = false;
          const res = await sb.auth.getSession();
          overlay.remove();
          resolve(res && res.data ? res.data.session : null);
        } catch (err) {
          showErr((err && err.message) || 'Could not save the password. Please try again.');
          btn.disabled = false;
          btn.textContent = 'Save password';
        }
      });
    });
  }

  function showBox(sb, opts, message) {
    const overlay = mountOverlay();
    return new Promise(resolve => {
      overlay.innerHTML = `
        <div class="ag-card" role="dialog" aria-modal="true" aria-labelledby="agTitle">
          <h2 id="agTitle"></h2>
          <p class="ag-sub" id="agSub">Sign in to continue.</p>
          <div class="ag-error" id="agError"></div>
          <div class="ag-note" id="agNote"></div>
          <form id="agForm" novalidate>
            <div class="ag-field">
              <label for="agEmail">Email</label>
              <input type="email" id="agEmail" autocomplete="username" required>
            </div>
            <div class="ag-field" id="agPasswordField">
              <label for="agPassword">Password</label>
              <input type="password" id="agPassword" autocomplete="current-password" required>
            </div>
            <button type="submit" class="ag-btn" id="agBtn">Sign in</button>
          </form>
          <button type="button" class="ag-link" id="agForgot">Forgot password?</button>
        </div>`;
      overlay.querySelector('#agTitle').textContent = (opts && opts.title) ? opts.title : 'Sign in';
      const errEl = overlay.querySelector('#agError');
      const noteEl = overlay.querySelector('#agNote');
      const btn = overlay.querySelector('#agBtn');
      const passwordField = overlay.querySelector('#agPasswordField');
      const passwordInput = overlay.querySelector('#agPassword');
      const forgotBtn = overlay.querySelector('#agForgot');
      const sub = overlay.querySelector('#agSub');
      let mode = 'sign-in';
      const showErr = msg => {
        noteEl.classList.remove('ag-show');
        errEl.textContent = msg;
        errEl.classList.add('ag-show');
      };
      const showNote = msg => {
        errEl.classList.remove('ag-show');
        noteEl.textContent = msg;
        noteEl.classList.add('ag-show');
      };
      if (message) showErr(message);
      overlay.querySelector('#agEmail').focus();

      forgotBtn.addEventListener('click', () => {
        mode = mode === 'sign-in' ? 'reset' : 'sign-in';
        const resetting = mode === 'reset';
        passwordField.hidden = resetting;
        passwordInput.required = !resetting;
        btn.textContent = resetting ? 'Send reset link' : 'Sign in';
        forgotBtn.textContent = resetting ? 'Back to sign in' : 'Forgot password?';
        sub.textContent = resetting ? 'Enter the email for the account.' : 'Sign in to continue.';
        errEl.classList.remove('ag-show');
        noteEl.classList.remove('ag-show');
      });

      overlay.querySelector('#agForm').addEventListener('submit', async e => {
        e.preventDefault();
        const email = overlay.querySelector('#agEmail').value.trim();
        const password = passwordInput.value;
        errEl.classList.remove('ag-show');
        if (!email) { showErr('Please enter your email.'); return; }
        if (mode === 'reset') {
          btn.disabled = true;
          btn.textContent = 'Sending…';
          try {
            const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectToHere() });
            if (error) throw error;
            showNote('A reset link has been sent. Check your email.');
          } catch (err) {
            showErr((err && err.message) || 'Could not send the reset link. Please try again.');
          } finally {
            btn.disabled = false;
            btn.textContent = 'Send reset link';
          }
          return;
        }
        if (!password) { showErr('Please enter your email and password.'); return; }
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        try {
          const { data, error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          if (!(await sessionIsUsable(sb, data.session))) throw new Error('Your account has been disabled.');
          overlay.remove();
          resolve(data.session);
        } catch (err) {
          showErr((err && err.message) || 'Sign-in failed. Please try again.');
          btn.disabled = false;
          btn.textContent = 'Sign in';
        }
      });
    });
  }

  async function require(sb, opts) {
    install(sb);
    sb.__authGateWatchSignOut = true;

    if (sb.__recoveryWanted || hashWantsRecovery()) {
      const recovered = await waitForSession(sb, 4000);
      if (recovered) return showNewPassword(sb);
      clearAuthHash();
      return showBox(sb, opts, 'That reset link has expired. Request a new one.');
    }

    // Offline, with a sign-in already saved on this device: open the local copy
    // and do not call the database. A reload while online uses the saved session.
    if (typeof navigator !== 'undefined' && navigator.onLine === false && hasStoredSession()) {
      return null;
    }

    let session = null;
    try {
      const res = await sb.auth.getSession();
      session = res && res.data ? res.data.session : null;
    } catch (_) { session = null; }

    if (!(session && await sessionIsUsable(sb, session))) {
      session = await showBox(sb, opts);
    }
    return session;
  }

  window.AuthGate = {
    require,
    createClient,
    useLocalData,
    redirectToHere,
    hasStoredSession,
  };
})();
