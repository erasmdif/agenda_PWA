# Agenda personale (PWA)

Impegni, esercizi e alimentazione con spunte o percentuali, sveglie, foto, dettatura vocale e blocco con PIN.
**Tutti i dati restano sul tuo telefono** (localStorage + IndexedDB): nessun server li riceve.

## Cosa contiene
- `index.html`, `style.css`, `logic.js`, `app.js` — l'app
- `assets/bg/` — 20 sfondi (5 sezioni × 4 fasce orarie)
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

## Novità 1.1
- **Kcal spese negli esercizi**: ogni esercizio ha un campo «Calorie spese». Quando lo completi (o lo porti a una %, in proporzione) si somma alle calorie base del giorno in *Cibo*: 1650 base + 300 = 1950 kcal, proteine invariate. La scheda Cibo mostra anche quanto resterebbe con tutto il pianificato.
- **Obiettivi settimanali** (blocco «🎯 Obiettivi della settimana» sotto la lista, in ogni sezione; «+ Nuovo»):
  - *Quantità* (es. 70.000 passi): inserisci il totale di ogni giorno come preferisci (20.000 un giorno, 5.000 un altro); vedi progresso e quanto manca.
  - *Sotto-obiettivi*: es. «Sessione 50 min ×3» e «Sessione 15 min ×3», oppure «Pagina home», «Rifacimento credits», «Bug fix». Li segni fatti quando vuoi (compaiono nell'elenco del giorno con 🎯) oppure li pianifichi in un giorno con 📅. Per gli esercizi puoi dare 🔥 kcal a ciascun sotto-obiettivo.
  - Le settimane vanno da lunedì a domenica; «Copia a settimana dopo» ripropone l'obiettivo. Le voci collegate non vengono riportate dal riporto automatico.
- I dati della versione 1.0 si migrano da soli.

## Novità 1.2 — Progressi
Quarta scheda **📊 Progressi**, con vista Giorno / Settimana / Mese (frecce per scorrere i periodi). Si ricalcola da sola a ogni modifica: aggiungere, spuntare o rimuovere voci cambia subito i numeri.
- Riepilogo: attività svolte (impegni + esercizi), giorni di fila, voci in programma, kcal spese, obiettivi completati.
- Tre riquadri: impegni, esercizi, cibo (kcal medie rispetto al budget).
- Grafici a colonne per giorno (attività svolte; kcal mangiate con la lineetta del budget). Tocca una colonna per aprire quel giorno.
- Alimentazione: media kcal e proteine, giorni nel budget, giorni con proteine raggiunte, totali.
- Obiettivi settimanali della settimana o del mese, con avanzamento.
Le percentuali contano solo le voci fino a oggi; quelle future figurano come «in programma».

## Novità 1.3 — Home e sfondi orari
- **Home** (si apre all'avvio): saluto, azioni rapide (+ Impegno, + Esercizio, + Pasto, Detta), riepilogo di oggi, prossime attività con spunta diretta, alimentazione e obiettivi della settimana.
- **Sfondi e tema in base all'ora italiana** (Europe/Rome, anche se il telefono è in un altro fuso): mattina 06:00–13:00, pomeriggio 13:01–17:00, sera 17:01–22:00, notte 22:01–05:59. Ogni sezione ha 4 illustrazioni (`assets/bg/<sezione>-<fascia>.webp`) con dissolvenza al cambio. Mattina e pomeriggio usano il tema chiaro, sera e notte quello scuro (prende il posto del tema automatico di sistema).
- Icone SVG del kit grafico per navigazione e impostazioni; titoli in serif; barra con 5 voci.

## Aggiornare da 1.0 / 1.1 / 1.2
Sovrascrivi `logic.js`, `app.js`, `style.css`, `sw.js`, `README.md` nel repository, poi commit e push. Apri l'app due volte per ricevere la nuova versione (la prima volta mostra ancora la vecchia dalla cache).

## Limiti da conoscere
- **Sveglie**: con l'app aperta o da poco in background arrivano puntuali; con l'app chiusa Android può ritardarle o non consegnarle (limite delle web app). Per un avviso sicuro usa "Aggiungi al calendario (.ics)" nella scheda della voce.
- **Foto**: una web app non può leggere automaticamente una cartella: le foto si scelgono dalla galleria e vengono copiate nell'app.
- **PIN**: blocca l'accesso all'app ma i dati nel browser non sono cifrati. Se lo dimentichi, l'unico modo è cancellare i dati del sito da Chrome (perdi tutto: fai prima un backup).
- **Dettatura**: usa il riconoscimento vocale di Chrome, che invia l'audio ai server di Google.
- Se cancelli i dati del browser o disinstalli l'app, i dati vanno persi: esporta ogni tanto un backup.
