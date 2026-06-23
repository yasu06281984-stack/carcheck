// GET /api/shop-members  -- 全店舗の所属メンバー（氏名・権限・メール）一覧
// site_admin のみ。必要な環境変数: SUPABASE_URL, SUPABASE_SERVICE_KEY
import { getAuth } from './_auth.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function adminHeaders(key) { return { 'apikey': key, 'Authorization': 'Bearer ' + key }; }
function restHeaders(key) {
  const h = { 'apikey': key };
  if (key && key.slice(0, 3) === 'eyJ') h['Authorization'] = 'Bearer ' + key;
  return h;
}
function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: CORS }); }

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'not_configured' }, 503);
    const auth = await getAuth(request, env);
    if (!auth || auth.role !== 'site_admin') return json({ error: 'forbidden' }, 403);

    const base = env.SUPABASE_URL.replace(/\/+$/, '');

    // 店舗所属のプロフィール
    const pr = await fetch(base + '/rest/v1/profiles?select=id,role,name,shop_id&shop_id=not.is.null', { headers: restHeaders(env.SUPABASE_SERVICE_KEY) });
    const profs = pr.ok ? await pr.json() : [];

    // メール（Admin API）
    const ur = await fetch(base + '/auth/v1/admin/users?per_page=200', { headers: adminHeaders(env.SUPABASE_SERVICE_KEY) });
    const uj = ur.ok ? await ur.json() : {};
    const users = (uj && uj.users) ? uj.users : (Array.isArray(uj) ? uj : []);
    const emailById = {};
    users.forEach(function (u) { emailById[u.id] = u.email || ''; });

    const members = (profs || []).map(function (p) {
      return { shop_id: p.shop_id, id: p.id, role: p.role || '', name: p.name || '', email: emailById[p.id] || '' };
    });

    return json(members, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}
