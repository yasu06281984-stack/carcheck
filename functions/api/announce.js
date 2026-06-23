// /api/announce
//   GET                         -> 全お知らせ一覧（公開/非公開含む）site_admin のみ
//   POST {action:'create', title, body, published}
//   POST {action:'delete', id}
// 必要な環境変数: SUPABASE_URL, SUPABASE_SERVICE_KEY
import { getAuth } from './_auth.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
function restHeaders(key, extra) {
  const h = Object.assign({ 'apikey': key, 'Content-Type': 'application/json' }, extra || {});
  if (key && key.slice(0, 3) === 'eyJ') h['Authorization'] = 'Bearer ' + key;
  return h;
}
function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: CORS }); }

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } });
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'not_configured' }, 503);
    const auth = await getAuth(request, env);
    if (!auth || auth.role !== 'site_admin') return json({ error: 'forbidden' }, 403);
    const base = env.SUPABASE_URL.replace(/\/+$/, '');
    const r = await fetch(base + '/rest/v1/announcements?select=id,title,body,published,created_at&order=created_at.desc', { headers: restHeaders(env.SUPABASE_SERVICE_KEY) });
    const rows = r.ok ? await r.json() : [];
    return json(rows, 200);
  } catch (e) { return json({ error: String(e) }, 500); }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'not_configured' }, 503);
    const auth = await getAuth(request, env);
    if (!auth || auth.role !== 'site_admin') return json({ error: 'forbidden' }, 403);
    const body = await request.json().catch(function () { return {}; });
    const base = env.SUPABASE_URL.replace(/\/+$/, '');

    if (body.action === 'delete') {
      if (!body.id) return json({ error: 'no_id' }, 400);
      const d = await fetch(base + '/rest/v1/announcements?id=eq.' + encodeURIComponent(body.id), { method: 'DELETE', headers: restHeaders(env.SUPABASE_SERVICE_KEY) });
      if (!d.ok) { const t = await d.text(); return json({ error: 'del_' + d.status, detail: t }, 500); }
      return json({ ok: true }, 200);
    }

    // create
    const title = (body.title || '').trim();
    const text = (body.body || '').trim();
    if (!title) return json({ error: 'no_title' }, 400);
    const published = body.published === false ? false : true;
    const ins = await fetch(base + '/rest/v1/announcements', {
      method: 'POST',
      headers: restHeaders(env.SUPABASE_SERVICE_KEY, { 'Prefer': 'return=representation' }),
      body: JSON.stringify({ title: title, body: text, published: published })
    });
    if (!ins.ok) { const t = await ins.text(); return json({ error: 'create_' + ins.status, detail: t }, 500); }
    const rows = await ins.json();
    return json({ ok: true, item: rows && rows[0] }, 200);
  } catch (e) { return json({ error: String(e) }, 500); }
}
