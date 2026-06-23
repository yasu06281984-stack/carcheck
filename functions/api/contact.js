// POST /api/contact  -- 問い合わせフォームの内容を運営宛にメール送信
// body: { name, shop, email, message, hp }  ※hp はスパム除け（空のはず）
// 必要な環境変数: RESEND_API_KEY
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: CORS }); }
function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]; }); }

const TO = 'staff@pioneer-monkeys.jp';

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.RESEND_API_KEY) return json({ error: 'no_resend_key' }, 503);
    const body = await request.json().catch(function () { return {}; });
    if (body.hp) return json({ ok: true }, 200); // ハニーポット（ボット）→成功偽装で無視
    const name = (body.name || '').trim();
    const shop = (body.shop || '').trim();
    const email = (body.email || '').trim();
    const message = (body.message || '').trim();
    if (!message || message.length < 5) return json({ error: 'no_message' }, 400);
    if (email && !isEmail(email)) return json({ error: 'bad_email' }, 400);

    const text = '入庫カルテ お問い合わせ\n\n' +
      'お名前：' + name + '\n' +
      '店舗・会社：' + shop + '\n' +
      '返信先メール：' + email + '\n' +
      '------------------------------\n' + message + '\n';
    const html = '<div style="font-family:sans-serif;font-size:14px;line-height:1.8">' +
      '<h3 style="margin:0 0 8px">入庫カルテ お問い合わせ</h3>' +
      '<p>お名前：' + esc(name) + '<br>店舗・会社：' + esc(shop) + '<br>返信先メール：' + esc(email) + '</p>' +
      '<hr><div style="white-space:pre-wrap">' + esc(message) + '</div></div>';

    const payload = {
      from: '入庫カルテ お問い合わせ <no-reply@nyukokarte.com>',
      to: [TO],
      subject: 'お問い合わせ' + (name ? '（' + name + '様）' : ''),
      text: text,
      html: html
    };
    if (email && isEmail(email)) payload.reply_to = email;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) { const t = await r.text(); return json({ error: 'send_' + r.status, detail: t }, 502); }
    return json({ ok: true }, 200);
  } catch (e) { return json({ error: String(e) }, 500); }
}
