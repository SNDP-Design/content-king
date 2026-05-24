const defaultModelChain = [
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash"
];

function jsonResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function withCors(response, request) {
  const origin = request.headers.get("origin") || "*";
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, headers });
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
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
  const trimmed = (text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Gemini did not return JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

function truncateWords(text, limit) {
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const cut = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, Math.max(0, cut))}...`;
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

async function generateWithGemini(payload, env) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return { ...fallbackPosts(payload), isFallback: true, warning: "Worker secret GEMINI_API_KEY is not set." };

  const modelChain = (env.GEMINI_MODEL_CHAIN || defaultModelChain.join(","))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(payload) }] }],
    generationConfig: { temperature: 0.75, topP: 0.9, responseMimeType: "application/json" }
  };

  let lastError = null;
  for (const model of modelChain) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) }
    );
    if (resp.ok) {
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      return cleanGeneratedJson(text);
    }
    const detail = await resp.text();
    if (resp.status === 401 || resp.status === 403) throw new Error("Gemini key is invalid or not allowed.");
    const retryable = resp.status === 404 || resp.status === 429 || resp.status === 500 || resp.status === 503;
    lastError = new Error(`Gemini failed on ${model} (${resp.status}): ${detail.slice(0, 200)}`);
    if (retryable) continue;
    throw lastError;
  }
  throw lastError || new Error("Gemini failed for all models.");
}

async function handleExtract(request) {
  const { url } = await readJson(request);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return jsonResponse({ error: "Enter a valid URL." }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return jsonResponse({ error: "Only http and https URLs are supported." }, { status: 400 });
  }

  const resp = await fetch(parsed.toString(), { headers: { "user-agent": "ContentKingWorker/1.0" } });
  const html = await resp.text();
  const title = extractTitle(html);
  const description = extractDescription(html);
  const text = stripHtml(html).slice(0, 20000);
  return jsonResponse({ title, description, text, sourceUrl: parsed.toString() });
}

async function handleGenerate(request, env) {
  const payload = await readJson(request);
  const sourceText = [payload.title, payload.description, payload.sourceText].filter(Boolean).join("\n\n").trim();
  if (sourceText.length < 20) return jsonResponse({ error: "Add a URL or a few notes before generating." }, { status: 400 });
  const result = await generateWithGemini({ ...payload, sourceText }, env);
  return jsonResponse(result);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), request);

    const url = new URL(request.url);
    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return withCors(jsonResponse({ ok: true, service: "content-king-api" }), request);
      }
      if (request.method === "POST" && url.pathname === "/api/extract") {
        return withCors(await handleExtract(request), request);
      }
      if (request.method === "POST" && url.pathname === "/api/generate") {
        return withCors(await handleGenerate(request, env), request);
      }
      return withCors(jsonResponse({ error: "Not found." }, { status: 404 }), request);
    } catch (err) {
      return withCors(jsonResponse({ error: err?.message || "Something went wrong." }, { status: 500 }), request);
    }
  }
};

