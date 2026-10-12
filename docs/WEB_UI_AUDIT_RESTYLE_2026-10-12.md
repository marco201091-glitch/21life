# Audit UI e restyle desktop web — 12 ottobre 2026

Implementato sul branch `style/web-site-alignment`, da `origin/Dev` (`0eec444998e21e873e261e1a228508e60f6e555d`). Ultimo commit applicativo verificato: `b504b4a`.

## Risultato

La web app desktop riprende il fondo quasi nero, il verde lime, i bordi sottili e i pannelli sobri del sito 21Life. Gli override di stile e le nuove griglie si attivano da 1024 px. Nessuna modifica a Expo, APK, IPA, dipendenze, backend, schema, versioni o pipeline. Nessun push, merge o deploy.

- Home: playgroup compatti in una griglia adattiva, riepilogo personale affiancato, analytics distribuiti su due colonne; nomi lunghi leggibili e accesso ai gruppi anche tramite link da tastiera.
- Profilo: mazzi in due colonne desktop, comandi adattati alla larghezza delle card; pannelli meno decorativi e intestazioni coerenti.
- Pagine applicative: contenitori e header desktop con larghezza/spaziature comuni; pulsanti primari lime, campi più sobri, tab con indicatore attivo.
- Accessibilità: etichette localizzate per icone di navigazione/uscita, immagini mana, filtri e controlli di configurazione contavita. I link di ritorno non contengono più pulsanti annidati. Le card mazzo conservano l'apertura al clic e usano il pulsante Dettagli per la tastiera, evitando controlli annidati dentro un elemento con ruolo button.
- Mana, mastery, premi, messaggi distruttivi e colori dei giocatori conservano il proprio significato. Il layout del contavita durante la partita resta intatto.

## Copertura delle 22 route

| Route | Verifica/intervento |
| --- | --- |
| `/` | Redirect pubblico e accesso alla home; comportamento preservato. |
| `/dashboard` | Layout desktop, card playgroup, riepilogo, analytics, modali Crea/Entra. |
| `/profile` | Header, griglia mazzi, filtri, accessibilità, apertura Dettagli con Enter. |
| `/profile/archived-decks` | Stile condiviso, contenitore desktop, titoli leggibili. |
| `/table/[id]` | Header/contenitore, titoli lunghi, azioni e tab, filtri etichettati. |
| `/table/[id]/play` | Configurazione live verificata; geometria di gioco preservata. |
| `/counter` | Configurazione coerente col tema desktop, campi/controlli etichettati. |
| `/arena/[code]` | Header, contenitore, pannello introduttivo, statistiche pubbliche. |
| `/join/[code]` | Invito pubblico e pulsanti condivisi verificati. Non eseguita adesione reale. |
| `/guest/claim/[token]` | Anteprima autenticata verificata; nessun trasferimento effettuato. |
| `/auth/login` | Pannello desktop sobrio, bottoni/form condivisi; autofill e rendering senza JS verificati. |
| `/auth/register` | Shell, pannello e controlli condivisi. |
| `/auth/forgot-password` | Shell, pannello e controlli condivisi. |
| `/auth/resend-confirmation` | Shell, pannello e controlli condivisi. |
| `/auth/check-email` | Shell e pannello condivisi. |
| `/auth/reset-password` | Stato pubblico senza token e shell condivisa verificati. |
| `/auth/turnstile` | Pagina tecnica preservata; fondo desktop armonizzato. Challenge esterna non eseguita. |
| `/legal/privacy` | Stile condiviso e navigazione accessibile; testo legale invariato. |
| `/legal/terms` | Stile condiviso e navigazione accessibile; testo legale invariato. |
| `/legal/cookies` | Stile condiviso e navigazione accessibile; testo legale invariato. |
| `/admin/operations` | Shell/contenitore, pannelli e controlli; contenuti con fixture sintetiche. |
| `/admin/access-logs` | Shell/contenitore, filtri etichettati; tabella con fixture sintetiche. |

## Verifica

- ESLint sui file web: superato; TypeScript: superato, anche nella build finale.
- Suite web: 344 test superati, 1 skip preesistente.
- `node node_modules/next/dist/bin/next build --webpack`: superato su `b504b4a`; nessun build nativo.
- Playwright UI: 46 controlli, copertura delle route e delle larghezze 391, 768, 1024, 1280, 1440 e 1920 px. Zero overflow orizzontali, errori JavaScript/boundary o violazioni axe serious/critical negli stati verificati. Inclusi modali Crea/Entra e Dettagli mazzo aperti da tastiera.
- Test Playwright esistenti: landing desktop e quattro controlli mobile superati. La baseline visiva mobile è passata senza aggiornamento.
- Review indipendente del diff: nessuna regressione importante; corretti feedback hover outline e colore Turnstile mobile.

Evidenze locali: `artifacts/web-restyle/results.json`, screenshot PNG e harness `verify-ui.mjs`. Dati e sessioni sono sintetici; un server locale simula i contratti dati. Nessuna credenziale reale o mutazione su Dev/produzione. Screenshot home: `artifacts/web-restyle/member--dashboard.png`.

## Limiti

L'audit riguarda UI e stati rappresentativi, non tutte le combinazioni di dati, permessi, risultati partita o flussi di scrittura. OAuth, email, challenge Turnstile e sincronizzazione live reale non sono stati esercitati. Il contavita in gioco non è stato riprogettato.

Il workspace riusa `node_modules` tramite junction: la build locale segnala 27 file di tracing fuori dalla radice, perciò l'output standalone locale non è certificato come pacchetto distribuibile. La verifica runtime usa `next start`. Node locale 24.18.0 è inferiore al minimo 24.21.0 indicato nel package: compilazione e controlli sono riusciti, ma prima del deploy serve l'ambiente release previsto dal progetto. Nessuna configurazione di build modificata per mascherare questi limiti.

Il lavoro resta sul branch locale indicato e non è pubblicato.
