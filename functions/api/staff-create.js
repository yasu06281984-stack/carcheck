// POST /api/staff-create  -- メール不要でスタッフを追加（店舗管理者・VIPのみ）
// body: { sei, mei, password(8桁数字) }
// 返り: { ok, loginName, code, password, name }
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
function rand(n) { var c = 'abcdefghijklmnopqrstuvwxyz0123456789', o = ''; for (var i = 0; i < n; i++) o += c[Math.floor(Math.random() * c.length)]; return o; }

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'not_configured' }, 503);
    const auth = await getAuth(request, env);
    if (!auth || auth.role !== 'shop_admin' || !auth.shopId) return json({ error: 'forbidden' }, 403);

    const body = await request.json().catch(function () { return {}; });
    const sei = (body.sei || '').trim();
    const mei = (body.mei || '').trim();
    const password = (body.password || '').trim();
    if (!sei || !mei) return json({ error: 'no_name' }, 400);
    if (!/^[0-9]{8}$/.test(password)) return json({ error: 'bad_password' }, 400);

    const base = env.SUPABASE_URL.replace(/\/+$/, '');

    // 店舗のVIP判定＋店舗コード取得
    const sr = await fetch(base + '/rest/v1/shops?id=eq.' + encodeURIComponent(auth.shopId) + '&select=plan,vip_expires_at,code', { headers: restHeaders(env.SUPABASE_SERVICE_KEY) });
    const shops = sr.ok ? await sr.json() : [];
    const shop = shops && shops[0];
    if (!shop) return json({ error: 'no_shop' }, 404);
    const vip = (shop.plan === 'vip') && (!shop.vip_expires_at || new Date(shop.vip_expires_at) > new Date());
    if (!vip) return json({ error: 'not_vip' }, 403);
    const code = shop.code;
    if (!code) return json({ error: 'no_code' }, 500);

    // ログイン氏名（スペース除去）＋同姓同名は自動連番
    const baseName = (sei + mei).replace(/\s/g, '');
    const ex = await fetch(base + '/rest/v1/profiles?login_code=eq.' + encodeURIComponent(code) + '&select=login_name', { headers: restHeaders(env.SUPABASE_SERVICE_KEY) });
    const taken = {};
    (ex.ok ? await ex.json() : []).forEach(function (p) { if (p.login_name) taken[p.login_name] = 1; });
    let loginName = baseName, i = 2;
    while (taken[loginName]) { loginName = baseName + i; i++; }

    const display = (sei + ' ' + mei).trim();
    const email = ('s-' + code + '-' + rand(6)).toLowerCase() + '@staff.nyukokarte.com';

    // 認証ユーザー作成（メール確認なし＝即有効）
    const cr = await fetch(base + '/auth/v1/admin/users', {
      method: 'POST',
      headers: adminHeaders(env.SUPABASE_SERVICE_KEY),
      body: JSON.stringify({ email: email, password: password, email_confirm: true, user_metadata: { role: 'staff', shop_id: auth.shopId } })
    });
    if (!cr.ok) { const t = await cr.text(); return json({ error: 'user_create_' + cr.status, detail: t }, 500); }
    const user = await cr.json();
    const uid = user && user.id;
    if (!uid) return json({ error: 'no_uid' }, 500);

    // プロフィール登録
    const up = await fetch(base + '/rest/v1/profiles?on_conflict=id', {
      method: 'POST',
      headers: restHeaders(env.SUPABASE_SERVICE_KEY, { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({ id: uid, role: 'staff', shop_id: auth.shopId, name: display, login_code: code, login_name: loginName, email: email })
    });
    if (!up.ok) {
      const t = await up.text();
      // 後始末：作成したユーザーを削除（プロフィール失敗時）
      try { await fetch(base + '/auth/v1/admin/users/' + uid, { method: 'DELETE', headers: adminHeaders(env.SUPABASE_SERVICE_KEY) }); } catch (e) {}
      return json({ error: 'profile_' + up.status, detail: t }, 500);
    }

    return json({ ok: true, loginName: loginName, code: code, password: password, name: display }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}
