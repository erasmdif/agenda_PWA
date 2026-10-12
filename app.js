/* Agenda — interfaccia. Tutti i dati restano nel browser del telefono
   (localStorage per impegni/pasti, IndexedDB per le foto). Nessun server. */
(function () {
  'use strict';
  var L = window.Logic;
  var VERSION = '1.2';

  /* =========================================================
     Utilità DOM
     ========================================================= */
  function $(s, r) { return (r || document).querySelector(s); }

  function appendKids(el, kids) {
    kids.forEach(function (k) {
      if (Array.isArray(k)) appendKids(el, k);
      else if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    });
  }
  // h(tag, attrs, ...figli) — i testi passano sempre da createTextNode (nessun innerHTML).
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var kids = Array.prototype.slice.call(arguments, 2);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      });
    }
    appendKids(el, kids);
    if (attrs && attrs.value != null && el.tagName === 'SELECT') el.value = attrs.value;
    return el;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgCheck() {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '3'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }

  var toastTimer;
  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }

  /* =========================================================
     Formati
     ========================================================= */
  var SECTIONS = {
    impegno: { label: 'Impegni', icon: '🗓️', singular: 'impegno', empty: 'Nessun impegno per questo giorno.' },
    esercizio: { label: 'Esercizi', icon: '🏃', singular: 'esercizio', empty: 'Nessun esercizio per questo giorno.' },
    cibo: { label: 'Cibo', icon: '🍽️', singular: 'pasto', empty: 'Nessun pasto registrato per questo giorno.' }
  };
  var fmtLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  var fmtShort = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric' });
  var fmtDM = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
  var nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function todayISO() { return L.toISO(new Date()); }
  function weekLabel(iso) {
    var s = L.startOfWeek(iso), e = L.addDays(s, 6);
    return fmtDM.format(L.fromISO(s)) + ' – ' + fmtDM.format(L.fromISO(e));
  }

  /* =========================================================
     Archivio: stato in localStorage, meta (PIN, avvisi già dati), foto in IndexedDB
     ========================================================= */
  var KEY = 'agenda.state.v1';
  var META_KEY = 'agenda.meta.v1';
  var state, meta;

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return L.migrate(JSON.parse(raw));
    } catch (e) { console.error(e); }
    return L.emptyState();
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Impossibile salvare: spazio esaurito?', 4000); }
  }
  function defaultMeta() { return { pin: null, firstRunDone: false, fired: {}, fails: { n: 0, until: 0 } }; }
  function loadMeta() {
    try {
      var m = JSON.parse(localStorage.getItem(META_KEY) || 'null');
      if (m && typeof m === 'object') return Object.assign(defaultMeta(), m);
    } catch (e) { /* ignore */ }
    return defaultMeta();
  }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ } }

  var dbp;
  function db() {
    if (!dbp) {
      dbp = new Promise(function (res, rej) {
        var r = indexedDB.open('agenda-photos', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('photos', { keyPath: 'id' }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    }
    return dbp;
  }
  function putPhoto(id, blob) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('photos', 'readwrite');
        t.objectStore('photos').put({ id: id, blob: blob });
        t.oncomplete = function () { res(); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function getPhoto(id) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var r = d.transaction('photos').objectStore('photos').get(id);
        r.onsuccess = function () { res(r.result ? r.result.blob : null); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }
  function delPhoto(id) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('photos', 'readwrite');
        t.objectStore('photos').delete(id);
        t.oncomplete = function () { res(); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function clearPhotos() {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('photos', 'readwrite');
        t.objectStore('photos').clear();
        t.oncomplete = function () { res(); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  var urlCache = new Map();
  function photoURL(id) {
    if (urlCache.has(id)) return Promise.resolve(urlCache.get(id));
    return getPhoto(id).then(function (blob) {
      if (!blob) return null;
      var u = URL.createObjectURL(blob);
      urlCache.set(id, u);
      return u;
    });
  }
  function dropPhoto(id) {
    var u = urlCache.get(id);
    if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
    return delPhoto(id).catch(function () { /* ignore */ });
  }
  function thumb(id, cls) {
    var img = h('img', { class: cls, alt: 'Foto allegata', loading: 'lazy' });
    photoURL(id).then(function (u) { if (u) img.src = u; }).catch(function () { /* ignore */ });
    return img;
  }

  // Riduce le foto (max 1600 px, JPEG) per non riempire la memoria del browser.
  function compress(file) {
    var MAX = 1600;
    function fromBitmap() {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); });
    }
    function fromImg() {
      return new Promise(function (res, rej) {
        var u = URL.createObjectURL(file), img = new Image();
        img.onload = function () { URL.revokeObjectURL(u); res(img); };
        img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('immagine non leggibile')); };
        img.src = u;
      });
    }
    var src = typeof createImageBitmap === 'function' ? fromBitmap().catch(fromImg) : fromImg();
    return src.then(function (im) {
      var w = im.width, hh = im.height, k = Math.min(1, MAX / Math.max(w, hh));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hh * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      return new Promise(function (res, rej) {
        c.toBlob(function (b) { b ? res(b) : rej(new Error('compressione fallita')); }, 'image/jpeg', 0.82);
      });
    });
  }

  /* =========================================================
     Stato dell'interfaccia
     ========================================================= */
  var ui = { sec: 'impegno', view: 'day', date: todayISO(), pview: 'week', pdate: todayISO() };

  function shift(n) {
    if (ui.sec === 'stats') ui.pdate = L.shiftPeriod(ui.pview, ui.pdate, n);
    else ui.date = L.addDays(ui.date, ui.view === 'week' ? 7 * n : n);
    render();
  }

  function maintain() {
    var t = todayISO();
    var created = L.materialize(state, t);
    var moved = L.rollover(state, t);
    if (created || moved) persist();
    return { created: created, moved: moved };
  }
  function movedToast(n) {
    if (n) toast(n === 1 ? '1 attività non svolta è stata riportata' : n + ' attività non svolte sono state riportate', 3600);
  }

  /* =========================================================
     Render
     ========================================================= */
  function render() {
    document.body.dataset.sec = ui.sec;
    renderHeader();
    renderTabs();
    var main = $('#view');
    var y = window.scrollY;
    main.replaceChildren.apply(main, ui.sec === 'stats' ? statsView() : ui.view === 'week' ? weekView() : dayView());
    try { window.scrollTo(0, y); } catch (e) { /* ignore */ }
  }

  function renderHeader() {
    var t = todayISO(), rel = L.diffDays(t, ui.date);
    var weekHasToday = L.startOfWeek(ui.date) === L.startOfWeek(t);
    var kicker = ui.view === 'week'
      ? (weekHasToday ? 'Questa settimana' : 'Settimana')
      : (rel === 0 ? 'Oggi' : rel === 1 ? 'Domani' : rel === -1 ? 'Ieri' : String(L.fromISO(ui.date).getFullYear()));
    var title = ui.view === 'week' ? weekLabel(ui.date) : cap(fmtLong.format(L.fromISO(ui.date)));
    var atNow = ui.view === 'week' ? weekHasToday : rel === 0;
    var top = $('#top');
    if (ui.sec === 'stats') {
      var pr = L.rangeOf(ui.pview, ui.pdate), nowIn = pr.start <= t && t <= pr.end;
      top.replaceChildren(
        h('div', { class: 'top-row' },
          h('div', null, h('div', { class: 'kicker' }, 'Progressi'), h('h1', null, periodTitle(ui.pview, ui.pdate))),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Impostazioni', onclick: openSettings }, '⚙')),
        h('div', { class: 'top-row nav' },
          h('div', { class: 'stepper' },
            h('button', { type: 'button', 'aria-label': 'Precedente', onclick: function () { shift(-1); } }, '‹'),
            h('button', { type: 'button', class: 'today', disabled: nowIn, onclick: function () { ui.pdate = t; render(); } }, 'Oggi'),
            h('button', { type: 'button', 'aria-label': 'Successivo', onclick: function () { shift(1); } }, '›')),
          h('div', { class: 'seg', role: 'tablist' }, PERIODS.map(function (v) {
            return h('button', {
              type: 'button', class: ui.pview === v[0] ? 'on' : '', role: 'tab', 'aria-selected': ui.pview === v[0] ? 'true' : 'false',
              onclick: function () { ui.pview = v[0]; render(); }
            }, v[1]);
          }))));
      return;
    }
    top.replaceChildren(
      h('div', { class: 'top-row' },
        h('div', null, h('div', { class: 'kicker' }, kicker), h('h1', null, title)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Impostazioni', onclick: openSettings }, '⚙')),
      h('div', { class: 'top-row nav' },
        h('div', { class: 'stepper' },
          h('button', { type: 'button', 'aria-label': 'Precedente', onclick: function () { shift(-1); } }, '‹'),
          h('button', { type: 'button', class: 'today', disabled: atNow, onclick: function () { ui.date = t; render(); } }, 'Oggi'),
          h('button', { type: 'button', 'aria-label': 'Successivo', onclick: function () { shift(1); } }, '›')),
        h('div', { class: 'seg', role: 'tablist' }, ['day', 'week'].map(function (v) {
          return h('button', {
            type: 'button', class: ui.view === v ? 'on' : '', role: 'tab', 'aria-selected': ui.view === v ? 'true' : 'false',
            onclick: function () { ui.view = v; render(); }
          }, v === 'day' ? 'Giorno' : 'Settimana');
        }))));
  }

  function renderTabs() {
    var tabs = Object.keys(SECTIONS).map(function (k) {
      return h('button', {
        type: 'button', class: ui.sec === k ? 'on' : '', style: '--tab: var(--c-' + k + ')',
        'aria-current': ui.sec === k ? 'page' : null,
        onclick: function () { ui.sec = k; render(); }
      }, h('span', { class: 'ic' }, SECTIONS[k].icon), SECTIONS[k].label);
    });
    tabs.push(h('button', {
      type: 'button', class: ui.sec === 'stats' ? 'on' : '', style: '--tab: var(--c-stats)', 'data-tab': 'stats',
      'aria-current': ui.sec === 'stats' ? 'page' : null,
      onclick: function () { ui.sec = 'stats'; ui.pdate = todayISO(); render(); }
    }, h('span', { class: 'ic' }, '📊'), 'Progressi'));
    $('#tabs').replaceChildren.apply($('#tabs'), tabs);
  }

  /* =========================================================
     Progressi (dashboard): si ricalcola da state a ogni render,
     quindi segue da sola ogni aggiunta, modifica o rimozione.
     ========================================================= */
  var PERIODS = [['day', 'Giorno'], ['week', 'Settimana'], ['month', 'Mese']];
  var fmtMonth = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
  function pctText(p) { return p == null ? '–' : p + '%'; }
  function periodTitle(period, iso) {
    if (period === 'week') return weekLabel(iso);
    if (period === 'month') return cap(fmtMonth.format(L.fromISO(iso)));
    return cap(fmtLong.format(L.fromISO(iso)));
  }
  function periodWord(period) { return period === 'day' ? 'del giorno' : period === 'week' ? 'della settimana' : 'del mese'; }

  function statTile(type, agg, extra) {
    var s = SECTIONS[type];
    return h('div', { class: 'tile', style: '--sec: var(--c-' + type + ')' },
      h('div', { class: 'tile-h' }, h('span', { class: 'ic' }, s.icon), h('span', null, s.label)),
      h('div', { class: 'tile-v' }, pctText(agg.pct)),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + (agg.pct || 0) + '%' })),
      h('div', { class: 'tile-n' }, extra));
  }

  /* Colonne giornaliere: l'altezza è la percentuale di attività svolte; toccando una colonna si apre quel giorno. */
  function activityChart(st) {
    var month = st.range.period === 'month';
    var cols = st.series.map(function (r, i) {
      var items = [r.impegno, r.esercizio].filter(Boolean);
      var tot = items.reduce(function (a, x) { return a + x.total; }, 0);
      var pct = tot ? Math.round(items.reduce(function (a, x) { return a + x.pct * x.total; }, 0) / tot) : null;
      var label = month ? ((i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '') : DAYLETTERS[i];
      return h('button', {
        type: 'button', class: 'col' + (r.future ? ' future' : '') + (r.today ? ' today' : '') + (pct == null ? ' empty' : ''),
        'aria-label': cap(fmtLong.format(L.fromISO(r.iso))) + (pct == null ? ': nessuna attività' : ': ' + pct + '%'),
        onclick: function () { ui.sec = 'impegno'; ui.view = 'day'; ui.date = r.iso; render(); }
      }, h('span', { class: 'col-bar' }, h('i', { style: 'height:' + (pct == null ? 4 : Math.max(pct, 4)) + '%' })), h('span', { class: 'col-l' }, label));
    });
    return h('div', { class: 'chart' + (month ? ' month' : '') }, cols);
  }

  function foodChart(st) {
    var month = st.range.period === 'month';
    var max = 0;
    st.series.forEach(function (r) { max = Math.max(max, r.cibo.eaten, r.cibo.goal); });
    max = max || 1;
    var cols = st.series.map(function (r, i) {
      var label = month ? ((i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '') : DAYLETTERS[i];
      var over = r.cibo.eaten > r.cibo.goal;
      return h('button', {
        type: 'button', class: 'col' + (r.future ? ' future' : '') + (r.today ? ' today' : '') + (!r.cibo.eaten ? ' empty' : '') + (over ? ' over' : ''),
        'aria-label': cap(fmtLong.format(L.fromISO(r.iso))) + ': ' + nf.format(r.cibo.eaten) + ' di ' + nf.format(r.cibo.goal) + ' kcal',
        onclick: function () { ui.sec = 'cibo'; ui.view = 'day'; ui.date = r.iso; render(); }
      }, h('span', { class: 'col-bar' },
        h('i', { style: 'height:' + (r.cibo.eaten ? Math.max(r.cibo.eaten / max * 100, 4) : 4) + '%' }),
        h('u', { class: 'goalmark', style: 'bottom:' + (r.cibo.goal / max * 100) + '%' })),
        h('span', { class: 'col-l' }, label));
    });
    return h('div', { class: 'chart food' + (month ? ' month' : '') }, cols);
  }

  function statsView() {
    var today = todayISO(), st = L.periodStats(state, ui.pview, ui.pdate, today), out = [];
    var P = ui.pview, word = periodWord(P);
    var nothing = !st.overallTotal && !st.food.activeDays && !st.upcoming && !st.goals.length;
    if (nothing) {
      return [h('div', { class: 'empty' }, h('div', { class: 'big' }, '📊'),
        h('p', null, 'Ancora niente da mostrare ' + word + '. Aggiungi impegni, esercizi o pasti e i progressi compariranno qui, aggiornandosi da soli.'))];
    }
    // riepilogo
    var streak = L.streak(state, today);
    var hero = h('section', { class: 'card summary hero' },
      h('div', { class: 'sum-top' }, h('span', null, st.overallTotal ? st.overallDone + ' di ' + st.overallTotal + ' attività svolte' : 'Nessuna attività svolta in questo periodo'),
        h('span', { class: 'pct' }, pctText(st.overall))),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + (st.overall || 0) + '%' })));
    var bits = [];
    if (streak > 0) bits.push(h('span', { class: 'chip-s' }, '🔥 ' + streak + (streak === 1 ? ' giorno' : ' giorni') + ' di fila'));
    if (st.upcoming) bits.push(h('span', { class: 'chip-s' }, '🗓️ ' + st.upcoming + ' in programma'));
    if (st.burned) bits.push(h('span', { class: 'chip-s' }, '⚡ ' + nf.format(st.burned) + ' kcal spese'));
    if (st.goals.length) bits.push(h('span', { class: 'chip-s' }, '🎯 ' + st.goalsDone + '/' + st.goals.length + ' obiettivi'));
    if (bits.length) hero.append(h('div', { class: 'chips-s' }, bits));
    out.push(hero);

    // tre riquadri
    var f = st.food;
    out.push(h('div', { class: 'tiles' },
      statTile('impegno', st.impegno, st.impegno.total ? st.impegno.done + '/' + st.impegno.total : '–'),
      statTile('esercizio', st.esercizio, st.esercizio.total ? st.esercizio.done + '/' + st.esercizio.total : '–'),
      statTile('cibo', { pct: f.avgGoalKcal ? Math.min(100, Math.round(f.avgKcal / f.avgGoalKcal * 100)) : null }, f.activeDays ? 'media ' + nf.format(f.avgKcal) + ' kcal' : '–')));

    if (P === 'day') {
      var n = L.nutrition(state, ui.pdate);
      if (n.eaten.kcal || n.planned.kcal || n.burned) out.push(h('section', { class: 'card nutri', style: '--sec: var(--c-cibo)' },
        h('h3', { class: 'card-h' }, 'Alimentazione'), metric('Calorie', 'kcal', n.eaten.kcal, n.planned.kcal, n.goal.kcal, (n.burned ? 'Base ' + nf.format(n.base) + ' + ' + nf.format(n.burned) + ' da esercizi' : null)),
        metric('Proteine', 'g', n.eaten.protein, n.planned.protein, n.goal.protein)));
    } else {
      out.push(h('section', { class: 'card' },
        h('h3', { class: 'card-h' }, 'Attività svolte per giorno'), activityChart(st),
        h('p', { class: 'hint' }, 'Impegni ed esercizi insieme. Tocca un giorno per aprirlo.')));
      if (f.activeDays || st.series.some(function (r) { return r.cibo.planned; })) {
        out.push(h('section', { class: 'card', style: '--sec: var(--c-cibo)' },
          h('h3', { class: 'card-h' }, 'Kcal mangiate per giorno'), foodChart(st),
          h('p', { class: 'hint' }, 'La lineetta è il budget del giorno (base + kcal spese). Barra rossa: budget superato.')));
      }
    }
    // alimentazione in sintesi
    if (f.activeDays && P !== 'day') {
      out.push(h('section', { class: 'card stat-list', style: '--sec: var(--c-cibo)' },
        h('h3', { class: 'card-h' }, 'Alimentazione ' + word),
        statRow('Media giornaliera', nf.format(f.avgKcal) + ' kcal', 'budget medio ' + nf.format(f.avgGoalKcal)),
        statRow('Proteine medie', nf.format(f.avgProtein) + ' g', 'obiettivo ' + nf.format(state.settings.proteinGoal)),
        statRow('Giorni nel budget kcal', f.kcalOk + ' su ' + f.activeDays, null),
        statRow('Giorni con proteine raggiunte', f.proteinOk + ' su ' + f.activeDays, null),
        statRow('Totale mangiato', nf.format(f.totalKcal) + ' kcal', nf.format(f.totalProtein) + ' g di proteine')));
    }
    // obiettivi
    if (st.goals.length) {
      var box = h('section', { class: 'card stat-list' }, h('h3', { class: 'card-h' }, '🎯 Obiettivi'));
      st.goals.forEach(function (x) {
        var g = x.goal, p = x.progress;
        var txt = p.kind === 'amount' ? nf.format(p.total) + ' / ' + nf.format(p.target) + (g.unit ? ' ' + g.unit : '') : p.done + ' di ' + p.total;
        box.append(h('div', { class: 'goal-line', style: '--sec: var(--c-' + g.type + ')' },
          h('div', { class: 'gl-h' }, h('span', { class: 'gl-t' }, g.title + (P !== 'week' ? ' · ' + fmtDM.format(L.fromISO(g.week)) : '')), h('span', { class: 'gl-p' }, p.pct + '%' + (p.complete ? ' ✓' : ''))),
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + p.pct + '%' })),
          h('div', { class: 'tile-n' }, txt)));
      });
      out.push(box);
    }
    return out;
  }
  function statRow(label, value, sub) {
    return h('div', { class: 'stat-row' }, h('span', { class: 'sr-l' }, label), h('span', { class: 'sr-v' }, h('b', null, value), sub ? h('small', null, sub) : null));
  }

  /* ---------- vista giorno ---------- */
  function dayView() {
    var items = L.itemsFor(state, ui.sec, ui.date);
    var out = [];
    if (ui.sec === 'cibo') out.push(nutritionCard(ui.date));
    else if (items.length) out.push(progressCard(items));
    out.push(goalsBlock());
    if (!items.length) {
      out.push(h('div', { class: 'empty' },
        h('div', { class: 'big' }, SECTIONS[ui.sec].icon),
        h('p', null, SECTIONS[ui.sec].empty),
        h('p', { class: 'hint' }, 'Tocca + per aggiungerne uno, oppure 🎙️ per dettarlo.')));
    } else {
      out.push(h('ul', { class: 'list' }, items.map(function (it) { return itemRow(it, false); })));
    }
    return out;
  }

  function progressCard(items) {
    var pct = L.completion(items);
    return h('section', { class: 'card summary' },
      h('div', { class: 'sum-top' }, h('strong', null, L.doneCount(items) + ' di ' + items.length + ' completati'), h('span', { class: 'pct' }, pct + '%')),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + pct + '%' })));
  }

  function metric(label, unit, eaten, planned, goal, note) {
    var rem = Math.round((goal - eaten) * 10) / 10;
    var pe = goal ? Math.min(100, eaten / goal * 100) : 0;
    var pp = goal ? Math.min(100, planned / goal * 100) : 0;
    return h('div', { class: 'metric' },
      h('div', { class: 'm-head' }, h('span', { class: 'm-label' }, label), h('span', null, h('b', null, nf.format(eaten)), ' / ' + nf.format(goal) + ' ' + unit)),
      note ? h('div', { class: 'm-note' }, note) : null,
      h('div', { class: 'bar stacked', 'aria-hidden': 'true' }, h('i', { class: 'planned', style: 'width:' + pp + '%' }), h('i', { style: 'width:' + pe + '%' })),
      h('div', { class: 'm-foot' + (rem < 0 ? ' over' : '') },
        rem >= 0 ? ['Rimangono ', h('b', null, nf.format(rem)), ' ' + unit] : ['Superato di ', h('b', null, nf.format(-rem)), ' ' + unit]));
  }

  function nutritionCard(date) {
    var n = L.nutrition(state, date);
    var card = h('section', { class: 'card nutri' });
    if (!n.base && !n.goal.protein && !n.burned) {
      card.append(h('p', null, 'Imposta il tuo obiettivo giornaliero di kcal e proteine per vedere quanto ti rimane.'),
        h('div', { class: 'nutri-foot' }, h('button', { type: 'button', class: 'link', onclick: openSettings }, 'Imposta obiettivo')));
      return card;
    }
    var note = (n.burned || n.burnPlanned) ? 'Base ' + nf.format(n.base) + ' + ' + nf.format(n.burned) + ' da esercizi svolti' : null;
    card.append(metric('Calorie', 'kcal', n.eaten.kcal, n.planned.kcal, n.goal.kcal, note));
    card.append(metric('Proteine', 'g', n.eaten.protein, n.planned.protein, n.goal.protein));
    if (n.planned.kcal > n.eaten.kcal || n.planned.protein > n.eaten.protein || n.burnPlanned > n.burned) {
      var parts = ['pasti ' + nf.format(n.planned.kcal) + ' kcal · ' + nf.format(n.planned.protein) + ' g'];
      if (n.burnPlanned > 0) parts.push('esercizi +' + nf.format(n.burnPlanned) + ' kcal');
      var k = n.remainingPlanned.kcal, pr = n.remainingPlanned.protein;
      card.append(h('p', { class: 'hint' }, 'Con tutto il pianificato (' + parts.join(', ') + ') ' +
        (k >= 0 ? 'resterebbero ' + nf.format(k) + ' kcal' : 'supereresti di ' + nf.format(-k) + ' kcal') +
        (pr >= 0 ? ' e ' + nf.format(pr) + ' g di proteine.' : ' e avresti ' + nf.format(-pr) + ' g di proteine in più.')));
    }
    card.append(h('div', { class: 'nutri-foot' }, h('button', { type: 'button', class: 'link', onclick: openSettings }, 'Modifica obiettivo')));
    return card;
  }

  /* ---------- voci ---------- */
  function leftControl(it) {
    var done = it.progress >= 100;
    function flip() { L.toggle(it); persist(); render(); }
    if (it.mode === 'percent') {
      return h('button', {
        type: 'button', class: 'ring' + (done ? ' done' : ''), style: '--p:' + it.progress,
        'aria-label': 'Avanzamento ' + it.progress + '%. Tocca per ' + (done ? 'azzerare' : 'completare'), onclick: flip
      }, h('span', null, it.progress + '%'));
    }
    return h('button', {
      type: 'button', class: 'chk' + (done ? ' on' : ''), role: 'checkbox', 'aria-checked': done ? 'true' : 'false',
      'aria-label': (done ? 'Completato: ' : 'Da fare: ') + it.title, onclick: flip
    }, svgCheck());
  }

  function tagsFor(it, compact) {
    var tags = [];
    if (it.time) tags.push(h('span', { class: 'tag' }, (it.alarm ? '🔔 ' : '⏰ ') + it.time));
    if (it.type === 'cibo' && (it.kcal || it.protein)) tags.push(h('span', { class: 'tag' }, nf.format(it.kcal) + ' kcal · ' + nf.format(it.protein) + ' g prot'));
    if (it.type === 'esercizio' && it.burn) tags.push(h('span', { class: 'tag' }, '🔥 ' + nf.format(it.burn) + ' kcal'));
    if (it.gid) {
      var gl = state.goals.find(function (x) { return x.id === it.gid; });
      if (gl) tags.push(h('span', { class: 'tag goal-tag', title: 'Obiettivo settimanale' }, '🎯 ' + gl.title));
    }
    if (it.carried > 0) {
      var was = it.origDate ? 'Previsto il ' + fmtDM.format(L.fromISO(it.origDate)) : 'Riportato';
      tags.push(h('span', { class: 'tag warn', title: was }, '↻ riportato' + (compact ? '' : ' · ' + was.toLowerCase())));
    }
    if (it.rid) tags.push(h('span', { class: 'tag', title: 'Si ripete' }, '🔁'));
    if (compact && it.photos.length) tags.push(h('span', { class: 'tag' }, '📷 ' + it.photos.length));
    return tags;
  }

  function itemRow(it, compact) {
    var done = it.progress >= 100;
    var left = leftControl(it);
    var body = h('div', {
      class: 'item-body', role: 'button', tabindex: '0',
      onclick: function () { openEditor(it); },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditor(it); } }
    }, h('div', { class: 'title' + (done ? ' done' : '') }, it.title), h('div', { class: 'meta' }, tagsFor(it, compact)));
    var li = h('li', { class: 'item' + (compact ? ' compact' : '') }, h('div', { class: 'item-main' }, left, body));
    if (!compact) {
      if (it.mode === 'percent') {
        li.append(h('input', {
          type: 'range', min: '0', max: '100', step: '5', value: it.progress, class: 'range', 'aria-label': 'Percentuale di completamento',
          oninput: function (e) {
            var v = Number(e.target.value);
            left.style.setProperty('--p', v);
            if (left.firstChild) left.firstChild.textContent = v + '%';
          },
          onchange: function (e) { it.progress = Number(e.target.value); persist(); render(); }
        }));
      }
      if (it.photos.length) {
        li.append(h('div', { class: 'thumbs' },
          it.photos.slice(0, 4).map(function (id) {
            var im = thumb(id, 'thumb'); im.addEventListener('click', function () { viewPhoto(id); }); return im;
          }),
          it.photos.length > 4 ? h('span', { class: 'more' }, '+' + (it.photos.length - 4)) : null));
      }
    }
    return li;
  }

  /* ---------- vista settimana ---------- */
  function weekView() {
    var start = L.startOfWeek(ui.date), st = L.weekStats(state, ui.sec, start), out = [];
    if (ui.sec === 'cibo') {
      out.push(h('section', { class: 'card summary' },
        h('div', { class: 'sum-top' }, h('strong', null, 'Media giornaliera'),
          h('span', { class: 'pct' }, st.activeDays ? nf.format(st.avgKcal) + ' kcal' : '—')),
        h('p', { class: 'hint', style: 'margin-top:6px' }, st.activeDays
          ? 'Proteine: ' + nf.format(st.avgProtein) + ' g/giorno · base ' + nf.format(state.settings.kcalGoal) + ' kcal (+ esercizi) e ' + nf.format(state.settings.proteinGoal) + ' g (su ' + st.activeDays + (st.activeDays === 1 ? ' giorno' : ' giorni') + ' con pasti consumati)'
          : 'Ancora nessun pasto consumato in questa settimana.')));
    } else if (st.total) {
      out.push(h('section', { class: 'card summary' },
        h('div', { class: 'sum-top' }, h('strong', null, st.done + ' di ' + st.total + ' completati'), h('span', { class: 'pct' }, st.pct + '%')),
        h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + st.pct + '%' }))));
    }
    out.push(goalsBlock());
    var days = [];
    for (var i = 0; i < 7; i++) days.push(dayCard(L.addDays(start, i)));
    out.push(h('div', { class: 'week' }, days));
    return out;
  }

  function dayCard(iso) {
    var items = L.itemsFor(state, ui.sec, iso), isToday = iso === todayISO(), sum, bar = null;
    if (ui.sec === 'cibo') {
      var n = L.nutrition(state, iso);
      sum = items.length ? nf.format(n.eaten.kcal) + ' / ' + nf.format(n.goal.kcal) + ' kcal · ' + nf.format(n.eaten.protein) + ' g' : '';
      if (items.length && n.goal.kcal) bar = h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.min(100, n.eaten.kcal / n.goal.kcal * 100) + '%' }));
    } else {
      var pct = L.completion(items);
      sum = items.length ? L.doneCount(items) + '/' + items.length + ' · ' + pct + '%' : '';
      if (items.length) bar = h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + pct + '%' }));
    }
    return h('section', { class: 'card day' + (isToday ? ' today' : '') },
      h('div', { class: 'day-head' },
        h('button', { type: 'button', class: 'day-name', onclick: function () { ui.date = iso; ui.view = 'day'; render(); } }, cap(fmtShort.format(L.fromISO(iso)))),
        h('span', { class: 'day-sum' }, sum),
        h('button', { type: 'button', class: 'day-add', 'aria-label': 'Aggiungi il ' + fmtLong.format(L.fromISO(iso)), onclick: function () { openEditor(null, { date: iso }); } }, '+')),
      bar,
      items.length ? h('ul', { class: 'list' }, items.map(function (it) { return itemRow(it, true); })) : h('p', { class: 'none' }, '—'));
  }

  /* =========================================================
     Overlay: sheet, dialog, viewer
     ========================================================= */
  var sheetCleanup = null;
  function openSheet(content, onClose) {
    var root = $('#sheet');
    root.replaceChildren(h('div', { class: 'backdrop', onclick: closeSheet }), h('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true' }, content));
    root.hidden = false; document.body.classList.add('noscroll');
    sheetCleanup = onClose || null;
    var panel = $('.panel', root); if (panel) panel.scrollTop = 0;
  }
  function closeSheet() {
    var root = $('#sheet');
    root.hidden = true; root.replaceChildren(); document.body.classList.remove('noscroll');
    document.body.dataset.sec = ui.sec;
    var c = sheetCleanup; sheetCleanup = null;
    if (c) c();
  }
  function closeOverlays() {
    closeSheet();
    var d = $('#dialog'); d.hidden = true; d.replaceChildren();
    var v = $('#viewer'); v.hidden = true; v.replaceChildren();
  }

  function choose(message, buttons) {
    return new Promise(function (res) {
      var root = $('#dialog');
      function done(v) { root.hidden = true; root.replaceChildren(); res(v); }
      root.replaceChildren(
        h('div', { class: 'backdrop', onclick: function () { done(null); } }),
        h('div', { class: 'dialog', role: 'alertdialog' },
          h('p', null, message),
          h('div', { class: 'dlg-btns' }, buttons.map(function (b) {
            return h('button', { type: 'button', class: 'btn ' + (b.kind || ''), onclick: function () { done(b.value); } }, b.label);
          }))));
      root.hidden = false;
    });
  }

  function viewPhoto(id) {
    var root = $('#viewer');
    var img = h('img', { alt: 'Foto' });
    photoURL(id).then(function (u) { if (u) img.src = u; });
    function close() { root.hidden = true; root.replaceChildren(); }
    root.replaceChildren(img, h('button', { type: 'button', 'aria-label': 'Chiudi', onclick: close }, '✕'));
    root.onclick = function (e) { if (e.target === root || e.target === img) close(); };
    root.hidden = false;
  }

  /* =========================================================
     Editor di una voce
     ========================================================= */
  function chips(options, value, onchange) {
    var cur = value;
    var el = h('div', { class: 'chips', role: 'radiogroup' });
    function paint() {
      el.replaceChildren.apply(el, options.map(function (o) {
        return h('button', {
          type: 'button', class: 'chip' + (o.value === cur ? ' on' : ''), role: 'radio', 'aria-checked': o.value === cur ? 'true' : 'false',
          onclick: function () { cur = o.value; paint(); if (onchange) onchange(cur); }
        }, o.label);
      }));
    }
    paint();
    return { el: el, get: function () { return cur; } };
  }

  function field(label, control, extra) {
    return h('div', { class: 'field' }, h('label', null, label), control, extra || null);
  }

  function openEditor(existing, defaults) {
    defaults = defaults || {};
    var isNew = !existing;
    var base = existing || L.makeItem(Object.assign({ type: ui.sec, date: ui.date }, defaults));
    var it = Object.assign({}, base, { photos: base.photos.slice() });
    var tpl = it.rid ? state.templates.find(function (t) { return t.id === it.rid; }) : null;
    var added = [], removed = [], saved = false;
    var memory = L.mealMemory(state);

    var typeC = chips(Object.keys(SECTIONS).map(function (k) { return { value: k, label: SECTIONS[k].icon + ' ' + SECTIONS[k].label }; }), it.type, onType);
    var fTitle = h('input', { type: 'text', placeholder: 'Titolo', value: it.title, autocomplete: 'off', enterkeyhint: 'done', maxlength: '120', 'aria-label': 'Titolo' });
    var fDate = h('input', { type: 'date', value: it.date, 'aria-label': 'Data' });
    var fTime = h('input', { type: 'time', value: it.time, 'aria-label': 'Ora di inizio' });
    var fAlarm = h('input', { type: 'checkbox', 'aria-label': 'Avvisami' });
    fAlarm.checked = !!it.alarm && !!it.time;
    var alarmRow = h('label', { class: 'check' }, fAlarm, h('span', null, "Avvisami all'ora di inizio"));
    var modeC = chips([{ value: 'check', label: '✓ Spunta' }, { value: 'percent', label: '% Percentuale' }], it.mode);
    var fKcal = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '1', placeholder: '0', value: it.kcal || '', 'aria-label': 'Calorie' });
    var fProt = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.5', placeholder: '0', value: it.protein || '', 'aria-label': 'Proteine in grammi' });
    var fBurn = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '10', placeholder: '0', value: it.burn || '', 'aria-label': 'Calorie spese' });
    var fNote = h('textarea', { rows: '2', placeholder: 'Note (facoltativo)', 'aria-label': 'Note' });
    fNote.value = it.note || '';
    var fRepeat = tpl ? null : h('select', { 'aria-label': 'Ripetizione', value: 'none' },
      h('option', { value: 'none' }, 'Non si ripete'), h('option', { value: 'daily' }, 'Ogni giorno'), h('option', { value: 'weekly' }, 'Ogni settimana'));
    var mealList = h('datalist', { id: 'meal-list' }, Object.keys(memory).map(function (k) { return h('option', { value: memory[k].title }); }));

    var foodBox = h('div', { class: 'row2' }, field('Calorie (kcal)', fKcal), field('Proteine (g)', fProt));
    var burnBox = field('Calorie spese (kcal)', fBurn, h('p', { class: 'hint' }, 'Quando lo completi, si sommano alle kcal del giorno nella sezione Cibo.'));
    var icsBtn = h('button', { type: 'button', class: 'link', onclick: exportICS }, '📅 Aggiungi al calendario del telefono (.ics)');
    var icsHint = h('p', { class: 'hint' }, 'Con l\'app chiusa Android può ritardare gli avvisi di una web app: il calendario li consegna in modo più affidabile.');
    var icsBox = h('div', { class: 'field' }, icsBtn, icsHint);

    function syncTime() {
      var has = !!fTime.value;
      fAlarm.disabled = !has;
      if (!has) fAlarm.checked = false;
      alarmRow.classList.toggle('off', !has);
      icsBox.hidden = !has;
    }
    function onType(t) {
      document.body.dataset.sec = t;
      foodBox.hidden = t !== 'cibo';
      burnBox.hidden = t !== 'esercizio';
      if (t === 'cibo') fTitle.setAttribute('list', 'meal-list'); else fTitle.removeAttribute('list');
    }
    fTime.addEventListener('input', syncTime);
    fTime.addEventListener('change', syncTime);
    fTitle.addEventListener('change', function () {
      if (typeC.get() !== 'cibo' || fKcal.value || fProt.value) return;
      var m = memory[fTitle.value.trim().toLowerCase()];
      if (m) { fKcal.value = m.kcal || ''; fProt.value = m.protein || ''; }
    });

    var photoBox = h('div', { class: 'photos' });
    var fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    fileInput.addEventListener('change', async function () {
      var files = Array.prototype.slice.call(fileInput.files || []);
      fileInput.value = '';
      for (var i = 0; i < files.length; i++) {
        try {
          var blob = await compress(files[i]);
          var id = L.uid();
          await putPhoto(id, blob);
          it.photos.push(id); added.push(id);
        } catch (e) { console.error(e); toast('Non sono riuscito ad aggiungere una foto', 3500); }
      }
      paintPhotos();
    });
    function removePhoto(id) {
      it.photos = it.photos.filter(function (p) { return p !== id; });
      var ai = added.indexOf(id);
      if (ai >= 0) { added.splice(ai, 1); dropPhoto(id); } else removed.push(id);
      paintPhotos();
    }
    function paintPhotos() {
      photoBox.replaceChildren.apply(photoBox, it.photos.map(function (id) {
        var im = thumb(id, 'thumb'); im.addEventListener('click', function () { viewPhoto(id); });
        return h('div', { class: 'ph' }, im, h('button', { type: 'button', class: 'ph-x', 'aria-label': 'Rimuovi foto', onclick: function () { removePhoto(id); } }, '×'));
      }).concat([h('button', { type: 'button', class: 'ph-add', onclick: function () { fileInput.click(); } }, '+ Foto')]));
    }

    function read() {
      var type = typeC.get();
      return {
        id: it.id, type: type, title: fTitle.value.trim(), date: fDate.value || it.date, time: fTime.value || '',
        alarm: !!fTime.value && fAlarm.checked, mode: modeC.get(),
        progress: it.progress, kcal: type === 'cibo' ? fKcal.value : 0, protein: type === 'cibo' ? fProt.value : 0,
        burn: type === 'esercizio' ? fBurn.value : 0, gid: it.gid, sid: it.sid,
        note: fNote.value.trim(), photos: it.photos.slice(), rid: it.rid, carried: it.carried, origDate: it.origDate, created: it.created
      };
    }

    function exportICS() {
      var v = L.makeItem(read());
      if (!v.title) { toast('Scrivi prima un titolo'); fTitle.focus(); return; }
      if (!v.time) return;
      var rep = tpl ? tpl.repeat : (fRepeat ? fRepeat.value : 'none');
      download(new Blob([L.toICS(v, rep)], { type: 'text/calendar' }), v.title.replace(/[^\w\-]+/g, '_').slice(0, 40) + '.ics');
    }

    function onSave() {
      var vals = read();
      if (!vals.title) { toast('Scrivi un titolo'); fTitle.focus(); return; }
      var next = L.makeItem(vals);
      if (isNew) state.items.push(next);
      else {
        var idx = state.items.findIndex(function (x) { return x.id === existing.id; });
        if (idx >= 0) state.items[idx] = next; else state.items.push(next);
      }
      var rep = fRepeat ? fRepeat.value : 'none';
      if (rep !== 'none' && !tpl) L.makeRecurring(state, next, rep);
      L.materialize(state, todayISO());
      removed.forEach(dropPhoto);
      saved = true;
      persist(); closeSheet(); render();
      if (next.alarm) ensureNotifPermission().then(function (p) {
        if (p === 'denied') toast('Notifiche bloccate: le sveglie compariranno solo con l\'app aperta', 4500);
      });
    }

    async function onDelete() {
      var scope = 'one';
      if (tpl) {
        var c = await choose('Eliminare «' + it.title + '»?', [
          { label: 'Solo questo', value: 'one', kind: 'danger' },
          { label: 'Questo e i successivi', value: 'series', kind: 'danger' },
          { label: 'Annulla', value: null, kind: 'ghost' }]);
        if (!c) return; scope = c;
      } else {
        var ok = await choose('Eliminare «' + it.title + '»?', [{ label: 'Elimina', value: 'yes', kind: 'danger' }, { label: 'Annulla', value: null, kind: 'ghost' }]);
        if (!ok) return;
      }
      L.removeItem(state, existing.id, scope).forEach(function (r) { r.photos.forEach(dropPhoto); });
      persist(); closeSheet(); render();
    }

    var heard = defaults._heard ? h('p', { class: 'heard' }, 'Ho capito: «' + defaults._heard + '». Controlla e correggi se serve.') : null;
    var repeatBlock = tpl
      ? h('p', { class: 'hint', style: 'margin-bottom:14px' }, '🔁 Si ripete ' + (tpl.repeat === 'daily' ? 'ogni giorno' : 'ogni settimana') + '. Le modifiche valgono solo per questa occorrenza.')
      : field('Ripetizione', fRepeat);

    var linkedGoal = it.gid ? state.goals.find(function (x) { return x.id === it.gid; }) : null;
    var goalHint = linkedGoal ? h('p', { class: 'hint', style: 'margin:-6px 0 14px' }, '🎯 Fa parte dell\'obiettivo settimanale «' + linkedGoal.title + '».') : null;

    var content = h('div', null,
      h('h2', null, isNew ? 'Nuova voce' : 'Modifica'),
      heard,
      h('div', { class: 'field' }, typeC.el),
      field('Titolo', fTitle),
      goalHint,
      h('div', { class: 'row2' }, field('Data', fDate), field('Ora di inizio (facoltativa)', fTime)),
      h('div', { class: 'field' }, alarmRow),
      icsBox,
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Come lo segno?'), modeC.el),
      foodBox,
      burnBox,
      repeatBlock,
      field('Note', fNote),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Foto'), photoBox, fileInput),
      mealList,
      h('div', { class: 'actions' },
        isNew ? null : h('button', { type: 'button', class: 'btn danger', onclick: onDelete }, 'Elimina'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn ghost', onclick: closeSheet }, 'Annulla'),
        h('button', { type: 'button', class: 'btn primary', onclick: onSave }, 'Salva')));

    openSheet(content, function () { if (!saved) added.forEach(function (id) { dropPhoto(id); }); });
    document.body.dataset.sec = it.type;
    onType(typeC.get()); syncTime(); paintPhotos();
    if (isNew && !defaults._heard) setTimeout(function () { try { fTitle.focus(); } catch (e) { /* ignore */ } }, 50);
  }

  /* =========================================================
     Download / backup
     ========================================================= */
  function download(blob, name) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function blobToDataURL(b) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
      r.readAsDataURL(b);
    });
  }
  function dataURLToBlob(u) { return fetch(u).then(function (r) { return r.blob(); }); }

  async function exportBackup() {
    try {
      var photos = {}, ids = {};
      state.items.forEach(function (i) { i.photos.forEach(function (p) { ids[p] = true; }); });
      var keys = Object.keys(ids);
      for (var i = 0; i < keys.length; i++) {
        var b = await getPhoto(keys[i]);
        if (b) photos[keys[i]] = await blobToDataURL(b);
      }
      var data = { app: 'agenda', version: 1, exportedAt: new Date().toISOString(), state: state, photos: photos };
      download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'agenda-backup-' + todayISO() + '.json');
      toast('Backup scaricato: conservalo in un posto privato');
    } catch (e) { console.error(e); toast('Backup non riuscito', 3500); }
  }

  async function importBackup(file) {
    var data;
    try { data = JSON.parse(await file.text()); } catch (e) { toast('File non valido'); return; }
    if (!data || data.app !== 'agenda' || !data.state || !Array.isArray(data.state.items)) { toast('Questo non sembra un backup di Agenda', 3500); return; }
    var ok = await choose('Sostituire tutti i dati attuali con quelli del backup?', [{ label: 'Sostituisci', value: 'yes', kind: 'danger' }, { label: 'Annulla', value: null, kind: 'ghost' }]);
    if (!ok) return;
    try {
      await clearPhotos();
      urlCache.forEach(function (u) { URL.revokeObjectURL(u); }); urlCache.clear();
      var ids = Object.keys(data.photos || {});
      for (var i = 0; i < ids.length; i++) {
        try { await putPhoto(ids[i], await dataURLToBlob(data.photos[ids[i]])); } catch (e) { /* salta la foto */ }
      }
      state = L.migrate(data.state);
      maintain(); persist(); closeSheet(); render();
      toast('Backup importato');
    } catch (e) { console.error(e); toast('Importazione non riuscita', 3500); }
  }

  async function resetAll() {
    var ok = await choose('Cancellare TUTTI i dati (impegni, pasti, foto)? Non si può annullare.', [{ label: 'Cancella tutto', value: 'yes', kind: 'danger' }, { label: 'Annulla', value: null, kind: 'ghost' }]);
    if (!ok) return;
    await clearPhotos().catch(function () { /* ignore */ });
    urlCache.forEach(function (u) { URL.revokeObjectURL(u); }); urlCache.clear();
    var keepGoals = state.settings;
    state = L.emptyState(); state.settings = keepGoals;
    persist(); closeSheet(); render(); toast('Dati cancellati');
  }

  /* =========================================================
     PIN
     ========================================================= */
  function bytesToB64(b) { return btoa(String.fromCharCode.apply(null, Array.prototype.slice.call(b))); }
  function b64ToBytes(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function hashPin(pin, saltB64) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']).then(function (key) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: 150000, hash: 'SHA-256' }, key, 256);
    }).then(function (bits) { return bytesToB64(new Uint8Array(bits)); });
  }
  function newPinRecord(pin) {
    var salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
    return hashPin(pin, salt).then(function (hash) { return { salt: salt, hash: hash }; });
  }
  function checkPin(pin) {
    if (!meta.pin) return Promise.resolve(false);
    return hashPin(pin, meta.pin.salt).then(function (hh) { return hh === meta.pin.hash; });
  }

  function pinPad(opts) {
    var root = $('#lock'), value = '', resolver = null;
    var dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
    var err = h('p', { class: 'lock-err', role: 'alert' });
    var title = h('h2', null, opts.title || ''); var sub = h('p', { class: 'lock-sub' }, opts.sub || '');
    function paint() {
      dots.replaceChildren();
      for (var i = 0; i < Math.max(4, value.length); i++) dots.append(h('i', { class: i < value.length ? 'on' : '' }));
    }
    function press(d) { if (value.length < 8) { value += d; paint(); err.textContent = ''; } }
    function back() { value = value.slice(0, -1); paint(); }
    function submit() {
      if (value.length < 4) { err.textContent = 'Almeno 4 cifre'; return; }
      if (resolver) { var r = resolver; resolver = null; r(value); }
    }
    function cancel() { if (resolver) { var r = resolver; resolver = null; r(null); } }
    function onKey(e) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape' && opts.cancel) cancel();
    }
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
    var pad = h('div', { class: 'keypad' }, keys.map(function (k) {
      return h('button', {
        type: 'button', class: 'key' + (k === '✓' ? ' ok' : ''), 'aria-label': k === '⌫' ? 'Cancella' : k === '✓' ? 'Conferma' : k,
        onclick: function () { if (k === '⌫') back(); else if (k === '✓') submit(); else press(k); }
      }, k);
    }));
    root.replaceChildren(h('div', { class: 'lock-box' }, h('div', { class: 'lock-ico' }, '🔒'), title, sub, dots, err, pad,
      opts.cancel ? h('button', { type: 'button', class: 'link', onclick: cancel }, 'Annulla') : null));
    root.hidden = false;
    document.addEventListener('keydown', onKey);
    paint();
    return {
      next: function () { return new Promise(function (r) { resolver = r; }); },
      setTitle: function (t) { title.textContent = t; },
      setSub: function (t) { sub.textContent = t; },
      setError: function (t) { err.textContent = t; },
      clear: function () { value = ''; paint(); },
      close: function () { root.hidden = true; root.replaceChildren(); document.removeEventListener('keydown', onKey); }
    };
  }

  var locked = false;
  async function lockNow() {
    if (!meta.pin || locked) return;
    locked = true;
    closeOverlays();
    $('#app').hidden = true;
    var pad = pinPad({ title: 'Agenda bloccata', sub: 'Inserisci il PIN', cancel: false });
    for (;;) {
      var pin = await pad.next();
      var wait = Math.ceil((meta.fails.until - Date.now()) / 1000);
      if (wait > 0) { pad.setError('Troppi tentativi. Riprova tra ' + wait + ' s'); pad.clear(); continue; }
      if (await checkPin(pin)) { meta.fails = { n: 0, until: 0 }; saveMeta(); break; }
      meta.fails.n++;
      var delay = meta.fails.n >= 5 ? Math.min(300, 15 * Math.pow(2, meta.fails.n - 5)) : 0;
      meta.fails.until = delay ? Date.now() + delay * 1000 : 0;
      saveMeta();
      pad.setError(delay ? 'PIN errato. Riprova tra ' + delay + ' s' : 'PIN errato');
      pad.clear();
    }
    pad.close();
    locked = false;
    $('#app').hidden = false;
    tick();
  }

  async function verifyCurrentPin() {
    var pad = pinPad({ title: 'PIN attuale', sub: '', cancel: true });
    for (;;) {
      var pin = await pad.next();
      if (pin === null) { pad.close(); return false; }
      if (await checkPin(pin)) { pad.close(); return true; }
      pad.setError('PIN errato'); pad.clear();
    }
  }

  async function setNewPin() {
    if (!(window.crypto && crypto.subtle)) { toast('Il PIN richiede una connessione sicura (https).', 4500); return false; }
    var pad = pinPad({ title: 'Scegli un PIN', sub: 'Da 4 a 8 cifre', cancel: true });
    for (;;) {
      var p1 = await pad.next();
      if (p1 === null) { pad.close(); return false; }
      pad.setTitle('Ripeti il PIN'); pad.setSub(''); pad.clear();
      var p2 = await pad.next();
      if (p2 === null) { pad.close(); return false; }
      if (p1 === p2) {
        meta.pin = await newPinRecord(p1); meta.fails = { n: 0, until: 0 }; saveMeta();
        pad.close(); toast('PIN impostato'); return true;
      }
      pad.setTitle('Scegli un PIN'); pad.setSub('Da 4 a 8 cifre'); pad.setError('I PIN non coincidono'); pad.clear();
    }
  }

  /* =========================================================
     Notifiche e sveglie
     ========================================================= */
  function notifSupport() { return 'Notification' in window; }
  function ensureNotifPermission() {
    if (!notifSupport()) return Promise.resolve('unsupported');
    if (Notification.permission === 'default') {
      try { return Promise.resolve(Notification.requestPermission()).then(function (p) { return p || Notification.permission; }); }
      catch (e) { return Promise.resolve(Notification.permission); }
    }
    return Promise.resolve(Notification.permission);
  }

  async function systemNotify(title, body, tag) {
    if (!notifSupport() || Notification.permission !== 'granted') return false;
    try {
      var reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, { body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [200, 100, 200], requireInteraction: true });
        return true;
      }
      new Notification(title, { body: body, tag: tag, icon: 'icons/icon-192.png' });
      return true;
    } catch (e) { return false; }
  }

  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08; o.start();
      setTimeout(function () { try { o.stop(); ctx.close(); } catch (e) { /* ignore */ } }, 350);
    } catch (e) { /* ignore */ }
  }

  function showAlert(title, body, item) {
    var root = $('#alerts');
    var el = h('div', { class: 'alert', role: 'alert' },
      h('div', { class: 'txt' }, h('b', null, title), h('span', null, body)),
      item ? h('button', { type: 'button', onclick: function () { item.progress = 100; persist(); el.remove(); render(); } }, 'Fatto') : null,
      h('button', { type: 'button', class: 'x', 'aria-label': 'Chiudi', onclick: function () { el.remove(); } }, '✕'));
    root.append(el);
  }

  function fireAlarm(it) {
    var icon = it.type === 'cibo' ? '🍽️ ' : it.type === 'esercizio' ? '🏃 ' : '🗓️ ';
    var now = new Date(), late = now.getHours() * 60 + now.getMinutes() - L.minutesOf(it.time);
    var body = late > 2 ? 'Previsto alle ' + it.time : 'Inizia ora (' + it.time + ')';
    showAlert(icon + it.title, body, it);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    beep();
    systemNotify(icon + it.title, body, L.alarmKey(it));
  }

  function checkAlarms() {
    var now = new Date();
    var due = L.dueAlarms(state, now, meta.fired);
    if (!due.length) return;
    due.forEach(function (it) { meta.fired[L.alarmKey(it)] = Date.now(); fireAlarm(it); });
    L.pruneFired(meta.fired, L.toISO(now));
    saveMeta();
  }

  var lastDay = todayISO();
  function tick() {
    var t = todayISO();
    if (t !== lastDay) {
      var wasToday = ui.date === lastDay;
      lastDay = t;
      if (wasToday) ui.date = t;
      var r = maintain();
      render();
      movedToast(r.moved);
    }
    checkAlarms();
  }

  /* =========================================================
     Dettatura vocale
     ========================================================= */
  function startDictation() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('La dettatura non è disponibile su questo browser. Usa Chrome su Android.', 4500); return; }
    var rec = new SR();
    rec.lang = 'it-IT'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    var finalText = '', cancelled = false, errored = false;
    var root = $('#dialog');
    var live = h('p', { class: 'dict-live' }, 'Parla ora…');
    function close() { root.hidden = true; root.replaceChildren(); }
    function cancel() { cancelled = true; try { rec.abort(); } catch (e) { /* ignore */ } close(); }
    root.replaceChildren(
      h('div', { class: 'backdrop', onclick: cancel }),
      h('div', { class: 'dialog mic' },
        h('div', { class: 'pulse' }, '🎙️'),
        h('p', { class: 'dict-title' }, 'Sto ascoltando…'),
        live,
        h('p', { class: 'hint' }, 'Es.: «domani alle 9 e mezza dentista» oppure «pranzo 650 kcal 45 g di proteine»'),
        h('div', { class: 'dlg-btns' },
          h('button', { type: 'button', class: 'btn primary', onclick: function () { try { rec.stop(); } catch (e) { /* ignore */ } } }, 'Ho finito'),
          h('button', { type: 'button', class: 'btn ghost', onclick: cancel }, 'Annulla'))));
    root.hidden = false;
    rec.onresult = function (e) {
      var txt = '';
      for (var i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript + ' ';
      finalText = txt.trim();
      live.textContent = finalText || '…';
    };
    rec.onerror = function (e) {
      if (e.error === 'aborted') return;
      errored = true;
      var msgs = {
        'not-allowed': 'Permesso microfono negato: abilitalo nelle impostazioni del sito.',
        'service-not-allowed': 'Dettatura non consentita su questo dispositivo.',
        'no-speech': 'Non ho sentito nulla.',
        'network': 'Serve la connessione internet per la dettatura.',
        'audio-capture': 'Microfono non disponibile.'
      };
      toast(msgs[e.error] || 'Errore di dettatura (' + e.error + ')', 4500);
    };
    rec.onend = function () {
      close();
      if (cancelled || errored) return;
      if (!finalText) { toast('Non ho sentito nulla'); return; }
      var parsed = L.parseDictation(finalText, { today: todayISO(), date: ui.date, type: ui.sec });
      parsed._heard = finalText;
      openEditor(null, parsed);
    };
    try { rec.start(); } catch (e) { close(); toast('Impossibile avviare il microfono'); }
  }

  /* =========================================================
     Obiettivi settimanali
     ========================================================= */
  var DAYLETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  function shortNum(v) { return v >= 1000 ? nf.format(Math.round(v / 100) / 10) + 'k' : nf.format(v); }
  function dayWord(iso) {
    var d = L.diffDays(todayISO(), iso);
    return d === 0 ? 'oggi' : d === -1 ? 'ieri' : d === 1 ? 'domani' : fmtShort.format(L.fromISO(iso));
  }
  function inWeek(g, iso) { return iso >= g.week && iso <= L.addDays(g.week, 6); }

  function askDate(message, min, max, value) {
    return new Promise(function (res) {
      var root = $('#dialog');
      var inp = h('input', { type: 'date', min: min, max: max, value: value, 'aria-label': 'Data' });
      function done(v) { root.hidden = true; root.replaceChildren(); res(v); }
      root.replaceChildren(
        h('div', { class: 'backdrop', onclick: function () { done(null); } }),
        h('div', { class: 'dialog', role: 'dialog' },
          h('p', null, message), h('div', { class: 'field' }, inp),
          h('div', { class: 'dlg-btns' },
            h('button', { type: 'button', class: 'btn primary', onclick: function () { done(inp.value && inp.value >= min && inp.value <= max ? inp.value : null); } }, 'Pianifica'),
            h('button', { type: 'button', class: 'btn ghost', onclick: function () { done(null); } }, 'Annulla'))));
      root.hidden = false;
    });
  }

  function goalsBlock() {
    var goals = L.goalsFor(state, ui.sec, ui.date);
    var wrap = h('section', { class: 'goals' },
      h('div', { class: 'goals-head' },
        h('h2', null, '🎯 Obiettivi della settimana'),
        h('button', { type: 'button', class: 'link', onclick: function () { openGoalEditor(null); } }, '+ Nuovo')));
    if (!goals.length) wrap.append(h('p', { class: 'hint' }, 'Nessun obiettivo per questa settimana.'));
    goals.forEach(function (g) { wrap.append(goalCard(g)); });
    return wrap;
  }

  function goalCard(g) {
    var p = L.goalProgress(state, g), date = ui.date;
    var summary = p.kind === 'amount'
      ? nf.format(p.total) + ' / ' + nf.format(p.target) + (g.unit ? ' ' + g.unit : '')
      : p.done + ' di ' + p.total + ' completati';
    var card = h('article', { class: 'card goal' + (p.complete ? ' done' : '') },
      h('div', { class: 'goal-head' },
        h('button', { type: 'button', class: 'goal-title', 'aria-label': 'Modifica obiettivo ' + g.title, onclick: function () { openGoalEditor(g); } }, g.title, h('span', { class: 'edit-ico', 'aria-hidden': 'true' }, '✎')),
        h('span', { class: 'pct' }, p.pct + '%')),
      h('div', { class: 'goal-sum' }, summary + (p.complete ? ' ✓' : '')),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + p.pct + '%' })));
    card.append(p.kind === 'amount' ? amountBody(g, p, date) : h('div', { class: 'goal-body' }, g.subs.map(function (sb) { return subRow(g, sb, date); })));
    return card;
  }

  // Obiettivo a quantità (es. passi): si inserisce il totale di ogni giorno, come si preferisce.
  function amountBody(g, p, date) {
    var input = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0', value: g.days[date] || '', 'aria-label': 'Totale di ' + dayWord(date) });
    input.addEventListener('change', function () { L.setAmount(g, date, input.value); persist(); render(); });
    var strip = h('div', { class: 'daystrip' }, [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var d = L.addDays(g.week, i), v = g.days[d] || 0;
      return h('button', {
        type: 'button', class: 'dcell' + (d === date ? ' sel' : '') + (v ? ' has' : ''),
        'aria-label': cap(fmtLong.format(L.fromISO(d))) + (v ? ': ' + nf.format(v) : ''),
        onclick: function () { ui.date = d; render(); }
      }, h('span', null, DAYLETTERS[i]), h('b', null, v ? shortNum(v) : '·'));
    }));
    var left = L.daysLeftInWeek(g, todayISO()), hint = null;
    if (p.remaining > 0 && left > 0) {
      hint = 'Mancano ' + nf.format(p.remaining) + (g.unit ? ' ' + g.unit : '') +
        (left > 1 ? ' · circa ' + nf.format(Math.ceil(p.remaining / left)) + ' al giorno per i ' + left + ' giorni rimasti' : ' · è l\'ultimo giorno');
    }
    return h('div', { class: 'goal-body' },
      h('label', { class: 'dayentry' }, h('span', null, cap(dayWord(date)) + ': totale'), input, g.unit ? h('span', { class: 'unit' }, g.unit) : null),
      strip, hint ? h('p', { class: 'hint' }, hint) : null);
  }

  // Sotto-obiettivo: si segna fatto oggi (o nel giorno selezionato) oppure si pianifica in un giorno.
  function subRow(g, sb, date) {
    var items = L.subItems(state, g, sb);
    var done = items.filter(function (i) { return i.progress >= 100; }).length;
    var open = items.filter(function (i) { return i.progress < 100; });
    var shown = Math.min(done, sb.count), complete = done >= sb.count;
    function commit() { persist(); render(); }
    var left;
    if (sb.count === 1) {
      left = h('button', {
        type: 'button', class: 'chk' + (complete ? ' on' : ''), role: 'checkbox', 'aria-checked': complete ? 'true' : 'false',
        'aria-label': (complete ? 'Fatto: ' : 'Da fare: ') + sb.title,
        onclick: function () { L.toggleSub(state, g, sb, date); commit(); }
      }, svgCheck());
    } else if (sb.count <= 10) {
      left = h('span', { class: 'pips', role: 'img', 'aria-label': shown + ' su ' + sb.count },
        Array.apply(null, Array(sb.count)).map(function (_, i) { return h('i', { class: i < shown ? 'on' : '' }); }));
    } else {
      left = h('span', { class: 'pips-num' }, shown + '/' + sb.count);
    }
    var tags = [];
    if (sb.count > 1) tags.push(h('span', { class: 'tag' }, shown + ' su ' + sb.count));
    if (sb.burn && g.type === 'esercizio') tags.push(h('span', { class: 'tag' }, '🔥 ' + nf.format(sb.burn) + ' kcal'));
    open.forEach(function (i) { tags.push(h('span', { class: 'tag plan' }, '📅 ' + fmtShort.format(L.fromISO(i.date)))); });
    var actions = [];
    if (sb.count > 1 && done > 0) actions.push(h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Annulla l\'ultimo completamento di ' + sb.title, onclick: function () { L.undoSub(state, g, sb); commit(); } }, '−'));
    if (sb.count > 1 && !complete) actions.push(h('button', { type: 'button', class: 'mini-btn primary', 'aria-label': 'Segna fatto: ' + sb.title + ' (' + dayWord(date) + ')', onclick: function () { L.completeSub(state, g, sb, date); commit(); } }, '+'));
    if (!complete) actions.push(h('button', {
      type: 'button', class: 'mini-btn', 'aria-label': 'Pianifica in un giorno: ' + sb.title,
      onclick: async function () {
        var wkEnd = L.addDays(g.week, 6);
        var d = await askDate('Quando vuoi farlo? «' + sb.title + '»', g.week, wkEnd, inWeek(g, date) ? date : g.week);
        if (!d) return;
        L.planSub(state, g, sb, d); commit(); toast('Pianificato per ' + cap(fmtLong.format(L.fromISO(d))));
      }
    }, '📅'));
    return h('div', { class: 'subrow' + (complete ? ' done' : '') },
      left,
      h('div', { class: 'sub-body' }, h('div', { class: 'title' + (complete ? ' done' : '') }, sb.title), h('div', { class: 'meta' }, tags)),
      h('div', { class: 'sub-actions' }, actions));
  }

  function openGoalEditor(existing) {
    var isNew = !existing;
    var g = existing ? JSON.parse(JSON.stringify(existing)) : L.makeGoal({ type: ui.sec, week: ui.date, kind: 'amount' });
    var subs = g.subs.map(function (x) { return { id: x.id, title: x.title, count: x.count, burn: x.burn }; });
    if (!subs.length) subs.push({ id: null, title: '', count: 1, burn: 0 });

    var typeC = chips(Object.keys(SECTIONS).map(function (k) { return { value: k, label: SECTIONS[k].icon + ' ' + SECTIONS[k].label }; }), g.type, onType);
    var kindC = chips([{ value: 'amount', label: '# Quantità' }, { value: 'list', label: '☰ Sotto-obiettivi' }], g.kind, onKind);
    var fTitle = h('input', { type: 'text', placeholder: 'Es. 70.000 passi, Finire il sito', value: g.title, autocomplete: 'off', maxlength: '120', 'aria-label': 'Titolo obiettivo' });
    var fWeek = h('input', { type: 'date', value: g.week, 'aria-label': 'Settimana' });
    var weekNote = h('p', { class: 'hint' });
    var fTarget = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '70000', value: g.target || '', 'aria-label': 'Obiettivo della settimana' });
    var fUnit = h('input', { type: 'text', placeholder: 'passi, km, pagine…', value: g.unit, maxlength: '20', 'aria-label': 'Unità' });
    var amountBox = h('div', null, h('div', { class: 'row2' }, field('Obiettivo della settimana', fTarget), field('Unità', fUnit)),
      h('p', { class: 'hint', style: 'margin:-6px 0 14px' }, 'Poi inserisci il totale di ogni giorno: 20.000 un giorno, 5.000 un altro… come preferisci.'));
    var subsBox = h('div', { class: 'subs-edit' });
    var subsWrap = h('div', { class: 'field' },
      h('span', { class: 'lbl' }, 'Sotto-obiettivi'),
      subsBox,
      h('button', { type: 'button', class: 'btn ghost', onclick: function () { subs.push({ id: null, title: '', count: 1, burn: 0 }); paintSubs(true); } }, '+ Aggiungi sotto-obiettivo'),
      h('p', { class: 'hint' }, '«×» = quante volte nella settimana (es. 3 sessioni). Poi li segni fatti quando vuoi o li pianifichi in un giorno: compariranno nell\'elenco di quel giorno.'));

    function paintSubs(focusLast) {
      var isEx = typeC.get() === 'esercizio';
      subsBox.replaceChildren.apply(subsBox, subs.map(function (sb, idx) {
        var t = h('input', { type: 'text', placeholder: 'Es. Pagina home', value: sb.title, maxlength: '120', 'aria-label': 'Sotto-obiettivo ' + (idx + 1) });
        t.addEventListener('input', function () { sb.title = t.value; });
        var c = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '99', step: '1', value: sb.count, 'aria-label': 'Quante volte' });
        c.addEventListener('input', function () { sb.count = c.value; });
        var b = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '10', placeholder: '0', value: sb.burn || '', 'aria-label': 'Calorie spese' });
        b.addEventListener('input', function () { sb.burn = b.value; });
        return h('div', { class: 'sub-edit' }, t,
          h('label', { class: 'mini' }, h('span', null, '×'), c),
          isEx ? h('label', { class: 'mini' }, h('span', null, '🔥'), b) : null,
          h('button', { type: 'button', class: 'ph-x static', 'aria-label': 'Rimuovi sotto-obiettivo', onclick: function () { subs.splice(idx, 1); if (!subs.length) subs.push({ id: null, title: '', count: 1, burn: 0 }); paintSubs(); } }, '×'));
      }));
      if (focusLast) { var all = subsBox.querySelectorAll('input[type=text]'); if (all.length) all[all.length - 1].focus(); }
    }
    function paintWeek() {
      var w = L.startOfWeek(fWeek.value || g.week);
      weekNote.textContent = 'Settimana dal ' + fmtDM.format(L.fromISO(w)) + ' al ' + fmtDM.format(L.fromISO(L.addDays(w, 6))) + '.';
    }
    function onKind(k) { amountBox.hidden = k !== 'amount'; subsWrap.hidden = k !== 'list'; }
    function onType(t) { document.body.dataset.sec = t; if (subsBox) paintSubs(); }
    fWeek.addEventListener('change', paintWeek); fWeek.addEventListener('input', paintWeek);

    function onSave() {
      var title = fTitle.value.trim();
      if (!title) { toast('Scrivi un titolo'); fTitle.focus(); return; }
      var kind = kindC.get();
      var ng = L.makeGoal({
        id: g.id, created: g.created, title: title, type: typeC.get(), week: fWeek.value || g.week, kind: kind,
        target: fTarget.value, unit: fUnit.value, days: g.days,
        subs: subs.map(function (x) { return { id: x.id || undefined, title: x.title, count: x.count, burn: x.burn }; })
      });
      if (kind === 'amount' && !(ng.target > 0)) { toast('Imposta un obiettivo maggiore di zero'); fTarget.focus(); return; }
      if (kind === 'list' && !ng.subs.length) { toast('Aggiungi almeno un sotto-obiettivo'); return; }
      var idx = state.goals.findIndex(function (x) { return x.id === ng.id; });
      if (idx >= 0) state.goals[idx] = ng; else state.goals.push(ng);
      L.syncGoalItems(state, ng).forEach(function (r) { r.photos.forEach(dropPhoto); });
      // fa vedere subito l'obiettivo: sezione giusta e settimana giusta
      ui.sec = ng.type;
      if (L.startOfWeek(ui.date) !== ng.week) { var t = todayISO(); ui.date = (t >= ng.week && t <= L.addDays(ng.week, 6)) ? t : ng.week; }
      persist(); closeSheet(); render();
      toast(isNew ? 'Obiettivo creato' : 'Obiettivo aggiornato');
    }
    async function onDelete() {
      var ok = await choose('Eliminare l\'obiettivo «' + g.title + '»? I sotto-obiettivi già completati restano nell\'elenco dei giorni.', [{ label: 'Elimina', value: 'yes', kind: 'danger' }, { label: 'Annulla', value: null, kind: 'ghost' }]);
      if (!ok) return;
      L.removeGoal(state, g.id).forEach(function (r) { r.photos.forEach(dropPhoto); });
      persist(); closeSheet(); render();
    }
    function onCopy() {
      var n = L.copyGoalToNextWeek(state, g.id);
      if (!n) return;
      persist(); closeSheet(); render();
      toast('Copiato nella settimana dal ' + fmtDM.format(L.fromISO(n.week)));
    }

    openSheet(h('div', null,
      h('h2', null, isNew ? 'Nuovo obiettivo settimanale' : 'Modifica obiettivo'),
      h('div', { class: 'field' }, typeC.el),
      field('Titolo', fTitle),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Tipo di obiettivo'), kindC.el),
      field('Settimana (scegli un giorno qualsiasi)', fWeek, weekNote),
      amountBox,
      subsWrap,
      h('div', { class: 'actions' },
        isNew ? null : h('button', { type: 'button', class: 'btn danger', onclick: onDelete }, 'Elimina'),
        isNew ? null : h('button', { type: 'button', class: 'btn', onclick: onCopy }, 'Copia a settimana dopo'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn ghost', onclick: closeSheet }, 'Annulla'),
        h('button', { type: 'button', class: 'btn primary', onclick: onSave }, 'Salva'))));
    document.body.dataset.sec = g.type;
    onKind(kindC.get()); paintSubs(); paintWeek();
    if (isNew) setTimeout(function () { try { fTitle.focus(); } catch (e) { /* ignore */ } }, 50);
  }

  /* =========================================================
     Impostazioni
     ========================================================= */
  function openSettings() {
    var s = state.settings;
    var kcal = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '10', value: s.kcalGoal, 'aria-label': 'Obiettivo calorie' });
    var prot = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '1', value: s.proteinGoal, 'aria-label': 'Obiettivo proteine' });
    function onGoal() {
      s.kcalGoal = Math.max(0, Math.round(parseFloat(kcal.value) || 0));
      s.proteinGoal = Math.max(0, Math.round(parseFloat(prot.value) || 0));
      persist(); render();
    }
    kcal.addEventListener('change', onGoal); prot.addEventListener('change', onGoal);

    var roll = h('select', { 'aria-label': 'Riporto', value: s.rolloverMode },
      h('option', { value: 'week' }, 'Stesso giorno, settimana dopo'),
      h('option', { value: 'today' }, 'A oggi'));
    roll.addEventListener('change', function () { s.rolloverMode = roll.value; persist(); toast('Vale dai prossimi riporti'); });

    var perm = notifSupport() ? Notification.permission : 'unsupported';
    var permText = { granted: 'Notifiche attive ✓', denied: 'Notifiche bloccate nelle impostazioni del sito', 'default': 'Notifiche non ancora attivate', unsupported: 'Notifiche non supportate da questo browser' }[perm];
    var notifBtns = [];
    if (perm === 'default') notifBtns.push(h('button', { type: 'button', class: 'btn', onclick: function () { ensureNotifPermission().then(openSettings); } }, 'Attiva notifiche'));
    if (perm === 'granted') notifBtns.push(h('button', { type: 'button', class: 'btn', onclick: function () { systemNotify('Agenda', 'Le notifiche funzionano ✓', 'test').then(function (ok) { if (!ok) toast('Notifica non inviata'); }); } }, 'Prova notifica'));

    var pinBtns = [];
    var auto = null;
    if (meta.pin) {
      pinBtns.push(h('button', { type: 'button', class: 'btn', onclick: async function () { if (await verifyCurrentPin()) { await setNewPin(); } } }, 'Cambia PIN'));
      pinBtns.push(h('button', { type: 'button', class: 'btn danger', onclick: async function () {
        if (await verifyCurrentPin()) { meta.pin = null; saveMeta(); toast('PIN rimosso'); openSettings(); }
      } }, 'Rimuovi PIN'));
      auto = field('Blocco automatico', h('select', {
        'aria-label': 'Blocco automatico', value: String(s.autoLockSec),
        onchange: function (e) { s.autoLockSec = Number(e.target.value); persist(); }
      }, h('option', { value: '0' }, 'Subito quando esco dall\'app'), h('option', { value: '60' }, 'Dopo 1 minuto'), h('option', { value: '300' }, 'Dopo 5 minuti')));
    } else {
      pinBtns.push(h('button', { type: 'button', class: 'btn primary', onclick: async function () { if (await setNewPin()) openSettings(); } }, 'Imposta PIN'));
    }

    var importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    importInput.addEventListener('change', function () { if (importInput.files && importInput.files[0]) importBackup(importInput.files[0]); importInput.value = ''; });

    openSheet(h('div', null,
      h('h2', null, 'Impostazioni'),
      h('section', { class: 'set-sec' }, h('h3', null, 'Obiettivo giornaliero (cibo)'),
        h('div', { class: 'row2' }, field('Calorie base (kcal)', kcal), field('Proteine (g)', prot)),
        h('p', { class: 'hint' }, 'Le kcal spese dagli esercizi completati si sommano alle calorie base del giorno (es. 1650 + 300 = 1950).')),
      h('section', { class: 'set-sec' }, h('h3', null, 'Attività non svolte'),
        field('Impegni ed esercizi non completati: riporta', roll),
        h('p', { class: 'hint' }, 'I pasti e le serie ripetute non vengono riportati.')),
      h('section', { class: 'set-sec' }, h('h3', null, 'Avvisi'),
        h('p', null, permText), h('div', { class: 'btns', style: 'margin-top:8px' }, notifBtns),
        h('p', { class: 'hint' }, 'Gli avvisi arrivano in modo affidabile con l\'app aperta o da poco in background. Per la massima puntualità usa "Aggiungi al calendario" nella scheda di una voce.')),
      h('section', { class: 'set-sec' }, h('h3', null, 'Blocco con PIN'),
        h('div', { class: 'btns' }, pinBtns), auto ? h('div', { style: 'margin-top:12px' }, auto) : null,
        h('p', { class: 'hint' }, 'Il PIN blocca l\'accesso all\'app; i dati nel telefono non sono cifrati. Se lo dimentichi, l\'unico modo di rientrare è cancellare i dati del sito dal browser (e perdi tutto: fai prima un backup).')),
      h('section', { class: 'set-sec' }, h('h3', null, 'Dati'),
        h('div', { class: 'btns' },
          h('button', { type: 'button', class: 'btn', onclick: exportBackup }, 'Esporta backup'),
          h('button', { type: 'button', class: 'btn', onclick: function () { importInput.click(); } }, 'Importa backup'),
          h('button', { type: 'button', class: 'btn danger', onclick: resetAll }, 'Cancella tutto')),
        importInput,
        h('p', { class: 'hint' }, 'Impegni, pasti e foto restano solo su questo telefono. Il backup (con le foto) è un file JSON: non caricarlo in un repository pubblico.')),
      h('section', { class: 'set-sec' }, h('h3', null, 'Dettatura'),
        h('p', { class: 'hint' }, 'La dettatura usa il riconoscimento vocale di Chrome: l\'audio viene elaborato dai server di Google. Il testo riconosciuto resta nell\'app.')),
      h('p', { class: 'hint' }, 'Agenda v' + VERSION),
      h('div', { class: 'actions' }, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn primary', onclick: closeSheet }, 'Chiudi'))));
  }

  /* =========================================================
     Avvio
     ========================================================= */
  async function welcome() {
    var c = await choose('Benvenuto! I tuoi impegni, pasti e foto restano solo su questo telefono. Vuoi proteggere l\'app con un PIN?', [
      { label: 'Imposta PIN', value: 'pin' }, { label: 'Più tardi', value: null, kind: 'ghost' }]);
    meta.firstRunDone = true; saveMeta();
    if (c === 'pin') await setNewPin();
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Service worker non registrato', e); });
    });
  }

  function bind() {
    $('#fab-add').addEventListener('click', function () { openEditor(null); });
    $('#fab-mic').addEventListener('click', startDictation);
    var hiddenAt = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        hiddenAt = Date.now();
        if (meta.pin && state.settings.autoLockSec === 0) lockNow();
      } else {
        var away = hiddenAt ? (Date.now() - hiddenAt) / 1000 : 0;
        hiddenAt = 0;
        if (meta.pin && !locked && away >= state.settings.autoLockSec) lockNow();
        else tick();
      }
    });
    setInterval(tick, 20000);
  }

  async function boot() {
    state = loadState(); meta = loadMeta();
    registerSW(); bind();
    if (meta.pin) {
      locked = false; $('#app').hidden = true;
      var first = maintain(); render();
      await lockNow();
      movedToast(first.moved);
    } else {
      var r = maintain(); render();
      $('#app').hidden = false;
      movedToast(r.moved);
      checkAlarms();
      if (!meta.firstRunDone) await welcome();
    }
  }

  boot().catch(function (e) { console.error(e); toast('Errore di avvio: ' + e.message, 6000); });
})();
