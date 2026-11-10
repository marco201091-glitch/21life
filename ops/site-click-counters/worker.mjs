const ORIGIN = 'https://21life.win';
const ALLOWED_EVENTS = new Set(['apk', 'web']);
const headers = { 'Access-Control-Allow-Origin': ORIGIN, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return new Response('ok', { headers });
    if (url.pathname !== '/click' || request.method !== 'POST') return new Response(null, { status: 404, headers });
    if (request.headers.get('Origin') !== ORIGIN) return new Response(null, { status: 403, headers });
    if (Number(request.headers.get('Content-Length') || 0) > 16 || !request.body) return new Response(null, { status: 400, headers });
    const reader = request.body.getReader();
    let bytes = new Uint8Array(0);
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        if (bytes.length + part.value.length > 16) { await reader.cancel(); return new Response(null, { status: 400, headers }); }
        const next = new Uint8Array(bytes.length + part.value.length);
        next.set(bytes); next.set(part.value, bytes.length); bytes = next;
      }
    } finally { reader.releaseLock(); }
    const event = new TextDecoder().decode(bytes);
    if (!ALLOWED_EVENTS.has(event)) return new Response(null, { status: 400, headers });
    try {
      await env.DB.prepare("INSERT INTO clicks (day, event, count) VALUES (date('now'), ?, 1) ON CONFLICT(day, event) DO UPDATE SET count = count + 1").bind(event).run();
      return new Response(null, { status: 204, headers });
    } catch {
      return new Response(null, { status: 503, headers });
    }
  },
};
