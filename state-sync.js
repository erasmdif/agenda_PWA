/* Conciliazione locale delle schede: merge a tre vie, nessun backend.
   I conflitti sono riferiti all'utente; mai sostituire silenziosamente
   gli elementi modificati da un'altra scheda. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AgendaStateSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function obj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function own(x, k) { return x != null && Object.prototype.hasOwnProperty.call(x, k); }
  function choose(base, local, remote, path, conflicts) {
    if (eq(local, base)) return remote;
    if (eq(remote, base) || eq(remote, local)) return local;
    if (obj(base) && obj(local) && obj(remote)) {
      var out = {};
      new Set(Object.keys(base).concat(Object.keys(local), Object.keys(remote))).forEach(function (k) {
        var val = choose(own(base, k) ? base[k] : undefined,
          own(local, k) ? local[k] : undefined, own(remote, k) ? remote[k] : undefined,
          path + '.' + k, conflicts);
        if (typeof val !== 'undefined') out[k] = val;
      });
      return out;
    }
    conflicts.push(path);
    return local; // SOLO se la persona conferma esplicitamente il conflitto
  }
  function records(base, local, remote, name, conflicts) {
    var index = function (arr) {
      var m = new Map(); (arr || []).forEach(function (x) { if (x && x.id) m.set(x.id, x); }); return m;
    };
    var a = index(base), b = index(local), c = index(remote), ids = new Set();
    (remote || []).concat(local || [], base || []).forEach(function (it) { if (it && it.id) ids.add(it.id); });
    var result = [];
    ids.forEach(function (id) {
      var value = choose(a.get(id), b.get(id), c.get(id), name + '[' + id + ']', conflicts);
      if (typeof value !== 'undefined') result.push(value);
    });
    return result;
  }
  function merge(base, local, remote) {
    var conflicts = [], out = {};
    ['items', 'templates', 'goals'].forEach(function (name) {
      out[name] = records(base[name], local[name], remote[name], name, conflicts);
    });
    out.settings = choose(base.settings, local.settings, remote.settings, 'settings', conflicts);
    out.v = Math.max(base.v || 2, local.v || 2, remote.v || 2);
    return { state: out, conflicts: conflicts };
  }
  return { merge: merge };
});
