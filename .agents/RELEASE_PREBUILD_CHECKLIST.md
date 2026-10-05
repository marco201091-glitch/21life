# Checklist obbligatoria prima di compilare o distribuire

Leggere il [registro dei merge falliti](MERGE_FAILURES.md) prima di iniziare.
Controllare tutti i punti applicabili PRIMA di lanciare ogni build, creare o
pubblicare un tag, oppure avviare un deploy. Registrare le prove e gli SHA nella
voce del task in `PROJECT_CHECKLIST.md`. Un punto non verificato blocca il passo
che ne dipende; non equivale a un risultato positivo.

## 1. Arresto sugli errori

- [ ] In PowerShell abilitare l'arresto su errori PowerShell e comandi nativi:

  ```powershell
  $ErrorActionPreference = 'Stop'
  $PSNativeCommandUseErrorActionPreference = $true
  ```

  Se il secondo parametro non è supportato, controllare `$LASTEXITCODE`
  immediatamente dopo OGNI comando nativo e lanciare `throw` se diverso da zero.
  `$ErrorActionPreference` da solo non garantisce questo controllo.
- [ ] Nell'orchestrazione degli strumenti, controllare `exit_code` e l'esito API
  prima di qualsiasi chiamata dipendente. Una sessione ancora in esecuzione non
  prova il successo. Non continuare perché l'ultimo comando del blocco è riuscito.
- [ ] Dopo un fallimento o risposta incerta, fermare tag/build/deploy dipendenti,
  rileggere lo stato remoto e aggiornare `MERGE_FAILURES.md` prima di riprovare.

## 2. Merge realmente concluso

- [ ] Destinazione richiesta confermata: `main` per web/APK/IPA produzione;
  `fdroid-prep` per la variante F-Droid; `Dev` solo per sviluppo.
- [ ] PR corretta, SHA sorgente atteso, check obbligatori verdi e conflitti risolti.
  Non usare admin bypass o cambiare protezioni per superare un errore.
- [ ] Comando merge riuscito E API/stato remoto della PR `MERGED`, con SHA del
  merge presente. In caso di errore API non presumere né successo né fallimento.
- [ ] `git fetch origin <destinazione>` riuscito; HEAD del worktree di build
  coincide con il commit remoto finale atteso.
- [ ] Albero e modifiche funzionali attese verificati. Un solo messaggio «merge
  riuscito», un branch locale o l'assenza di conflitti non bastano.

## 3. Sorgenti e versione

- [ ] Worktree di build pulito e separato dalle modifiche locali del PM.
- [ ] Versione di package web/mobile e lockfile coerente con la release.
- [ ] `expo/app.json`, versionCode Android, buildNumber iOS e versioni visualizzate
  coerenti. Correzione richiesta effettivamente presente nei sorgenti.
- [ ] Controlli richiesti passati sui sorgenti candidati. Dopo il merge confermare
  l'uguaglianza dell'albero; nuove modifiche richiedono nuova verifica pertinente.
- [ ] Tag annotato creato solo dopo le verifiche del merge e delle versioni.
  `git rev-parse '<tag>^{}'` coincide con il commit finale richiesto; dopo il push
  verificare anche il riferimento remoto. Non spostare tag di release esistenti.

## 4. Ambiente e avvio

- [ ] Ambiente produzione confermato per ogni piattaforma: API/Supabase,
  identificativo app, profilo EAS, firma Android e branch Dokploy.
- [ ] Migrazioni necessarie revisionate, autorizzate per la destinazione,
  applicate e verificate; backup richiesto verificato prima delle modifiche.
- [ ] APK, IPA e web usano tutti lo SHA finale richiesto. Se il PM dice «tutto su
  main», non avviare in anticipo uno dei build da Dev, anche a parità di albero.
- [ ] Solo ora lanciare ogni build/deploy; annotare piattaforma, ID, versione e
  SHA restituiti. Una richiesta rifiutata non è una build avviata.
- [ ] Confermare accettazione/avvio. Monitorare fino alla conclusione soltanto
  quando richiesto dal PM. Non dichiarare «pubblicato» o «completato» a questo punto.

