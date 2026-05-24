# Content King

Content King is an AI-powered social media content generator for startup founders. Paste a URL or rough notes, then generate platform-native drafts for LinkedIn, X, Instagram, and Reddit in one pass.

## Run locally

```bash
npm start
```

Open [http://localhost:4173](http://localhost:4173).

## Deploy (Render)

Render provides a `PORT` automatically. This app will also bind to `0.0.0.0` when running on Render so Render can detect the open port.

## Deploy (No credit card)

If you want a deployment path that can work without a credit card, mirror the approach used in `XGrowth`:

1. Host the UI on GitHub Pages (static files).
2. Host the API on Cloudflare Workers (keeps your Gemini key secret).

### 1) Publish the UI with GitHub Pages

This repo already includes a ready-to-publish static site in `docs/`.

In GitHub:
1. Open the repo → Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main`
4. Folder: `/docs`
5. Save, then wait for GitHub to give you the live link.

### 2) Deploy the API with Cloudflare Workers

The worker lives in `worker/` and exposes:
- `POST /api/extract`
- `POST /api/generate`

After you deploy the Worker, copy its URL (it ends with `.workers.dev`) and paste it into:

UI → Advanced settings → API endpoint

## Gemini setup

Set a Gemini API key before starting the server:

```bash
export GEMINI_API_KEY="your-key"
npm start
```

The app also includes an optional in-browser key field for quick testing. For production, keep the key on the server with `GEMINI_API_KEY`.

By default the server tries models in this order (falling back if a model is unavailable/quota-limited):

`gemini-3.5-flash` → `gemini-3.1-pro-preview` → `gemini-3-flash-preview` → `gemini-3.1-flash-lite` → `gemini-3.1-flash-lite-preview` → `gemini-2.5-pro` → `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash`

Override the chain with `GEMINI_MODEL_CHAIN` (comma-separated).

## Features

- URL extraction for articles, blogs, and press releases
- Notes-first workflow for rough founder thoughts
- Gemini-powered generation with a structured JSON prompt
- LinkedIn, X, Instagram, and Reddit drafts generated together
- Platform character counts and over-limit warnings
- Copy buttons, JSON export, and local history
- Dependency-free Node server serving static production assets
