/* ============================================================
   車検証OCR（単体モジュール）
   - 画像を /api/ocr (Cloudflare Function → Google Cloud Vision) に送り5項目を自動入力
   - サーバーが使えない時はブラウザ内OCR(Tesseract.js)へ自動フォールバック
   - 読み取り中の表示／タイムアウト（無限ループ防止）／全文表示つき
   必要なHTML要素のid:
     shakenFile, dzInner, dzPreview, shakenImg, scanline,
     scanStatus(.spinner と #scanMsg を内包), 
     f_vin, f_year, f_class, f_model, f_engine, rawBox, rawText
   ============================================================ */
(function () {
  'use strict';

  var shakenFile = document.getElementById('shakenFile');
  if (!shakenFile) return; // この機能が無いページでは何もしない

  var dzInner    = document.getElementById('dzInner');
  var dzPreview  = document.getElementById('dzPreview');
  var shakenImg  = document.getElementById('shakenImg');
  var scanline   = document.getElementById('scanline');
  var scanStatus = document.getElementById('scanStatus');
  var scanMsg    = document.getElementById('scanMsg');
  var spinnerEl  = scanStatus ? scanStatus.querySelector('.spinner') : null;

  var fields = {
    vin:    document.getElementById('f_vin'),
    year:   document.getElementById('f_year'),
    cls:    document.getElementById('f_class'),
    model:  document.getElementById('f_model'),
    engine: document.getElementById('f_engine'),
    name:   document.getElementById('cust_name'),
    addr:   document.getElementById('cust_addr')
  };

  function markFilled(input, val) {
    if (!input) return;
    if (val && !input.value) {
      input.value = val;
      var row = input.closest('.spec-row');
      if (row) row.classList.add('filled');
    }
  }

  /* ---- テキスト正規化 ---- */
  function normalize(s) {
    return (s || '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[‐－―ー−]/g, '-')
      .replace(/[　\t]/g, ' ');
  }

  /* ---- ノイズ入りOCRテキストから5項目を抽出（端末側フォールバック用）---- */
  function parseShaken(raw) {
    var text = normalize(raw).replace(/\n/g, ' \n ');
    function esc(c) { return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function lbl(s) { return s.split('').map(esc).join('\\s*'); }
    function clean(v) { return v ? v.replace(/\s+/g, '') : ''; }
    function region(labelStr, len) {
      var rx = new RegExp(lbl(labelStr));
      var m = rx.exec(text);
      if (!m) return '';
      return text.slice(m.index + m[0].length, m.index + m[0].length + (len || 60));
    }
    function idx(labelStr) {
      var m = new RegExp(lbl(labelStr)).exec(text);
      return m ? m.index : -1;
    }
    var out = {};
    var vm = region('車台番号').match(/[A-Z0-9]{2,}(?:\s?-\s?[A-Z0-9]+){0,3}/);
    out.vin = vm ? clean(vm[0]) : '';
    var yR = region('初度登録') || region('初年度') || region('初度検査') || region('登録年月');
    var ym = yR.match(/(?:令和|平成|昭和)?\s*(?:元|[0-9]{1,2})\s*年\s*(?:[0-9]{1,2}\s*月)?/);
    out.year = ym ? clean(ym[0]) : '';
    var ti = idx('型式指定番号'), ri = idx('類別区分番号');
    if (ti >= 0 && ri >= 0) {
      var between = text.slice(Math.min(ti, ri), Math.max(ti, ri))
        .replace(new RegExp(lbl('型式指定番号'), 'g'), '')
        .replace(new RegExp(lbl('類別区分番号'), 'g'), '');
      if (!/[0-9]/.test(between) && between.replace(/\s/g, '').length < 4) {
        var after = text.slice(Math.max(ti, ri))
          .replace(new RegExp(lbl('類別区分番号')), '')
          .replace(new RegExp(lbl('型式指定番号')), '');
        var nums = after.match(/[0-9]{3,5}/g) || [];
        out.model = nums[0] || '';
        out.cls = nums[1] || '';
      }
    }
    if (!out.model) { var mm = region('型式指定番号').match(/[0-9]{4,5}/); out.model = mm ? mm[0] : ''; }
    if (!out.cls)   { var cm = region('類別区分番号').match(/[0-9]{3,4}/); out.cls = cm ? cm[0] : ''; }
    var eR = region('原動機の型式') || region('原動機型式') || region('原動機');
    var em = eR.match(/[A-Z0-9]{2,}(?:\s?-\s?[A-Z0-9]+)?/);
    out.engine = em ? clean(em[0]) : '';
    var nR = region('使用者の氏名又は名称', 30) || region('使用者の氏名', 30) || region('氏名又は名称', 30);
    if (nR) { var nv = nR.split(/\s{2,}|使用者|住所|本拠|車台|型式|初度|令和|平成|昭和/)[0].replace(/\s+/g, ''); if (nv.length >= 2 && nv.length <= 20) out.name = nv; }
    var aR = region('使用者の本拠の位置', 44) || region('本拠の位置', 44) || region('使用者の住所', 44);
    if (aR) { var av = aR.split(/\s{2,}|使用者|氏名|名称|車台|型式|初度/)[0].replace(/\s+/g, ''); if (av.length >= 4) out.addr = av.slice(0, 40); }
    return out;
  }

  /* ---- 端末側OCR前処理（グレースケール＋コントラスト＋リサイズ）---- */
  function preprocess(file) {
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          try {
            var maxSide = 1800, minSide = 1000;
            var longest = Math.max(img.width, img.height);
            var scale = 1;
            if (longest > maxSide) scale = maxSide / longest;
            else if (longest < minSide) scale = minSide / longest;
            var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
            var c = document.createElement('canvas');
            c.width = w; c.height = h;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            var d = ctx.getImageData(0, 0, w, h), px = d.data;
            var min = 255, max = 0, i, g;
            for (i = 0; i < px.length; i += 4) {
              g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
              px[i] = px[i + 1] = px[i + 2] = g;
              if (g < min) min = g; if (g > max) max = g;
            }
            var range = Math.max(1, max - min), contrast = 1.25;
            for (i = 0; i < px.length; i += 4) {
              var n = (px[i] - min) * 255 / range;
              n = (n - 128) * contrast + 128;
              n = n < 0 ? 0 : n > 255 ? 255 : n;
              px[i] = px[i + 1] = px[i + 2] = n;
            }
            ctx.putImageData(d, 0, 0);
            resolve(c);
          } catch (e) { resolve(file); }
        };
        img.onerror = function () { resolve(file); };
        img.src = URL.createObjectURL(file);
      } catch (e) { resolve(file); }
    });
  }

  function allFilled(o) { return o.vin && o.year && o.cls && o.model && o.engine; }

  /* ---- スキャン状態管理（スピナーが無限に回らないように）---- */
  var scanFinished = false;
  var scanWatchdog = null;
  var currentWorker = null;
  function endScan(message) {
    if (scanFinished) return;
    scanFinished = true;
    if (scanWatchdog) { clearTimeout(scanWatchdog); scanWatchdog = null; }
    if (scanline) scanline.hidden = true;
    if (spinnerEl) spinnerEl.hidden = true;
    if (currentWorker) { try { currentWorker.terminate(); } catch (e) {} currentWorker = null; }
    if (message && scanMsg) scanMsg.textContent = message;
  }

  /* ---- 端末側OCR（Tesseract.js）---- */
  function runOCR(file) {
    if (typeof Tesseract === 'undefined') { endScan('各欄に直接ご入力ください。'); return; }
    if (!scanFinished && scanMsg) scanMsg.textContent = '端末側で読み取り中…';
    if (!scanFinished && scanline) scanline.hidden = false;

    var merged = {};
    function applyMerged() {
      markFilled(fields.vin, merged.vin); markFilled(fields.year, merged.year);
      markFilled(fields.cls, merged.cls); markFilled(fields.model, merged.model);
      markFilled(fields.engine, merged.engine);
      markFilled(fields.name, merged.name); markFilled(fields.addr, merged.addr);
    }
    var logger = function (m) {
      if (!scanMsg || scanFinished) return;
      if (m.status === 'recognizing text') scanMsg.textContent = '読み取り中… ' + Math.round((m.progress || 0) * 100) + '%';
      else if (m.status && /load|initi/i.test(m.status)) scanMsg.textContent = '言語データを読み込み中…';
    };
    preprocess(file).then(function (image) {
      if (scanFinished) return;
      var passes = ['3', '6', '11'];
      Tesseract.createWorker('jpn+eng', 1, { logger: logger }).then(function (w) {
        currentWorker = w;
        if (scanFinished) { try { w.terminate(); } catch (e) {} return; }
        var i = 0;
        function next() {
          if (scanFinished) { try { w.terminate(); } catch (e) {} return; }
          if (i >= passes.length || allFilled(merged)) {
            applyMerged();
            var hits = Object.keys(merged).filter(function (k) { return merged[k]; }).length;
            endScan(hits ? '読み取り完了（' + hits + '/5項目）。内容をご確認・修正ください。'
                         : 'うまく読み取れませんでした。各欄に直接ご入力ください。');
            return;
          }
          var psm = passes[i++];
          w.setParameters({ tessedit_pageseg_mode: psm }).then(function () { return w.recognize(image); })
            .then(function (res) {
              if (scanFinished) return;
              var d = parseShaken(res && res.data ? res.data.text : '');
              for (var k in d) if (d[k] && !merged[k]) merged[k] = d[k];
              applyMerged(); next();
            }).catch(function () { next(); });
        }
        next();
      }).catch(function () { endScan('読み取りに失敗しました。各欄に直接ご入力ください。'); });
    });
  }

  /* ---- サーバー側OCR（Cloudflare Function /api/ocr → Google Cloud Vision）。20秒でタイムアウト ---- */
  function serverOCR(file) {
    var fd = new FormData();
    fd.append('shaken_photo', file);
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 20000) : null;
    return fetch('/api/ocr', { method: 'POST', body: fd, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (t) clearTimeout(t); if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'ocr_failed');
        return { fields: j.fields || {}, raw: j.raw || '', hits: j.hits || 0 };
      })
      .catch(function (e) { if (t) clearTimeout(t); throw e; });
  }

  function showRaw(text) {
    var box = document.getElementById('rawBox');
    var pre = document.getElementById('rawText');
    if (!box || !pre || !text) return;
    pre.textContent = text;
    box.hidden = false;
  }

  function fillFields(data) {
    markFilled(fields.vin, data.vin);   markFilled(fields.year, data.year);
    markFilled(fields.cls, data.cls);   markFilled(fields.model, data.model);
    markFilled(fields.engine, data.engine);
    markFilled(fields.name, data.name); markFilled(fields.addr, data.addr);
    return Object.keys(data).filter(function (k) { return data[k]; }).length;
  }

  /* ---- 画像選択時の処理 ---- */
  shakenFile.addEventListener('change', function () {
    var file = shakenFile.files && shakenFile.files[0];
    if (!file) return;
    var url = URL.createObjectURL(file);
    if (shakenImg) shakenImg.src = url;
    if (dzInner) dzInner.hidden = true;
    if (dzPreview) dzPreview.hidden = false;

    scanFinished = false;
    if (scanWatchdog) { clearTimeout(scanWatchdog); scanWatchdog = null; }
    if (currentWorker) { try { currentWorker.terminate(); } catch (e) {} currentWorker = null; }
    if (scanStatus) { scanStatus.hidden = false; if (scanMsg) scanMsg.textContent = 'サーバーで高精度読み取り中…'; }
    if (spinnerEl) spinnerEl.hidden = false;
    if (scanline) scanline.hidden = false;

    // 安全網：45秒を超えたら必ず止める
    scanWatchdog = setTimeout(function () {
      endScan('読み取りに時間がかかっています。お手数ですが各欄に直接ご入力ください。');
    }, 45000);

    serverOCR(file).then(function (res) {
      if (scanFinished) return;
      var hits = fillFields(res.fields || {});
      if (hits === 0) { runOCR(file); return; }
      if (hits < 5) showRaw(res.raw);
      endScan('読み取り完了（' + hits + '/5項目）。内容をご確認・修正ください。'
        + (hits < 5 ? '読み取れなかった項目は、下の「読み取った全文」からご確認ください。' : ''));
    }).catch(function () {
      if (scanFinished) return;
      runOCR(file);
    });
  });
})();
