# PayPulse — GitHub Pages 公開手順

## アップロードするファイル（6つ）

| ファイル名 | 説明 |
|---|---|
| `brand.css` | ブランド共通スタイル（必須・最初にアップ） |
| `index.html` | ランディングページ（メイン） |
| `about.html` | PayPulseについて |
| `survey.html` | アンケートページ |
| `paypulse_result.html` | 診断結果ページ |
| `privacy.html` | プライバシーポリシー |

---

## STEP 1：GitHubアカウントの準備

1. https://github.com にアクセス
2. 右上「Sign up」からアカウント作成（すでにある場合はスキップ）

---

## STEP 2：リポジトリを作成する

1. ログイン後、右上「＋」→「New repository」をクリック
2. 以下を入力：
   - **Repository name**: `paypulse`（または任意の名前）
   - **Public** を選択（GitHub Pages無料版はPublicが必要）
   - 「Add a README file」にチェック
3. 「Create repository」をクリック

---

## STEP 3：ファイルをアップロード

1. 作成したリポジトリのページを開く
2. 「Add file」→「Upload files」をクリック
3. 以下の6ファイルをまとめてドラッグ＆ドロップ：
   - `brand.css`
   - `index.html`
   - `about.html`
   - `survey.html`
   - `paypulse_result.html`
   - `privacy.html`
4. 下部の「Commit changes」をクリック

---

## STEP 4：GitHub Pages を有効化

1. リポジトリの「**Settings**」タブをクリック
2. 左サイドバーの「**Pages**」をクリック
3. 「**Source**」を「Deploy from a branch」に設定
4. Branch: **main** / フォルダ: **/ (root)** を選択
5. 「**Save**」をクリック

---

## STEP 5：URLを確認・公開

数分後、以下のURLでアクセスできるようになります：

```
https://【あなたのGitHubユーザー名】.github.io/paypulse/
```

例：`https://tsujiuchi.github.io/paypulse/`

> ページ更新には最大5分かかる場合があります。

---

## ファイルを更新したい場合

1. リポジトリページで対象ファイルをクリック
2. 右上の鉛筆アイコン（Edit）をクリック
3. または「Add file」→「Upload files」で上書きアップロード

---

## 公開後にやること（チェックリスト）

- [ ] `privacy.html` の「【運営者名を記入してください】」を実際の社名に変更してアップロード
- [ ] Googleスプレッドシートのテストデータ（test@example.com行）を削除
- [ ] 公開URLをメルマガ・SNS・Slackに展開
- [ ] 管理者ダッシュボードへのアクセス方法：
      `https://【URL】/?debug=true` にアクセスしてフッターの「管理」リンクから

---

## テスト用URL（開発・管理者専用）

```
https://【URL】/?debug=true
```
このURLにアクセスすると：
- 🧪 TESTボタンが表示される
- フッターに「管理」リンクが現れる（ダッシュボードへのアクセス）
