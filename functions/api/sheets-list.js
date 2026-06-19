// GET /api/sheets-list?type=estimate&days=30  -- 期間内の見積もりシート一覧
// 必要な環境変数: SUPABASE_URL, SUPABASE_SERVICE_KEY
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function sbHeaders(key, extra) {
  const h = Object.assign({ 'apikey': key }, extra || {});
  if (key && key.slice(0, 3) === 'eyJ') h['Authorization'] = 'Bearer ' + key;
  return h;
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: CORS });
    }
    const u = new URL(request.url);
    const type = u.searchParams.get('type') || 'estimate';
    let days = parseInt(u.searchParams.get('days') || '30', 10);
    if (!(days > 0) || days > 366) days = 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const q = env.SUPABASE_URL + '/rest/v1/sheets'
      + '?select=id,created_at,data'
      + '&created_at=gte.' + encodeURIComponent(since)
      + '&data->>sheetType=eq.' + encodeURIComponent(type)
      + '&order=created_at.desc&limit=50';
    const r = await fetch(q, { headers: sbHeaders(env.SUPABASE_SERVICE_KEY) });
    if (!r.ok) return new Response(JSON.stringify({ error: 'db' }), { status: 500, headers: CORS });
    const rows = await r.json();
    const list = (rows || []).map(function (row) {
      const d = row.data || {};
      const c = d.cust || {};
      return { id: row.id, created_at: row.created_at, name: c.name || '', v: d.v || '', estDate: d.estDate || '' };
    });
    return new Response(JSON.stringify(list), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
}
