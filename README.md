# Content King

Content King is an AI-powered social media content generator for startup founders. Paste a URL or rough notes, then generate platform-native drafts for LinkedIn, X, Instagram, and Reddit in one pass.

## Run locally

```bash
npm start
```

Open [http://localhost:4173](http://localhost:4173).

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
