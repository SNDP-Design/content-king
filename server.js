import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 4173);

const modelFallbackChain = (
  process.env.GEMINI_MODEL_CHAIN ||
  [
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash"
  ].join(",")
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|h1|h2|h3|li|blockquote|article|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractTitle(html) {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(ogTitle?.[1] || title?.[1] || "").slice(0, 180);
}

function extractDescription(html) {
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const ogDescription = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  return stripHtml(description?.[1] || ogDescription?.[1] || "").slice(0, 280);
}

function cleanGeneratedJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Gemini did not return JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function fallbackPosts({ sourceText, campaign }) {
  const topic = truncateWords((sourceText || "your latest startup update").replace(/\s+/g, " "), 150);
  const cta = campaign?.cta || "What would you add?";
  return {
    summary: `Drafted from: ${topic}`,
    posts: {
      linkedin: {
        platform: "LinkedIn",
        title: "Founder Narrative",
        post: `Startup update:\n\n${topic}\n\nThe useful part is not just the announcement. It is what it teaches about the customer problem, the tradeoff we made, and the momentum we are seeing.\n\n${cta}`,
        tips: ["Lead with the founder insight.", "Keep the first two lines specific."]
      },
      x: {
        platform: "X",
        title: "Punchy Thread Starter",
        post: `${topic}\n\nOne thing this proves: founders win when they turn customer signal into shipping cadence.\n\n${cta}`,
        tips: ["Use as a standalone post or first tweet.", "Add a metric if you have one."]
      },
      instagram: {
        platform: "Instagram",
        title: "Caption",
        post: `${topic}\n\nBuilding in public means sharing the useful lesson, not only the polished milestone.\n\n${cta}\n\n#startupfounder #buildinpublic #startuplife #founderjourney`,
        tips: ["Pair with a product screenshot or founder photo.", "Keep hashtags niche."]
      },
      reddit: {
        platform: "Reddit",
        title: "Community Post",
        post: `I am working through this startup update and would love operator feedback:\n\n${topic}\n\nThe part I am still thinking about is what this says about customer urgency and positioning.\n\n${cta}`,
        tips: ["Post in a relevant founder community.", "Avoid sounding promotional."]
      }
    }
  };
}

function truncateWords(text, limit) {
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  return `${clipped.slice(0, Math.max(0, clipped.lastIndexOf(" ")))}...`;
}

function buildPrompt({ sourceText, campaign }) {
  return `You are Content King, an expert social media strategist for startup founders.

Create platform-native posts from the source material. The user may provide article text, a press release, notes, or rough thoughts.

Founder context:
- Company/Product: ${campaign.company || "Startup"}
- Audience: ${campaign.audience || "startup operators, customers, investors, and early adopters"}
- Goal: ${campaign.goal || "build awareness and meaningful conversation"}
- Tone: ${campaign.tone || "sharp, credible, founder-led, useful"}
- Call to action: ${campaign.cta || "invite thoughtful replies"}

Rules:
- Return valid JSON only.
- Do not invent hard numbers, customer names, funding, partnerships, or claims that are not in the source.
- Make each post feel native to the platform.
- LinkedIn: 600-1200 characters, professional founder voice, strong hook, short paragraphs.
- X: under 280 characters unless a short thread is clearly better; no more than 2 hashtags.
- Instagram: caption under 1500 characters, visual-first tone, 4-8 relevant hashtags.
- Reddit: no hype, community-first, transparent, invites discussion, avoid sales language.

JSON shape:
{
  "summary": "one sentence source summary",
  "posts": {
    "linkedin": { "platform": "LinkedIn", "title": "short label", "post": "post text", "tips": ["tip", "tip"] },
    "x": { "platform": "X", "title": "short label", "post": "post text", "tips": ["tip", "tip"] },
    "instagram": { "platform": "Instagram", "title": "short label", "post": "post text", "tips": ["tip", "tip"] },
    "reddit": { "platform": "Reddit", "title": "short label", "post": "post text", "tips": ["tip", "tip"] }
  }
}

Source:
${sourceText.slice(0, 18000)}`;
}

async function generateWithGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY || payload.apiKey;
  if (!apiKey) {
    return { ...fallbackPosts(payload), isFallback: true, warning: "Add GEMINI_API_KEY to use live Gemini generation." };
  }

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(payload) }] }],
    generationConfig: {
      temperature: 0.75,
      topP: 0.9,
      responseMimeType: "application/json"
    }
  };

  let lastError = null;
  for (const model of modelFallbackChain) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody)
      }
    );

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
      return cleanGeneratedJson(text);
    }

    const detail = await response.text();
    const message = detail.slice(0, 500);

    // Stop early for auth/config problems. Otherwise, fall back to the next model.
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Gemini auth failed (${response.status}) using ${model}: ${message}`);
    }

    const isRetryable =
      response.status === 404 || // model not found / not enabled
      response.status === 429 || // quota/rate limit
      response.status === 500 ||
      response.status === 503;

    lastError = new Error(`Gemini request failed (${response.status}) using ${model}: ${message}`);
    if (isRetryable) continue;
    throw lastError;
  }

  throw lastError || new Error("Gemini request failed for all fallback models.");
}

async function handleExtract(req, res) {
  const { url } = await readBody(req);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return sendJson(res, 400, { error: "Enter a valid URL." });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return sendJson(res, 400, { error: "Only http and https URLs are supported." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(parsed, {
      headers: {
        "user-agent": "ContentKingBot/1.0 (+https://localhost)"
      },
      signal: controller.signal
    });
    const html = await response.text();
    const title = extractTitle(html);
    const description = extractDescription(html);
    const text = stripHtml(html).slice(0, 20000);
    sendJson(res, 200, { title, description, text, sourceUrl: parsed.toString() });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleGenerate(req, res) {
  const payload = await readBody(req);
  const sourceText = [payload.title, payload.description, payload.sourceText].filter(Boolean).join("\n\n").trim();
  if (sourceText.length < 20) {
    return sendJson(res, 400, { error: "Add a URL or at least a few notes before generating." });
  }
  const result = await generateWithGemini({ ...payload, sourceText });
  sendJson(res, 200, result);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=3600"
    });
    res.end(file);
  } catch {
    const index = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(index);
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/extract") return await handleExtract(req, res);
    if (req.method === "POST" && req.url === "/api/generate") return await handleGenerate(req, res);
    if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res);
    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Something went wrong." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Content King is running at http://localhost:${port}`);
});
