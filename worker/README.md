# Content King API (Cloudflare Worker)

This Worker is the "server" for Content King when you host the UI on GitHub Pages.

It keeps your `GEMINI_API_KEY` secret (it never goes to the browser).

## Deploy

From the repo root:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

After deploy, Wrangler prints a URL ending in `.workers.dev`.
Paste that into the Content King UI under **Advanced settings → API endpoint**.

