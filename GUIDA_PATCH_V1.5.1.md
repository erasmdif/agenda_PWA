# Agenda PWA v1.5 → v1.5.1 — Patch drag & drop

**Base verificata:** `agenda-pwa(1).zip` (v1.5.0), fornito il 13 ottobre 2026.

**IMPORTANTE:** Questa patch **sostituisce** le patch 1.4.2 e 1.4.3. NON applicare la 1.4.3 sopra la 1.5: farebbe perdere alcune novità della 1.5.

## Installazione

1. Apri la PWA che usi sul telefono e crea un **backup completo** (Impostazioni → Dati → Esporta backup). Conservalo in luogo privato.
2. Nella cartella locale della **tua v1.5** (quella con `index.html`, `app.js`, `logic.js`, ecc.) estrai lo ZIP della patch e **sovrascrivi i file omonimi**, mantenendo la struttura delle cartelle. I due nuovi file `state-sync.js` e `daily-reminder.js` vanno nella stessa cartella di `app.js`.
3. Esegui commit e push; attendi il deploy GitHub Pages. Su PWA già installata, chiudi/riapri l'app (occasionalmente due volte per il service worker). **Non cancellare dati del sito, non disinstallare la PWA.**
4. Controlla **Impostazioni → in fondo: Agenda v1.5.1**. I dati personali già presenti rimangono nel `localStorage` dello stesso browser/profilo.

### File modificati/aggiunti

- `index.html`: carica due moduli aggiuntivi senza cambiare struttura HTML.
- `app.js`: v1.5.1, UI con immagini più grandi, progetti, reminder e salvataggi protetti.
- `logic.js`: calorie passi e avanzamento figli senza rimuovere i `credits` della v1.5.
- `style.css`: stile foto, progressi progetti e promemoria.
- `sw.js`: cache `agenda-shell-v9-1.5.1`, network-first per script/stili/pagine e gestione pulsanti notifiche.
- `state-sync.js`: merge locale fra schede, controllo conflitti.
- `daily-reminder.js`: logica dell'avviso quotidiano delle 15:00 e rinvii di un'ora.

**Intatti:** `chatgpt-bridge.js` **della v1.5** (con supporto agli obiettivi, `links` e link gzip `#agenda-import-z=`), immagini, icone, `manifest.webmanifest`, `README.md` e altri asset.

## Novità

### 1. Calorie per i passi

- Coefficiente fisso **0,0381 kcal/passo**, basato su una stima precalcolata del profilo indicato. Nel codice viene pubblicato **soltanto il coefficiente**, non il peso/altezza/età.
- 10.000 passi ≈ **381 kcal**. Stima indicativa, non misura del dispendio reale.
- Sono riconosciuti gli obiettivi `kind: "amount"` con unità `passi`, `passo`, `steps` o `step` (oppure titolo contenente “passi” e unità vuota).
- I passi del giorno possono essere inseriti manualmente oppure derivare dagli **accrediti `credits`** su task collegati nella v1.5. Due obiettivi che registrano lo stesso contapassi non vengono sommati fra loro: si usa il valore più alto, mentre dentro un singolo obiettivo gli accrediti si sommano ai passi manuali.
- Le kcal dei passi entrano nel budget alimentare giornaliero; evitare doppio conteggio con esercizi di camminata già contabilizzati come allenamenti.

### 2. Fotografie nelle schede

- Foto principale estesa sotto il task; miniature aggiuntive per altre foto.
- Click/tap per la visualizzazione ingrandita già presente.
- Foto memorizzate ancora in IndexedDB e **non esportate a ChatGPT**.

### 3. Progresso progetti nella dashboard

- Nuove barre “Progetti · task assegnati” nella home e nelle statistiche.
- Numeratore = task **completati** (100%) collegati con `gid` a quell'obiettivo; denominatore = task **effettivamente assegnati**, non la quantità teorica di `subs`.
- L'avanzamento standard dell'obiettivo (basato su `subs` o su `credits` per gli obiettivi quantitativi) resta intatto.

### 4. Stato locale e importazione ChatGPT incrementale

- La v1.5 già supporta `operations` con `add` / `update` / `delete`, inclusi gli obiettivi: questa patch **mantiene la versione v1.5 del bridge** e introduce controlli di salvataggio.
- Se un'altra scheda modifica i dati, al salvataggio viene eseguito un merge e in presenza di conflitti viene chiesta una scelta esplicita.
- Le modifiche esterne vengono rilevate alla riapertura / quando la PWA torna visibile.
- Il comando di importazione verifica che il dataset non sia cambiato mentre era aperta l'anteprima; in caso contrario ne richiede una nuova verifica.
- **ChatGPT non accede automaticamente al `localStorage`:** per modificare impegni già presenti deve conoscere ID reali; per aggiunte nuove bastano dati dei nuovi impegni. Non inviare l'intero dataset se non serve.
- Esempio solo aggiunta:

```json
{
  "schema": "agenda-chatgpt-v1",
  "operations": [
    {"op":"add","type":"impegno","title":"Nuova attività","date":"2026-10-14","time":"09:00"}
  ]
}
```

### 5. Riepilogo delle 15:00

- **Impostazioni → Promemoria quotidiano**: attiva/disattiva, titoli notifiche (off di default), controllo manuale e opzione `.ics`.
- Alle **15:00** controlla i task di tipo `impegno` ed `esercizio` con `progress < 100` per la giornata corrente (incluso allenamento).
- **OK** chiude la sveglia fino a domani. **Ricordamelo tra un'ora** rinvia di 60 minuti a partire dal momento della risposta; al controllo successivo ricalcola che cosa resta da fare. Se sono tutti completati, niente avviso.
- Con permesso notifiche e browser compatibile presenta anche due pulsanti sulla notifica di sistema (altrimenti usa i pulsanti nell'app).
- **Limite tecnico importante:** con una PWA statica su GitHub Pages **non sono garantite** notifiche puntuali quando l'app è completamente chiusa o sospesa. Il controllo riprende all'apertura dell'app. Il file calendario `.ics`, importato volontariamente nel calendario di sistema, offre un avviso **generico** ricorrente alle 15:00 ma **non** segue automaticamente i rinvii/OK della PWA.

## Compatibilità e sicurezza

- Nessun backend o account richiesto, nessun token ChatGPT, nessun accesso alla repository per aggiornare dati personali.
- Stato locale in `agenda.state.v1`; foto in IndexedDB. **Stessi nomi/struttura usati dalla v1.5**, nessuna migrazione distruttiva.
- Browser/PWA installata in **contesti di archiviazione diversi** non condividono automaticamente lo stesso localStorage: per questo serve backup/importazione manuale o in futuro un sistema sincronizzato.
- Il PIN protegge l'interfaccia ma non cifra i dati in locale.

## Verifiche eseguite

- Sintassi JavaScript con Node; test logici su calorie dei passi manuali e con accrediti v1.5, calcolo progetti, 15:00/16:00/OK, importazione incrementale di task e obiettivi, link importazione, merge di schede.
- Interfaccia in Chromium mobile simulato: dashboard, sezione Impostazioni, promemoria, versione v1.5.1 e importazione incrementale tramite l'interfaccia. Nessun errore JavaScript in queste prove.
- Da verificare sul tuo telefono reale: permessi notifiche e comportamento in background (Android/iOS differiscono).
