/* Agenda ↔ ChatGPT v1.5 — JSON locale, obiettivi settimanali e anteprima; nessun backend. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.AgendaChatBridge = factory(root.Logic);
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';
  var SCHEMA = 'agenda-chatgpt-v1', CONTEXT = 'agenda-chatgpt-context-v1';
  var PREFIX = '#agenda-import=', ZIP_PREFIX = '#agenda-import-z=';
  var MAX_CHARS = 150000, MAX_OPS = 100, MAX_LINKS = 100;
  var FIELDS = ['type', 'title', 'date', 'time', 'alarm', 'mode', 'progress', 'note', 'kcal', 'protein', 'burn'];
  var GOAL_FIELDS = ['type', 'title', 'week', 'kind', 'target', 'unit', 'days', 'subs', 'links'];
  var TYPES = ['impegno', 'esercizio', 'cibo'];
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function validDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var t = new Date(v + 'T12:00:00Z');
    return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === v;
  }
  function validTime(v) { return typeof v === 'string' && (v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v)); }
  function str(v, max, label) { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(label + ' mancante o troppo lungo'); return v.trim(); }
  function nonneg(v, label, limit) { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > limit) throw new Error(label + ': numero non valido'); return v; }
  function validType(v) { if (TYPES.indexOf(v) < 0) throw new Error('Tipo non valido'); return v; }
  function uniqueKeys(obj, allowed, label) {
    var unexpected = Object.keys(obj).filter(function (k) { return allowed.indexOf(k) < 0; });
    if (unexpected.length) throw new Error(label + ': campi non supportati: ' + unexpected.join(', '));
  }
  function itemFields(r, kind) {
    var p = {};
    FIELDS.forEach(function (k) {
      if (!own(r, k)) return;
      var v = r[k];
      if (k === 'type') validType(v);
      if (k === 'title') str(v, 180, 'Titolo');
      if (k === 'date' && !validDate(v)) throw new Error('Data non valida (AAAA-MM-GG)');
      if (k === 'time' && !validTime(v)) throw new Error('Ora non valida');
      if (k === 'note' && (typeof v !== 'string' || v.length > 2000)) throw new Error('Nota non valida (max 2000)');
      if (k === 'alarm' && typeof v !== 'boolean') throw new Error('Sveglia: usare true/false');
      if (k === 'mode' && ['check', 'percent'].indexOf(v) < 0) throw new Error('Modalità: check/percent');
      if (k === 'progress') nonneg(v, 'Avanzamento', 100);
      if (['kcal', 'protein', 'burn'].indexOf(k) >= 0) nonneg(v, k, 100000);
      p[k] = v;
    });
    if (kind === 'add' && (!p.title || !p.date)) throw new Error('Aggiunta: title e date obbligatori');
    if (kind === 'update' && !Object.keys(p).length) throw new Error('Modifica: indicare almeno un campo');
    return p;
  }
  function selector(raw) {
    if (!isObj(raw)) throw new Error('Collegamento: serve match con id oppure type, title, date');
    uniqueKeys(raw, ['id', 'type', 'title', 'date'], 'match');
    if (raw.id != null) return { id: str(raw.id, 160, 'ID') };
    return { type: validType(raw.type), title: str(raw.title, 180, 'Titolo del match'),
      date: validDate(raw.date) ? raw.date : (function () { throw new Error('Data del match non valida'); })() };
  }
  function goalFields(raw, kind) {
    var p = {};
    GOAL_FIELDS.forEach(function (k) { if (own(raw, k)) p[k] = raw[k]; });
    if (own(p, 'title')) p.title = str(p.title, 120, 'Titolo obiettivo');
    if (own(p, 'type')) validType(p.type);
    if (own(p, 'week') && !validDate(p.week)) throw new Error('Settimana non valida');
    if (own(p, 'kind') && ['list', 'amount'].indexOf(p.kind) < 0) throw new Error('kind deve essere list oppure amount');
    if (own(p, 'target')) nonneg(p.target, 'Target', 100000000);
    if (own(p, 'unit') && (typeof p.unit !== 'string' || p.unit.length > 20)) throw new Error('Unità non valida');
    if (own(p, 'days')) {
      if (!isObj(p.days) || Object.keys(p.days).length > 7) throw new Error('days non valido');
      Object.keys(p.days).forEach(function (d) { if (!validDate(d)) throw new Error('Data in days non valida'); nonneg(p.days[d], 'Quantità giornaliera', 100000000); });
    }
    if (own(p, 'subs')) {
      if (!Array.isArray(p.subs) || p.subs.length < 1 || p.subs.length > 70) throw new Error('subs: servono da 1 a 70 sotto-obiettivi');
      p.subs = p.subs.map(function (s) {
        if (!isObj(s)) throw new Error('Sotto-obiettivo non valido');
        uniqueKeys(s, ['title', 'count', 'burn', 'previousTitle'], 'subs');
        var sb = { title: str(s.title, 120, 'Titolo sotto-obiettivo'), count: own(s, 'count') ? nonneg(s.count, 'count', 99) : 1,
          burn: own(s, 'burn') ? nonneg(s.burn, 'burn', 100000) : 0 };
        if (!Number.isInteger(sb.count) || sb.count < 1) throw new Error('count deve essere intero tra 1 e 99');
        if (own(s, 'previousTitle')) sb.previousTitle = str(s.previousTitle, 120, 'previousTitle');
        return sb;
      });
      var names = p.subs.map(function (s) { return s.title.toLocaleLowerCase('it'); });
      if (new Set(names).size !== names.length) throw new Error('I titoli dei sotto-obiettivi devono essere distinti; usa count per ripetizioni');
    }
    if (own(p, 'links')) {
      if (!Array.isArray(p.links) || p.links.length > MAX_LINKS) throw new Error('Troppi collegamenti');
      p.links = p.links.map(function (li) {
        if (!isObj(li)) throw new Error('Collegamento non valido');
        uniqueKeys(li, ['match', 'sub', 'quantity'], 'links');
        if (!own(li, 'sub') && !own(li, 'quantity')) throw new Error('links: servono sub per list oppure quantity per amount');
        if (own(li, 'sub') && own(li, 'quantity')) throw new Error('links: scegliere sub oppure quantity');
        return Object.assign({ match: selector(li.match) }, own(li, 'sub') ? { sub: str(li.sub, 120, 'Sotto-obiettivo di destinazione') } : { quantity: nonneg(li.quantity, 'quantity', 100000000) });
      });
    }
    if (kind === 'add' && (!p.title || !p.type || !p.week || !p.kind)) throw new Error('Nuovo obiettivo: title, type, week e kind obbligatori');
    if (kind === 'add' && p.kind === 'list' && !p.subs) throw new Error('Obiettivo list: inserisci subs');
    if (kind === 'add' && p.kind === 'amount' && !(p.target > 0)) throw new Error('Obiettivo amount: target positivo obbligatorio');
    if (kind === 'update' && !Object.keys(p).length) throw new Error('Modifica obiettivo vuota');
    return p;
  }
  function unwrap(input) {
    if (typeof input !== 'string' || !input.trim()) throw new Error('Incolla il JSON o un link ricevuto da ChatGPT');
    if (input.length > MAX_CHARS * 4) throw new Error('Contenuto troppo lungo');
    var s = input.trim().replace(/^\uFEFF/, '').trim();
    if (/^```(?:json)?\s*/i.test(s)) s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (/^https?:\/\//i.test(s)) {
      var u;
      try { u = new URL(s); } catch (e) { throw new Error('Link non valido'); }
      var norm = function (v) { return v.replace(/\/index\.html$/i, '/'); };
      if (typeof location !== 'undefined' && (u.origin !== location.origin || norm(u.pathname) !== norm(location.pathname)))
        throw new Error('Il link non appartiene a questa Agenda');
      s = u.hash;
    }
    if (s.indexOf(ZIP_PREFIX) === 0) throw new Error('Link compresso: aprilo nell’Agenda oppure usa la funzione expandLink');
    if (s.indexOf(PREFIX) === 0) {
      try { s = decodeURIComponent(s.slice(PREFIX.length)); } catch (e) { throw new Error('Codifica del link non valida'); }
    }
    if (s.length > MAX_CHARS) throw new Error('Piano troppo lungo');
    return s;
  }
  // gzip+base64url: link corto, payload nel frammento (non va al server).
  async function expandLink(input) {
    var s = input.trim();
    if (/^https?:\/\//i.test(s)) {
      var u = new URL(s);
      var norm = function (v) { return v.replace(/\/index\.html$/i, '/'); };
      if (typeof location !== 'undefined' && (u.origin !== location.origin || norm(u.pathname) !== norm(location.pathname))) throw new Error('Il link non appartiene a questa Agenda');
      s = u.hash;
    }
    if (s.indexOf(ZIP_PREFIX) !== 0) return input;
    if (typeof DecompressionStream === 'undefined') throw new Error('Browser senza supporto gzip: usa il JSON normale');
    var b64 = s.slice(ZIP_PREFIX.length);
    if (!/^[A-Za-z0-9_-]{1,120000}$/.test(b64)) throw new Error('Link compresso non valido');
    var bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4));
    var bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    var reader = stream.getReader(), out = [], size = 0;
    while (true) {
      var piece = await reader.read();
      if (piece.done) break;
      size += piece.value.byteLength;
      if (size > MAX_CHARS) { reader.cancel(); throw new Error('Link decompresso troppo grande'); }
      out.push(piece.value);
    }
    var buf = new Uint8Array(size), n = 0;
    out.forEach(function (a) { buf.set(a, n); n += a.byteLength; });
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  }
  function parse(input) {
    var o;
    try { o = JSON.parse(unwrap(input)); } catch (e) { throw new Error(e instanceof SyntaxError ? 'JSON non valido' : e.message); }
    if (!isObj(o) || o.schema !== SCHEMA) throw new Error('Formato richiesto: schema "' + SCHEMA + '"');
    var raw = Array.isArray(o.operations) ? o.operations : (Array.isArray(o.items) ? o.items : null);
    if (!raw || !raw.length || raw.length > MAX_OPS) throw new Error('Servono da 1 a ' + MAX_OPS + ' operazioni');
    return { schema: SCHEMA, operations: raw.map(function (r, i) {
      try {
        if (!isObj(r)) throw new Error('Operazione non valida');
        var kind = r.op || (Array.isArray(o.items) ? 'add' : null), entity = r.entity || 'item';
        if (['add', 'update', 'delete'].indexOf(kind) < 0) throw new Error('op: add/update/delete');
        if (['item', 'goal'].indexOf(entity) < 0) throw new Error('entity: item/goal');
        var keys = ['op', 'entity', 'id'].concat(entity === 'item' ? ['match'] : []);
        uniqueKeys(r, keys.concat(entity === 'goal' ? GOAL_FIELDS : FIELDS), 'Operazione');
        if (kind !== 'add' && (!r.id && !(entity === 'item' && r.match))) throw new Error('Per update/delete serve id reale oppure match univoco per gli impegni');
        if (r.id != null && (typeof r.id !== 'string' || !r.id || r.id.length > 160)) throw new Error('id non valido');
        if (own(r, 'match') && (entity !== 'item' || kind === 'add' || r.id)) throw new Error('match consentito solo per update/delete impegni senza id');
        if (kind === 'delete' && Object.keys(r).some(function (k) { return keys.indexOf(k) < 0; })) throw new Error('Delete: usare soltanto op, entity e id/match');
        return { op: kind, entity: entity, id: kind === 'add' ? null : (r.id || null),
          match: r.match ? selector(r.match) : null,
          patch: kind === 'delete' ? {} : (entity === 'goal' ? goalFields(r, kind) : itemFields(r, kind)) };
      } catch (e) { throw new Error('Operazione ' + (i + 1) + ': ' + e.message); }
    }) };
  }
  function keyOf(it) { return [it.type, it.date, it.time || '', String(it.title || '').trim().toLocaleLowerCase('it')].join('\u001f'); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function findMatch(items, match) {
    var found = items.filter(function (it) { return match.id ? it.id === match.id :
      it.type === match.type && it.date === match.date && it.title === match.title; });
    if (found.length !== 1) throw new Error(found.length ? 'Match ambiguo: più voci identiche' : 'Voce da collegare non trovata');
    return found[0];
  }
  function runOne(next, op) {
    var coll = op.entity === 'goal' ? next.goals : next.items;
    var at = op.id ? coll.findIndex(function (x) { return x.id === op.id; }) : (op.match ? coll.findIndex(function (x) { return x.id === findMatch(coll, op.match).id; }) : -1);
    if (op.op !== 'add' && at < 0) throw new Error('ID non presente in questa agenda (o browser diverso)');
    var old = at < 0 ? null : copy(coll[at]), newObj = null, linked = 0;
    if (op.op === 'delete') {
      if (op.entity === 'goal') next.items.forEach(function (it) { if (it.gid === old.id) { it.gid = null; it.sid = null; } });
      coll.splice(at, 1);
      return { current: old, next: null, info: op.entity === 'goal' ? 'Le attività restano, scollegate dall’obiettivo' : '' };
    }
    if (op.entity === 'item') {
      if (op.op === 'add') {
        newObj = L.makeItem(op.patch);
        if (next.items.some(function (i) { return keyOf(i) === keyOf(newObj); })) throw new Error('Possibile duplicato già presente');
        coll.push(newObj);
      } else {
        newObj = L.makeItem(Object.assign({}, old, op.patch));
        if (same(old, newObj)) throw new Error('Nessun cambiamento');
        if (next.items.some(function (i) { return i.id !== old.id && keyOf(i) === keyOf(newObj); })) throw new Error('Possibile duplicato dopo modifica');
        coll[at] = newObj;
      }
    } else {
      var p = op.patch;
      if (op.op === 'add' && next.goals.some(function (g) {
        return g.week === L.startOfWeek(p.week) && g.type === p.type && g.title.toLocaleLowerCase('it') === p.title.toLocaleLowerCase('it');
      })) throw new Error('Obiettivo già presente (non verrà duplicato)');
      var merged = Object.assign({}, old || {}, p);
      delete merged.links;
      if (p.links && merged.kind === 'amount') merged.credits = [];
      if (p.subs) merged.subs = p.subs.map(function (s) {
        var prior = old && old.subs.find(function (x) { return x.title === (s.previousTitle || s.title); });
        return { id: prior ? prior.id : undefined, title: s.title, count: s.count, burn: s.burn };
      });
      newObj = L.makeGoal(merged);
      if (newObj.kind === 'list' && !newObj.subs.length) throw new Error('Mancano sotto-obiettivi');
      if (newObj.kind === 'amount' && !(newObj.target > 0)) throw new Error('Target quantità non valido');
      if (op.op === 'add') coll.push(newObj); else coll[at] = newObj;
      if (op.op === 'update') {
        var validSids = new Set(newObj.subs.map(function (s) { return s.id; }));
        next.items.forEach(function (it) {
          if (it.gid === newObj.id && (newObj.kind === 'list' ? !validSids.has(it.sid) : (p.links ? true : !newObj.credits.some(function (c) { return c.itemId === it.id; })))) { it.gid = null; it.sid = null; }
        });
      }
      if (p.days) {
        Object.keys(newObj.days).forEach(function (date) {
          if (date < newObj.week || date > L.addDays(newObj.week, 6)) throw new Error('Giorno fuori dalla settimana dell’obiettivo');
        });
      }
      // Risoluzione preliminare: evitare conflitti temporanei quando più vecchi
      // impegni condividono un sotto-obiettivo e devono essere ridistribuiti.
      var requested = (p.links || []).map(function (link) {
        if (newObj.kind === 'list' && !own(link, 'sub')) throw new Error('Obiettivo list: ogni link richiede sub');
        if (newObj.kind === 'amount' && !(link.quantity > 0)) throw new Error('Obiettivo amount: ogni link richiede quantity > 0');
        var sub = newObj.kind === 'list' ? newObj.subs.find(function (s) { return s.title === link.sub; }) : null;
        if (newObj.kind === 'list' && !sub) throw new Error('Sotto-obiettivo non trovato: ' + link.sub);
        var it = findMatch(next.items, link.match);
        if (it.type !== newObj.type) throw new Error('Tipo diverso per: ' + it.title);
        if (L.startOfWeek(it.date) !== newObj.week) throw new Error('Voce fuori settimana: ' + it.title);
        if (it.gid && it.gid !== newObj.id) throw new Error('Voce già collegata a un altro obiettivo: ' + it.title);
        return { item: it, sub: sub, quantity: link.quantity || 0 };
      });
      if (new Set(requested.map(function (x) { return x.item.id; })).size !== requested.length)
        throw new Error('Una stessa attività compare più volte nei links');
      requested.forEach(function (x) { if (x.item.gid === newObj.id) { x.item.gid = null; x.item.sid = null; } });
      requested.forEach(function (x) {
        if (newObj.kind === 'list') {
          var taken = next.items.filter(function (i) { return i.gid === newObj.id && i.sid === x.sub.id; }).length;
          if (taken >= x.sub.count) throw new Error('Numero massimo già raggiunto per: ' + x.sub.title);
        }
        x.item.gid = newObj.id; x.item.sid = x.sub ? x.sub.id : null;
        if (newObj.kind === 'amount') newObj.credits.push({ itemId: x.item.id, quantity: x.quantity });
        linked++;
      });
      if (op.op === 'update' && same(old, newObj) && !linked) throw new Error('Nessun cambiamento');
    }
    return { current: old, next: newObj, info: linked ? linked + ' attività esistenti collegate (nessun duplicato)' : '' };
  }
  function analyze(state, parsed) {
    var simulated = copy(state), seen = {};
    return parsed.operations.map(function (op, index) {
      var result = { index: index, op: op.op, entity: op.entity, id: op.id, patch: op.patch,
        status: 'ready', current: null, next: null, info: '' };
      try {
        var token = op.id && op.entity + ':' + op.id;
        if (token && seen[token]) throw new Error('Più operazioni sullo stesso ID');
        if (token) seen[token] = true;
        var attempt = copy(simulated);
        var r = runOne(attempt, op);
        result.current = r.current; result.next = r.next; result.info = r.info;
        simulated = attempt;
      } catch (e) { result.status = /duplicat|già presente/i.test(e.message) ? 'duplicate' : 'blocked'; result.info = e.message; }
      return result;
    });
  }
  function apply(state, parsed, selectedIndices) {
    var sel = new Set(selectedIndices), next = copy(state);
    var summary = { add: 0, update: 0, delete: 0, goals: 0, links: 0 };
    if (!sel.size) throw new Error('Nessuna operazione selezionata');
    parsed.operations.forEach(function (op, index) {
      if (!sel.has(index)) return;
      var r = runOne(next, op);
      summary[op.op]++;
      if (op.entity === 'goal') { summary.goals++; summary.links += (op.patch.links || []).length; }
    });
    return { state: next, summary: summary };
  }
  function exportContext(state, date, types) {
    if (!validDate(date)) throw new Error('Data non valida');
    var week = L.startOfWeek(date), end = L.addDays(week, 6);
    var allowed = (types || ['impegno', 'esercizio']).filter(function (t) { return TYPES.indexOf(t) >= 0; });
    var items = state.items.filter(function (it) { return it.date >= week && it.date <= end && allowed.indexOf(it.type) >= 0; })
      .sort(function (a, b) { return (a.date + ' ' + (a.time || '99:99')).localeCompare(b.date + ' ' + (b.time || '99:99')); })
      .map(function (it) { return { id: it.id, type: it.type, title: it.title, date: it.date, time: it.time,
        alarm: it.alarm, mode: it.mode, progress: it.progress, note: it.note,
        kcal: it.kcal, protein: it.protein, burn: it.burn, goalId: it.gid || null, subId: it.sid || null, recurring: !!it.rid }; });
    var goals = state.goals.filter(function (g) { return g.week === week && allowed.indexOf(g.type) >= 0; })
      .map(function (g) { return { id: g.id, title: g.title, type: g.type, kind: g.kind, target: g.target,
        unit: g.unit, days: g.kind === 'amount' ? g.days : undefined,
        credits: g.kind === 'amount' ? g.credits : undefined,
        subs: g.subs && g.subs.map(function (s) { return { id: s.id, title: s.title, count: s.count, burn: s.burn }; }) }; });
    return { schema: CONTEXT, exportedAt: new Date().toISOString(), weekStart: week, weekEnd: end, timezone: 'Europe/Rome',
      items: items, weeklyGoalsForContext: goals };
  }
  function makeLink(base, source) {
    var obj = typeof source === 'string' ? parse(source) :
      (source && Array.isArray(source.operations) && source.operations.every(function (op) { return isObj(op) && isObj(op.patch); })
        ? source : parse(JSON.stringify(source)));
    var u = new URL(base);
    u.search = ''; u.hash = PREFIX + encodeURIComponent(JSON.stringify({ schema: SCHEMA,
      operations: obj.operations.map(function (op) { return Object.assign({ op: op.op }, op.entity === 'goal' ? { entity: 'goal' } : {}, op.id ? { id: op.id } : {}, op.match ? { match: op.match } : {}, op.patch); }) }));
    return u.href;
  }
  return { SCHEMA: SCHEMA, CONTEXT: CONTEXT, PREFIX: PREFIX, ZIP_PREFIX: ZIP_PREFIX,
    parse: parse, analyze: analyze, apply: apply, exportContext: exportContext,
    makeLink: makeLink, expandLink: expandLink, validDate: validDate };
});
