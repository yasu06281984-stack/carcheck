/* 入庫カルテ 共通ナビ（マイアカウント／各ツールへの直リンク）
   - ロール対応：店舗情報・スタッフ登録は店舗管理者(shop_admin)のみ表示
   - 現在地をハイライト、PCは横並び・スマホはハンバーガー
   - 既存の .topbar / .site-head は隠し、このナビに統一
   読み込み例： <script src="assets/appnav.js?v=1" defer></script> */
(function () {
  var SUPABASE_URL = 'https://ysxqnwxpuxfstvuobzuz.supabase.co';
  var SB_KEY = 'sb_publishable_5Wc1cQ4nYDejKaxQt7Clag_BXiVs4DL';

  var ITEMS = [
    { t: 'マイアカウントTOP', href: 'home.html', key: 'home' },
    { t: '受付シート作成', href: 'uketsuke.html', key: 'uketsuke' },
    { t: '工場スケジュール管理', href: 'schedule.html', key: 'schedule' },
    { t: '店舗情報', href: 'shopadmin.html#shop', key: 'shopadmin#shop', admin: true },
    { t: '代車登録', href: 'shopadmin.html#loan', key: 'shopadmin#loan' },
    { t: 'スタッフ登録', href: 'shopadmin.html#staff', key: 'shopadmin#staff', admin: true },
    { t: '業者登録', href: 'shopadmin.html#vendor', key: 'shopadmin#vendor' },
    { t: '外注先登録', href: 'shopadmin.html#outsrc', key: 'shopadmin#outsrc' }
  ];

  var CSS = [
    'html{overflow-x:clip}',
    'body.has-appnav{padding-top:0}',
    '.topbar,.site-head{display:none!important}',
    '.appnav{position:sticky;top:0;z-index:1000;width:100vw;margin-left:calc(50% - 50vw);margin-bottom:14px;background:#143A57;color:#fff;font-family:"Hiragino Kaku Gothic ProN","Yu Gothic Medium","Noto Sans JP",system-ui,sans-serif;box-shadow:0 1px 0 rgba(255,255,255,.06),0 6px 18px rgba(8,18,28,.18)}',
    '.appnav .inner{max-width:1240px;margin:0 auto;display:flex;align-items:center;gap:14px;padding:9px 18px;position:relative}',
    '.appnav .lg{display:flex;align-items:center;line-height:0;flex:0 0 auto}',
    '.appnav .lg img{height:36px;width:auto;display:block}',
    '.appnav .menu{display:flex;align-items:center;gap:2px;flex:1 1 auto}',
    '.appnav .menu a{color:#dbe6f1;text-decoration:none;font-size:.86rem;font-weight:600;letter-spacing:.01em;padding:9px 11px;border-radius:10px;white-space:nowrap;transition:background .14s,color .14s}',
    '.appnav .menu a:hover{background:rgba(255,255,255,.10);color:#fff}',
    '.appnav .menu a.on{background:#E8810C;color:#241606}',
    '.appnav .right{display:flex;align-items:center;gap:10px;flex:0 0 auto;margin-left:auto}',
    '.appnav .nm{font-size:.82rem;color:#cfe0f0;white-space:nowrap}',
    '.appnav .out{background:rgba(255,255,255,.12);border:0;color:#fff;font-size:.8rem;font-weight:700;padding:8px 13px;border-radius:10px;cursor:pointer;transition:background .14s}',
    '.appnav .out:hover{background:rgba(255,255,255,.22)}',
    '.appnav .burger{display:none;background:rgba(255,255,255,.12);border:0;color:#fff;font-size:1.05rem;line-height:1;padding:9px 13px;border-radius:10px;cursor:pointer}',
    '@media(max-width:1080px){',
    '.appnav .inner{flex-wrap:nowrap}',
    '.appnav .menu{position:absolute;left:0;right:0;top:100%;background:#143A57;flex-direction:column;align-items:stretch;gap:0;padding:8px 14px 14px;border-top:1px solid rgba(255,255,255,.12);display:none;box-shadow:0 14px 24px rgba(8,18,28,.28)}',
    '.appnav.open .menu{display:flex}',
    '.appnav .menu a{padding:14px 12px;font-size:.98rem;border-radius:11px}',
    '.appnav .nm{display:none}',
    '.appnav .burger{display:inline-flex}',
    '}'
  ].join('');

  function curKey() {
    var f = (location.pathname.split('/').pop() || '').toLowerCase();
    if (f === '' || f === 'home.html') return 'home';
    if (f === 'uketsuke.html') return 'uketsuke';
    if (f === 'schedule.html') return 'schedule';
    if (f === 'shopadmin.html') { var h = (location.hash || '#shop').replace('#', ''); return 'shopadmin#' + h; }
    return '';
  }

  function build(role, name) {
    var isAdmin = role === 'shop_admin';
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    var nav = document.createElement('header'); nav.className = 'appnav';
    var inner = document.createElement('div'); inner.className = 'inner';

    var lg = document.createElement('a'); lg.className = 'lg'; lg.href = 'home.html';
    lg.setAttribute('aria-label', 'マイアカウントTOP');
    lg.innerHTML = '<img src="/img/logo-mark.png" alt="入庫カルテ">';

    var menu = document.createElement('nav'); menu.className = 'menu';
    var ck = curKey();
    ITEMS.forEach(function (it) {
      if (it.admin && !isAdmin) return;
      var a = document.createElement('a'); a.href = it.href; a.textContent = it.t;
      if (it.key === ck) a.className = 'on';
      menu.appendChild(a);
    });

    var right = document.createElement('div'); right.className = 'right';
    var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = name ? name + ' さん' : '';
    var out = document.createElement('button'); out.type = 'button'; out.className = 'out'; out.textContent = 'ログアウト';
    out.onclick = function () {
      try {
        var sb = window.supabase.createClient(SUPABASE_URL, SB_KEY);
        sb.auth.signOut().then(function () { location.replace('login.html'); }, function () { location.replace('login.html'); });
      } catch (e) { location.replace('login.html'); }
    };
    right.appendChild(nm); right.appendChild(out);

    var burger = document.createElement('button'); burger.type = 'button'; burger.className = 'burger';
    burger.setAttribute('aria-label', 'メニュー'); burger.innerHTML = '☰';
    burger.onclick = function () { nav.classList.toggle('open'); };

    inner.appendChild(lg); inner.appendChild(menu); inner.appendChild(right); inner.appendChild(burger);
    nav.appendChild(inner);
    document.body.classList.add('has-appnav');
    document.body.insertBefore(nav, document.body.firstChild);
  }

  function init() {
    var role = 'staff', name = '';
    try {
      var sb = window.supabase.createClient(SUPABASE_URL, SB_KEY);
      sb.auth.getSession().then(function (r) {
        if (!r.data || !r.data.session) { build(role, name); return; }
        sb.from('profiles').select('role,name').eq('id', r.data.session.user.id).single().then(function (p) {
          build((p.data && p.data.role) || 'staff', (p.data && p.data.name) || '');
        }, function () { build(role, name); });
      }, function () { build(role, name); });
    } catch (e) { build('shop_admin', ''); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
