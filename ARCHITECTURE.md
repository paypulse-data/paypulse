# PayPulse — アーキテクチャ概要

> ゼネコン建築施工管理者向け 年収診断サービス
> GitHub Pages (静的サイト) + Google Apps Script (API バックエンド)

---

## ⚠️ このドキュメントの更新ルール

**システムを変更したら、必ずこのファイルも同じコミットで更新してください。**

```
変更したら → ARCHITECTURE.md も更新 → git add ARCHITECTURE.md → 同じコミットでpush
```

更新が必要になる主なケース:
- GAS API にエンドポイントを追加・変更した
- スプレッドシートのカラムを追加・変更した
- HTML ファイルを追加・削除した
- ビジネスロジック（緩和ステージ・閾値など）を変更した
- 外部サービスやツールを追加した

---

## 目次
1. [システム全体像](#1-システム全体像)
2. [ファイル構成](#2-ファイル構成)
3. [データフロー](#3-データフロー)
4. [GAS API リファレンス](#4-gas-api-リファレンス)
5. [スプレッドシートのカラム定義](#5-スプレッドシートのカラム定義)
6. [ビジネスロジック詳細](#6-ビジネスロジック詳細)
7. [パフォーマンスと運用](#7-パフォーマンスと運用)
8. [よくあるメンテナンス作業](#8-よくあるメンテナンス作業)
9. [新規開発者向けセットアップ](#9-新規開発者向けセットアップ)

---

## 1. システム全体像

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Pages  (静的ホスティング)                         │
│                                                          │
│  index.html ──→  survey.html ──→  paypulse_result.html  │
│  (TOP/HOME)      (アンケート)       (診断結果)             │
│  about.html  privacy.html                                │
│                                                          │
│  config.js   ← GAS_URL を一元管理（★ここだけ書き換える）  │
│  brand.css   ← 共通ブランドスタイル                       │
└────────────────────┬────────────────────────────────────┘
                     │ JSONP / fetch (CORS回避)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Google Apps Script  (gas_Code.gs)                       │
│                                                          │
│  doGet()   ← action=result / count / admin / ping        │
│  doPost()  ← action=submit → 保存 + メール送信            │
└──────────┬──────────────────────────┬───────────────────┘
           │ SpreadsheetApp           │ MailApp
           ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│  Google Spreadsheet  │   │  Gmail (送信のみ・蓄積なし)   │
│  (Responses シート)  │   │  ← ユーザーの受信ボックスへ   │
│                      │   │  ← BCC: contact.fairbase     │
└──────────────────────┘   │       @gmail.com（監視用）    │
                            └──────────────────────────────┘
```

### ストレージについて

| 場所 | 何が蓄積するか | 上限の目安 |
|---|---|---|
| Google Spreadsheet | 回答データ（1行 = 1回答） | 10M セル ≒ 30万件まで問題なし |
| Gmail | **なし**（送信済みメールは送信者側のみ） | 制限なし |
| GAS | **なし**（コードのみ、データは持たない） | — |
| ユーザーのブラウザ | localStorage に一時キャッシュ（回答数・回答ペイロード） | 数KB・自動消滅 |

> **重くなる原因はスプレッドシートだけ。** メール送信・結果計算はいくら増えても蓄積しない。
> 詳細は [§7 パフォーマンスと運用](#7-パフォーマンスと運用) を参照。

---

## 2. ファイル構成

```
/
├── config.js              ★ GAS_URL を一元管理。URLが変わったらここだけ更新
├── gas_Code.gs            GAS バックエンド（保存・集計・メール送信）
│
├── index.html             TOP/HOMEページ
│                            - 回答数カウンター（10分キャッシュ）
│                            - 診断結果プレビュー（iframe で自動同期）
├── survey.html            アンケートフォーム（4ステップ）
│                            - 送信後 paypulse_result.html へリダイレクト
│                            - ?debug=true で管理ダッシュボード表示
├── paypulse_result.html   診断結果ページ
│                            - ?id={uuid} で本番結果を取得
│                            - ?demo=1 でサンプルデータ表示（フォーム入力不要）
│                            - ?embed=1 でヘッダー非表示（index.html の iframe 用）
├── about.html             サービス説明ページ
├── privacy.html           プライバシーポリシー
├── brand.css              共通ブランドスタイル（ロゴ・カラー変数）
│
└── ARCHITECTURE.md        ← このファイル（システム変更時に必ず更新）
```

### 各ページの責務

| ファイル | 役割 | GAS通信 |
|---|---|---|
| `index.html` | LP + 回答数表示 + 結果ページプレビュー | `action=count`（10分キャッシュ） |
| `survey.html` | 入力フォーム + 送信 + 管理画面 | `action=submit` (POST) + `action=admin` |
| `paypulse_result.html` | パーセンタイル計算結果の表示 | `action=result` |
| `gas_Code.gs` | データ保存・集計・API応答・メール送信 | — |

---

## 3. データフロー

### 3-1. 回答送信 → 保存 → メール送信

```
ユーザーがフォームを送信
  ↓
survey.html: UUID を生成 → localStorage に payload を保存
  ↓
POST https://{GAS_URL}  body: { action:"submit", id, payload }
  ↓
gas_Code.gs doPost():
  1. saveResponse(id, payload) → Spreadsheet に1行追記
  2. payload.email が存在する場合:
       getResult(id) を実行（計算済みパーセンタイル等を取得）
       sendResultEmail(id, email, result) → Gmail 経由でHTML メール送信
         件名: 【PayPulse】あなたは同条件の上位XX%でした
         本文: パーセンタイル・年収・中央値 + 結果ページURL
         BCC: contact.fairbase@gmail.com（全送信の監視・記録用）
         ※ メール失敗しても保存は成功扱い（サイレントエラー）
  ↓
{ success: true, id } を返す
  ↓
survey.html: paypulse_result.html?id={uuid} にリダイレクト
```

### 3-2. 診断結果取得

```
paypulse_result.html: URL から id を取得
  ↓
?demo=1 の場合 → getDemoData() のハードコードデータを使用（GAS 不使用）
  ↓（通常時）
まず fetch(credentials:'omit') を試みる
  └─失敗時→ JSONP (動的 <script> タグ) にフォールバック
  └─両方失敗→ localStorage のキャッシュからローカル計算（参考値・オフラインモード）
  ↓
gas_Code.gs getResult(id):
  - ユーザー行を検索
  - 自動緩和ロジックでピアグループを選定（§6-1 参照）
  - パーセンタイル・ヒストグラム・キャリアトレンドを計算
  - データ鮮度ラベルを付与（§6-3 参照）
  ↓
paypulse_result.html: ヒーロー + 条件タグ + テーブル + チャートを描画
```

### 3-3. HOME の回答数カウンター

```
index.html 読み込み時:
  1. localStorage['pp_count_cache'] を確認
     → 10分以内のキャッシュがあれば即座に表示（GAS 呼び出しなし）
  2. キャッシュなし or 期限切れ:
     JSONP で GAS ?action=count を呼び出し（タイムアウト5秒）
     → 成功: 表示 + localStorage に保存（TTL 10分）
     → 失敗: デフォルト値「16+」を維持
```

### 3-4. HOME のプレビュー（自動同期）

```
index.html の「診断結果はこんな画面」セクション:
  <iframe src="paypulse_result.html?demo=1&embed=1">
    → paypulse_result.html の実物を 50% 縮小表示
    → ?embed=1 によりヘッダー・フッターは非表示
    → 結果ページを変更すれば index.html を触らずに自動反映
```

### 3-5. CORS 回避戦略

GitHub Pages (静的) → GAS (スクリプト) のクロスオリジン問題は以下の順で対処:

1. **fetch + `credentials:'omit'`** — Google マルチアカウントリダイレクトを回避
2. **JSONP フォールバック** — `<script src="...?callback=pp_cb_XXX">` で CORS 完全回避
3. **ローカル推定モード** — 両方失敗した場合も画面が落ちない最終手段

---

## 4. GAS API リファレンス

ベースURL: `config.js` の `GAS_URL` を参照

### GET `?action=result&id={uuid}`

ユーザーの診断結果を返す。

**レスポンス（成功時）:**
```json
{
  "success": true,
  "userIncome": 720,           // 万円
  "userPctile": 77.5,          // パーセンタイル (0-100)
  "peerCount": 12,             // ピアグループ人数
  "totalCount": 16,            // 全体回答数
  "median": 620,               // ピアグループ中央値（万円）
  "userAge": 32,
  "userRole": "主任・係長クラス",
  "userType": "建築（A工事）",
  "userPref": "東京都",
  "userCareerYears": 10,       // 推定キャリア年数（age - 22）
  "relaxApplied": [],          // 緩和されたステップの説明配列（空 = 緩和なし）
  "freshnessLabel": "直近1年", // データ鮮度ラベル（null = 非表示）
  "pctTable": [ ... ],
  "histogram": [ ... ],
  "careerTrend": [ ... ]
}
```

**pctTable 要素:**
```json
{ "pct": 75, "label": "TOP 25%", "crown": true, "value": 760, "unlocked": true, "needed": 0 }
```

**histogram 要素:**
```json
{ "label": "700-799", "count": 4, "isUser": true }
```

**careerTrend 要素:**
```json
{ "label": "10-14年", "count": 5, "p10": 480, "p25": 540, "p50": 620, "p75": 720, "p90": 820 }
```

> **注意:** careerTrend は**全回答者を対象**に `年齢 − 22` で経験年数を推定（大卒22歳入社の一律前提）。
> ピアグループの条件絞り込みは適用されない参考値。結果画面では「年代別の年収分布（参考）」と表示。

---

### GET `?action=count`

HOME の回答数カウンター用。フロント側で10分キャッシュ済み。

```json
{ "success": true, "count": 42 }
```

---

### GET `?action=ping`

GAS の疎通確認用。

```json
{ "success": true, "message": "PayPulse API OK" }
```

---

### GET `?action=admin&password={pw}`

管理者用。全データをダウンロード。`survey.html?debug=true` からアクセス。

```json
{ "success": true, "headers": [...], "rows": [[...], ...] }
```

---

### POST `action=submit`

アンケート送信 + (任意) 結果メール送信。

**リクエストボディ:**
```json
{
  "action": "submit",
  "id": "uuid-v4",
  "payload": {
    "case1": { "type": "建築（A工事）", "role": "主任・係長クラス", ... },
    "case2": { ... },
    "income": { "total": 720, "bonus": 100, ... },
    "basic": { "age": 32, "pref": "東京都", "quals": ["一級建築士"], ... },
    "email": "optional@example.com"
  }
}
```

`payload.email` が存在する場合、GAS が自動でパーセンタイル結果をHTMLメールで送信する。
送信時は常に `contact.fairbase@gmail.com` に BCC される（監視・記録用）。
メール送信が失敗しても `{ success: true }` を返す（サイレントエラー）。

**メール送信の上限（MailApp）:**
- 一般 Google アカウント: 100通/日
- Google Workspace: 1,500通/日

---

### JSONP 対応

すべての GET エンドポイントは `?callback={関数名}` で JSONP 形式で返す。

```
GET ?action=count&callback=pp_count_1710000000000
→ pp_count_1710000000000({"success":true,"count":42})
```

---

## 5. スプレッドシートのカラム定義

シート名: `Responses`

| カラム名 | 型 | 説明 |
|---|---|---|
| `ID` | string | UUID (フロントエンドで生成) |
| `送信日時` | datetime | 保存時刻 (JST)。**鮮度ラベル計算に使用** |
| `メール` | string | **必須**（フォームで required 化済み） |
| `案件1_工事分類` | string | 例: "建築（A工事）" |
| `案件1_役職` | string | 例: "主任・係長クラス" |
| `案件1_建物用途` | string | 例: "オフィス" |
| `案件1_受注金額_億円` | number | |
| `案件1_受注金額_万円` | number | 億未満の端数 |
| `案件1_地上階` | number | |
| `案件1_地下階` | number | |
| `案件1_延床面積` | number | m² |
| `案件1_経験業務` | string | `\|` 区切りの複数選択値 |
| `案件1_構造種別` | string | 例: "RC造" |
| `案件2_*` | — | 案件1と同構造（2件目の現場情報） |
| `年収_総支給年収` | number | 万円。**比較計算のメイン軸** |
| `年収_賞与` | number | 万円 |
| `年収_手当` | number | 万円 |
| `年収_残業代制度` | string | |
| `年収_実残業時間` | number | 月間時間 |
| `基本_年齢` | number | 歳 |
| `基本_性別` | string | |
| `基本_最終学歴` | string | |
| `基本_勤務地` | string | 都道府県。例: "東京都" |
| `基本_保有資格` | string | `\|` 区切りの複数選択値 |

---

## 6. ビジネスロジック詳細

### 6-1. ピアグループ選定（自動緩和ロジック）

データが最低件数（`MIN_DATA = 5`）に満たない場合、以下の順に条件を緩和して再試行する。

```
Stage 0: 役職 + 工事分類 + 勤務地 + 年代  (全4条件一致)
Stage 1: 工事分類 + 勤務地 + 年代         (役職を除外)
Stage 2: 勤務地 + 年代                    (工事分類も除外)
Stage 3: 年代のみ                         (勤務地も除外)
Stage 4: 20〜49歳                         (年代を拡大)
Stage 5: 全データ                         (条件なし)
```

緩和が発生したステージは `relaxApplied` 配列に記録され、フロントエンドで
アンバー色のタグとして表示される。

**定数:**
- `MIN_DATA = 5` — パーセンタイル表示の最低件数
- `MIN_DATA_99 = 50` — TOP 1% (99%ile) 解放の最低件数

### 6-2. パーセンタイル計算

線形補間方式:

```
index = (p / 100) × (n - 1)
value = arr[floor(index)] + (arr[ceil(index)] - arr[floor(index)]) × 小数部
```

### 6-3. データ鮮度ラベル

ピアグループ（≥ MIN_DATA 件）を対象に、以下の閾値でラベルを決定:

```
count(直近6ヶ月) / total ≥ 0.8  → "直近6ヶ月"（緑タグで表示）
count(直近1年)   / total ≥ 0.8  → "直近1年"
count(直近2年)   / total ≥ 0.8  → "直近2年"
それ以外 かつ 日付データ2件以上   → "YYYY年M月〜" (最古投稿月)
それ以外                          → null（タグを非表示）
```

---

## 7. パフォーマンスと運用

### 何が蓄積して重くなるか

**スプレッドシートのみ。** メール送信・結果計算はいくら増えても蓄積しない。

- **GAS は完全ステートレス** — 実行のたびに起動・終了する。状態を持たない。
- **メール送信** — Gmail の送信ボックスに残るが、受信者側に届くだけで GAS 側に蓄積しない。
- **結果計算** — 毎回スプレッドシートを読んで計算して返す。計算後は何も保存しない。

### スプレッドシートのスケール感

| 回答数 | `getResult()` の処理時間 | 対処 |
|---|---|---|
| ～1,000件 | ほぼ瞬時（< 1秒） | なにもしない |
| 1,000～5,000件 | 1〜2秒 | なにもしない |
| 5,000〜10,000件 | 2〜4秒（ユーザーが体感） | 集計キャッシュシートを検討 |
| 10,000件〜 | 要最適化 | 下記「将来の最適化」を参照 |

### 将来の最適化（今は不要）

**集計キャッシュシート方式（5,000件超になったら）:**
```
1. 夜間タイムトリガー（毎日深夜）で全集計を実行
2. 結果を "Cache" シートに書き出す
3. getResult() は Responses シートの全行読み込みをやめて Cache シートだけ参照
→ getResult() が O(n) → O(1) になる
```

**アーカイブ方式（古いデータの整理）:**
```
古い回答を削除せず "Archive" シートへ移動
→ アクティブな Responses シートを軽量に保つ
→ 必要に応じて Archive を参照できる（データは消えない）
```

> データは絶対に削除しない。データがサービスの価値。

---

## 8. よくあるメンテナンス作業

### GAS を再デプロイしたとき (URL が変わる)

```bash
# config.js の GAS_URL を新しい URL に書き換えてから:
git add config.js
git commit -m "chore: update GAS_URL to new deployment"
git push
# → index.html / survey.html / paypulse_result.html に自動反映
```

### アンケートに新しい設問を追加したいとき

1. `survey.html` に入力フィールドを追加
2. `survey.html` の送信処理で `payload` に新フィールドを追加
3. `gas_Code.gs` の `saveResponse()` に:
   - `headers` 配列に新カラム名を追加
   - `sheet.appendRow()` の引数配列に対応値を追加
4. 新フィールドを比較軸にするなら `getResult()` の `entries` マッピングと `stages` も更新
5. **このファイル（ARCHITECTURE.md）の §5 カラム定義を更新**
6. GAS を再デプロイ → `config.js` の URL も更新

### 結果ページのデザインを変えたとき

`paypulse_result.html` を更新してプッシュするだけ。
HOME の preview iframe は**自動的に**新しいデザインを反映する（手動更新不要）。

### デモモードで確認したいとき

```
https://paypulse-data.github.io/paypulse/paypulse_result.html?demo=1
```

ハードコードされたサンプルデータ（720万/77.5%ile/12人）が表示される。
データの変更は `getDemoData()` 関数を編集する。

### 管理ダッシュボード（全データ確認）

```
https://paypulse-data.github.io/paypulse/survey.html?debug=true
```

ページ右上に管理リンクが表示される。パスワードは GAS の PropertiesService に保存済み。

---

## 9. 新規開発者向けセットアップ

### 前提条件
- GitHub アカウント（リポジトリへのアクセス権）
- Google アカウント（GAS プロジェクトへのアクセス権）

### ローカル確認

```bash
git clone https://github.com/paypulse-data/paypulse.git
cd paypulse
python3 -m http.server 8000
# → http://localhost:8000/
# → http://localhost:8000/paypulse_result.html?demo=1  ← GAS 不要で動作確認可能
```

### GAS プロジェクトの構成

| 項目 | 値 |
|---|---|
| ファイル名 | `gas_Code.gs` |
| 実行環境 | V8 ランタイム |
| デプロイ種別 | ウェブアプリ |
| アクセス権 | 全員（認証なし） |
| スプレッドシートID | PropertiesService に保存（`setupConfig()` で登録） |

### 初回セットアップ手順

詳細は `PayPulse_セットアップ手順.md` / `GitHub_Pages公開手順.md` を参照。

```
1. Google スプレッドシートを新規作成 → ID をコピー
2. GAS プロジェクトを作成 → gas_Code.gs を貼り付け
3. GAS エディタで setupConfig() を実行:
     props.setProperty('SPREADSHEET_ID', 'コピーした ID');
     props.setProperty('ADMIN_PASSWORD',  '任意のパスワード');
4. ウェブアプリとしてデプロイ → URL をコピー
5. config.js の GAS_URL に貼り付け → push
```

---

## 変更履歴

| 日付 | 変更内容 |
|---|---|
| 2026-03-09 | 初版作成 |
| 2026-03-12 | config.js による GAS_URL 一元管理を追加 |
| 2026-03-12 | メール送信機能（sendResultEmail）を追加 |
| 2026-03-12 | HOME プレビューを iframe 自動同期方式に変更 |
| 2026-03-12 | 回答数カウンターに 10分キャッシュを追加 |
| 2026-03-12 | パフォーマンスと運用セクション（§7）を追加 |
| 2026-03-12 | 更新ルールを冒頭に追記 |
| 2026-03-13 | メール送信に BCC（contact.fairbase@gmail.com）を追加 |
| 2026-03-13 | サービスの訴求コピーを「比較」フレーミングに全面刷新 |
| 2026-03-13 | survey.html: 全フィールドを必須化・インラインバリデーション追加 |
| 2026-03-13 | 保有資格に「該当なし」選択肢を追加 |
| 2026-03-13 | careerTrend チャートのラベルを実態に即した表記に修正（全データ・参考値） |
| 2026-03-13 | メールカラムを「必須」に更新（§5） |

---

## ライセンス・連絡先

プロジェクトオーナー: AKI (tsujiuchi@wheelsup.jp)
リポジトリ: https://github.com/paypulse-data/paypulse
公開URL: https://paypulse-data.github.io/paypulse/
