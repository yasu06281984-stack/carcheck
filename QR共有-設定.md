# QR共有 設定ガイド

受付シートを保存し、QRコードでお客様に共有する機能です。
流れ：受付シート作成 →「共有QRを作成」→ データを保存（Supabase）→ 閲覧URLをQR化 → PDFにQR印字 → お客様がスキャン → 同じシートを表示・PDF保存。

ローカル（ファイルを直接開く）では保存サーバーに繋がらないため、暫定でこのページのURLをQR化します。実際の「シートごとの共有URL」は、下記の公開設定後に有効になります。

## 1. Supabase 側の準備
1. Supabase でプロジェクトを作成（無料枠でOK）。
2. SQL Editor で以下を実行してテーブルを作成：

```sql
create table if not exists sheets (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
```

3. プロジェクトの「Project Settings → API」で次を控える：
   - Project URL（例: https://xxxxxxxx.supabase.co）
   - service_role key（秘密鍵。サーバー側のみで使用します）

※ service_role キーはサーバー（Cloudflare の Functions）内だけで使い、ブラウザには出しません。RLS は有効のままで構いません（service_role は RLS を通過します）。

## 2. Cloudflare Pages 側の準備（環境変数）
Cloudflare Pages のプロジェクト → Settings → Environment variables に追加：

- `SUPABASE_URL` = （Supabase の Project URL）
- `SUPABASE_SERVICE_KEY` = （service_role key）

（OCRを使う場合は既存の `GCV_API_KEY` も設定）

設定後、再デプロイしてください。

## 3. 仕組み（ファイル）
- `functions/api/sheet-save.js` … POST。シートデータを保存し短いID（例 ab12cd34）を返す。
- `functions/api/sheet.js` … GET `?id=` 。保存済みデータを返す。
- `view.html` … お客様が開く閲覧ページ。QRの行き先（`view.html?id=ID`）。表示して「PDFを保存/印刷」できる。
- フォーム本体（`index.html`）の「共有QRを作成」… 保存→共有URLをQR化して画面表示。以後のPDF出力の右上にQRが印字される。

## 4. 注意
- 共有データには、入庫時画像・署名・損傷記録・お客様情報が含まれます（個人情報）。公開URLは推測されにくいIDですが、取り扱いにご注意ください。必要なら後日、有効期限や削除機能を追加できます。
- QRは PDF を作成する前に「共有QRを作成」を押してください（押した時点のQRがPDFに入ります）。
