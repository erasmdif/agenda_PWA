# Patch drag & drop per Agenda PWA v1.4 — collegamento ChatGPT

**Applicazione risultante: 1.4.1**. Non si aggiunge un chatbot dentro la PWA, un account o un server: si aggiunge uno scambio **esplicito**, locale e revisionabile tra la conversazione ChatGPT e i dati personali di Agenda.

## Installazione (sovrascrittura file)

1. Fai una copia di sicurezza del progetto e, sul telefono, esporta il backup dall'app (**Impostazioni → Dati → Esporta backup**).
2. Estrai lo ZIP della patch e **trascina i file e la guida nella radice della repository `agenda_PWA`**, sovrascrivendo quelli con lo stesso nome. Non eliminare gli altri file, soprattutto `assets/`, `icons/`, `manifest.webmanifest` e `.git/`.
3. I file aggiornati sono `app.js`, `index.html`, `style.css`, `sw.js`; il nuovo file **obbligatorio** è `chatgpt-bridge.js`. Lo ZIP include anche `README.md` aggiornato e questa guida.
4. Commit e push su GitHub: GitHub Pages pubblica i **file dell'app**, NON gli impegni. Attendi il deploy; da telefono chiudi e riapri l'app per ricevere la nuova cache del service worker. Se non cambia subito, riaprila una seconda volta.
5. Apri **Impostazioni → ChatGPT ↔ Agenda → Apri collegamento ChatGPT**.

I dati precedenti restano nella chiave `agenda.state.v1` di localStorage e **non vengono migrati o cancellati dalla patch**. Il nuovo flusso importa solo le operazioni selezionate, lasciando foto, impostazioni, PIN, ricorrenze e obiettivi settimanali invariati.

## Usarla con ChatGPT

**Agenda → ChatGPT**

1. Nella schermata ChatGPT ↔ Agenda scegli la settimana con il campo data.
2. Seleziona i contenuti da condividere: **Impegni** e **Esercizi** sono spuntati inizialmente; **Cibo** no.
3. Tocca **Prepara contesto**, controlla l'anteprima testuale, poi **Copia per ChatGPT**.
4. Incolla il testo nella conversazione ChatGPT per programmare insieme gli impegni. Il testo include le date, gli ID necessari per modifiche/eliminazioni mirate e gli obiettivi settimanali utili come contesto; NON include PIN, fotografie o backup.

**ChatGPT → Agenda**

1. Quando il piano è definitivo, chiedi **«Restituisci il JSON Agenda in formato `agenda-chatgpt-v1` con le operazioni concordate»**.
2. Copia il JSON da ChatGPT, torna in **ChatGPT ↔ Agenda**, incollalo nel riquadro **Importa il piano concordato**, premi **Controlla e importa**.
3. Esamina ogni modifica. Le aggiunte e modifiche valide sono preselezionate; **eliminazioni e possibili duplicati non sono preselezionati**. Scegli cosa applicare e conferma.
4. Se necessario: **ChatGPT ↔ Agenda → Annulla ultima importazione**. Il ripristino è possibile finché lo stato dell'agenda non cambia dopo l'importazione. Per un recupero a lungo termine utilizza il backup completo.

### Esempio di formato: aggiunta

```json
{
  "schema": "agenda-chatgpt-v1",
  "operations": [
    { "op": "add", "type": "impegno", "title": "Revisione bibliografia", "date": "2026-10-15", "time": "09:00", "note": "2 ore di lavoro" },
    { "op": "add", "type": "esercizio", "title": "Allenamento", "date": "2026-10-15", "time": "18:00" }
  ]
}
```

Le date nell'esempio sono indicative: sostituiscile con quelle desiderate. **Non esiste un campo orario di fine o durata nella v1.4:** se vuoi una durata, riportala nella nota. Il nome di tipo può essere `impegno`, `esercizio` o `cibo`.

### Esempio: modifica o eliminazione

Per modificare una voce già esistente, ChatGPT deve prima ricevere il contesto esportato, così conosce l'**ID reale**. Non deve inventare ID.

```json
{
  "schema": "agenda-chatgpt-v1",
  "operations": [
    { "op": "update", "id": "ID_REALE_DA_EXPORT", "date": "2026-10-16", "time": "11:30" },
    { "op": "delete", "id": "ALTRO_ID_REALE_DA_EXPORT" }
  ]
}
```

La modifica conserva i campi non esplicitamente indicati. L'eliminazione rimuove **solo la singola attività** e NON tocca la serie di ripetizioni di cui potrebbe far parte. Non sono previste modifiche automatiche degli obiettivi settimanali (`state.goals`).

## Link che apre direttamente l'anteprima

Si può anche chiedere a ChatGPT un link alla propria PWA secondo questo formato:

`https://erasmdif.github.io/agenda_PWA/#agenda-import=<JSON_codificato_con_encodeURIComponent>`

Il contenuto è un JSON con `schema: "agenda-chatgpt-v1"` e `operations`. In JavaScript si costruisce, per esempio, con:

```js
const link = 'https://erasmdif.github.io/agenda_PWA/#agenda-import=' + encodeURIComponent(JSON.stringify(piano));
```

Il frammento `#...` non viene inviato a GitHub Pages: l'app lo legge e lo rimuove subito dalla barra prima di mostrare **l'anteprima**. **Non applica mai le modifiche automaticamente.**

⚠️ Un link può essere troppo lungo per alcune app di messaggistica; per i piani corposi usa il JSON copiato/incollato. **ChatGPT sul telefono potrebbe aprire il link nel proprio browser interno** o in un profilo Chrome con localStorage differente da quello della PWA installata: in quel caso non vedrai gli impegni già presenti nell'app. Per evitarlo, apri la PWA installata normalmente e utilizza **Incolla JSON**, anziché affidarti al link.

## Privacy e backup

- Tutti i dati rimangono sul telefono **fino a quando scegli di copiarli e inviarli nella conversazione ChatGPT**. Quello che incolli in ChatGPT viene ovviamente condiviso con il servizio ChatGPT. Verifica e rimuovi eventuali note private prima di copiarle.
- Il link contiene nel proprio frammento i dati delle operazioni, quindi non condividere link relativi a impegni privati con terzi.
- La patch NON installa alcuna chiave API e NON invia richieste a OpenAI, GitHub o a database esterni.
- È previsto un massimo di 100 operazioni per blocco; date, orari, tipi e valori sono validati. Campi non conosciuti sono rifiutati, anziché ignorati silenziosamente.
- **Non mettere in repository né backup JSON, né esportazioni reali, né link contenenti i tuoi dati personali.**

## Compatibilità

Patch progettata **sul pacchetto v1.4 allegato alla conversazione** e verificata con controlli di sintassi JS, test di logica su Node e test della UI in Chromium con memoria locale simulata. L'apertura da app ChatGPT in Android/iOS e il comportamento della PWA installata dipendono anche dal browser del dispositivo: testare il primo link su telefono e usare l'importazione manuale come fallback.
