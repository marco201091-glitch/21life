# Mazzi eliminati e storico

Quando un mazzo usato viene eliminato da 21Life, il database conserva un riferimento storico non ripristinabile: non compare nel profilo, nell'archivio o nei selettori. Snapshot e identità delle partecipazioni rimangono disponibili per partite, classifiche e trofei. I mazzi mai usati sono eliminati fisicamente. Una partita in corso continua; nuove partite non possono selezionare quel riferimento.

Le app esistenti continuano a usare la DELETE originale. La sincronizzazione automatica Archidekt non reinserisce un mazzo eliminato, mentre un'importazione esplicita può creare un nuovo mazzo. Se una lista scompare da Archidekt, i dati 21Life e lo storico non vengono eliminati. La cancellazione dell'account continua a rimuovere i dati associati. Nessun recupero dei mazzi già eliminati.

Verifica su un database Dev/isolato con almeno un mazzo Archidekt e partite: `scripts/qa/deleted-deck-history.sql` usa transazioni annullate e controlla la DELETE autenticata, profilo e selettore, storico/statistiche, sincronizzazione, partita attiva e cancellazione account. Usare il runner SSH per Dev; non usare questo script su produzione.
