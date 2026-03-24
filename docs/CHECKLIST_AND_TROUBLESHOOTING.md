# 工場ビジーメーター やることはこれだけ / 失敗した場合の確認ポイント

## やることはこれだけ

1. **Supabase**  
   Dashboard > SQL Editor を開き、`sql/schema.sql` の内容をそのまま貼り付けて「Run」で実行する。  
   「already in publication」など Realtime のエラーが出たら、Dashboard > Database > Replication で `public.machine_status` を手動で追加する。

2. **ローカル**  
   プロジェクト直下に `.env` を置き、`VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定する。  
   `npm install` のあと `npm run dev` で起動し、ブラウザで `http://localhost:5173/` を開く。

3. **確認**  
   「工場ビジーメーター」が見え、大阪/大分/高知の3セクションと各機械カード（実行状態・ジャムレベル・バー・スライダー・「変更を保存」）が表示され、保存と別タブでのリアルタイム反映が動けば完了。

---

## 失敗した場合の確認ポイント

- **画面が真っ白 / env エラー**  
  `.env` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` があるか確認。変更したら開発サーバーを再起動する。

- **「データ取得に失敗」 / 一覧が出ない**  
  Supabase で `sql/schema.sql` を実行済みか確認。RLS で SELECT が許可されているか（ポリシーで `USING (true)` になっているか）確認。

- **保存できない**  
  RLS で `machine_status` の UPDATE / INSERT が許可されているか確認。ビュー `machine_status_display` ではなくテーブル `machine_status` への upsert になっているか確認。

- **別タブで更新しても反映されない**  
  Dashboard > Database > Replication で `public.machine_status` が Realtime の publication に含まれているか確認。含まれていなければ「Add table」で追加する。

- **`Failed to resolve import ... supabaseClient`**  
  `src/supabaseClient.js` は削除済み。参照はすべて `src/lib/supabaseClient.js` になっているか確認する。
