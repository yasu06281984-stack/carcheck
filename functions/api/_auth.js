// 共有: ログインユーザーのトークンを検証し、shop_id / role を返す
// ファイル名が _ で始まるためルートにはならない（共有モジュール）
const PUBLISHABLE = 'sb_publishable_5Wc1cQ4nYDejKaxQt7Clag_BXiVs4DL';

function svcHeaders(key, extra) {
  const h = Object.assign({ 'apikey': key }, extra || {});
  if (key && key.slice(0, 3) === 'eyJ') h['Authorization'] = 'Bearer ' + key;
  return h;
}

export async function getAuth(request, env) {
  try {
    const auth = request.headers.get('Authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const token = m[1];
    const base = (env.SUPABASE_URL || '').replace(/\/+$/, '');
    // 1) トークンからユーザーを取得（公開キーをapikeyに、ユーザートークンをBearerに）
    const ur = await fetch(base + '/auth/v1/user', {
      headers: { 'apikey': PUBLISHABLE, 'Authorization': 'Bearer ' + token }
    });
    if (!ur.ok) return null;
    const user = await ur.json();
    if (!user || !user.id) return null;
    // 2) プロフィールから shop_id / role（サーバー鍵で取得＝改ざん不可）
    const pr = await fetch(base + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=shop_id,role', {
      headers: svcHeaders(env.SUPABASE_SERVICE_KEY)
    });
    if (!pr.ok) return { uid: user.id, shopId: null, role: null };
    const rows = await pr.json();
    const p = (rows && rows[0]) || {};
    return { uid: user.id, shopId: p.shop_id || null, role: p.role || null };
  } catch (e) {
    return null;
  }
}
