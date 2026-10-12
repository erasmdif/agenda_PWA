# Agenda personale (PWA)

Impegni, esercizi e alimentazione con spunte o percentuali, sveglie, foto, dettatura vocale e blocco con PIN.
**Tutti i dati restano sul tuo telefono** (localStorage + IndexedDB): nessun server li riceve.

## Cosa contiene
- `index.html`, `style.css`, `logic.js`, `app.js` — l'app
- `sw.js`, `manifest.webmanifest`, `icons/` — rendono l'app installabile e utilizzabile offline

## Pubblicare su GitHub Pages
1. Crea un repository (anche pubblico: contiene solo il codice) e carica **il contenuto** di questa cartella nella radice.
2. Settings → Pages → *Deploy from a branch* → branch `main`, cartella `/ (root)` → Save.
3. Dopo un minuto trovi l'indirizzo `https://<utente>.github.io/<repo>/`.
4. **Non caricare mai nel repository backup `.json`, foto o dati reali.**

## Installare su Android
1. Apri l'indirizzo in **Chrome**.
2. Menu ⋮ → *Installa app* (o *Aggiungi a schermata Home*).
3. Apri l'icona "Agenda": al primo avvio puoi impostare il PIN. Alla prima sveglia Chrome chiede il permesso per le notifiche.

## Provarla sul computer
```
python3 -m http.server 8000
```
poi apri `http://localhost:8000` (il PIN, il service worker e le notifiche richiedono https oppure localhost).

## Come funziona
- **Impegni / Esercizi / Cibo**: ogni voce si segna con una spunta o con una percentuale (cursore a passi del 5%). L'ora e la sveglia sono facoltative.
- **Riporto automatico**: impegni ed esercizi non completati con data passata passano allo stesso giorno della settimana successiva (in Impostazioni puoi scegliere "a oggi"). Pasti e serie ripetute non vengono riportati.
- **Cibo**: imposti l'obiettivo (es. 2000 kcal e 140 g di proteine); ogni pasto ha kcal, proteine e foto. Una spunta (o una percentuale) conta il pasto come consumato; vedi quanto ti rimane e, sotto, quanto resterebbe con i pasti ancora pianificati. I pasti già usati si precompilano dal nome.
- **Foto**: dalla scheda di una voce, da galleria o fotocamera. Sono ridotte (max 1600 px) e salvate solo nel browser.
- **Dettatura** (🎙️): «domani alle 9 e mezza dentista», «venerdì alle 18 allenamento gambe», «pranzo 650 kcal 45 g di proteine». Si apre la scheda precompilata da controllare.
- **Ripetizioni**: ogni giorno o ogni settimana.
- **Backup**: Impostazioni → Esporta/Importa (JSON con le foto).

## Limiti da conoscere
- **Sveglie**: con l'app aperta o da poco in background arrivano puntuali; con l'app chiusa Android può ritardarle o non consegnarle (limite delle web app). Per un avviso sicuro usa "Aggiungi al calendario (.ics)" nella scheda della voce.
- **Foto**: una web app non può leggere automaticamente una cartella: le foto si scelgono dalla galleria e vengono copiate nell'app.
- **PIN**: blocca l'accesso all'app ma i dati nel browser non sono cifrati. Se lo dimentichi, l'unico modo è cancellare i dati del sito da Chrome (perdi tutto: fai prima un backup).
- **Dettatura**: usa il riconoscimento vocale di Chrome, che invia l'audio ai server di Google.
- Se cancelli i dati del browser o disinstalli l'app, i dati vanno persi: esporta ogni tanto un backup.
