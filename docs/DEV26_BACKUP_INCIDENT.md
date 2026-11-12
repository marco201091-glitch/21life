# Incidente durante la verifica Dev del backup v2

12 novembre 2026. Ambiente coinvolto: **solo Supabase Dev**. Nessun deploy,
operazione sul database o modifica delle protezioni di produzione.

## Errore e impatto osservato

Durante l'aggiunta del confronto esatto degli ACL degli schemi, il blocco
`DO ... REVOKE` destinato al database di ripristino è stato inserito per errore
nella query che leggeva il catalogo sorgente. Il codice eseguito da questo agente
ha quindi revocato temporaneamente privilegi degli schemi Dev. I dati delle
partite non erano oggetto del comando; Auth/REST Dev e il cleanup delle fixture
hanno manifestato errori di permessi. Un E2E concorrente è fallito prima di creare
il gruppo. Nessun merge/deploy è stato avviato.

Il controllo schema ACL del clone ha rilevato la discrepanza e fallito la prova.
Il clone e la directory cloud temporanea sono stati eliminati dal cleanup; il
pacchetto privato di errore è stato conservato con permessi0700 sulla VM.

## Recupero effettuato

- Ripristinate le istruzioni ACL degli schemi ordinari dal pg_dump acquisito
  **prima** della revoca, conservato nel pacchetto privato.
- Per graphql e graphql_public usato `pg_init_privs`, che conserva gli ACL
  iniziali dell'estensione; ripristinati anche gli owner e i grant option.
- Ripristinati i grant predefiniti PUBLIC USAGE su public e net, la cui mancanza
  era visibile come due REVOKE aggiuntivi rispetto al dump precedente.
- Confronto normalizzato del nuovo pg_dump: **38 comandi ACL degli schemi
  ordinari uguali alla copia precedente**, zero comandi aggiunti/mancanti.
  GraphQL: ACL confrontati con pg_init_privs, corrispondenza verificata.
- Auth admin e lettura REST con service role nuovamente funzionanti; rimossi
  esattamente i due account e il bucket della fixture interrotta e verificata
  l'assenza dei due account. Nessun account reale cancellato.

Non si usa l'uguaglianza del checksum del file SQL come prova del ripristino
originale: l'ordine fisico dei record pg_namespace cambia dopo gli UPDATE degli
ACL e le query precedenti non imponevano un ordinamento. Le verifiche sopra
confrontano i comandi normalizzati e le autorizzazioni, non l'ordine dei byte.

## Correzione e prevenzione

- Reset ACL emesso **solo come testo nel file di recupero**, eseguito dal clone.
- Tutte le query SQL di catalogo del produttore passano da `read_source_sql`,
  che apre una transazione `BEGIN READ ONLY` e chiude con ROLLBACK.
- Test di regressione AST che vieta il DO mutante nella query dei cataloghi e
  verifica il wrapper read-only.
- Drill reale che tenta un GRANT idempotente dentro il wrapper: deve essere
  rifiutato dal server e lasciare invariato l'ACL prima/dopo.
- Drill corretto nuovamente passato:58tabelle, owner/ACL sia schemi sia tabelle,
  tutti i file Storage/hash/xattr, oggetti DB, login/REST e diniego cross-user,
  recupero configurazione dal pacchetto scaricato e cleanup verificato.

L'evidenza privata dell'incidente resta conservata per diagnosi; non va aggiunta
al repository o allegata a una PR. Le successive prove verdi non cancellano
l'incidente né lo trasformano in una verifica mai fallita.
