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


## 2026-10-08 — ritorno hotfix main nel candidato Dev
- Merge locale origin/main c3d5ae34 nella feature chore/21life-domain b632fff: git merge exit1, conflitto soltanto PROJECT_CHECKLIST.md per note aggiunte alla stessa posizione.
- Verifica remota: PR175 MERGED, commit c3d5ae34; nessun build/tag/deploy dipendente avviato dopo il conflitto.
- Risoluzione revisionata: mantenere tutte le note rebranding e il record incidente comune; nessuna differenza applicativa rispetto ai due candidati testati. Conservare ancestry main, senza subset di schema/test.
- Prevenzione: verificare i conflitti checklist su back-merge e fermare build/deploy finche markers e file unmerged non sono assenti.

## 2026-10-12 — PR #193, controllo merge web bloccato da Archidekt
- Sorgente 7fab6cd978bbb33de957ba5a3d9c225fff68b9af, destinazione main. Nessun tentativo di merge/deploy effettuato; PR OPEN/BLOCKED.
- Quality run 38225800252: 342 test passati, 2 falliti in deck-importers-server.test.ts per HTTP403 Archidekt dal runner GitHub; lint/typecheck, Expo e CodeQL passati.
- Causa verificata: due unit test dipendevano da deck pubblici e immagini live; codice importazione invariato rispetto a main. Nessun problema UI individuato.
- Recupero: risposte pubbliche ridotte Archidekt/Scryfall salvate come fixture, fetch intercettato solo nei test, URL inattesi rifiutati e globals ripristinati. I due test passano senza rete; nuovo controllo CI richiesto prima del merge.
- Prevenzione: controllare che unit test importazione usino fixture, non servizi esterni; nessun bypass protezioni o retry deploy.
- Aggiornamento run38226544550: tutti344test verdi, soglia coverage per-file importatore non raggiunta dalle risposte ridotte (functions60.29<61.76, statements48.78<49.59). Aggiunti casi pertinenti top-level commander, bracket HTML frammentato e HTTP403; 346test verdi e ratchet103file passato, soglie invariate. Nessun merge/deploy effettuato.

## 2026-10-12 — PR193 desktop counter click regression
- Run38227127337: quality/build passed,25E2Epassed/4skip,3desktop life-feedback failures. PR not merged; no deployment launched.
- Root cause reproduced locally: desktop transition-property override removed transform/translate/scale animation. Existing active translate-y-px jumps a centered counter button away from pointer before mouseup; its rotated wrapper intercepts clicks. Without override the same real click changes40to41; with override timeout/life40.
- Recovery: remove only transition-property override, retaining Button default transition-all; phone and gameplay logic unchanged. Verify existing desktop/mobile life-feedback tests on fresh build and remote required checks before merge.
- Prevention: desktop restyle changes to shared Button must run actual quick-game life-feedback E2E, including normal/system/app reduced motion; setup-only smoke is insufficient.

## 2026-10-13  -  allineamento F-Droid 9.1.2
- Merge locale origin/main23b23fe nel candidato dafdroid-prepbfe6af2 exit1: conflitti versione/flavor/ledger. Nessun merge remoto o build dipendente avviato.
- Risoluzione: albero main testato, riapplicate solo differenze F-Droid documentate. Nessun bypass scanner o protezioni. Verificare zero unmerged, versione e gates prima build/tag.

## 2026-10-13 — gate F-Droid PR194
- Quality38409246980 Expo failed su doctor:ci: 7patchSDK pubblicate dopo main23b23fe (@expo/ui,expo,crypto,router,screen-orientation,sharing,splash-screen). 314test/coverage verdi; PR194 OPEN, nessunmerge/tag/buildrelease. Nessunbypass: aggiornare solo patch raccomandate e verificare nuovo grafo/audit/source/autolinking prima merge.
- Prevenzione: doctor:ci sul candidato prima push e preservare il gate strict anche per F-Droid.

## 2026-10-13 — reference F-Droid checkout tag
- Run38412681575 failed prima build nel nuovo checkgitcat-file tag. PR194 MERGED436fe32 e tagremoto annotatodaaac5be->436fe32 verificati; nessunAPK pubblicato.
- Causa verificata logactionscheckout: fetch +436fe32:refs/tags/fdroid-v9.1.2 sovrascrive solo il tag locale con ref lightweight. Tagremoto immutato. Recupero: rifetch del tag annotato remoto prima verifica e dispatch orchestrazione separata con checkout tagimmutabile; stessoSHA436fe32 obbligatorio, nessunmovimento del tag.
- Prevenzione: test riproduce checkoutlightweight; verificare tagremoto/fetch annotato/ancestry/HEAD; separareSHAorchestrazione daSHAsorgenti nei rerun.
