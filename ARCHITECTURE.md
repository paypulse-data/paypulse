# PayPulse — アーキテクチャ概要

> ゼネコン建築施工管理者向け 年収診断サービス
> GitHub Pages (静的サイト) + Google Apps Script (API バックエンド)

---

## 目次
1. [システム全体像](#1-システム全体像)
2. [ファイル構成](#2-ファイル構成)
3. [データフロー](#3-データフロー)
4. [GAS API リファレンス](#4-gas-api-リファレンス)
5. [スプレッドシートのカラム定義](#5-スプレッドシートのカラム定義)
6. [ビジネスロジック詳細](#6-ビジネスロジック詳細)
7. [よくあるメンテナンス作業](#7-よくあるメンテナンス作業)
8. [新規開発者向けセットアップ](#8-新規開発者向けセットアップ)

---

## 1. システム全体像

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Pages  (静的ホスティング)                         │
│                                                          │
│  index.html ──→  survey.html ──→  paypulse_result.html  │
│  (TOP)           (アンケート)       (診断結果)             │
│  about.html  privacy.html                                │
│                                                          │
│  共有設定: config.js  共通CSS: brand.css                  │
└────────────────────┬────────────────────────────────────┘
                     │ JSONP / fetch (CORS回避)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Google Apps Script  (gas_Code.gs)                       │
│                                                          │
│  doGet()   ← action=result / count / admin / ping        │
│  doPost()  ← action=submit                               │
└────────────────────┬────────────────────────────────────┘
                     │ SpreadsheetApp API
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Google Spreadsheet  (Responses シート)                   │
│  ID は GAS の PropertiesService に保存（ソースには非記載） │
└─────────────────────────────────────────────────────────┘
```

---

## 2. ファイル構成

```
/
├── config.js              ★ GAS_URL を一元管理。URLが変わったらここだけ更新
├── gas_Code.gs            GAS バックエンド全体（スプレッドシートのAPIサーバー役）
│
├── index.html             TOP/HOMEページ。GASからリアルタイム回答数を取得
├── survey.html            アンケートフォーム。送信後にpaypulse_result.htmlへ遷移
├── paypulse_result.html   診断結果ページ。GASから計算済みデータを受け取って描画
├── about.html             サービス説明ページ
├── privacy.html           プライバシーポリシー
├── brand.css              共通ブランドスタイル（ロゴ・カラー変数など）
│
└── ARCHITECTURE.md        ← このファイル
```

### 各ページの責務

| ファイル | 役割 | GAS通信 |
|---|---|---|
| `index.html` | LP + 回答数カウンター表示 | `action=count` のみ |
| `survey.html` | 入力フォーム + 送信 + 管理画面 | `action=submit` (POST) + `action=admin` |
| `paypulse_result.html` | パーセンタイル計算結果の表示 | `action=result` |
| `gas_Code.gs` | データ保存・集計・API応答 | — |

---

## 3. データフロー

### 3-1. 回答送信 (survey.html → GAS → Spreadsheet)

```
ユーザーがフォームを送信
  ↓
survey.html: UUIDを生成 → localStorageに payload を保存
  ↓
POST https://{GAS_URL}  body: { action:"submit", id, payload }
  ↓
gas_Code.gs doPost(): saveResponse(id, payload) → Spreadsheet に1行追記
  ↓
{ success: true, id } を返す
  ↓
survey.html: paypulse_result.html?id={uuid} にリダイレクト
```

### 3-2. 診断結果取得 (paypulse_result.html → GAS)

```
paypulse_result.html: URLから id を取得
  ↓
まず fetch(credentials:'omit') を試みる
  └─失敗時→ JSONP (動的 <script> タグ) にフォールバック
  └─両方失敗→ localStorage のキャッシュからローカル計算（参考値）
  ↓
gas_Code.gs getResult(id):
  - ユーザー行を検索
  - 自動緩和ロジックでピアグループを選定
  - パーセンタイル・ヒストグラム・キャリアトレンドを計算
  - データ鮮度ラベルを付与
  ↓
paypulse_result.html: ヒーロー + テーブル + チャートを描画
```

### 3-3. CORS 回避戦略

GitHub Pages (静的) → GAS (スクリプト) のクロスオリジン問題は以下の順で対処:

1. **fetch + `credentials:'omit'`** — Googleのマルチアカウントリダイレクトを回避
2. **JSONP フォールバック** — `<script src="...?callback=pp_cb_XXX">` でCORS完全回避
3. **ローカル推定モード** — 上記が両方失敗した場合、サービスが落ちない最終手段

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
  "pctTable": [ ... ],         // パーセンタイルテーブル（下記参照）
  "histogram": [ ... ],        // ヒストグラムデータ
  "careerTrend": [ ... ]       // キャリア年次別データ
}
```

**pctTable 要素:**
```json
{
  "pct": 75,           // パーセンタイル値
  "label": "TOP 25%",
  "crown": true,       // 王冠アイコンを表示するか
  "value": 760,        // 万円（null = データ不足で非表示）
  "unlocked": true,    // trueなら表示、falseならロック表示
  "needed": 0          // ロック解除まであと何件必要か
}
```

**histogram 要素:**
```json
{ "label": "700-799", "count": 4, "isUser": true }
```

**careerTrend 要素:**
```json
{ "label": "10-14年", "count": 5, "p10": 480, "p25": 540, "p50": 620, "p75": 720, "p90": 820 }
```

---

### GET `?action=count`

HOMEページのカウンター用。回答総数を返す。

```json
{ "success": true, "count": 42 }
```

---

### GET `?action=ping`

GASの疎通確認用。

```json
{ "success": true, "message": "PayPulse API OK" }
```

---

### GET `?action=admin&password={pw}`

管理者用。全データをダウンロード。`survey.html?debug=true` からアクセス。

```json
{ "success": true, "headers": [...], "rows": [[...], ...] }
```

パスワードは GAS の `PropertiesService` に保存（ソース非記載）。

---

### POST `action=submit`

アンケート送信。

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

---

### JSONP 対応

すべての GET エンドポイントは `?callback={関数名}` パラメータを付けると JSONP 形式で返す。

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
| `送信日時` | datetime | 保存時刻 (JST) |
| `メール` | string | 任意。空の場合あり |
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

### 6-1. ピアグループ選定 (自動緩和ロジック)

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

ピアグループ（≥ MIN_DATA件）を対象に、以下の閾値でラベルを決定:

```
count(直近6ヶ月) / total ≥ 0.8  → "直近6ヶ月"
count(直近1年)   / total ≥ 0.8  → "直近1年"
count(直近2年)   / total ≥ 0.8  → "直近2年"
それ以外 かつ 日付データ2件以上   → "YYYY年M月〜" (最古投稿月)
それ以外                          → null (非表示)
```

---

## 7. よくあるメンテナンス作業

### GAS を再デプロイしたとき (URLが変わる)

```
1. GASエディタで新しいURLをコピー
2. config.js の GAS_URL を新しいURLに書き換える
   （他のHTMLファイルは触らなくて良い）
3. git add config.js
4. git commit -m "chore: update GAS_URL"
5. git push
```

### アンケートに新しい設問を追加したいとき

1. `survey.html` に入力フィールドを追加
2. `survey.html` の送信処理で `payload` に新フィールドを追加
3. `gas_Code.gs` の `saveResponse()` に:
   - ヘッダー配列 (`headers`) に新カラム名を追加
   - `sheet.appendRow()` の引数配列に対応値を追加
4. `gas_Code.gs` の `getResult()` で、新フィールドを比較軸にするなら `entries` マッピングと緩和ロジックに追加
5. GAS を再デプロイ（URLが変わるので config.js も更新）

### 比較軸を変更したいとき (緩和ステージの追加・削除)

`gas_Code.gs` の `getResult()` 内 `stages` 配列を編集する:

```javascript
const stages = [
  { desc: null, fn: e => e.role===userRole && e.type===userType && ... },
  // ↑ Stage 0: 最も厳しい条件（全条件一致）
  { desc: '説明文', fn: e => ... },
  // ...
  { desc: '全データで比較', fn: () => true }
  // ↑ 必ず最後は全データフォールバック
];
```

### デモモードで確認したいとき

```
https://paypulse-data.github.io/paypulse/paypulse_result.html?demo=1
```

ハードコードされたサンプルデータ（720万円/77.5%ile/12人）が表示される。
GASへの通信は発生しない。サンプルデータの変更は `getDemoData()` 関数を編集。

### 管理ダッシュボード（全データ確認）

```
https://paypulse-data.github.io/paypulse/survey.html?debug=true
```

ページ右上に管理リンクが表示される。パスワードは GAS の PropertiesService に保存済み。

---

## 8. 新規開発者向けセットアップ

### 前提条件
- GitHub アカウント（リポジトリへのアクセス権）
- Google アカウント（GAS プロジェクトへのアクセス権）

### ローカル確認

```bash
git clone https://github.com/paypulse-data/paypulse.git
cd paypulse
# 静的ファイルなのでそのままブラウザで開いてOK
# または簡易HTTPサーバーで確認:
python3 -m http.server 8000
# → http://localhost:8000/
```

> **注意:** `?demo=1` は localhost でも動作するが、実際の GAS 通信は
> `config.js` の GAS_URL に正しいデプロイURLが設定されている必要がある。

### GAS プロジェクトの構成

| 項目 | 値 |
|---|---|
| ファイル名 | `gas_Code.gs` (このリポジトリと同名) |
| 実行環境 | V8 ランタイム |
| デプロイ種別 | ウェブアプリ |
| アクセス権 | 全員（認証なし） |
| スプレッドシートID | PropertiesService に保存（`setupConfig()` で登録） |

### 初回セットアップ手順

詳細は `PayPulse_セットアップ手順.md` / `GitHub_Pages公開手順.md` を参照。

```
1. Google スプレッドシートを新規作成 → IDをコピー
2. GAS プロジェクトを作成 → gas_Code.gs を貼り付け
3. GAS エディタで setupConfig() を実行:
     props.setProperty('SPREADSHEET_ID', 'コピーしたID');
     props.setProperty('ADMIN_PASSWORD',  '任意のパスワード');
4. ウェブアプリとしてデプロイ → URLをコピー
5. config.js の GAS_URL に貼り付け → push
```

---

## ライセンス・連絡先

プロジェクトオーナー: AKI (tsujiuchi@wheelsup.jp)
リポジトリ: https://github.com/paypulse-data/paypulse
公開URL: https://paypulse-data.github.io/paypulse/
