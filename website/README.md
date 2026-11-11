# 21Life — sito di presentazione

Progetto separato dall’app, pubblicato su `https://21life.win`.

## Aggiornamento 19 ottobre 2026

Sei pagine IT/EN: Home, Funzioni, Download, Guida, Confronto e Supporto. Sfondo fantasy in WebP e d20 originale 21Life. Gratuità e licenza MIT esplicite; F-Droid indicato come prossimamente, senza link store attivo. Confronto con Playgroup/Lifetap basato su fonti ufficiali, con attribuzione e data. Metadata per route, WebSite/SoftwareApplication/SoftwareSourceCode/WebPage e FAQPage coerente con le FAQ visibili, anteprime social e sitemap.

Cloudflare Web Analytics misura visite e pagine senza cookie di analytics. Il beacon viene caricato solo su `21life.win`, mai nelle anteprime locali. Il token nel bundle è pubblico e consente la raccolta, non la lettura delle statistiche. La dashboard richiede il login del proprietario Cloudflare; al preflight l’account ha un solo membro accettato. Non sono presenti contatori o statistiche pubbliche.

Dashboard: https://dash.cloudflare.com/7055da8c4183cd1c52f7c4e9cb823ee2/web-analytics/overview?siteTag~in=34e92b25e56042ceb1c3e08feff4d91b

Compilare con `node build.mjs`: `render-pages.mjs` rigenera tutte le pagine e applica SEO, beacon e CSP corrispondente in `nginx.conf` e `dist/_headers`. `site-metadata.mjs` contiene metadata e fatti del software; versione e APK provengono sempre da `dist/config.js`. `generate.mjs` è un alias compatibile dello stesso build. Dopo modifiche ai dati strutturati rigenerare prima di distribuire, poiché la CSP include tutti gli hash JSON-LD.

Verifiche correnti: anteprima sulla porta 4321 (`PORT=4321 node preview.mjs`), `node verify-site.cjs` per sei route/due lingue/tre viewport e accessibilità. Con `PREVIEW_URL=http://127.0.0.1:4321 node verify-publication.mjs` verificare dati strutturati, canonical, indicizzabilità e beacon sotto CSP di produzione: l’invio è intercettato per non creare visite di test. Le vecchie `verify.mjs`/`verify-motion.mjs` restano prove storiche del layout precedente e richiedono aggiornamenti prima dell’uso su questa versione.

## Contenuti

Home, info, download, guida, confronto e supporto/FAQ. Inglese predefinito, italiano selezionabile con `?lang=it` e preservato durante la navigazione. Menu mobile e copia indirizzo Obtainium. HTML prerenderizzato in inglese; titoli e descrizioni si aggiornano insieme al cambio lingua. Asset e font locali. Download Android/Web disponibili; F-Droid prossimamente, nessun link IPA.

## Aggiornamento e anteprima

Modificare `dist/app.js` per i contenuti e `dist/style.css` / `dist/refinement.css` per lo stile. Eseguire `node build.mjs` per rigenerare il pacchetto finale. Pubblicare la cartella `dist` con un host statico. Il file `_headers` è riconosciuto da Cloudflare Pages; altri host richiedono intestazioni equivalenti.

Anteprima locale: `node preview.mjs` e aprire `http://127.0.0.1:4319`. Verifica locale: `node verify.mjs` con il server attivo e Playwright disponibile nel progetto padre.

## Collegamenti verificati il 9 ottobre 2026

- Web app di produzione: `https://app.21life.win`, attiva con la 9.1.0. I vecchi endpoint sono mantenuti per compatibilità con i client installati.
- Sorgenti e release: `https://github.com/marco201091-glitch/21life`.
- APK 9.1.0 pubblica verificata: `dist/config.js` ha `downloadsEnabled: true` e il collegamento alla release ufficiale. SHA-256 `2f798b1b876548e9d981349c29b767e2d0d2e1d2555e9725f61ddf5ef0765f1e`; firma identica alla 9.0.5, package di produzione e versionCode 90100 verificati.
- Supporto: `support@21life.win`; invio/ricezione effettivi non verificati dal sito.
- Nessun link a IPA non presente nella release latest. F-Droid in revisione.

## Pubblicazione sul dominio

PM, 9 ottobre 2026: pubblicazione autorizzata tramite Dokploy dopo il rilascio verificato dell’APK 9.1.0 e della web app. Il Dockerfile usa Nginx senza privilegi, con immagine fissata tramite digest; `nginx.conf` applica le intestazioni di sicurezza, serve le cinque route statiche e restituisce una vera risposta 404. Il deploy usa un archivio contenente solo Dockerfile, configurazione Nginx e `dist/`. Preservare MX, SPF, DKIM e DMARC del dominio.

Checklist di lancio:

1. Verificare la release ufficiale 9.1.0, il nome effettivo dell’APK, firma e checksum prima di impostare il link corretto e `downloadsEnabled: true` in `dist/config.js`.
2. Verificare `app.21life.win`, login, privacy e condizioni sul dominio definitivo. L’eliminazione account è descritta nella sezione locale `/supporto/#account`, basandosi sulle Impostazioni documentate dall’app: il vecchio URL `/legal/delete-account` restituisce 404 ed è stato escluso.
3. Verificare lo stato della proposta F-Droid e aggiornare la relativa disponibilità. Non aggiungere IPA se non effettivamente pubblicata e verificata.
4. Eseguire `node generate.mjs`, `node verify.mjs` e controllare desktop/mobile. Leggere i gate di rilascio del progetto prima del deploy.
5. Pubblicare solo su istruzione PM insieme alla 9.1.0. Applicare TLS e intestazioni statiche dell’host, verificare cinque route, sitemap e 404, poi collegare il dominio.

## Identità e licenza

Emblema, wordmark e icona forniti dal progetto 21Life. Font Inter locale (SIL Open Font License, allegata in `dist/assets/INTER-LICENSE.txt`). La presentazione usa solo identità di marca e illustrazioni dei concetti: nessuna demo o riproduzione inventata dell’interfaccia dell’app.

## Motion refresh

`dist/motion.css` e `dist/motion.js` gestiscono ingressi coordinati, reveal allo scroll, feedback dei controlli, menu mobile e FAQ. Animazioni finite, senza librerie o loop di rendering. Il contenuto resta visibile senza JavaScript e senza IntersectionObserver; la preferenza di movimento ridotto viene rispettata anche quando cambia durante la visita. Il menu chiuso non riceve focus su mobile. Le transizioni tra pagine e la variazione di altezza delle FAQ usano miglioramenti CSS progressivi, con funzionamento nativo nei browser che non li supportano.

Verifica aggiuntiva: `node verify-motion.mjs`. Il controllo axe viene eseguito dopo il completamento degli ingressi e dopo aver attraversato tutte le sezioni. Nessun deploy effettuato.
