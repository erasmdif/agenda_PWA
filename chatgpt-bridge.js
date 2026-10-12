/* Agenda ↔ ChatGPT — protocollo locale v1. Nessuna API, nessuna rete, nessuna scrittura automatica.
   Questo modulo è intenzionalmente indipendente dal DOM ed è testabile con Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.AgendaChatBridge = factory(root.Logic);
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';
  var SCHEMA = 'agenda-chatgpt-v1';
  var CONTEXT = 'agenda-chatgpt-context-v1';
  var PREFIX = '#agenda-import=';
  var MAX_CHARS = 100000, MAX_OPS = 100;
  var FIELDS = ['type', 'title', 'date', 'time', 'alarm', 'mode', 'progress', 'note', 'kcal', 'protein', 'burn'];
  var TYPES = ['impegno', 'esercizio', 'cibo'];
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function validDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var t = new Date(v + 'T12:00:00Z');
    return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === v;
  }
  function validTime(v) { return typeof v === 'string' && (v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v)); }
  function checkFields(op, kind) {
    var patch = {}, k, v;
    for (var i = 0; i < FIELDS.length; i++) {
      k = FIELDS[i];
      if (!own(op, k)) continue;
      v = op[k];
      if (k === 'type' && TYPES.indexOf(v) < 0) throw new Error('Tipo non valido');
      if (k === 'title' && (typeof v !== 'string' || !v.trim() || v.length > 180)) throw new Error('Titolo mancante o troppo lungo (max 180)');
      if (k === 'date' && !validDate(v)) throw new Error('Data non valida (AAAA-MM-GG)');
      if (k === 'time' && !validTime(v)) throw new Error('Ora non valida (HH:MM oppure vuota)');
      if (k === 'note' && (typeof v !== 'string' || v.length > 2000)) throw new Error('Nota non valida (max 2000 caratteri)');
      if (k === 'alarm' && typeof v !== 'boolean') throw new Error('Sveglia: usare true/false');
      if (k === 'mode' && v !== 'check' && v !== 'percent') throw new Error('Modalità: check/percent');
      if (k === 'progress' && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)) throw new Error('Avanzamento: numero tra 0 e 100');
      if (['kcal', 'protein', 'burn'].indexOf(k) >= 0 && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100000)) throw new Error(k + ': numero non valido');
      patch[k] = v;
    }
    if (kind === 'add' && (!patch.title || !patch.date)) throw new Error('Aggiunta: title e date obbligatori');
    if (kind === 'update' && !Object.keys(patch).length) throw new Error('Modifica: indicare almeno un campo');
    return patch;
  }

  // Può leggere JSON puro, blocchi ```json e link con frammento URL.
  function unwrap(input) {
    if (typeof input !== 'string' || !input.trim()) throw new Error('Incolla il JSON o il link ricevuto da ChatGPT');
    if (input.length > MAX_CHARS * 3) throw new Error('Contenuto troppo lungo');
    var s = input.trim().replace(/^\uFEFF/, '').trim();
    if (/^```(?:json)?\s*/i.test(s)) s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (/^https?:\/\//i.test(s)) {
      var u;
      try { u = new URL(s); } catch (e) { throw new Error('Link non valido'); }
      var normPath = function (p) { return p.replace(/\/index\.html$/i, '/'); };
      if (typeof location !== 'undefined' && (u.origin !== location.origin || normPath(u.pathname) !== normPath(location.pathname))) {
        throw new Error('Il link non appartiene a questa Agenda');
      }
      s = u.hash;
    }
    if (s.indexOf(PREFIX) === 0) {
      try { s = decodeURIComponent(s.slice(PREFIX.length)); }
      catch (e) { throw new Error('Codifica del link non valida'); }
    }
    if (s.length > MAX_CHARS) throw new Error('Piano troppo lungo (max 100 KB)');
    return s;
  }
  function parse(input) {
    var o;
    try { o = JSON.parse(unwrap(input)); } catch (e) {
      throw new Error(e instanceof SyntaxError ? 'JSON non valido: chiedi a ChatGPT di correggerlo' : e.message);
    }
    if (!isObj(o) || o.schema !== SCHEMA) {
      throw new Error('Formato non riconosciuto: serve schema "' + SCHEMA + '" (non il backup né il contesto esportato)');
    }
    var raw = Array.isArray(o.operations) ? o.operations : (Array.isArray(o.items) ? o.items : null);
    if (!raw || !raw.length || raw.length > MAX_OPS) throw new Error('Servono da 1 a ' + MAX_OPS + ' operazioni');
    var operations = raw.map(function (r, i) {
      if (!isObj(r)) throw new Error('Operazione ' + (i + 1) + ': formato non valido');
      var kind = r.op || (Array.isArray(o.items) ? 'add' : null);
      if (['add', 'update', 'delete'].indexOf(kind) < 0) throw new Error('Operazione ' + (i + 1) + ': op deve essere add/update/delete');
      var id = r.id;
      if (kind !== 'add' && (typeof id !== 'string' || !id || id.length > 160)) throw new Error('Operazione ' + (i + 1) + ': id obbligatorio');
      var unknown = Object.keys(r).filter(function (k) { return ['op', 'id'].concat(FIELDS).indexOf(k) < 0; });
      if (unknown.length) throw new Error('Operazione ' + (i + 1) + ': campi non supportati: ' + unknown.join(', '));
      if (kind === 'delete' && Object.keys(r).some(function (k) { return k !== 'op' && k !== 'id'; })) throw new Error('Eliminazione: usare solo op e id');
      var patch;
      try { patch = kind === 'delete' ? {} : checkFields(r, kind); }
      catch (e) { throw new Error('Operazione ' + (i + 1) + ': ' + e.message); }
      return { op: kind, id: kind === 'add' ? null : id, patch: patch };
    });
    return { schema: SCHEMA, operations: operations };
  }

  function keyOf(it) { return [it.type, it.date, it.time || '', String(it.title || '').trim().toLocaleLowerCase('it')].join('\u001f'); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function analyze(state, parsed) {
    var seen = {}, simulated = state.items.map(function (it) { return Object.assign({}, it); });
    return parsed.operations.map(function (op, index) {
      var result = { index: index, op: op.op, id: op.id, patch: op.patch, status: 'ready', current: null, next: null, info: '' };
      if (op.id && seen[op.id]) { result.status = 'blocked'; result.info = 'Più operazioni sullo stesso ID'; return result; }
      if (op.id) seen[op.id] = true;
      var at = op.id ? simulated.findIndex(function (it) { return it.id === op.id; }) : -1;
      if (op.op !== 'add' && at < 0) { result.status = 'blocked'; result.info = 'ID non presente in questa agenda (browser o dispositivo diverso?)'; return result; }
      if (op.op === 'add') {
        var it = L.makeItem(op.patch);
        result.next = it;
        if (simulated.some(function (x) { return keyOf(x) === keyOf(it); })) { result.status = 'duplicate'; result.info = 'Possibile duplicato già presente'; }
        simulated.push(it);
      } else if (op.op === 'update') {
        result.current = Object.assign({}, simulated[at]);
        var patch = Object.assign({}, simulated[at], op.patch);
        result.next = L.makeItem(patch);
        if (same(result.current, result.next)) { result.status = 'blocked'; result.info = 'Nessun cambiamento'; }
        simulated[at] = result.next;
      } else {
        result.current = Object.assign({}, simulated[at]);
        simulated.splice(at, 1);
      }
      return result;
    });
  }
  function apply(state, parsed, selectedIndices) {
    var sel = new Set(selectedIndices), rows = analyze(state, parsed);
    var selected = rows.filter(function (r) { return sel.has(r.index); });
    if (!selected.length) throw new Error('Non hai selezionato alcuna modifica');
    if (selected.some(function (r) { return r.status === 'blocked'; })) throw new Error('Una delle operazioni selezionate non è più valida: riesamina il piano');
    // Ricalcolo preventivo dei conflitti e applicazione su COPIA, mai sullo stato originale.
    var next = JSON.parse(JSON.stringify(state));
    var summary = { add: 0, update: 0, delete: 0 };
    rows.forEach(function (r) {
      if (!sel.has(r.index)) return;
      var op = parsed.operations[r.index], at = op.id ? next.items.findIndex(function (it) { return it.id === op.id; }) : -1;
      if (op.op === 'add') {
        next.items.push(L.makeItem(op.patch)); summary.add++;
      } else if (op.op === 'update') {
        if (at < 0) throw new Error('L’attività da modificare non esiste più');
        next.items[at] = L.makeItem(Object.assign({}, next.items[at], op.patch)); summary.update++;
      } else {
        if (at < 0) throw new Error('L’attività da eliminare non esiste più');
        // La foto NON viene cancellata da IndexedDB: serve a un eventuale ripristino.
        next.items.splice(at, 1); summary.delete++;
      }
    });
    return { state: next, summary: summary };
  }

  function exportContext(state, date, types) {
    if (!validDate(date)) throw new Error('Data non valida');
    var week = L.startOfWeek(date), end = L.addDays(week, 6);
    var allowed = (types || ['impegno', 'esercizio']).filter(function (t) { return TYPES.indexOf(t) >= 0; });
    var items = state.items.filter(function (it) { return it.date >= week && it.date <= end && allowed.indexOf(it.type) >= 0; })
      .sort(function (a, b) { return (a.date + ' ' + (a.time || '99:99')).localeCompare(b.date + ' ' + (b.time || '99:99')); })
      .map(function (it) {
        return { id: it.id, type: it.type, title: it.title, date: it.date, time: it.time, alarm: it.alarm,
          mode: it.mode, progress: it.progress, note: it.note, kcal: it.kcal, protein: it.protein, burn: it.burn,
          linkedToGoal: !!it.gid, recurring: !!it.rid };
      });
    var goals = state.goals.filter(function (g) { return g.week === week && allowed.indexOf(g.type) >= 0; })
      .map(function (g) { return { id: g.id, title: g.title, type: g.type, kind: g.kind, target: g.target, unit: g.unit,
        subs: g.subs && g.subs.map(function (s) { return { title: s.title, count: s.count }; }) }; });
    return { schema: CONTEXT, exportedAt: new Date().toISOString(), weekStart: week, weekEnd: end, timezone: 'Europe/Rome',
      items: items, weeklyGoalsForContext: goals };
  }
  function makeLink(base, source) {
    var obj = typeof source === 'string' ? parse(source) :
      (source && Array.isArray(source.operations) && source.operations.every(function (op) { return isObj(op) && isObj(op.patch); })
        ? source : parse(JSON.stringify(source)));
    var root = new URL(base);
    root.search = ''; root.hash = PREFIX + encodeURIComponent(JSON.stringify({ schema: SCHEMA,
      operations: obj.operations.map(function (op) { return Object.assign({ op: op.op }, op.id ? { id: op.id } : {}, op.patch); }) }));
    return root.href;
  }
  return { SCHEMA: SCHEMA, CONTEXT: CONTEXT, PREFIX: PREFIX, parse: parse, analyze: analyze,
    apply: apply, exportContext: exportContext, makeLink: makeLink, validDate: validDate };
});
