// POST /api/notify-email  -- 任意のメール宛に通知文を送信（Resend経由）
// body: { to, subject?, text }
// 店舗管理者 or 運営のみ。必要な環境変数: RESEND_API_KEY（＋認証のため SUPABASE_URL, SUPABASE_SERVICE_KEY）
import { getAuth } from './_auth.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: CORS }); }
function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]; }); }

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.RESEND_API_KEY) return json({ error: 'no_resend_key' }, 503);
    const auth = await getAuth(request, env);
    if (!auth || (auth.role !== 'shop_admin' && auth.role !== 'site_admin')) return json({ error: 'forbidden' }, 403);

    const body = await request.json().catch(function () { return {}; });
    const to = (body.to || '').trim();
    const text = (body.text || '').trim();
    const subject = (body.subject || '入庫カルテ ログイン情報').trim();
    if (!isEmail(to)) return json({ error: 'bad_email' }, 400);
    if (!text) return json({ error: 'no_text' }, 400);

    const html = '<div style="font-family:sans-serif;font-size:14px;line-height:1.8;white-space:pre-wrap">' + escHtml(text) + '</div>';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '入庫カルテ <no-reply@nyukokarte.com>',
        to: [to],
        subject: subject,
        text: text,
        html: html
      })
    });
    if (!r.ok) { const t = await r.text(); return json({ error: 'send_' + r.status, detail: t }, 502); }
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}
