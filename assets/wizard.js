/* 受付ウィザード制御 */
(function () {
  'use strict';
  var DRAFT = 'intake_draft_v1', STAFF = 'intake_staff_v1', SHOPK = 'intake_shop_v1';
  var TOOL = { A: { c: '#E24B4A', w: '傷' }, B: { c: '#BA7517', w: '凹み' }, X: { c: '#378ADD', w: 'その他' }, Op: { c: '#8E44AD', w: 'エアロ' } };
  var VIEWLBL = { front: '正面', rear: '後方', left: '左側面', right: '右側面', roof: 'ルーフ' };
  var VEHLBL = { hatchback: 'ハッチバック', sedan: 'セダン', suv: 'SUV', minivan: 'ミニバン', onebox: 'ワンボックス' };
  var VIEWS = ['front', 'rear', 'left', 'right', 'roof'];
  var TYPELBL = { intake: '入庫受付チェックシート', estimate: '見積もり依頼チェックシート', business: '業者受付チェックシート' };

  var TERMS = '【利用規約（サンプル）】\n\n本規約は、お客様の車両の点検・整備・修理および見積りに関する受付に適用されます。\n\n1. 受付内容の確認\n本シートに記載の車両状態・損傷箇所・修理希望は、受付時点の確認内容です。作業中に追加の不具合が判明した場合は、別途ご連絡のうえ対応します。\n\n2. 車両のお預かり\n当店は善良な管理者の注意をもって車両を管理します。天災・盗難その他当店の責によらない事由による損害については責任を負いかねる場合があります。\n\n3. 貴重品について\n車内の貴重品・現金・ETCカード等は、必ずお客様ご自身でお持ち帰りください。車内に残された物品の紛失・破損について当店は責任を負いません。\n\n4. 見積り・費用\nお見積りは概算です。部品価格・作業内容の変更により金額が変動する場合があります。作業開始前にご確認・ご同意をいただきます。\n\n5. 個人情報の取り扱い\nご記入いただいた情報は、本件の受付・整備・連絡・見積りの目的にのみ利用します。\n\n6. 撮影データ\n車検証・車両の撮影画像は、受付および見積りの目的で利用します。\n\n以上の内容にご同意のうえ、ご署名ください。\n（この規約文はサンプルです。実際の文面に差し替えてください。）\n';

  function $(id) { return document.getElementById(id); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
  function fmtDate(s) { if (!s) return ''; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? (m[1] + '/' + m[2] + '/' + m[3]) : s; }

  var wiz = { type: '', staff: '', step: 1, consent: '', daisha: '', payMethod: '', editing: false, savedNo: '', termsAgreed: false, started: false };

  /* ---------------- スタッフ ---------------- */
  function loadStaff() {
    if (window.csStaffList && window.csStaffList.length) return window.csStaffList.slice();
    var raw = ''; try { raw = localStorage.getItem(STAFF) || ''; } catch (e) {}
    return raw ? raw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : ['スタッフ1', 'スタッフ2'];
  }
  function saveStaffList(arr) { try { localStorage.setItem(STAFF, arr.join('\n')); } catch (e) {} }
  function fillStaffSelect() {
    var sel = $('wizStaff'); if (!sel) return;
    var cur = sel.value, arr = loadStaff();
    sel.innerHTML = '<option value="">選択してください</option>';
    arr.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
    if (arr.indexOf(cur) >= 0) sel.value = cur;
  }
  function setStaffDisp() { var d = $('staffNameDisp'); if (d) d.textContent = wiz.staff || '—'; }

  function applyShopUI() {
    var brand = document.querySelector('.site-head .brand');
    if (brand) {
      var nm = window.csShopName || (window.csShopDB && window.csShopDB.company) || 'AUTO SHOP';
      var co = (window.csShopDB && window.csShopDB.company) || '';
      brand.innerHTML = esc(nm) + '<small>' + (co ? esc(co) + '｜' : '') + '受付チェックシート</small>';
    }
    var who = $('siteWho');
    if (who && window.csAuth) who.textContent = (window.csAuth.name || 'スタッフ') + ' さん';
    fillStaffSelect();
  }

  function loadShop() { if (window.csShopDB) return window.csShopDB; try { return JSON.parse(localStorage.getItem(SHOPK) || '{}') || {}; } catch (e) { return {}; } }
  function saveShop(o) { try { localStorage.setItem(SHOPK, JSON.stringify(o)); } catch (e) {} window.csShop = o; }
  function fillShopEditor() { var s = loadShop(); setVal('shop_company', s.company); setVal('shop_address', s.address); setVal('shop_tel', s.tel); setVal('shop_hours', s.hours); setVal('shop_url', s.url); }
  function readShopEditor() { return { company: val('shop_company'), address: val('shop_address'), tel: val('shop_tel'), hours: val('shop_hours'), url: val('shop_url') }; }

  /* ---------------- 値ヘルパ ---------------- */
  function val(id) { var e = $(id); return e && e.value != null ? e.value : ''; }
  function setVal(id, v) { var e = $(id); if (e) e.value = v || ''; }

  function serialize() {
    return {
      type: wiz.type, staff: wiz.staff, step: wiz.step, consent: wiz.consent, daisha: wiz.daisha,
      payMethod: wiz.payMethod, payOther: val('payOther'), termsAgreed: wiz.termsAgreed, savedNo: wiz.savedNo,
      estDate: val('est_date'), intakeDate: val('intake_date'),
      cust: {
        name: val('cust_name'), reqname: val('cust_reqname'), tel: val('cust_tel'), addr: val('cust_addr'), reqaddr: val('cust_reqaddr'), mail: val('cust_mail'), vehicle: val('cust_vehicle'),
        vin: val('f_vin'), year: val('f_year'), cls: val('f_class'), model: val('f_model'), engine: val('f_engine'),
        mileage: val('cust_mileage'), colorno: val('cust_colorno'), colorname: val('cust_colorname'), color: val('cust_color')
      },
      photos: (window.csPhotosGet ? window.csPhotosGet() : null),
      sign: window.csSignature || '',
      vehicleType: (window.csAPI ? window.csAPI.getType() : 'hatchback'),
      records: (window.csAPI ? window.csAPI.getRecords() : []),
      valuables: qa('#valuables input:checked').map(function (c) { return c.getAttribute('data-val'); }),
      ts: Date.now()
    };
  }
  function hasDraft() { try { var d = localStorage.getItem(DRAFT); if (!d) return false; var o = JSON.parse(d); return !!(o && o.type); } catch (e) { return false; } }
  function saveDraft() { if (!wiz.started) return; try { localStorage.setItem(DRAFT, JSON.stringify(serialize())); } catch (e) {} }
  function clearDraft() { try { localStorage.removeItem(DRAFT); } catch (e) {} }
  window.wizardOnChange = function () { clearTimeout(window._wzT); window._wzT = setTimeout(saveDraft, 400); };

  function applyData(o) {
    if (!o) return;
    wiz.type = o.type || 'intake'; wiz.staff = o.staff || ''; wiz.consent = o.consent || '';
    wiz.daisha = o.daisha || ''; wiz.payMethod = o.payMethod || ''; wiz.termsAgreed = !!o.termsAgreed; wiz.savedNo = o.savedNo || '';
    var c = o.cust || {};
    setVal('cust_name', c.name); setVal('cust_reqname', c.reqname); setVal('cust_tel', c.tel);
    setVal('cust_addr', c.addr); setVal('cust_reqaddr', c.reqaddr); setVal('cust_mail', c.mail); setVal('cust_vehicle', c.vehicle);
    setVal('f_vin', c.vin); setVal('f_year', c.year); setVal('f_class', c.cls); setVal('f_model', c.model); setVal('f_engine', c.engine);
    setVal('cust_mileage', c.mileage); setVal('cust_colorno', c.colorno); setVal('cust_colorname', c.colorname);
    setVal('est_date', o.estDate); setVal('intake_date', o.intakeDate);
    if (c.color) { setVal('cust_color', c.color); var pv = $('colorPrev'), hx = $('colorHex'); if (pv) pv.style.background = c.color; if (hx) hx.textContent = c.color; }
    setVal('payOther', o.payOther);
    fillStaffSelect(); if ($('wizStaff')) $('wizStaff').value = wiz.staff; setStaffDisp();
    if (window.csPhotosSet && o.photos) window.csPhotosSet(o.photos);
    if (window.csAPI) { if (o.vehicleType) window.csAPI.setType(o.vehicleType); if (o.records) window.csAPI.setRecords(o.records); }
    if (o.sign && window.csSignSet) setTimeout(function () { window.csSignSet(o.sign); }, 250);
    (o.valuables || []).forEach(function (v) { var el = document.querySelector('#valuables input[data-val="' + v + '"]'); if (el) el.checked = true; });
    applyConsent(wiz.consent, true); applyDaisha(wiz.daisha, true); applyPay(wiz.payMethod, true); applyType();
  }

  /* ---------------- 1ページ目トグル ---------------- */
  function applyConsent(v, silent) {
    wiz.consent = v;
    qa('#consentChoice button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-consent') === v); });
    if ($('vehDetail')) $('vehDetail').hidden = !v;
    var drop = $('shakenDrop'), head = $('scannerHead'), note = $('manualNote'), st = $('scanStatus');
    if (v === 'no') { if (drop) drop.style.display = 'none'; if (head) head.style.display = 'none'; if (st) st.hidden = true; if (note) note.hidden = false; }
    else if (v === 'yes') { if (drop) drop.style.display = ''; if (head) head.style.display = ''; if (note) note.hidden = true; }
    if (!silent) saveDraft();
  }
  function applyDaisha(v, silent) { wiz.daisha = v; qa('#daishaChoice button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-daisha') === v); }); if (!silent) saveDraft(); }
  function applyPay(v, silent) {
    wiz.payMethod = v; qa('#payChoice button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-pay') === v); });
    var oth = $('payOther'); if (oth) oth.style.display = (v === 'その他') ? '' : 'none';
    if (!silent) saveDraft();
  }
  function populateBizSelect() {
    var sel = $('biz_name'); if (!sel) return;
    var cur = sel.value, arr = window.csVendors || [];
    sel.innerHTML = '<option value="">選択してください</option>';
    arr.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
    if (arr.indexOf(cur) >= 0) sel.value = cur;
  }
  function applyType() {
    qa('#typeCards .type-card').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-type') === wiz.type); });
    if ($('wizTypeLabel')) $('wizTypeLabel').textContent = TYPELBL[wiz.type] || '';
    var io = $('intakeOnly'); if (io) io.style.display = (wiz.type === 'intake') ? '' : 'none';
    var biz = (wiz.type === 'business');
    qa('.bizOnly').forEach(function (e) { e.style.display = biz ? '' : 'none'; });
    qa('.custOnly').forEach(function (e) { e.style.display = biz ? 'none' : ''; });
    var cb = $('custBlock'); if (cb) cb.style.display = biz ? 'none' : '';
    if (biz) { if ($('vehDetail')) $('vehDetail').hidden = false; populateBizSelect(); }
    else { if ($('vehDetail')) $('vehDetail').hidden = !wiz.consent; }
  }

  /* ---------------- プレビュー描画 ---------------- */
  function payText() { return (wiz.payMethod === 'その他') ? ('その他：' + val('payOther')) : wiz.payMethod; }
  function setMeta() {
    window.csShop = loadShop();
    if (wiz.type === 'business') { var cn = $('cust_name'); if (cn) cn.value = val('biz_name'); }
    window.csMeta = { staff: wiz.staff, sheetType: wiz.type, daisha: wiz.daisha, pay: payText(), estDate: fmtDate(val('est_date')), intakeDate: fmtDate(val('intake_date')), vehicleName: val('cust_vehicle'), shop: window.csShop,
      bizName: val('biz_name'), number: val('biz_number'), bizIntake: fmtDate(val('biz_intake')), bizDue: fmtDate(val('biz_due')) };
  }
  function previewData() {
    if (wiz.type === 'business') { var cn = $('cust_name'); if (cn) cn.value = val('biz_name'); }
    var base = window.csAPI ? window.csAPI.getPayload() : { v: 'hatchback', cust: {}, records: [], sign: '', photos: [] };
    setMeta();
    base.staff = wiz.staff; base.sheetType = wiz.type; base.daisha = wiz.daisha; base.pay = payText();
    base.estDate = fmtDate(val('est_date')); base.intakeDate = fmtDate(val('intake_date'));
    base.vehicleName = val('cust_vehicle'); base.shop = loadShop();
    base.bizName = val('biz_name'); base.number = val('biz_number'); base.bizIntake = fmtDate(val('biz_intake')); base.bizDue = fmtDate(val('biz_due'));
    base.valuables = qa('#valuables input:checked').map(function (c) { return c.getAttribute('data-val'); });
    return base;
  }
  function renderSheet(d) {
    var v = d.v, c = d.cust || {}, recs = d.records || [], sign = d.sign || '', photos = d.photos || [];
    var dir = 'assets/vehicles/' + v;
    var colorCell = c.colorname ? ((c.color ? '<span class="p-swatch" style="background:' + esc(c.color) + '"></span>' : '') + esc(c.colorname)) : '';
    var vehName = d.vehicleName || VEHLBL[v] || v;
    var isBiz = d.sheetType === 'business';
    var info, cust, custHeading;
    if (isBiz) {
      info = '<table class="p-cust"><tr><th>シート種別</th><td>' + (TYPELBL[d.sheetType] || '') + '</td><th>車種</th><td>' + esc(vehName) + '</td></tr>' +
        '<tr><th>業者名</th><td>' + esc(d.bizName) + '</td><th>ナンバー</th><td>' + esc(d.number) + '</td></tr>' +
        '<tr><th>入庫日</th><td>' + esc(d.bizIntake) + '</td><th>納車予定日</th><td>' + esc(d.bizDue) + '</td></tr></table>';
      cust = '<table class="p-cust"><tr><th>カラー番号</th><td>' + esc(c.colorno) + '</td><th>カラー</th><td>' + colorCell + '</td></tr>' +
        '<tr><th>走行距離</th><td colspan="3">' + (c.mileage ? esc(c.mileage) + ' km' : '') + '</td></tr></table>';
      custHeading = '車両情報';
    } else {
      info = '<table class="p-cust"><tr><th>シート種別</th><td>' + (TYPELBL[d.sheetType] || '') + '</td><th>車種</th><td>' + esc(vehName) + '</td></tr>' +
        '<tr><th>代車</th><td>' + (d.daisha === 'yes' ? 'あり' : d.daisha === 'no' ? 'なし' : '') + '</td><th>支払い方法</th><td>' + esc(d.pay) + '</td></tr>' +
        '<tr><th>見積もり日</th><td>' + esc(d.estDate) + '</td><th>入庫予定日</th><td>' + esc(d.intakeDate) + '</td></tr></table>';
      cust = '<table class="p-cust">' +
        '<tr><th>お客様名</th><td>' + (c.name ? esc(c.name) + ' 様' : '') + '</td><th>電話番号</th><td>' + esc(c.tel) + '</td></tr>' +
        '<tr><th>住所</th><td colspan="3">' + esc(c.addr) + '</td></tr>' +
        '<tr><th>車台番号</th><td>' + esc(c.vin) + '</td><th>初年度登録</th><td>' + esc(c.year) + '</td></tr>' +
        '<tr><th>型式指定番号</th><td>' + esc(c.model) + '</td><th>類別区分番号</th><td>' + esc(c.cls) + '</td></tr>' +
        '<tr><th>原動機の型式</th><td>' + esc(c.engine) + '</td><th>走行距離</th><td>' + (c.mileage ? esc(c.mileage) + ' km' : '') + '</td></tr>' +
        '<tr><th>カラー番号</th><td>' + esc(c.colorno) + '</td><th>カラー</th><td>' + colorCell + '</td></tr></table>';
      custHeading = 'お客様情報';
    }
    function viewBlock(vk) {
      var ms = recs.filter(function (r) { return r.views ? r.views.indexOf(vk) >= 0 : r.view === vk; }).map(function (r) {
        var col = TOOL[r.tool] ? TOOL[r.tool].c : '#888';
        return '<span class="p-mk" style="left:' + r.x + '%;top:' + r.y + '%;background:' + col + '">' + esc(r.code) + '</span>';
      }).join('');
      return '<div class="p-cell"><div class="p-vt">' + VIEWLBL[vk] + '</div><div class="p-fig"><img src="' + dir + '/' + vk + '.png" alt=""><div class="p-ly">' + ms + '</div></div></div>';
    }
    var figs = '<div class="p-figs">' + VIEWS.map(viewBlock).join('') + '</div>';
    var rows = recs.map(function (r) {
      var T = TOOL[r.tool] || { w: '' };
      var sz = (r.tool === 'X' || r.tool === 'Op') ? '—' : (r.size ? ((r.tool === 'A' ? '長さ' : '直径') + '約' + esc(r.size) + 'cm') : '—');
      var vlab = (r.views && r.views.length > 1) ? '左右側面' : VIEWLBL[r.view];
      return '<tr><td class="c">' + esc(r.code) + '</td><td>' + vlab + '</td><td>' + T.w + '</td><td>' + esc(r.part) + '</td><td>' + sz + '</td><td>' + esc(r.note) + '</td><td>' + esc(r.repair) + '</td></tr>';
    }).join('') || '<tr><td colspan="7">記録なし</td></tr>';
    var photoSec = photos.length ? ('<div class="p-sec">入庫時画像</div><div class="p-photos">' + photos.map(function (s, i) { return '<div class="p-photo"><img src="' + s + '" alt=""><div class="p-pcap">画像 ' + (i + 1) + '</div></div>'; }).join('') + '</div>') : '';
    var signSec = ''; // 確認プレビューでは署名欄を表示しない（この時点では未署名）
    var shop = d.shop || {};
    var shopLines = '';
    if (shop.company) shopLines += '<div class="p-shopco">' + esc(shop.company) + '</div>';
    if (d.staff) shopLines += '<div>担当：' + esc(d.staff) + '</div>';
    if (shop.address) shopLines += '<div>' + esc(shop.address) + '</div>';
    if (shop.tel) shopLines += '<div>TEL：' + esc(shop.tel) + '</div>';
    if (shop.hours) shopLines += '<div>営業：' + esc(shop.hours) + '</div>';
    if (shop.url) shopLines += '<div>' + esc(shop.url) + '</div>';
    var head = '<div class="p-title">' + (TYPELBL[d.sheetType] || '受付チェックシート') + '</div>' +
      '<div class="p-hdr2"><div class="p-custname">' + (isBiz ? '業者名：' + esc(d.bizName) : 'お客様名：' + (c.name ? esc(c.name) + ' 様' : '')) + '</div><div class="p-shop">' + shopLines + '</div></div>';
    return head + '<div class="p-sec">受付情報</div>' + info + '<div class="p-sec">' + custHeading + '</div>' + cust +
      '<div class="p-sec">損傷チェック図</div>' + figs +
      '<div class="p-sec">入力チェック欄一覧</div><table class="p-lst"><thead><tr><th>番号</th><th>ビュー</th><th>種別</th><th>部位</th><th>サイズ</th><th>備考</th><th>修理内容</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="p-legend">A＝傷／B＝凹み／X＝その他／Op＝エアロパーツ となります。</div>' +
      signSec + photoSec;
  }
  function renderPreview() { var el = $('wizPreview'); if (el) el.innerHTML = renderSheet(previewData()); }

  function goLoanSheet() {
    var d = previewData(); var c = d.cust || {};
    var name = (wiz.type === 'business') ? (d.bizName || c.name || '') : (c.name || '');
    var handoff = {
      kind: wiz.type, name: name, tel: c.tel || '', vehicle: d.vehicleName || '',
      due: (wiz.type === 'business') ? (d.bizDue || '') : '',
      sign: (wiz.type === 'intake') ? (d.sign || window.csSignature || '') : '',
      intakeId: wiz.savedNo || ''
    };
    try { sessionStorage.setItem('cs_loan_handoff', JSON.stringify(handoff)); } catch (e) {}
    location.href = 'daisha.html';
  }

  /* ---------------- ステップ遷移 ---------------- */
  var STEP_NAMES = ['受付情報', '写真', '損傷チェック', '確認・署名', '完了'];
  function buildIndicator() {
    var w = $('wizSteps'); if (!w) return; w.innerHTML = '';
    STEP_NAMES.forEach(function (nm, i) {
      var s = document.createElement('span'); s.className = 'st'; s.textContent = (i + 1) + '. ' + nm;
      s.addEventListener('click', function () { if (wiz.started) showStep(i + 1); });
      w.appendChild(s);
    });
  }
  function updateIndicator() {
    qa('#wizSteps .st').forEach(function (s, i) { s.classList.toggle('on', (i + 1) === wiz.step); s.classList.toggle('done', (i + 1) < wiz.step); });
  }
  function showStep(n) {
    saveDraft();
    wiz.step = n;
    qa('.step').forEach(function (s) { s.classList.toggle('active', parseInt(s.getAttribute('data-step'), 10) === n); });
    updateIndicator();
    var prev = $('wizPrev'), next = $('wizNext');
    if (prev) prev.style.visibility = (n <= 1) ? 'hidden' : 'visible';
    if (next) { next.textContent = (n >= 5) ? '完了' : '次へ'; next.disabled = false; }
    window.scrollTo(0, 0);
    if (n === 1) setStaffDisp();
    if (n === 4) onEnterStep4();
    if (n === 5) onEnterStep5();
    saveDraft();
  }
  function onEnterStep4() {
    applyType(); renderPreview();
    if (wiz.type === 'intake') { setTimeout(function () { if (window.csSignFit) window.csSignFit(); }, 60); setupTermsGate(); }
  }
  function setupTermsGate() {
    var box = $('termsBox'), hint = $('termsHint'), wrap = $('signWrap');
    if (!box) return;
    if (!box.textContent) box.textContent = TERMS;
    function check() {
      var atBottom = (box.scrollTop + box.clientHeight) >= (box.scrollHeight - 8);
      if (atBottom || wiz.termsAgreed) {
        wiz.termsAgreed = true;
        if (wrap) { wrap.style.opacity = '1'; wrap.style.pointerEvents = 'auto'; }
        if (hint) { hint.textContent = '※ ご署名いただけます。'; hint.style.color = '#1f6b2a'; }
        if (window.csSignFit) window.csSignFit();
      }
    }
    box.onscroll = check; check();
  }
  window.wizardOnSign = function () { var m = $('signDoneMsg'); if (m) m.hidden = false; };
  function onEnterStep5() {
    wizardSave();
    var lp = $('loanPrompt');
    if (lp) lp.style.display = (wiz.type === 'intake' || wiz.type === 'business') ? '' : 'none';
  }

  /* ---------------- 保存・共有 ---------------- */
  function makeQR(text) { if (typeof qrcode === 'undefined') return ''; try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createDataURL(5, 8); } catch (e) { return ''; } }
  function localNo() { var n = new Date(); var p = (wiz.type === 'estimate') ? 'E' : 'I'; return p + n.getFullYear() + ('0' + (n.getMonth() + 1)).slice(-2) + ('0' + n.getDate()).slice(-2) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
  function wizardSave() {
    var no = $('saveNo'), db = $('dbMsg');
    if (no) no.textContent = '保存中…';
    var payload = previewData();
    var _sh = { 'Content-Type': 'application/json' }; if (window.csAuth && window.csAuth.token) _sh['Authorization'] = 'Bearer ' + window.csAuth.token;
    fetch('api/sheet-save', { method: 'POST', headers: _sh, body: JSON.stringify(payload) })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) {
        if (!d || !d.id) throw 0;
        wiz.savedNo = d.id; if (no) no.textContent = d.id;
        var base = location.origin + location.pathname.replace(/[^/]*$/, '');
        window.csShareURL = base + 'view.html?id=' + d.id; window.csShareQR = makeQR(window.csShareURL);
        if (db) db.innerHTML = '<span style="color:#1f6b2a">✓ データベースへ反映されました。</span><br>「' + esc(wiz.staff || '当店') + '」会社様の管理ページ内でも、この受付情報を閲覧できます。';
        saveDraft();
      })
      .catch(function () {
        if (!wiz.savedNo) wiz.savedNo = localNo();
        if (no) no.textContent = wiz.savedNo;
        window.csShareURL = (location.href.split('#')[0]); window.csShareQR = makeQR(window.csShareURL);
        if (db) db.innerHTML = '<span class="muted">※ 保存サーバー未接続のため、ローカルの保存番号を表示しています。公開（Supabase設定＋デプロイ）後に、データベース反映と管理ページ閲覧が有効になります。</span>';
        saveDraft();
      });
  }
  function showFinalShare() {
    var out = $('finalShareOut'); if (!out) return;
    if (!window.csShareURL) wizardSave();
    setTimeout(function () {
      out.innerHTML = '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
        (window.csShareQR ? '<img src="' + window.csShareQR + '" style="width:128px;height:128px;border:1px solid #e1e7ee;image-rendering:pixelated">' : '') +
        '<div style="min-width:200px;flex:1"><div style="font-weight:700;margin-bottom:4px">共有QR</div>' +
        '<div class="muted" style="margin-bottom:6px">お客様がスキャンすると、この受付票を表示・PDF保存できます。PDF出力にもQRが入ります。</div>' +
        '<div style="font-size:.78rem;word-break:break-all;color:#33506e">' + esc(window.csShareURL || '') + '</div></div></div>';
    }, 300);
  }

  /* ---------------- 見積もり一覧・呼び出し ---------------- */
  function convertFrom(d, res) {
    var conv = {
      type: 'intake', staff: d.staff || wiz.staff || '', consent: 'yes', daisha: d.daisha || '',
      payMethod: (d.pay && d.pay.indexOf('その他') === 0) ? 'その他' : (d.pay || ''),
      payOther: (d.pay && d.pay.indexOf('その他：') === 0) ? d.pay.slice(4) : '',
      estDate: (d.estDate || ''), intakeDate: '',
      cust: d.cust || {}, photos: d.photos ? { front: d.photos[0] || null, rear: d.photos[1] || null, others: d.photos.slice(2) } : null,
      sign: '', vehicleType: d.v || 'hatchback', records: d.records || [], valuables: []
    };
    wiz.type = 'intake'; applyData(conv); wiz.started = true; wiz.step = 4;
    if (res) res.innerHTML = '<span style="color:#1f6b2a">呼び出しました。入庫受付シートに切り替えます（貴重品チェックと署名を追加）。</span>';
    startFlow(); showStep(4);
  }
  function callById(id, res) {
    if (!id) { if (res) res.textContent = '保存番号を入力してください。'; return; }
    if (res) res.textContent = '呼び出し中…';
    fetch('api/sheet?id=' + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { if (!d || d.error) throw 0; convertFrom(d, res); })
      .catch(function () { if (res) res.textContent = '見つかりませんでした（公開設定後に有効）。'; });
  }
  function loadEstimates(days) {
    var box = $('estList'); if (!box) return;
    box.textContent = '読み込み中…';
    var _lh = {}; if (window.csAuth && window.csAuth.token) _lh['Authorization'] = 'Bearer ' + window.csAuth.token;
    fetch('api/sheets-list?type=estimate&days=' + days, { headers: _lh }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (list) {
        if (!list || !list.length) { box.innerHTML = '<span class="muted">該当する見積もりはありません。</span>'; return; }
        box.innerHTML = list.map(function (it) {
          var nm = (it.name ? esc(it.name) + ' 様' : '（無名）'); var veh = VEHLBL[it.v] || it.v || '';
          var dt = it.estDate ? esc(it.estDate) : fmtDate(it.created_at);
          return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid #e1e7ee;border-radius:8px;padding:8px 10px;margin-bottom:6px;background:#fff">' +
            '<div style="font-size:.85rem;color:#2c3a48">見積もり日 ' + dt + '　' + nm + '　車種 ' + esc(veh) + '</div>' +
            '<button type="button" class="btn ghost estPick" data-id="' + esc(it.id) + '" style="padding:7px 11px;font-size:.82rem">入庫へ切替</button></div>';
        }).join('');
        qa('.estPick', box).forEach(function (b) { b.addEventListener('click', function () { callById(b.getAttribute('data-id'), $('convResult')); }); });
      })
      .catch(function () { box.innerHTML = '<span class="muted">見積もり一覧は公開（Supabase設定＋デプロイ）後に表示されます。保存番号での呼び出しは下の欄から可能です。</span>'; });
  }

  /* ---------------- バリデーション ---------------- */
  function validateStep(n) {
    if (n === 1) {
      if (wiz.type === 'business') { if (!val('biz_name')) { alert('業者名を選択してください。'); return false; } }
      else { if (!wiz.consent) { alert('車検証の撮影可否を選択してください。'); return false; } }
    }
    return true;
  }

  /* ---------------- 起動 ---------------- */
  function startFlow() {
    wiz.started = true;
    if ($('wizStart')) $('wizStart').style.display = 'none';
    if ($('wizFlow')) $('wizFlow').hidden = false;
    applyType(); setStaffDisp();
    showStep(wiz.step && wiz.step >= 1 ? wiz.step : 1);
    saveDraft();
  }

  function init() {
    buildIndicator(); fillStaffSelect();
    if ($('siteLogout')) $('siteLogout').addEventListener('click', function () { if (window.csLogout) window.csLogout(); });
    if (window.csAuthReady && window.csAuthReady.then) window.csAuthReady.then(function () { applyShopUI(); });

    qa('#typeCards .type-card').forEach(function (b) {
      b.addEventListener('click', function () { wiz.type = b.getAttribute('data-type'); applyType(); checkReady(); saveDraft(); });
    });
    if ($('wizStaff')) $('wizStaff').addEventListener('change', function () { wiz.staff = this.value; setStaffDisp(); checkReady(); saveDraft(); });
    if ($('wizStaffEdit')) $('wizStaffEdit').addEventListener('click', function () { var ed = $('staffEditor'); if (!ed) return; ed.hidden = !ed.hidden; if (!ed.hidden) $('staffList').value = loadStaff().join('\n'); });
    if ($('staffSave')) $('staffSave').addEventListener('click', function () { var arr = $('staffList').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); saveStaffList(arr); fillStaffSelect(); $('staffEditor').hidden = true; });

    window.csShop = loadShop();
    if ($('shopEdit')) $('shopEdit').addEventListener('click', function () { var ed = $('shopEditor'); if (!ed) return; ed.hidden = !ed.hidden; if (!ed.hidden) fillShopEditor(); });
    if ($('shopSave')) $('shopSave').addEventListener('click', function () { saveShop(readShopEditor()); if ($('shopEditor')) $('shopEditor').hidden = true; });

    function checkReady() { if ($('wizStartBtn')) $('wizStartBtn').disabled = !(wiz.type && wiz.staff); }
    if ($('wizStartBtn')) $('wizStartBtn').addEventListener('click', function () { wiz.step = 1; startFlow(); });

    // 見積もり一覧・呼び出し
    qa('#estRange button').forEach(function (b) {
      b.addEventListener('click', function () { qa('#estRange button').forEach(function (x) { x.classList.toggle('on', x === b); }); loadEstimates(b.getAttribute('data-range')); });
    });
    if ($('convLoad')) $('convLoad').addEventListener('click', function () { callById(($('convNo').value || '').trim(), $('convResult')); });
    loadEstimates(30);

    if (hasDraft() && $('resumeBox')) $('resumeBox').hidden = false;
    if ($('resumeBtn')) $('resumeBtn').addEventListener('click', function () { try { var o = JSON.parse(localStorage.getItem(DRAFT)); applyData(o); wiz.step = (o && o.step) || 1; startFlow(); } catch (e) {} });
    if ($('discardBtn')) $('discardBtn').addEventListener('click', function () { clearDraft(); if ($('resumeBox')) $('resumeBox').hidden = true; });

    qa('#consentChoice button').forEach(function (b) { b.addEventListener('click', function () { applyConsent(b.getAttribute('data-consent')); }); });
    qa('#daishaChoice button').forEach(function (b) { b.addEventListener('click', function () { applyDaisha(b.getAttribute('data-daisha')); }); });
    qa('#payChoice button').forEach(function (b) { b.addEventListener('click', function () { applyPay(b.getAttribute('data-pay')); }); });
    if ($('payOther')) $('payOther').addEventListener('input', saveDraft);

    qa('.edit-btns button').forEach(function (b) { b.addEventListener('click', function () { wiz.editing = true; showStep(parseInt(b.getAttribute('data-edit'), 10)); }); });

    if ($('wizNext')) $('wizNext').addEventListener('click', function () {
      if (wiz.step >= 5) return;
      if (!validateStep(wiz.step)) return;
      var target = wiz.step + 1;
      if (wiz.editing && target === 4) { if (!confirm('内容を変更しました。新たに保存してよろしいですか？')) return; wiz.editing = false; }
      showStep(target);
    });
    if ($('wizPrev')) $('wizPrev').addEventListener('click', function () { if (wiz.step > 1) showStep(wiz.step - 1); });

    qa('.step[data-step="5"] [data-pdf]').forEach(function (b) { b.addEventListener('click', function () { setMeta(); if (window.csAPI) window.csAPI.print(b.getAttribute('data-pdf')); }); });
    if ($('finalShare')) $('finalShare').addEventListener('click', showFinalShare);
    if ($('finishBtn')) $('finishBtn').addEventListener('click', function () { clearDraft(); location.reload(); });
    if ($('loanYesBtn')) $('loanYesBtn').addEventListener('click', goLoanSheet);
    if ($('loanNoBtn')) $('loanNoBtn').addEventListener('click', function () { var lp = $('loanPrompt'); if (lp) lp.style.display = 'none'; });

    document.addEventListener('input', function () { if (wiz.started) window.wizardOnChange(); });
    document.addEventListener('change', function () { if (wiz.started) window.wizardOnChange(); });
    setInterval(function () { if (wiz.started) saveDraft(); }, 4000);
    window.addEventListener('beforeunload', saveDraft);
    checkReady();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
