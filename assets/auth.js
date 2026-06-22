// 受付アプリのログイン連携：未ログインならログイン画面へ。
// ログイン中はトークン・店舗ID・店舗情報を読み込む。
(function () {
  var SUPABASE_URL = 'https://ysxqnwxpuxfstvuobzuz.supabase.co';
  var SB_KEY = 'sb_publishable_5Wc1cQ4nYDejKaxQt7Clag_BXiVs4DL';
  if (!window.supabase) { return; }
  var sb = window.supabase.createClient(SUPABASE_URL, SB_KEY);
  window.csSB = sb;
  window.csLogout = function () { sb.auth.signOut().then(function () { location.replace('login.html'); }); };
  // トークン自動更新を反映
  sb.auth.onAuthStateChange(function (_e, session) { if (window.csAuth && session) { window.csAuth.token = session.access_token; } });

  window.csAuthReady = (async function () {
    var s = await sb.auth.getSession();
    if (!s.data || !s.data.session) { location.replace('login.html'); return null; }
    var sess = s.data.session, uid = sess.user.id;
    var p = await sb.from('profiles').select('role,name,shop_id').eq('id', uid).single();
    var prof = (p && p.data) || {};
    window.csAuth = { token: sess.access_token, shopId: prof.shop_id, name: prof.name, role: prof.role };
    if (prof.shop_id) {
      var sh = await sb.from('shops').select('name,company,address,tel,hours,url,plan,vip_expires_at').eq('id', prof.shop_id).single();
      if (sh && sh.data) {
        window.csShopName = sh.data.name || '';
        window.csShopDB = { company: sh.data.company || '', address: sh.data.address || '', tel: sh.data.tel || '', hours: sh.data.hours || '', url: sh.data.url || '' };
        window.csShop = window.csShopDB;
        window.csPlan = sh.data.plan || 'free';
        var _ve = sh.data.vip_expires_at;
        window.csIsVip = (sh.data.plan === 'vip') && (!_ve || new Date(_ve) > new Date());
      }
      var st = await sb.from('profiles').select('name,role').eq('shop_id', prof.shop_id);
      if (st && st.data) {
        window.csStaffList = st.data
          .filter(function (x) { return x.name; })
          .sort(function (a, b) { return (a.role === 'shop_admin' ? 0 : 1) - (b.role === 'shop_admin' ? 0 : 1); })
          .map(function (x) { return x.name; });
      }
      var vn = await sb.from('vendors').select('name').eq('shop_id', prof.shop_id).order('created_at');
      if (vn && vn.data) window.csVendors = vn.data.map(function (x) { return x.name; });
    }
    return window.csAuth;
  })();
})();
