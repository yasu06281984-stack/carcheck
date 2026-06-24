// POST /api/setup-shop  -- ログイン本人の店舗を自動作成（VIP30日）＋登録情報を反映＋本人を店舗管理者に
// 認証ユーザー本人のみ（自分の店舗を1つ作る）。冪等：既に店舗があれば作らない。
// 必要な環境変数: SUPABASE_URL, SUPABASE_SERVICE_KEY
import { getAuth } from './_auth.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function adminHeaders(key) { return { 'apikey': key, 'Authorization': 'Bearer ' + key }; }
function restHeaders(key, extra) {
  const h = Object.assign({ 'apikey': key, 'Content-Type': 'application/json' }, extra || {});
  if (key && key.slice(0, 3) === 'eyJ') h['Authorization'] = 'Bearer ' + key;
  return h;
}
function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: CORS }); }
function genCode() { var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', o = ''; for (var i = 0; i < 6; i++) o += c[Math.floor(Math.random() * c.length)]; return o; }
async function ensureUniqueCode(base, key) {
  for (var k = 0; k < 25; k++) {
    var code = genCode();
    var r = await fetch(base + '/rest/v1/shops?code=eq.' + code + '&select=id', { headers: restHeaders(key) });
    var rows = r.ok ? await r.json() : [];
    if (!rows.length) return code;
  }
  return genCode() + ('' + Date.now()).slice(-2);
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
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'not_configured' }, 503);
    const auth = await getAuth(request, env);
    if (!auth || !auth.uid) return json({ error: 'unauthorized' }, 401);

    // すでに店舗を持っている（=セットアップ済み）なら、コード未発行のときだけ発行して返す
    if (auth.shopId) {
      const base0 = env.SUPABASE_URL.replace(/\/+$/, '');
      const cr0 = await fetch(base0 + '/rest/v1/shops?id=eq.' + encodeURIComponent(auth.shopId) + '&select=code', { headers: restHeaders(env.SUPABASE_SERVICE_KEY) });
      const c0 = cr0.ok ? await cr0.json() : [];
      let code0 = c0 && c0[0] && c0[0].code;
      if (!code0) {
        code0 = await ensureUniqueCode(base0, env.SUPABASE_SERVICE_KEY);
        await fetch(base0 + '/rest/v1/shops?id=eq.' + encodeURIComponent(auth.shopId), { method: 'PATCH', headers: restHeaders(env.SUPABASE_SERVICE_KEY, { 'Prefer': 'return=minimal' }), body: JSON.stringify({ code: code0 }) });
      }
      return json({ ok: true, already: true, shopId: auth.shopId, code: code0 }, 200);
    }

    const base = env.SUPABASE_URL.replace(/\/+$/, '');

    // 本人の登録情報（user metadata）を取得
    const ur = await fetch(base + '/auth/v1/admin/users/' + encodeURIComponent(auth.uid), { headers: adminHeaders(env.SUPABASE_SERVICE_KEY) });
    if (!ur.ok) return json({ error: 'user_' + ur.status }, 500);
    const user = await ur.json();
    const meta = (user && user.user_metadata) || {};
    const company = (meta.company || '').trim();
    const owner = (meta.owner || '').trim();
    const tel = (meta.tel || '').trim();
    const address = (meta.address || '').trim();
    if (!company) return json({ ok: false, error: 'no_metadata' }, 200);

    // 店舗を VIP30日 で作成（店舗コードを発行）
    const now = Date.now();
    const exp = new Date(now + 30 * 86400000).toISOString();
    const newCode = await ensureUniqueCode(base, env.SUPABASE_SERVICE_KEY);
    const ins = await fetch(base + '/rest/v1/shops', {
      method: 'POST',
      headers: restHeaders(env.SUPABASE_SERVICE_KEY, { 'Prefer': 'return=representation' }),
      body: JSON.stringify({
        name: company, company: company, address: address, tel: tel, code: newCode,
        plan: 'vip', status: 'active', billing: 'monthly',
        storage_limit_gb: 5, vip_expires_at: exp, trial_ends_at: exp, trial_used: true
      })
    });
    if (!ins.ok) { const t = await ins.text(); return json({ error: 'shop_create_' + ins.status, detail: t }, 500); }
    const rows = await ins.json();
    const shopId = rows && rows[0] && rows[0].id;
    if (!shopId) return json({ error: 'no_shop_id' }, 500);

    // 本人を店舗管理者に（profiles を upsert）
    const up = await fetch(base + '/rest/v1/profiles?on_conflict=id', {
      method: 'POST',
      headers: restHeaders(env.SUPABASE_SERVICE_KEY, { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({ id: auth.uid, role: 'shop_admin', shop_id: shopId, name: owner || company })
    });
    if (!up.ok) { const t = await up.text(); return json({ error: 'profile_' + up.status, detail: t }, 500); }

    return json({ ok: true, shopId: shopId }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}
