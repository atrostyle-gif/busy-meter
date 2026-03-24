# 工場ビジーメーター セットアップ手順・チェックリスト・トラブルシュート

## A) 変更/新規作成したファイル一覧

| パス | 内容 |
|------|------|
| `sql/schema.sql` | テーブル・ビュー・RLS・Realtime 用 SQL（Supabase SQL Editor で実行） |
| `src/lib/supabaseClient.js` | Supabase クライアント初期化（既存の `src/supabaseClient.js` を lib に移動） |
| `src/hooks/useMachineStatus.js` | 一覧取得・Realtime 購読・60秒フォールバック・update/upsert |
| `src/components/MachineCard.jsx` | 1機械カード（表示名・稼働状態・詰まりバー・スライダー・更新日時） |
| `src/components/FactorySection.jsx` | 工場セクション（大阪/大分/高知＋カード一覧） |
| `src/App.jsx` | 工場ビジーメーター画面（見出し・エラー・トースト・3工場セクション） |
| `src/App.css` | カード・バー・スライダー・警告・トーストのスタイル |
| `docs/BUSY_METER_SETUP.md` | 本手順・チェックリスト・トラブルシュート |

**削除:** `src/supabaseClient.js` → 利用箇所を `src/lib/supabaseClient.js` に統一済み。

---

## B) 必要な SQL（Supabase で実行する内容）

すべて **Supabase Dashboard > SQL Editor** で実行できます。

1. **スキーマ一式**  
   プロジェクト内の **`sql/schema.sql`** を開き、内容をコピーして SQL Editor に貼り付け、**Run** で実行する。

   含まれる内容:
   - `public.machines` の作成（既存ならカラム追加のみ）
   - `public.machine_status` の作成（PK: machine_id、必要なら FK）
   - `updated_at` 自動更新トリガー
   - マスタ投入（大阪・大分・高知の機械）
   - 表示用ビュー `machine_status_display`（machines LEFT JOIN machine_status）
   - RLS 有効化とポリシー（SELECT 全員・UPDATE/INSERT 全員）
   - Realtime 用: `ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_status;`

2. **Realtime を SQL で追加しない場合**  
   - Dashboard > **Database** > **Replication** を開く。  
   - **0 tables in publication** の **Add table** から `public.machine_status` を追加する。

---

## C) 手順書（実施順）

1. **Supabase 側**
   - 対象プロジェクトを開く。
   - **SQL Editor** で `sql/schema.sql` の内容を実行する。
   - 最後の `ALTER PUBLICATION ... ADD TABLE public.machine_status` でエラーが出た場合:
     - 「already in publication」系なら無視してよい。
     - それ以外なら **Database > Replication** から手動で `public.machine_status` を追加する。

2. **ローカル**
   - リポジトリ直下に `.env` があることを確認する。
   - 以下が設定されていることを確認する。  
     `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   - `npm i` のあと `npm run dev` で起動する。
   - ブラウザで `http://localhost:5173/` を開く。

3. **動作確認**
   - 大阪・大分・高知の 3 セクションが表示される。
   - 各機械カードに「稼働状態」「詰まり具合」バー・スライダー・更新日時が出る。
   - スライダーを動かして離すと保存され、トーストで「保存しました」が出る。
   - 別タブ/別端末で同じ URL を開き、片方で保存すると、もう片方にリアルタイムで反映される。

---

## D) 動作確認チェックリスト

- [ ] 見出し「工場ビジーメーター」が表示される
- [ ] 大阪工場・大分工場・高知工場の 3 セクションが表示される
- [ ] 各工場に指定の機械が表示される（大阪: CT20以下, CT32, NC, MINI, MC / 大分: NC, NC_Bar / 高知: CT20）
- [ ] 詰まり具合が 0→青・50→黄・100→赤のバーで表示される
- [ ] jam_level 70 以上でカードが警告スタイル（薄赤背景など）になる
- [ ] スライダーで jam_level を変えて離すと保存され、トースト「保存しました」が出る
- [ ] 稼働状態のドロップダウンを変えると保存される
- [ ] 別タブ/別端末で更新すると、開いている画面にリアルタイムで反映される
- [ ] エラー時はメッセージと「再取得」ボタンが表示される
- [ ] 保存中は「Saving...」が表示される

---

## E) よくあるエラーと対処

| 現象 | 想定原因 | 対処 |
|------|----------|------|
| 画面真っ白・コンソールに env エラー | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` が未設定 | `.env` に上記 2 つを設定し、**開発サーバーを再起動**する（Vite は起動時にしか env を読まない） |
| 「データ取得に失敗しました」 | RLS で SELECT が拒否されている / ビュー・テーブルが無い | RLS ポリシーで `SELECT USING (true)` が付いているか確認。`sql/schema.sql` を再実行してビュー・テーブルを用意する |
| 一覧は出るが更新できない | RLS で UPDATE/INSERT が拒否されている | `machine_status` に `FOR UPDATE USING (true)` と `FOR INSERT WITH CHECK (true)` が付いているか確認 |
| 別端末の変更がリアルタイムで反映されない | Realtime が有効になっていない | **Database > Replication** で `public.machine_status` が publication に含まれているか確認。含まれていなければ「Add table」で追加する |
| Realtime のエラーがコンソールに出る | ネットワーク・ファイアウォール・Supabase 側の Realtime 制限 | 60秒フォールバックで一覧は更新される。DNS やプロキシを確認。Supabase の Realtime 利用量・制限を確認する |
| `Failed to resolve import ... supabaseClient` | 旧パス `./supabaseClient` を参照している | すべて `./lib/supabaseClient` または `../lib/supabaseClient` に変更済みか確認。`src/supabaseClient.js` は削除済みのため、参照を残さないこと |
| ビューが無い / カラムが無い | スキーマ未実行または途中で失敗 | `sql/schema.sql` を先頭から順に実行する。既存テーブルがある場合は、衝突する部分（例: 既存の machine_status に FK を足す）をコメントアウトするか、手動で整合を取る |

---

## Realtime が動かないときの確認ポイント

1. **Publication**  
   Supabase Dashboard > **Database** > **Replication** で、`supabase_realtime` に `public.machine_status` が含まれているか確認する。

2. **RLS**  
   `machine_status` に対して SELECT が許可されているか確認する。Realtime は「変更を配信するだけ」なので、SELECT が通らないとクライアント側で再取得してもデータが返らず、結果的に「反映されない」ように見える。

3. **ブラウザコンソール**  
   Realtime 購読で `CHANNEL_ERROR` が出ていないか確認する。出ている場合はネットワークや Supabase の Realtime ステータスを確認する。

4. **フォールバック**  
   本アプリは 60 秒ごとに一覧を再取得するため、Realtime が落ちていても 1 分以内には他端末の変更は反映される。
