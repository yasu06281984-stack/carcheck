// /api/staff-manage  -- スタッフのパスワード変更／削除（店舗管理者・自店のスタッフのみ）
// POST body:
//   { action:'password', staffId, password(8桁数字) }
//   { action:'delete',   staffId }
// 必要な環境変数: SUPABASE_URL, SUPABASE_SERVICE_KEY
import { getAuth } from './_auth.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function adminHeaders(key, extra) { return Object.assign({ 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }, extra || {}); }
function restHeaders(key, extra) {
  const h = Object.assign({ 'apikey': key, 'Content-Type': 'application/json' }, extra || {});
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
    const auth = await getAuth(request, env);
    if (!auth || auth.role !== 'shop_admin' || !auth.shopId) return json({ error: 'forbidden' }, 403);

    const body = await request.json().catch(function () { return {}; });
    const action = body.action;
    const staffId = body.staffId;
    if (!staffId) return json({ error: 'no_staff' }, 400);

    const base = env.SUPABASE_URL.replace(/\/+$/, '');

    // 対象スタッフが「自分の店舗の staff」であることを確認（他店・自分自身の管理者は不可）
    const pr = await fetch(base + '/rest/v1/profiles?id=eq.' + encodeURIComponent(staffId) + '&select=role,shop_id,login_code,login_name,name', { headers: restHeaders(env.SUPABASE_SERVICE_KEY) });
    const rows = pr.ok ? await pr.json() : [];
    const prof = rows && rows[0];
    if (!prof) return json({ error: 'not_found' }, 404);
    if (prof.shop_id !== auth.shopId || prof.role !== 'staff') return json({ error: 'not_your_staff' }, 403);

    if (action === 'password') {
      const password = (body.password || '').trim();
      if (!/^[0-9]{8}$/.test(password)) return json({ error: 'bad_password' }, 400);
      const r = await fetch(base + '/auth/v1/admin/users/' + encodeURIComponent(staffId), {
        method: 'PUT',
        headers: adminHeaders(env.SUPABASE_SERVICE_KEY),
        body: JSON.stringify({ password: password })
      });
      if (!r.ok) { const t = await r.text(); return json({ error: 'pw_' + r.status, detail: t }, 500); }
      return json({ ok: true, code: prof.login_code, loginName: prof.login_name, name: prof.name, password: password }, 200);
    }

    if (action === 'delete') {
      // 認証ユーザー削除（profiles は FK/トリガ or 後続で削除）
      const du = await fetch(base + '/auth/v1/admin/users/' + encodeURIComponent(staffId), { method: 'DELETE', headers: adminHeaders(env.SUPABASE_SERVICE_KEY) });
      // プロフィールも明示的に削除（残っていれば）
      await fetch(base + '/rest/v1/profiles?id=eq.' + encodeURIComponent(staffId), { method: 'DELETE', headers: restHeaders(env.SUPABASE_SERVICE_KEY) });
      if (!du.ok && du.status !== 404) { const t = await du.text(); return json({ error: 'del_' + du.status, detail: t }, 500); }
      return json({ ok: true }, 200);
    }

    return json({ error: 'bad_action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}
