# Registro dei merge falliti

Prima di ogni nuova build leggere questo registro e la
[checklist pre-build](RELEASE_PREBUILD_CHECKLIST.md). A ogni merge fallito o con
esito incerto aggiungere una voce prima di proseguire. Distinguere fatti verificati,
cause ancora sconosciute e conseguenze. Non registrare token o altri segreti.
L'avanzamento dei task resta in `PROJECT_CHECKLIST.md`.

## 2026-10-05, 16:22 Europe/Rome — promozione 9.0.5, PR #155

- **Operazione:** `gh pr merge 155 --merge`, destinazione `main`, sorgente Dev
  `caacfd96700351699a0f2c669eb3872312e00803`.
- **Errore verificato:** GitHub GraphQL ha risposto «Something went wrong while
  executing your query». ID diagnostico `7CA6:206F5B:2D80574:2D33796:6AC3B2A1`.
  La causa interna di GitHub non è accertata. Non era un conflitto confermato:
  la PR era ancora OPEN/CLEAN e il merge non era avvenuto.
- **Errore nel nostro flusso:** la sequenza PowerShell non interrompeva i comandi
  successivi al codice di uscita nonzero di `gh`. Anche il confronto degli alberi
  fallito non fermava la sequenza. Sono stati eseguiti checkout, tag e deploy
  senza verificare il successo dei prerequisiti.
- **Conseguenze:** `v9.0.5` puntava temporaneamente al vecchio main `1c319233`,
  versione 9.0.4. Il [run 37324188214](https://github.com/marco201091-glitch/PhyrexianArena/actions/runs/37324188214)
  è fallito in «Resolve and validate release version» con «Tag/input version
  9.0.5 does not match expo/app.json version 9.0.4». Nessuna release 9.0.5 era
  pubblicata da quel run. È stato accodato anche un deploy del vecchio main.
- **Recupero verificato:** stato PR e SHA riletti; tag errato rimosso dopo verifica
  dell'assenza della release; merge REST con SHA atteso riuscito. La
  [PR #155](https://github.com/marco201091-glitch/PhyrexianArena/pull/155)
  risulta MERGED dal 2026-10-05 alle 16:23:22 Europe/Rome, commit
  `c90f5c818dc9d0304176c76df8663a46f788d09d`. Albero identico a Dev testato,
  versioni 9.0.5/90005 e correzione Archidekt verificate. Tag corretto e tre build
  avviati da quel commit. Questo registro non attesta il completamento dei build.
- **Prevenzione obbligatoria:** stop su ogni errore nativo; verifica del merge
  remoto prima del checkout; verifica di commit, contenuto, versione e tag prima
  di qualsiasi compilazione, push del tag o deploy.

## Modello per i prossimi fallimenti

- Data/ora Europe/Rome, PR, destinazione e SHA sorgente atteso:
- Comando, codice di uscita, errore/API o link al log:
- Stato remoto osservato dopo l'errore:
- Causa verificata / causa sconosciuta:
- Conseguenze e operazioni realmente eseguite:
- Correzione applicata e prova del recupero:
- Controllo preventivo aggiunto alla checklist:

