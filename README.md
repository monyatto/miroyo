# miroyo

がんばった成果を見せびらかすWebアプリ。

テキストで成果を入力すると、DJのお兄さんがノリノリで紹介してくれます。結果はURLでシェアできます。

## 機能

- テキストで成果を入力（例: 「今週毎日5km走った」）
- Gemini APIがテキストを解釈し、成果データとDJコメントを生成
- DJのお兄さんが成果をノリノリで紹介する結果画面
- 数値の偉大さを例え話で紹介するトリビア機能
- URLでシェア（データはURL内に圧縮して埋め込み、DBなし）

## 技術構成

- **フロントエンド**: HTML + CSS + JavaScript（フレームワークなし）
- **バックエンド**: Vercel Serverless Functions（Gemini APIプロキシ）
- **AI**: Google Gemini 2.5 Flash
- **ホスティング**: Vercel
- **URLシェア**: Base64エンコード（DB不要）

## セットアップ

```bash
npm install
```

### 環境変数

`.env.example` をコピーして `.env` を作成し、Gemini APIキーを設定してください。

```bash
cp .env.example .env
```

APIキーは [Google AI Studio](https://aistudio.google.com/apikey) で取得できます。

### ローカル起動

```bash
vercel dev
```

`http://localhost:3000` でアクセスできます。

## デプロイ

```bash
vercel --prod
```

Vercelの環境変数に `GEMINI_API_KEY` を設定してください。

## ライセンス

MIT
