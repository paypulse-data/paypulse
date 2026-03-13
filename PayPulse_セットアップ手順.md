# PayPulse セットアップ手順

## 全体の流れ

```
gas_Code.gs → Google Apps Script にデプロイ
      ↓
  setupConfig() でスプレッドシートID・パスワードを登録
      ↓
   デプロイURL を survey.html / paypulse_result.html に貼り付ける
      ↓
  完成！ アンケートを共有する
```

---

## STEP 1：Google スプレッドシートを準備する

1. [Google スプレッドシート](https://docs.google.com/spreadsheets/) を新規作成する
2. URLから **スプレッドシートID** をコピーしておく
   ```
   https://docs.google.com/spreadsheets/d/【ここがスプレッドシートID】/edit
   ```
3. メニューから **「拡張機能」→「Apps Script」** を開く

---

## STEP 2：GASにコードを貼り付ける

1. GASエディタに表示されているコードをすべて削除する
2. `gas_Code.gs` の内容をすべてコピーして貼り付ける
3. 画面上部の **「保存」ボタン（Ctrl+S）** を押す

---

## STEP 3：スプレッドシートIDとパスワードを設定する

> ⚠️ スプレッドシートIDと管理者パスワードはソースコードに直書きしません。
> `setupConfig()` 関数で安全に登録します。

1. `gas_Code.gs` 内の `setupConfig()` 関数を開き、以下の2行を実際の値に書き換える：
   ```javascript
   props.setProperty('SPREADSHEET_ID', 'YOUR_SPREADSHEET_ID_HERE'); // ← STEP 1でコピーしたID
   props.setProperty('ADMIN_PASSWORD',  'YOUR_SECURE_PASSWORD_HERE'); // ← 任意のパスワード
   ```
2. GASエディタ上部の関数選択で **「setupConfig」** を選び、**「実行」** をクリック
3. アクセス許可を求めるダイアログが出たら **「アクセスを許可」** を押す
4. ログに「✅ 設定完了」と表示されれば成功

> 設定後は `setupConfig()` の2行を元のプレースホルダーに戻しても構いません。
> 値はGASのプロパティに安全に保存されています。

---

## STEP 4：ウェブアプリとしてデプロイする

1. 右上の **「デプロイ」→「新しいデプロイ」** をクリック
2. ⚙アイコン（歯車）→ **「ウェブアプリ」** を選択
3. 設定を以下のように変更：
   - **説明**: PayPulse API（任意）
   - **実行ユーザー**: 自分
   - **アクセスできるユーザー**: **全員**
4. **「デプロイ」** をクリック
5. Googleアカウントの確認ダイアログが出たら **「アクセスを許可」** を押す
6. **「ウェブアプリのURL」** が表示される → コピーする
   例: `https://script.google.com/macros/s/AKfycby.../exec`

---

## STEP 5：HTMLファイルにURLを貼り付ける

`survey.html` と `paypulse_result.html` の2ファイルを開き、
それぞれ **`YOUR_GAS_URL_HERE`** の部分を実際のURLに書き換える。

### survey.html（762行目あたり）
```javascript
// 変更前
const GAS_URL = 'YOUR_GAS_URL_HERE';

// 変更後
const GAS_URL = 'https://script.google.com/macros/s/AKfycby.../exec';
```

### paypulse_result.html（163行目あたり）
```javascript
// 変更前（または既存URLを上書き）
const GAS_URL = 'https://script.google.com/macros/s/AKfycby.../exec';
```

---

## STEP 6：動作確認

1. `survey.html` をブラウザで開く
2. フォームに入力して送信する
3. 2秒後に `paypulse_result.html` に自動遷移する
4. Google スプレッドシートの **「Responses」シート** にデータが追加されていることを確認

---

## STEP 7：ダッシュボードで回答を確認する

1. `survey.html` を開いてナビの **「ダッシュボード」** をクリック
2. STEP 3 で設定したパスワードを入力する
3. 全回答データが一覧表示される
4. **「CSVダウンロード」** でエクスポートも可能

---

## ファイル一覧

| ファイル | 役割 |
|---|---|
| `index.html` | ランディングページ |
| `about.html` | PayPulseについてのページ |
| `survey.html` | アンケートフォーム（4ステップ）＋管理ダッシュボード |
| `paypulse_result.html` | 年収診断結果ページ（パーセンタイル・ヒストグラム等） |
| `privacy.html` | プライバシーポリシー |
| `gas_Code.gs` | Google Apps Script バックエンド（スプレッドシート連携） |

---

## よくある質問

**Q: 「アクセスを許可」ダイアログで「このアプリは確認されていません」と表示される**
A: 「詳細」→「（アプリ名）に移動（安全ではないページ）」をクリックして許可してください。自分のGASスクリプトなので安全です。

**Q: 診断結果が「データ不足」と表示される**
A: 最低5件の回答が必要です。テスト用に数件入力してみてください。
99パーセンタイルの表示には50件以上必要です。

**Q: コードを修正後に再デプロイする方法**
A: 「デプロイ」→「デプロイを管理」→「編集」→バージョンを「新しいバージョン」にして「デプロイ」。URLは変わりません。

**Q: ダッシュボードのパスワードを変えたい**
A: GASエディタで `setupConfig()` の `ADMIN_PASSWORD` 行を新しいパスワードに書き換えて再実行してください。コードには残りません。

---

*PayPulse © 2026*
