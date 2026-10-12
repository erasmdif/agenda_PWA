# Agenda PWA 1.5 — patch ChatGPT e obiettivi settimanali

## Installazione senza perdere i dati

1. Nella PWA attuale usa **Impostazioni → Dati → Esporta backup** e conserva il backup localmente.
2. Estrai **PATCH_Agenda_v1.5_drag_drop.zip** e trascina i file contenuti nella **radice del progetto** `agenda_PWA`, sovrascrivendo gli omonimi. **Non cancellare altri file**, incluse le cartelle `assets`, `icons` e `.git`.
3. Effettua commit e push, poi apri l'app aggiornata e controlla in Impostazioni che indichi **Agenda v1.5.0**. Se la vecchia versione persiste, chiudi e riapri la PWA per aggiornare la cache del service worker.
4. Una volta aggiornata la PWA sul telefono, puoi aprire il link di importazione fornito da ChatGPT (oppure incollare il JSON fornito nello scambio).

**File sovrascritti:** `app.js`, `logic.js`, `chatgpt-bridge.js`, `sw.js`. Gli archivi locali, le fotografie, il PIN, i dati già registrati e gli impegni non vengono sovrascritti dal deploy.

## Cosa aggiunge

- Operazioni su **obiettivi settimanali**, nello stesso schema `agenda-chatgpt-v1`: `op: add/update/delete`, `entity: "goal"`, con `kind: "list"` e `subs` oppure `kind: "amount"` con `target`, `unit`.
- **Collegamenti agli impegni già presenti**, con ricerca per ID o con `match` esatto `{type,title,date}` se gli ID non sono stati esportati. Il titolo e la data delle attività già registrate restano invariati; non si creano doppioni.
- Conteggio automatico per obiettivi quantitativi collegati: ciascuna attività completata contribuisce per la sua `quantity`, proporzionalmente alla sua percentuale `progress`. Per esempio 5 attività da 8 mappe contribuiscono fino a 40 mappe, e 5 attività da 2 articoli fino a 10 articoli. L'obiettivo passi invece rimane un contatore manuale cumulativo.
- **Link diretto da ChatGPT**: `#agenda-import=` con JSON URL encoded oppure `#agenda-import-z=` con gzip UTF-8 + base64url. I link aprono **solo l'anteprima** da approvare nell'Agenda, senza incollare JSON e senza sincronizzazione cloud.
- Esportazione del contesto arricchita con gli ID degli obiettivi, dei sotto-obiettivi e dei collegamenti, utile per futuri aggiornamenti.
- **Condividi contesto** tramite condivisione nativa dello smartphone, quando disponibile. È disponibile anche **Apri ChatGPT** e resta attivo il pulsante **Copia per ChatGPT**.
- Possibilità di annullare l'ultima importazione, se non hai modificato successivamente l'Agenda; selezione dei singoli cambiamenti in anteprima.

## Importare il piano già concordato

Il pacchetto supplementare **piano_obiettivi_12-18_ottobre_2026.json** è un piano di **soli obiettivi e collegamenti** che presuppone che i normali impegni giornalieri del precedente JSON siano già stati inseriti. Include:

- Longo: aggiornamento dell'obiettivo preesistente `mv54gokcbikhx8` e collegamento dei 9 compiti;
- Terre Unione: 40 mappe, 8 per giorno feriale, avanzamento automatico;
- Bibliografia: 10 articoli, 2 da martedì a sabato, avanzamento automatico;
- MyMito Annotator: obiettivo con il compito di venerdì;
- Archeobotanica: obiettivo con il fix di martedì;
- Allenamenti: 3 pesanti e 3 leggeri, senza duplicare gli esercizi;
- Passi: obiettivo quantitativo 70.000, da riempire liberamente nei 7 giorni.

L'ultima operazione è un'eliminazione **non preselezionata** del vecchio impegno giornaliero segnaposto «Obiettivo settimanale — 70.000 passi». Se esiste nell'Agenda, puoi spuntarla nella schermata di conferma; l'obiettivo settimanale vero resta salvo.

Il piano non tocca il pasto già registrato, gli altri impegni, le fotografie né gli orari. Se alcune attività sono state rinominate nell'app, i relativi collegamenti per `match` risulteranno **bloccati** anziché collegare l'impegno sbagliato: in tal caso esporta un contesto aggiornato e chiedi un piano corretto.

## Esempio di JSON v1.5

```json
{
  "schema": "agenda-chatgpt-v1",
  "operations": [
    {
      "op": "add", "entity": "goal", "type": "impegno", "title": "Aggiornare 40 mappe",
      "week": "2026-10-12", "kind": "amount", "target": 40, "unit": "mappe",
      "links": [{"match":{"date":"2026-10-12","type":"impegno","title":"Terre Unione — Aggiornare 8 mappe (1–8)"},"quantity":8}]
    }
  ]
}
```

Per una lista: `"kind":"list","subs":[{"title":"Task A","count":1}],"links":[{"match":{"id":"ID_ESATTO"},"sub":"Task A"}]`.

Per modificare un obiettivo serve il suo **ID esatto** (`"op":"update","entity":"goal","id":"..."`). Gli update di una lista con `subs` sostituiscono la lista ma riusano gli ID dei sotto-obiettivi con lo stesso titolo. Per rinominare uno specifico sotto-obiettivo mantenendone l'ID usa `previousTitle`. Non inventare ID.

Le eliminazioni non sono selezionate di default. L'eliminazione di un obiettivo **non elimina** le attività giornaliere ma le scollega. L'eliminazione di un'attività elimina solo quella singola attività; le foto non vengono fisicamente cancellate durante l'importazione.

## Limiti di collegamento e sicurezza

**Non è un'integrazione che consente a ChatGPT di modificare silenziosamente localStorage.** Senza backend/API, la chat non ha accesso alla memoria privata della PWA sul tuo telefono. Il sistema più diretto e compatibile è:

1. In Agenda condividi il contesto esplicitamente con ChatGPT (share sheet o copia/incolla; ChatGPT non può leggerlo in automatico).
2. Qui approvi il piano.
3. Tocchi il link di modifica prodotto dalla chat, che apre Agenda con l'anteprima. Confermi; nessun copia/incolla sul ritorno.

Un link è sufficiente quando è **aperto nello stesso profilo browser che ospita la tua Agenda**. In alcuni telefoni, ChatGPT apre i link in un browser interno separato, dove l'Agenda potrebbe essere *vuota*: in tal caso non confermare nulla e usa l'importazione manuale dall'app installata. I frammenti URL non vengono trasmessi al server, ma possono restare nella cronologia della chat; non condividere i link con persone terze.

La patch non installa chiavi OpenAI, non aggiunge autenticazione ChatGPT, non aggiunge server, non modifica dati del repository dell'utente e non invia dati in background.
