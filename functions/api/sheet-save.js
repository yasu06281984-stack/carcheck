// POST /api/sheet-save  -- 受付シートのデータを Supabase に保存し、共有用の id を返す
// 必要な環境変数: SUPABASE_URL, SUPABASE_SERVICE_KEY
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

import { getAuth } from './_auth.js';

function sbHeaders(key, extra) {
  const h = Object.assign({ 'apikey': key }, extra || {});
  if (key && key.slice(0, 3) === 'eyJ') h['Authorization'] = 'Bearer ' + key; // 旧service_role(JWT)のみBearer付与
  return h;
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: CORS });
    }
    const body = await request.json();
    const auth = await getAuth(request, env);
    const id = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    const row = { id: id, data: body, created_at: new Date().toISOString(), shop_id: auth ? auth.shopId : null };
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/sheets', {
      method: 'POST',
      headers: sbHeaders(env.SUPABASE_SERVICE_KEY, { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify(row)
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: 'db', detail: t }), { status: 500, headers: CORS });
    }
    return new Response(JSON.stringify({ id: id }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
}
