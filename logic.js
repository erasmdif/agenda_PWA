/* Agenda — logica pura (date, riporto, ricorrenze, nutrizione, dettatura).
   Nessun accesso al DOM: usabile sia nel browser (window.Logic) sia in Node per i test. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = ['impegno', 'esercizio', 'cibo'];
  var HORIZON_DAYS = 14;   // quanti giorni in avanti generare le ripetizioni
  var MAX_LOOKBACK = 60;   // quanti giorni indietro generare le ripetizioni mancanti
  var DEFAULT_SETTINGS = { kcalGoal: 2000, proteinGoal: 140, rolloverMode: 'week', autoLockSec: 60 };

  /* ---------- date (stringhe YYYY-MM-DD, ora locale) ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromISO(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function dayNumber(s) { var p = s.split('-').map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000); }
  function diffDays(a, b) { return dayNumber(b) - dayNumber(a); }
  function addDays(s, n) { var d = fromISO(s); d.setDate(d.getDate() + n); return toISO(d); }
  function weekday(s) { return (fromISO(s).getDay() + 6) % 7; } // 0 = lunedì
  function startOfWeek(s) { return addDays(s, -weekday(s)); }
  function minutesOf(t) { var p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; }
  var TIME_RE = /^\d{2}:\d{2}$/;

  /* ---------- modello ---------- */
  function emptyState() {
    return { v: 2, items: [], templates: [], goals: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
  }

  function makeItem(p) {
    p = p || {};
    var mode = p.mode === 'percent' ? 'percent' : 'check';
    var hasTime = TIME_RE.test(p.time || '');
    return {
      id: p.id || uid(),
      type: TYPES.indexOf(p.type) >= 0 ? p.type : 'impegno',
      title: String(p.title || '').trim(),
      date: p.date || toISO(new Date()),
      time: hasTime ? p.time : '',
      alarm: !!p.alarm && hasTime,
      mode: mode,
      progress: mode === 'check' ? ((p.progress || 0) >= 100 ? 100 : 0) : clamp(Math.round(p.progress || 0), 0, 100),
      kcal: Math.round(num(p.kcal)),
      protein: Math.round(num(p.protein) * 10) / 10,
      burn: p.type === 'esercizio' ? Math.round(num(p.burn)) : 0,   // kcal spese (solo esercizi)
      note: String(p.note || ''),
      photos: Array.isArray(p.photos) ? p.photos.slice() : [],
      rid: p.rid || null,
      gid: p.gid || null,   // obiettivo settimanale collegato
      sid: p.sid || null,   // sotto-obiettivo collegato
      carried: p.carried || 0,
      origDate: p.origDate || null,
      created: p.created || Date.now()
    };
  }

  function migrate(s) {
    var st = emptyState();
    if (!s || typeof s !== 'object') return st;
    st.items = (Array.isArray(s.items) ? s.items : []).map(makeItem);
    st.templates = Array.isArray(s.templates) ? s.templates.filter(function (t) { return t && t.id && t.startDate; }) : [];
    st.goals = (Array.isArray(s.goals) ? s.goals : []).map(makeGoal).filter(function (g) { return g.title; });
    st.v = 2;
    var se = s.settings || {};
    st.settings.kcalGoal = Math.max(0, Math.round(num(se.kcalGoal) || (se.kcalGoal === 0 ? 0 : DEFAULT_SETTINGS.kcalGoal)));
    st.settings.proteinGoal = Math.max(0, Math.round(num(se.proteinGoal) || (se.proteinGoal === 0 ? 0 : DEFAULT_SETTINGS.proteinGoal)));
    st.settings.rolloverMode = se.rolloverMode === 'today' ? 'today' : 'week';
    st.settings.autoLockSec = [0, 60, 300].indexOf(se.autoLockSec) >= 0 ? se.autoLockSec : DEFAULT_SETTINGS.autoLockSec;
    return st;
  }

  function toggle(item) { item.progress = item.progress >= 100 ? 0 : 100; return item; }

  /* ---------- ricorrenze ---------- */
  function matches(t, iso) {
    if (t.repeat === 'daily') return true;
    if (t.repeat === 'weekly') return weekday(iso) === weekday(t.startDate);
    return false;
  }

  function makeRecurring(state, item, repeat) {
    if (repeat !== 'daily' && repeat !== 'weekly') return null;
    var t = {
      id: uid(), type: item.type, title: item.title, time: item.time, alarm: item.alarm,
      mode: item.mode, kcal: item.kcal, protein: item.protein, burn: item.burn, note: item.note,
      repeat: repeat, startDate: item.date, through: item.date
    };
    state.templates.push(t);
    item.rid = t.id;
    return t;
  }

  /* Genera le occorrenze mancanti fino a oggi + HORIZON_DAYS. Ritorna quante ne ha create. */
  function materialize(state, today) {
    var end = addDays(today, HORIZON_DAYS);
    var floor = addDays(today, -MAX_LOOKBACK);
    var created = 0;
    state.templates.forEach(function (t) {
      var from = t.through ? addDays(t.through, 1) : t.startDate;
      if (from < t.startDate) from = t.startDate;
      if (from < floor) from = floor;
      for (var d = from; d <= end; d = addDays(d, 1)) {
        if (!matches(t, d)) continue;
        var exists = state.items.some(function (i) { return i.rid === t.id && i.date === d; });
        if (exists) continue;
        state.items.push(makeItem({
          type: t.type, title: t.title, date: d, time: t.time, alarm: t.alarm, mode: t.mode,
          kcal: t.kcal, protein: t.protein, burn: t.burn, note: t.note, rid: t.id
        }));
        created++;
      }
      if (!t.through || end > t.through) t.through = end;
    });
    return created;
  }

  function removeItem(state, id, scope) {
    var it = state.items.find(function (i) { return i.id === id; });
    if (!it) return [];
    var removed;
    if (scope === 'series' && it.rid) {
      removed = state.items.filter(function (i) { return i.rid === it.rid && i.date >= it.date; });
      state.templates = state.templates.filter(function (t) { return t.id !== it.rid; });
    } else {
      removed = [it];
    }
    var ids = {};
    removed.forEach(function (r) { ids[r.id] = true; });
    state.items = state.items.filter(function (i) { return !ids[i.id]; });
    return removed;
  }

  /* ---------- riporto automatico ----------
     Impegni ed esercizi non completati con data passata vengono spostati:
       - modalità 'week' (default): allo stesso giorno della settimana successiva
         (ripetuto finché la data non è >= oggi);
       - modalità 'today': a oggi.
     Non toccano i pasti né le occorrenze di serie ripetute. Ritorna quanti elementi ha spostato. */
  function rollover(state, today) {
    var mode = state.settings.rolloverMode;
    var moved = 0;
    state.items.forEach(function (it) {
      if (it.type === 'cibo' || it.rid || it.gid) return;
      if (it.progress >= 100 || it.date >= today) return;
      var from = it.date;
      var nd;
      if (mode === 'today') nd = today;
      else nd = addDays(from, Math.ceil(diffDays(from, today) / 7) * 7);
      it.origDate = it.origDate || from;
      it.carried = (it.carried || 0) + 1;
      it.date = nd;
      moved++;
    });
    return moved;
  }

  /* ---------- interrogazioni ---------- */
  function cmpItems(a, b) {
    var ta = a.time || '99:99', tb = b.time || '99:99';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.created || 0) - (b.created || 0);
  }
  function itemsFor(state, type, iso) {
    return state.items.filter(function (i) { return i.type === type && i.date === iso; }).sort(cmpItems);
  }
  function completion(items) {
    if (!items.length) return null;
    return Math.round(items.reduce(function (s, i) { return s + i.progress; }, 0) / items.length);
  }
  function doneCount(items) { return items.filter(function (i) { return i.progress >= 100; }).length; }

  function round1(x) { return Math.round(x * 10) / 10; }
  /* Budget del giorno = kcal base + kcal spese dagli esercizi svolti (in proporzione alla percentuale). */
  function nutrition(state, iso) {
    var meals = itemsFor(state, 'cibo', iso);
    var planned = { kcal: 0, protein: 0 }, eaten = { kcal: 0, protein: 0 };
    meals.forEach(function (m) {
      planned.kcal += m.kcal; planned.protein += m.protein;
      eaten.kcal += m.kcal * m.progress / 100; eaten.protein += m.protein * m.progress / 100;
    });
    planned = { kcal: Math.round(planned.kcal), protein: round1(planned.protein) };
    eaten = { kcal: Math.round(eaten.kcal), protein: round1(eaten.protein) };
    var burned = 0, burnPlanned = 0;
    itemsFor(state, 'esercizio', iso).forEach(function (e) {
      burned += (e.burn || 0) * e.progress / 100; burnPlanned += (e.burn || 0);
    });
    burned = Math.round(burned); burnPlanned = Math.round(burnPlanned);
    var base = state.settings.kcalGoal;
    var goal = { kcal: base + burned, protein: state.settings.proteinGoal };
    return {
      meals: meals, base: base, burned: burned, burnPlanned: burnPlanned,
      goal: goal, planned: planned, eaten: eaten,
      remaining: { kcal: goal.kcal - eaten.kcal, protein: round1(goal.protein - eaten.protein) },
      remainingPlanned: { kcal: base + burnPlanned - planned.kcal, protein: round1(goal.protein - planned.protein) }
    };
  }

  function weekStats(state, type, startISO) {
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(startISO, i));
    if (type === 'cibo') {
      var active = 0, kcal = 0, prot = 0;
      days.forEach(function (d) {
        var n = nutrition(state, d);
        if (!n.eaten.kcal && !n.eaten.protein) return;   // giorni futuri o solo pianificati: non contano
        active++; kcal += n.eaten.kcal; prot += n.eaten.protein;
      });
      return { type: type, activeDays: active, avgKcal: active ? Math.round(kcal / active) : 0, avgProtein: active ? Math.round(prot / active) : 0 };
    }
    var items = [];
    days.forEach(function (d) { items = items.concat(itemsFor(state, type, d)); });
    return { type: type, total: items.length, done: doneCount(items), pct: completion(items) };
  }

  /* ---------- fasce orarie (ora italiana, a prescindere dal fuso del telefono) ----------
     mattina 06:00–13:00 · pomeriggio 13:01–17:00 · sera 17:01–22:00 · notte 22:01–05:59 */
  var TODS = ['mattina', 'pomeriggio', 'sera', 'notte'];
  function romeMinutes(date) {
    var d = date || new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
      var hh = 0, mm = 0;
      parts.forEach(function (p) { if (p.type === 'hour') hh = parseInt(p.value, 10); if (p.type === 'minute') mm = parseInt(p.value, 10); });
      return (hh % 24) * 60 + mm;
    } catch (e) { return d.getHours() * 60 + d.getMinutes(); }
  }
  function timeOfDay(minutes) {
    if (minutes >= 360 && minutes <= 780) return 'mattina';       // 06:00 – 13:00
    if (minutes > 780 && minutes <= 1020) return 'pomeriggio';    // 13:01 – 17:00
    if (minutes > 1020 && minutes <= 1320) return 'sera';         // 17:01 – 22:00
    return 'notte';                                               // 22:01 – 05:59
  }

  /* ---------- progressi (giorno / settimana / mese) ---------- */
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  /* Intervallo del periodo che contiene iso: day | week (lun–dom) | month (mese di calendario). */
  function rangeOf(period, iso) {
    var start, end;
    if (period === 'week') { start = startOfWeek(iso); end = addDays(start, 6); }
    else if (period === 'month') {
      var d = fromISO(iso), y = d.getFullYear(), m = d.getMonth();
      start = y + '-' + pad(m + 1) + '-01'; end = y + '-' + pad(m + 1) + '-' + pad(daysInMonth(y, m));
    } else { start = iso; end = iso; }
    var days = [];
    for (var i = 0, n = diffDays(start, end); i <= n; i++) days.push(addDays(start, i));
    return { period: period, start: start, end: end, days: days };
  }
  /* Sposta il periodo di n unità (mese: stesso giorno, limitato alla lunghezza del mese di arrivo). */
  function shiftPeriod(period, iso, n) {
    if (period === 'week') return addDays(iso, 7 * n);
    if (period === 'month') {
      var d = fromISO(iso), y = d.getFullYear(), m = d.getMonth() + n;
      var ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12;
      return ty + '-' + pad(tm + 1) + '-' + pad(Math.min(d.getDate(), daysInMonth(ty, tm)));
    }
    return addDays(iso, n);
  }

  function typeAgg(items) {
    return { total: items.length, done: doneCount(items), pct: completion(items) };
  }

  /* Statistiche calcolate al volo da state: si aggiornano da sole quando le voci cambiano.
     Le percentuali contano solo le voci fino a oggi; quelle future sono "pianificate" (upcoming). */
  function periodStats(state, period, iso, today) {
    var r = rangeOf(period, iso);
    var series = [], pastItems = { impegno: [], esercizio: [], cibo: [] }, upcoming = 0;
    var food = { activeDays: 0, eaten: 0, protein: 0, goal: 0, kcalOk: 0, proteinOk: 0 };
    var burned = 0;
    r.days.forEach(function (d) {
      var future = d > today, row = { iso: d, future: future, today: d === today };
      ['impegno', 'esercizio'].forEach(function (t) {
        var its = itemsFor(state, t, d);
        row[t] = its.length ? typeAgg(its) : null;
        if (future) upcoming += its.length; else pastItems[t] = pastItems[t].concat(its);
      });
      var meals = itemsFor(state, 'cibo', d), n = nutrition(state, d);
      row.cibo = { meals: meals.length, eaten: n.eaten.kcal, protein: n.eaten.protein, goal: n.goal.kcal, goalProtein: n.goal.protein, burned: n.burned, planned: n.planned.kcal };
      if (future) upcoming += meals.length; else pastItems.cibo = pastItems.cibo.concat(meals);
      if (!future) burned += n.burned;
      if (!future && (n.eaten.kcal || n.eaten.protein)) {
        food.activeDays++; food.eaten += n.eaten.kcal; food.protein += n.eaten.protein; food.goal += n.goal.kcal;
        if (n.eaten.kcal <= n.goal.kcal) food.kcalOk++;
        if (n.eaten.protein >= n.goal.protein) food.proteinOk++;
      }
      series.push(row);
    });
    var impegno = typeAgg(pastItems.impegno), esercizio = typeAgg(pastItems.esercizio);
    var both = pastItems.impegno.concat(pastItems.esercizio);
    var a = Math.max(food.activeDays, 1);
    var goals = state.goals.filter(function (g) { return g.week >= startOfWeek(r.start) && g.week <= r.end; })
      .sort(function (x, y) { return x.week < y.week ? -1 : x.week > y.week ? 1 : (x.created || 0) - (y.created || 0); })
      .map(function (g) { return { goal: g, progress: goalProgress(state, g) }; });
    return {
      range: r, series: series, upcoming: upcoming,
      impegno: impegno, esercizio: esercizio,
      overall: completion(both), overallDone: doneCount(both), overallTotal: both.length,
      food: {
        activeDays: food.activeDays, totalKcal: food.eaten, totalProtein: round1(food.protein),
        avgKcal: food.activeDays ? Math.round(food.eaten / a) : 0, avgProtein: food.activeDays ? Math.round(food.protein / a) : 0,
        avgGoalKcal: food.activeDays ? Math.round(food.goal / a) : 0, kcalOk: food.kcalOk, proteinOk: food.proteinOk
      },
      burned: burned, goals: goals,
      goalsDone: goals.filter(function (x) { return x.progress.complete; }).length
    };
  }

  /* Giorni consecutivi (fino a oggi) con tutte le attività svolte. Giorni senza attività non interrompono;
     oggi non interrompe se è ancora in corso. */
  function streak(state, today) {
    var n = 0, d = today;
    for (var i = 0; i < 400; i++, d = addDays(d, -1)) {
      var its = itemsFor(state, 'impegno', d).concat(itemsFor(state, 'esercizio', d));
      if (!its.length) continue;
      if (doneCount(its) === its.length) n++;
      else if (d !== today) break;
    }
    return n;
  }

  /* Ultimi valori usati per ogni nome di pasto (per precompilare kcal/proteine). */
  function mealMemory(state) {
    var map = {};
    state.items.filter(function (i) { return i.type === 'cibo' && i.title; })
      .sort(function (a, b) { return (a.created || 0) - (b.created || 0); })
      .forEach(function (m) { map[m.title.toLowerCase()] = { title: m.title, kcal: m.kcal, protein: m.protein }; });
    return map;
  }

  /* ---------- obiettivi settimanali ----------
     Un obiettivo vale per una settimana (lun–dom) ed è di due tipi:
       - 'amount': una quantità da distribuire come si vuole (es. 70.000 passi): si registra il totale di ogni giorno;
       - 'list'  : sotto-obiettivi (es. "Sessione 50 min" x3, "pagina home" x1) da fare quando si vuole.
         Completarne o pianificarne uno crea una voce del giorno (collegata con gid/sid) che compare nell'elenco
         di quel giorno; le kcal spese di un sotto-obiettivo di tipo esercizio alimentano il budget del cibo. */
  function makeSub(p) {
    p = p || {};
    return {
      id: p.id || uid(),
      title: String(p.title || '').trim().slice(0, 120),
      count: clamp(Math.round(num(p.count)) || 1, 1, 99),
      burn: Math.round(num(p.burn))
    };
  }

  function makeGoal(p) {
    p = p || {};
    var kind = p.kind === 'list' ? 'list' : 'amount';
    var days = {};
    if (kind === 'amount' && p.days && typeof p.days === 'object') {
      Object.keys(p.days).forEach(function (d) {
        var v = num(p.days[d]);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v > 0) days[d] = v;
      });
    }
    return {
      id: p.id || uid(),
      title: String(p.title || '').trim().slice(0, 120),
      type: TYPES.indexOf(p.type) >= 0 ? p.type : 'esercizio',
      week: startOfWeek(/^\d{4}-\d{2}-\d{2}$/.test(p.week || '') ? p.week : toISO(new Date())),
      kind: kind,
      target: kind === 'amount' ? num(p.target) : 0,
      unit: String(p.unit || '').trim().slice(0, 20),
      days: days,
      subs: kind === 'list' ? (Array.isArray(p.subs) ? p.subs : []).map(makeSub).filter(function (x) { return x.title; }) : [],
      created: p.created || Date.now()
    };
  }

  function goalsFor(state, type, iso) {
    var w = startOfWeek(iso);
    return state.goals.filter(function (g) { return g.type === type && g.week === w; })
      .sort(function (a, b) { return (a.created || 0) - (b.created || 0); });
  }

  function subItems(state, goal, sub) {
    return state.items.filter(function (i) { return i.gid === goal.id && i.sid === sub.id; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created || 0) - (b.created || 0); });
  }

  function amountTotal(goal) {
    var t = 0;
    Object.keys(goal.days).forEach(function (d) { t += goal.days[d]; });
    return Math.round(t * 100) / 100;
  }
  function setAmount(goal, iso, value) {
    var v = num(value);
    if (v > 0) goal.days[iso] = v; else delete goal.days[iso];
  }

  function goalProgress(state, goal) {
    if (goal.kind === 'list') {
      var total = 0, done = 0;
      goal.subs.forEach(function (sb) {
        var d = subItems(state, goal, sb).filter(function (i) { return i.progress >= 100; }).length;
        total += sb.count; done += Math.min(sb.count, d);
      });
      return { kind: 'list', done: done, total: total, pct: total ? Math.round(done / total * 100) : 0, complete: total > 0 && done >= total };
    }
    var sum = amountTotal(goal);
    return {
      kind: 'amount', total: sum, target: goal.target,
      pct: goal.target ? Math.min(100, Math.round(sum / goal.target * 100)) : 0,
      remaining: Math.max(0, Math.round((goal.target - sum) * 100) / 100),
      complete: goal.target > 0 && sum >= goal.target
    };
  }

  /* Giorni rimasti (oggi compreso) per raggiungere l'obiettivo: 7 se la settimana è futura, 0 se passata. */
  function daysLeftInWeek(goal, today) {
    var end = addDays(goal.week, 6);
    if (today > end) return 0;
    if (today < goal.week) return 7;
    return diffDays(today, end) + 1;
  }

  /* Segna fatto un sotto-obiettivo nel giorno iso: completa una voce già pianificata (spostandola a iso,
     perché è lì che conta, ad esempio per le kcal spese) oppure ne crea una già completata. */
  function completeSub(state, goal, sub, iso) {
    var open = subItems(state, goal, sub).filter(function (i) { return i.progress < 100; });
    var it = open.find(function (i) { return i.date === iso; }) || open[0];
    if (it) { it.progress = 100; it.date = iso; return it; }
    it = makeItem({ type: goal.type, title: sub.title, date: iso, progress: 100, burn: sub.burn, gid: goal.id, sid: sub.id });
    state.items.push(it);
    return it;
  }
  function planSub(state, goal, sub, iso) {
    var it = makeItem({ type: goal.type, title: sub.title, date: iso, burn: sub.burn, gid: goal.id, sid: sub.id });
    state.items.push(it);
    return it;
  }
  function undoSub(state, goal, sub) {
    var done = subItems(state, goal, sub).filter(function (i) { return i.progress >= 100; });
    var it = done[done.length - 1];
    if (it) it.progress = 0;
    return it || null;
  }
  function toggleSub(state, goal, sub, iso) {
    var hasDone = subItems(state, goal, sub).some(function (i) { return i.progress >= 100; });
    return hasDone ? undoSub(state, goal, sub) : completeSub(state, goal, sub, iso);
  }

  /* Dopo aver modificato un obiettivo: allinea titolo/tipo/kcal delle voci collegate. Ritorna le voci
     eliminate (sotto-obiettivi rimossi e non ancora completati) così l'app può cancellarne le foto. */
  function syncGoalItems(state, goal) {
    var byId = {};
    goal.subs.forEach(function (sb) { byId[sb.id] = sb; });
    var removed = [];
    state.items = state.items.filter(function (i) {
      if (i.gid !== goal.id) return true;
      var sb = byId[i.sid];
      if (sb) {
        i.title = sb.title; i.type = goal.type;
        if (goal.type !== 'esercizio') i.burn = 0; else if (i.progress < 100) i.burn = sb.burn;
        return true;
      }
      if (i.progress < 100) { removed.push(i); return false; }
      i.gid = null; i.sid = null;
      return true;
    });
    return removed;
  }

  function removeGoal(state, id) {
    var removed = [];
    state.items = state.items.filter(function (i) {
      if (i.gid !== id) return true;
      if (i.progress < 100) { removed.push(i); return false; }
      i.gid = null; i.sid = null;
      return true;
    });
    state.goals = state.goals.filter(function (g) { return g.id !== id; });
    return removed;
  }

  function copyGoalToNextWeek(state, id) {
    var g = state.goals.find(function (x) { return x.id === id; });
    if (!g) return null;
    var n = makeGoal({
      title: g.title, type: g.type, kind: g.kind, target: g.target, unit: g.unit, week: addDays(g.week, 7),
      subs: g.subs.map(function (sb) { return { title: sb.title, count: sb.count, burn: sb.burn }; })
    });
    state.goals.push(n);
    return n;
  }

  /* ---------- sveglie ---------- */
  function alarmKey(it) { return it.id + '|' + it.date + '|' + it.time; }
  function dueAlarms(state, now, fired) {
    var today = toISO(now);
    var nowMin = now.getHours() * 60 + now.getMinutes();
    return state.items.filter(function (it) {
      if (!it.alarm || !it.time || it.date !== today || it.progress >= 100) return false;
      var t = minutesOf(it.time);
      if (nowMin < t || nowMin - t > 180) return false;
      return !fired[alarmKey(it)];
    });
  }
  function pruneFired(fired, today) {
    var limit = addDays(today, -3);
    Object.keys(fired).forEach(function (k) {
      var d = k.split('|')[1];
      if (!d || d < limit) delete fired[k];
    });
  }

  /* ---------- export .ics (promemoria affidabile nel calendario del telefono) ---------- */
  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsLocal(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function toICS(item, repeat) {
    var p = item.time.split(':').map(Number);
    var s = fromISO(item.date); s.setHours(p[0], p[1], 0, 0);
    var e = new Date(s.getTime() + 3600000);
    var desc = [];
    if (item.type === 'cibo' && (item.kcal || item.protein)) desc.push(item.kcal + ' kcal, ' + item.protein + ' g proteine');
    if (item.note) desc.push(item.note);
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda//IT', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + item.id + '@agenda.local',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      'DTSTART:' + icsLocal(s),
      'DTEND:' + icsLocal(e),
      'SUMMARY:' + icsEscape(item.title)
    ];
    if (desc.length) lines.push('DESCRIPTION:' + icsEscape(desc.join(' — ')));
    if (repeat === 'daily') lines.push('RRULE:FREQ=DAILY');
    if (repeat === 'weekly') lines.push('RRULE:FREQ=WEEKLY');
    lines.push('BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(item.title), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  /* ---------- parser della dettatura (italiano) ---------- */
  var MONTHS = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12 };
  var WEEKDAYS = { 'lunedì': 0, lunedi: 0, 'martedì': 1, martedi: 1, 'mercoledì': 2, mercoledi: 2, 'giovedì': 3, giovedi: 3, 'venerdì': 4, venerdi: 4, sabato: 5, domenica: 6 };
  var HOURWORDS = { zero: 0, una: 1, uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19, venti: 20, ventuno: 21, ventidue: 22, 'ventitré': 23, ventitre: 23 };
  var MINWORDS = { mezza: 30, mezzo: 30, 'un quarto': 15, quarto: 15, cinque: 5, dieci: 10, quindici: 15, venti: 20, venticinque: 25, trenta: 30, trentacinque: 35, quaranta: 40, quarantacinque: 45, cinquanta: 50, cinquantacinque: 55 };
  var DAYWORDS = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10 };

  function alt(obj) { return Object.keys(obj).sort(function (a, b) { return b.length - a.length; }).join('|'); }
  var NB = "(?![a-zàèéìòù0-9])";   // non seguito da lettera/cifra
  var NA = "(?<![a-zàèéìòù0-9])";  // non preceduto da lettera/cifra

  var RE_TIME = new RegExp(
    "(?:" + NA + "alle\\s+ore\\s+|" + NA + "alle\\s+|" + NA + "all'\\s*|" + NA + "ore\\s+)" +
    "(\\d{1,2}|" + alt(HOURWORDS) + ")" + NB +
    "(?:\\s*[:.h]\\s*(\\d{2})(?!\\d))?" +
    "(?:\\s+(e|meno)\\s+(" + alt(MINWORDS) + "|\\d{1,2})" + NB + ")?"
  );
  var RE_COLON = /(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/;
  var RE_DM = new RegExp("(?:(?:il|per|entro)\\s+)?" + NA + "(\\d{1,2})\\s*[°º]?\\s*(" + Object.keys(MONTHS).join('|') + ")" + NB + "(?:\\s+(\\d{4}))?");
  var RE_WD = new RegExp("(?:(?:il|di|per|entro|questo|questa)\\s+)?" + NA + "(" + Object.keys(WEEKDAYS).join('|') + ")" + NB + "(?:\\s+(?:prossimo|prossima))?");

  function cut(s, m) { return s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); }

  function parseDictation(raw, ctx) {
    ctx = ctx || {};
    var today = ctx.today || toISO(new Date());
    var o = ' ' + String(raw || '').replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim() + ' ';
    var s0 = o.toLowerCase();
    var s = s0;
    if (o.length !== s.length) o = s;   // sicurezza: indici sempre allineati
    function cutBoth(mm) { s = cut(s, mm); o = cut(o, mm); }
    var out = { type: null, title: '', date: ctx.date || today, time: '', alarm: false, kcal: 0, protein: 0, burn: 0 };
    var m;

    // kcal e proteine
    if ((m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:kcal|chilocalorie|calorie|cal)(?![a-zà-ù])/))) {
      var v = m[1]; if (/^\d{1,3}\.\d{3}$/.test(v)) v = v.replace('.', '');
      out.kcal = Math.round(parseFloat(v.replace(',', '.'))); cutBoth(m);
    }
    if ((m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grammi)?\s*(?:di\s+)?prote[ie]ne/)) ||
        (m = s.match(/prote[ie]ne\s+(\d+(?:[.,]\d+)?)/))) {
      out.protein = Math.round(parseFloat(m[1].replace(',', '.')) * 10) / 10; cutBoth(m);
    }

    var evening = new RegExp(NA + "(?:pomeriggio|sera|stasera)" + NB).test(s);

    // data
    var dateSet = false;
    if ((m = s.match(/(?:(?:il|per|entro)\s+)?(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/))) {
      var y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
      var r = resolveDM(Number(m[1]), Number(m[2]), y, today);
      if (r) { out.date = r; dateSet = true; cutBoth(m); }
    }
    if (!dateSet && (m = s.match(RE_DM))) {
      var r2 = resolveDM(Number(m[1]), MONTHS[m[2]], m[3] ? Number(m[3]) : null, today);
      if (r2) { out.date = r2; dateSet = true; cutBoth(m); }
    }
    if (!dateSet) {
      var rel = [
        [new RegExp(NA + "dopodomani" + NB), 2],
        [new RegExp(NA + "domattina" + NB), 1],
        [new RegExp(NA + "domani" + NB), 1],
        [new RegExp(NA + "(?:oggi|stasera|stanotte|stamattina|stamani|stamane)" + NB), 0]
      ];
      for (var i = 0; i < rel.length && !dateSet; i++) {
        if ((m = s.match(rel[i][0]))) { out.date = addDays(today, rel[i][1]); dateSet = true; cutBoth(m); }
      }
    }
    if (!dateSet && (m = s.match(new RegExp(NA + "(?:tra|fra)\\s+(\\d+|" + alt(DAYWORDS) + ")\\s+(giorn[oi]|settiman[ae])" + NB)))) {
      var n = /^\d/.test(m[1]) ? parseInt(m[1], 10) : DAYWORDS[m[1]];
      out.date = addDays(today, /^settim/.test(m[2]) ? n * 7 : n); dateSet = true; cutBoth(m);
    }
    if (!dateSet && (m = s.match(new RegExp(NA + "(?:la\\s+)?(?:settimana\\s+prossima|prossima\\s+settimana)" + NB)))) {
      out.date = addDays(today, 7); dateSet = true; cutBoth(m);
    }
    if (!dateSet && (m = s.match(RE_WD))) {
      var delta = (WEEKDAYS[m[1]] - weekday(today) + 7) % 7 || 7;
      out.date = addDays(today, delta); dateSet = true; cutBoth(m);
    }

    // ora
    var hour = null, min = 0;
    if ((m = s.match(RE_TIME))) {
      hour = /^\d/.test(m[1]) ? parseInt(m[1], 10) : HOURWORDS[m[1]];
      if (m[2]) min = parseInt(m[2], 10);
      if (m[3] && m[4]) {
        var mm = /^\d/.test(m[4]) ? parseInt(m[4], 10) : MINWORDS[m[4]];
        if (m[3] === 'e') min = mm;
        else { hour = (hour + 23) % 24; min = 60 - mm; }
      }
      if (hour > 23 || min > 59) { hour = null; min = 0; } else cutBoth(m);
    }
    if (hour === null && (m = s.match(new RegExp(NA + "(?:a\\s+|alle\\s+)?mezzogiorno" + NB)))) { hour = 12; min = 0; cutBoth(m); }
    if (hour === null && (m = s.match(new RegExp(NA + "(?:a\\s+|alle\\s+)?mezzanotte" + NB)))) { hour = 0; min = 0; cutBoth(m); }
    if (hour === null && (m = s.match(RE_COLON))) {
      var hh = parseInt(m[1], 10), mi = parseInt(m[2], 10);
      if (hh <= 23 && mi <= 59) { hour = hh; min = mi; cutBoth(m); }
    }
    if (hour !== null) {
      if (evening && hour >= 1 && hour <= 11) hour += 12;
      out.time = pad(hour) + ':' + pad(min);
      out.alarm = true;
    }

    // frasi di momento della giornata rimaste
    var RE_PERIOD = new RegExp("(?:" + NA + "(?:del|nel|di|al|questo|questa|in)\\s+)?" + NA + "(?:mattina|mattino|pomeriggio|sera|notte)" + NB);
    while ((m = s.match(RE_PERIOD))) cutBoth(m);

    // tipo
    var food = /(colazione|pranzo|cena|spuntino|merenda|pasto|prote[ie]ne)/.test(s0);
    var sport = /(allenament|palestra|corsa|correre|corro|camminata|nuoto|nuotare|yoga|stretching|esercizi|flession|squat|bicicletta|ciclismo|pesi|cardio|pilates|plank|addominali)/.test(s0);
    var hasKcal = !!out.kcal || /(kcal|calorie)/.test(s0);
    if (food || out.protein) out.type = 'cibo';
    else if (sport) out.type = 'esercizio';
    else if (hasKcal) out.type = ctx.type === 'esercizio' ? 'esercizio' : 'cibo';
    else out.type = ctx.type || 'impegno';
    if (out.type === 'esercizio' && out.kcal) { out.burn = out.kcal; out.kcal = 0; }   // kcal di un esercizio = spese

    // titolo
    var t = o.replace(/\s+/g, ' ').trim();
    var lead = /^(?:ricordami(?:\s+di)?|ricorda(?:mi)?(?:\s+di)?|promemoria(?:\s+(?:per|di))?|aggiungi(?:\s+(?:un|una|il|l'))?(?:\s+(?:impegno|esercizio|pasto))?|nuovo\s+(?:impegno|esercizio|pasto)|devo|dovrei|ho|mi\s+serve|segna(?:mi)?|metti|inserisci|imposta(?:\s+una\s+sveglia\s+per)?)\s+/i;
    var lead2 = /^(?:il|lo|la|le|l'|di|a|ad|alle|alla|all'|ai|per|e|entro|ore|del|della|nel|nella|in)\s+/i;
    var trail = /\s+(?:il|lo|la|le|di|a|ad|alle|alla|all'|ai|per|e|entro|ore|del|della|nel|nella|in|con|su)$/i;
    var prev;
    do { prev = t; t = t.replace(lead, '').replace(lead2, '').replace(trail, '').trim(); } while (t !== prev);
    out.title = t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
    return out;
  }

  function resolveDM(day, month, year, today) {
    if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
    var base = Number(today.slice(0, 4));
    var y = year || base;
    var iso = y + '-' + pad(month) + '-' + pad(day);
    var d = fromISO(iso);
    if (d.getMonth() + 1 !== month || d.getDate() !== day) return null;
    if (!year && iso < today) iso = toISO(new Date(y + 1, month - 1, day));
    return iso;
  }

  return {
    TYPES: TYPES, DEFAULT_SETTINGS: DEFAULT_SETTINGS, HORIZON_DAYS: HORIZON_DAYS,
    pad: pad, toISO: toISO, fromISO: fromISO, diffDays: diffDays, addDays: addDays, weekday: weekday,
    startOfWeek: startOfWeek, minutesOf: minutesOf, uid: uid,
    emptyState: emptyState, makeItem: makeItem, migrate: migrate, toggle: toggle,
    makeRecurring: makeRecurring, materialize: materialize, removeItem: removeItem, rollover: rollover,
    itemsFor: itemsFor, completion: completion, doneCount: doneCount, nutrition: nutrition,
    weekStats: weekStats, mealMemory: mealMemory,
    TODS: TODS, romeMinutes: romeMinutes, timeOfDay: timeOfDay,
    rangeOf: rangeOf, shiftPeriod: shiftPeriod, periodStats: periodStats, streak: streak,
    makeGoal: makeGoal, makeSub: makeSub, goalsFor: goalsFor, subItems: subItems, amountTotal: amountTotal,
    setAmount: setAmount, goalProgress: goalProgress, daysLeftInWeek: daysLeftInWeek,
    completeSub: completeSub, planSub: planSub, undoSub: undoSub, toggleSub: toggleSub,
    syncGoalItems: syncGoalItems, removeGoal: removeGoal, copyGoalToNextWeek: copyGoalToNextWeek,
    alarmKey: alarmKey, dueAlarms: dueAlarms, pruneFired: pruneFired,
    toICS: toICS, parseDictation: parseDictation
  };
});
