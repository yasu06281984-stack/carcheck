// GET /api/sheet?id=xxxx  -- 保存済みの受付シートデータを返す
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
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'no_id' }), { status: 400, headers: CORS });
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/sheets?id=eq.' + encodeURIComponent(id) + '&select=data', {
      headers: sbHeaders(env.SUPABASE_SERVICE_KEY)
    });
    if (!r.ok) return new Response(JSON.stringify({ error: 'db' }), { status: 500, headers: CORS });
    const rows = await r.json();
    if (!rows.length) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: CORS });
    return new Response(JSON.stringify(rows[0].data), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
}
