/* Agenda — riepilogo quotidiano locale delle ore 15.
   Logica pura: nessun servizio esterno, nessuna trasmissione di dati. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AgendaDailyReminder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var STATE_KEY = 'agenda.daily-reminder.v1';
  var PREF_KEY = 'agenda.daily-reminder.prefs.v1';
  var HOUR = 15;
  var HOUR_MS = 60 * 60 * 1000;
  function localDate(d) {
    var pad = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function defaults() { return { enabled: true, showTitles: false }; }
  function preferences(p) {
    return { enabled: !(p && p.enabled === false), showTitles: !!(p && p.showTitles === true) };
  }
  function blank(date) { return { date: date, dismissed: false, awaiting: false, nextAt: 0, notifiedAt: 0 }; }
  function normalize(record, date) {
    if (!record || record.date !== date) return blank(date);
    return {
      date: date,
      dismissed: record.dismissed === true,
      awaiting: record.awaiting === true,
      nextAt: Number.isFinite(Number(record.nextAt)) && Number(record.nextAt) > 0 ? Number(record.nextAt) : 0,
      notifiedAt: Number.isFinite(Number(record.notifiedAt)) && Number(record.notifiedAt) > 0 ? Number(record.notifiedAt) : 0
    };
  }
  function pending(state, date) {
    return (state && Array.isArray(state.items) ? state.items : [])
      .filter(function (it) { return it && it.date === date && (it.type === 'impegno' || it.type === 'esercizio') && Number(it.progress || 0) < 100; })
      .slice().sort(function (a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); });
  }
  function atThree(date) {
    var parts = date.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], HOUR, 0, 0, 0).getTime();
  }
  function status(state, prefs, record, now) {
    var date = localDate(now), p = preferences(prefs), r = normalize(record, date), list = pending(state, date);
    var base = atThree(date);
    var next = Math.max(base, r.nextAt || base);
    var due = p.enabled && !r.dismissed && !r.awaiting && list.length > 0 && now.getTime() >= next;
    return { date: date, pref: p, record: r, items: list, count: list.length, due: due, nextAt: next,
      awaiting: p.enabled && !r.dismissed && r.awaiting && list.length > 0,
      dismissed: r.dismissed };
  }
  function firing(record, date, now) {
    var r = normalize(record, date);
    r.awaiting = true; r.notifiedAt = now.getTime(); r.nextAt = 0;
    return r;
  }
  function snooze(record, date, now) {
    var r = normalize(record, date);
    if (r.dismissed) return r;
    r.awaiting = false; r.nextAt = now.getTime() + HOUR_MS;
    return r;
  }
  function accept(record, date) {
    var r = normalize(record, date);
    r.dismissed = true; r.awaiting = false; r.nextAt = 0;
    return r;
  }
  function cleared(record, date) {
    var r = normalize(record, date);
    r.awaiting = false; r.nextAt = 0;
    return r;
  }
  function timeLabel(timestamp) {
    var d = new Date(timestamp);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  return { STATE_KEY: STATE_KEY, PREF_KEY: PREF_KEY, HOUR: HOUR, HOUR_MS: HOUR_MS,
    defaults: defaults, preferences: preferences, normalize: normalize, localDate: localDate,
    pending: pending, status: status, firing: firing, snooze: snooze,
    accept: accept, cleared: cleared, timeLabel: timeLabel };
});
