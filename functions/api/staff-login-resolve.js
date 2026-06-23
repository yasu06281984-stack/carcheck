// POST /api/staff-login-resolve  -- 店舗コード＋氏名 から ログイン用メールを引く（ログイン前に使用）
// body: { code, name }  返り: { ok, email }  （パスワードは扱わない＝Supabase側で検証）
// 必要な環境変数: SUPABASE_URL, SUPABASE_SERVICE_KEY
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function adminHeaders(key) { return { 'apikey': key, 'Authorization': 'Bearer ' + key }; }
function restHeaders(key) {
  const h = { 'apikey': key };
  if (key && key.slice(0, 3) === 'eyJ') h['Authorization'] = 'Bearer ' + key;
  return h;
}
function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: CORS }); }

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'not_configured' }, 503);
    const body = await request.json().catch(function () { return {}; });
    const code = (body.code || '').trim().toUpperCase();
    const name = (body.name || '').replace(/\s/g, '');
    if (!code || !name) return json({ error: 'bad_input' }, 400);

    const base = env.SUPABASE_URL.replace(/\/+$/, '');
    const pr = await fetch(base + '/rest/v1/profiles?login_code=eq.' + encodeURIComponent(code) + '&login_name=eq.' + encodeURIComponent(name) + '&role=eq.staff&select=id&limit=1', { headers: restHeaders(env.SUPABASE_SERVICE_KEY) });
    const rows = pr.ok ? await pr.json() : [];
    if (!rows || !rows[0]) return json({ error: 'not_found' }, 404);
    const uid = rows[0].id;

    const ur = await fetch(base + '/auth/v1/admin/users/' + encodeURIComponent(uid), { headers: adminHeaders(env.SUPABASE_SERVICE_KEY) });
    if (!ur.ok) return json({ error: 'user_' + ur.status }, 500);
    const user = await ur.json();
    const email = user && user.email;
    if (!email) return json({ error: 'no_email' }, 500);

    return json({ ok: true, email: email }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}
