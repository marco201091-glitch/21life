# Site click counters

The public site sends only `apk` or `web` to the Cloudflare Worker. The Worker increments daily aggregate counters in D1 with one atomic statement. It does not persist IP addresses, URLs, cookies or user identifiers. Requests are restricted to the site origin, but counts represent browser events and can include bots or be missed if scripts/network are blocked.

Production endpoint: `https://21life-clicks.21life-stats.workers.dev/click`. The `DB` D1 binding and table are defined by `database-id.json` and `schema.sql`. In the Cloudflare dashboard open **Workers & Pages → D1 → 21life-site-click-counters → Console** and run:

```sql
SELECT event, SUM(count) AS clicks FROM clicks GROUP BY event ORDER BY event;
```

For daily totals use `SELECT day, event, count FROM clicks ORDER BY day DESC, event;`. Only authorized Cloudflare account members can read the database. The web client does not expose credentials. D1 quota failures return 503 and do not interrupt the visitor. Configure alerts for Cloudflare usage and back up the D1 database according to its retention policy.

Run `node --test ops/site-click-counters/worker.test.mjs` for Worker checks. The website source lives in the separate `website-21life` checkout; its renderer loads `click-counters.js` and allows only the endpoint in CSP.
