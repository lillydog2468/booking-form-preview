/*
 * User actions for the admin page. Ids are always strings.
 * Removing a person deletes only their profiles row, not the auth login.
 */
(function (root) {
  'use strict';

  function sameId(a, b) {
    return String(a == null ? '' : a) === String(b == null ? '' : b);
  }

  function findUser(users, id) {
    return (users || []).find(function (user) { return user && sameId(user.id, id); }) || null;
  }

  function activeAdmins(users) {
    return (users || []).filter(function (user) {
      return user && user.role === 'admin' && user.status !== 'disabled';
    });
  }

  function guard(users, id, selfId, action) {
    const user = findUser(users, id);
    if (!user) return { ok: false, message: 'That user was not found.' };
    if ((action === 'disable' || action === 'demote' || action === 'remove') && sameId(user.id, selfId)) {
      return { ok: false, message: 'You cannot change your own account.' };
    }
    const dropsLastAdmin = user.role === 'admin' && user.status !== 'disabled'
      && (action === 'disable' || action === 'demote' || action === 'remove');
    if (dropsLastAdmin && activeAdmins(users).length <= 1) {
      return { ok: false, message: 'Keep at least one active admin.' };
    }
    return { ok: true, user: user };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function userRowsHtml(users, formatDate) {
    return (users || []).map(function (user) {
      const id = escapeHtml(user.id);
      const disabling = user.status === 'active';
      const statusLabel = disabling ? 'Disable' : 'Enable';
      const statusClass = disabling ? 'btn btn-outline btn-sm' : 'btn btn-success btn-sm';
      const roleLabel = user.role === 'admin' ? 'Demote' : 'Make Admin';
      const created = formatDate ? formatDate(user.created_at) : '';
      return '<tr>'
        + '<td><strong>' + escapeHtml(user.email) + '</strong></td>'
        + '<td><span class="badge badge-' + escapeHtml(user.role) + '">' + escapeHtml(user.role) + '</span></td>'
        + '<td><span class="badge badge-' + escapeHtml(user.status) + '">' + escapeHtml(user.status) + '</span></td>'
        + '<td>' + escapeHtml(created) + '</td>'
        + '<td style="text-align:right;"><div style="display:flex;gap:6px;justify-content:flex-end;">'
        + '<button type="button" class="' + statusClass + '" data-user-action="status" data-user-id="' + id + '" data-user-status="' + (disabling ? 'disabled' : 'active') + '">' + statusLabel + '</button>'
        + '<button type="button" class="btn btn-outline btn-sm" data-user-action="role" data-user-id="' + id + '">' + roleLabel + '</button>'
        + '<button type="button" class="btn btn-danger btn-sm" data-user-action="remove" data-user-id="' + id + '">Remove</button>'
        + '</div></td></tr>';
    }).join('');
  }

  function confirmCopy(user, action) {
    const email = user && user.email ? user.email : 'this user';
    if (action === 'remove') {
      return {
        title: 'Remove access',
        message: 'This removes ' + email + '’s access to the booking form. Their sign-in still exists and is not deleted here.',
        confirm: 'Remove access',
      };
    }
    if (action === 'disable') {
      return { title: 'Disable user', message: 'Disable ' + email + '? They will be signed out of the booking form.', confirm: 'Disable' };
    }
    if (action === 'enable') {
      return { title: 'Enable user', message: 'Enable ' + email + '?', confirm: 'Enable' };
    }
    if (action === 'demote') {
      return { title: 'Demote admin', message: 'Demote ' + email + ' to a normal user?', confirm: 'Demote' };
    }
    return { title: 'Make admin', message: 'Make ' + email + ' an admin?', confirm: 'Make Admin' };
  }

  async function setStatus(sb, id, status) {
    const { error } = await sb.from('profiles').update({ status: status }).eq('id', String(id));
    if (error) throw error;
  }

  async function setRole(sb, id, role) {
    const { error } = await sb.from('profiles').update({ role: role }).eq('id', String(id));
    if (error) throw error;
  }

  async function removeProfile(sb, id) {
    const { error } = await sb.from('profiles').delete().eq('id', String(id));
    if (error) throw error;
  }

  root.AdminUsers = {
    sameId: sameId,
    findUser: findUser,
    activeAdmins: activeAdmins,
    guard: guard,
    userRowsHtml: userRowsHtml,
    confirmCopy: confirmCopy,
    setStatus: setStatus,
    setRole: setRole,
    removeProfile: removeProfile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
