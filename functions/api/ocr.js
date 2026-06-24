/* ============================================================
   車検証OCR エンドポイント（Cloudflare Pages Function 版）
   ------------------------------------------------------------
   ・元の ocr.php を JavaScript に移植したもの。
   ・このファイルを functions/api/ocr.js に置くと、
     自動的に  https://<あなたのサイト>/api/ocr  というURLになります。
   ・受け取った車検証画像を Google Cloud Vision に送り、
     「車台番号・初年度年式・類別区分番号・型式指定番号・原動機」の
     5項目を抽出して JSON で返します。
   ・APIキーは Cloudflare の「環境変数 GCV_API_KEY」から読みます
     （= コードにもHTMLにも一切書きません）。
   ============================================================ */

export async function onRequestPost(context) {
  const { request, env } = context;

  const KEY = env && env.GCV_API_KEY ? String(env.GCV_API_KEY) : '';
  if (!KEY || KEY.indexOf('ここに') !== -1) {
    // キー未設定 → フロントは端末側OCR(Tesseract.js)に自動で切り替わります
    return json({ ok: false, error: 'no_api_key' });
  }

  // ---- 画像受け取り ----
  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json({ ok: false, error: 'no_file' });
  }
  const file = form.get('shaken_photo') || form.get('image');
  if (!file || typeof file === 'string') {
    return json({ ok: false, error: 'no_file' });
  }

  const buf = await file.arrayBuffer();
  const MAX_BYTES = 10 * 1024 * 1024; // 10MB
  if (buf.byteLength > MAX_BYTES) {
    return json({ ok: false, error: 'too_large' });
  }
  const b64 = arrayBufferToBase64(buf);

  // ---- Google Cloud Vision 呼び出し ----
  const payload = {
    requests: [{
      image: { content: b64 },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      imageContext: { languageHints: ['ja'] }
    }]
  };

  const url = 'https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(KEY);
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return json({ ok: false, error: 'fetch', detail: String(e) });
  }

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    return json({ ok: false, error: 'vision', detail: 'bad_json_http_' + resp.status });
  }
  if (!resp.ok || !data) {
    const msg = (data && data.error && data.error.message) ? data.error.message : ('http_' + resp.status);
    return json({ ok: false, error: 'vision', detail: msg });
  }

  let text = '';
  const r0 = data.responses && data.responses[0];
  if (r0 && r0.fullTextAnnotation && r0.fullTextAnnotation.text) {
    text = r0.fullTextAnnotation.text;
  } else if (r0 && r0.textAnnotations && r0.textAnnotations[0] && r0.textAnnotations[0].description) {
    text = r0.textAnnotations[0].description;
  }

  const fields = parseShaken(text);
  let hits = 0;
  ['vin', 'year', 'cls', 'model', 'engine'].forEach(function (k) { if (fields[k] !== '') hits++; });

  return json({ ok: true, fields, hits, raw: text.slice(0, 2000) });
}

// POST以外は拒否（フロントは端末側OCRへ）
export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, error: 'method' });
}

/* ---- 返信ヘルパー ---- */
function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json; charset=UTF-8' }
  });
}

/* ---- ArrayBuffer → base64（大きい画像でも落ちないよう分割）---- */
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/* ============================================================
   車検証テキスト → 5項目 抽出（ocr.php の pm_parse_shaken を移植）
   ============================================================ */
function normalize(s) {
  return (s || '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[‐－―ー−]/g, '-')
    .replace(/[\u3000\t]/g, ' ');
}
function esc(c) { return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function lbl(s) { return s.split('').map(esc).join('\\s*'); } // ラベル内の空白を許容
function clean(v) { return v ? v.replace(/\s+/g, '') : ''; }

function region(text, label, max) {
  max = max || 180;
  const m = new RegExp(lbl(label)).exec(text);
  if (!m) return '';
  const start = m.index + m[0].length;
  const bounds = ['車台番号', '型式指定番号', '類別区分番号', '原動機', '初度登録', '初年度', '初度検査',
    '登録年月', '使用者', '所有者', '自動車登録番号', '車両番号', '車名', '燃料', '総排気量',
    '長さ', '幅', '高さ', '乗車定員', '車体の形状', '有効期間'];
  let end = text.length;
  for (const b of bounds) {
    const bm = new RegExp(lbl(b)).exec(text.slice(start + 1));
    if (bm) { const pos = start + 1 + bm.index; if (pos < end) end = pos; }
  }
  end = Math.min(end, start + max);
  return text.slice(start, Math.max(start, end));
}
function idx(text, label) {
  const m = new RegExp(lbl(label)).exec(text);
  return m ? m.index : -1;
}
function vinFallback(text) {
  let best = '';
  const re = /[A-Z0-9]{2,}(?:-[A-Z0-9]+){0,3}/g;
  let mm;
  while ((mm = re.exec(text))) {
    const t = mm[0];
    const letters = (t.match(/[A-Z]/g) || []).length;
    const digits = (t.match(/[0-9]/g) || []).length;
    const len = t.replace(/-/g, '').length;
    if (letters >= 1 && digits >= 4 && len >= 8 && len <= 20) {
      if (t.length > best.length) best = t;
    }
  }
  return best;
}

function parseShaken(raw) {
  const text = normalize(raw);
  const out = { vin: '', year: '', cls: '', model: '', engine: '', name: '', addr: '' };

  // 車台番号
  const vreg = region(text, '車台番号');
  let m = /[A-Z0-9]{2,}(?:\s?-\s?[A-Z0-9]+){0,3}/.exec(vreg);
  if (m && /[0-9]/.test(m[0])) out.vin = clean(m[0]);
  if (!out.vin) out.vin = vinFallback(text);

  // 初度登録年月 / 初年度
  let yreg = region(text, '初度登録') || region(text, '初年度') || region(text, '初度検査') || region(text, '登録年月');
  m = /(?:令和|平成|昭和)?\s*(?:元|[0-9]{1,2})\s*年\s*(?:[0-9]{1,2}\s*月)?/.exec(yreg);
  if (m) out.year = clean(m[0]);
  if (!out.year) {
    m = /(?:令和|平成|昭和)\s*(?:元|[0-9]{1,2})\s*年\s*[0-9]{1,2}\s*月/.exec(text);
    if (m) out.year = clean(m[0]);
  }

  // 型式指定番号 / 類別区分番号
  const ti = idx(text, '型式指定番号'), ri = idx(text, '類別区分番号');
  if (ti >= 0 && ri >= 0) {
    const lo = Math.min(ti, ri), hi = Math.max(ti, ri);
    let between = text.slice(lo, hi)
      .replace(new RegExp(lbl('型式指定番号'), 'g'), '')
      .replace(new RegExp(lbl('類別区分番号'), 'g'), '');
    const betweenNoSpace = between.replace(/\s/g, '');
    if (!/[0-9]/.test(between) && betweenNoSpace.length < 4) {
      let after = text.slice(hi)
        .replace(new RegExp(lbl('類別区分番号')), '')
        .replace(new RegExp(lbl('型式指定番号')), '');
      const nums = after.match(/[0-9]{3,5}/g) || [];
      out.model = nums[0] || '';
      out.cls = nums[1] || '';
    }
  }
  if (!out.model) { m = /[0-9]{4,5}/.exec(region(text, '型式指定番号')); if (m) out.model = m[0]; }
  if (!out.cls) { m = /[0-9]{3,4}/.exec(region(text, '類別区分番号')); if (m) out.cls = m[0]; }

  // 原動機の型式
  let ereg = region(text, '原動機の型式') || region(text, '原動機型式') || region(text, '原動機');
  m = /[A-Z0-9]{2,}(?:\s?-\s?[A-Z0-9]+)?/.exec(ereg);
  if (m) out.engine = clean(m[0]);

  // 自動車登録番号（ナンバー）
  const plateRe = /[一-龥ぁ-ん]{1,4}\s*[0-9]{2,3}\s*[ぁ-んァ-ンA-Za-z]\s*[0-9]{1,2}[\s\-‐・]*[0-9]{1,4}/;
  let preg = region(text, '自動車登録番号又は車両番号', 40) || region(text, '自動車登録番号', 40) || region(text, '車両番号', 40);
  let pm = plateRe.exec(preg) || plateRe.exec(text);
  out.plate = pm ? pm[0].replace(/\s+/g, '') : '';

  // 使用者名・本拠の位置（ベストエフォート）
  let nreg = region(text, '使用者の氏名又は名称', 40) || region(text, '使用者の氏名', 40) || region(text, '氏名又は名称', 40);
  if (nreg) { const nv = nreg.replace(/\s+/g, ''); if (nv.length >= 2 && nv.length <= 20) out.name = nv; }
  let areg = region(text, '使用者の本拠の位置', 60) || region(text, '本拠の位置', 60) || region(text, '使用者の住所', 60);
  if (areg) { const av = areg.replace(/\s+/g, ''); if (av.length >= 4) out.addr = av.slice(0, 40); }

  return out;
}

// テスト用にエクスポート（本番では無視されます）
export const __test = { parseShaken };
