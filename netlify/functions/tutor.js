// Netlify function: sends the tutor prompt to Gemini and returns {ja, en, board}.
// Needs the environment variable GEMINI_API_KEY (set in Netlify, never in this file).
// Optional: GEMINI_MODEL to change the model (default below).
const buckets = new Map();

function reply(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return reply(500, { error: "GEMINI_API_KEY is not set" });

  // Best-effort limit: 8 questions per minute per visitor.
  const ip = event.headers["x-nf-client-connection-ip"] || "unknown";
  const now = Date.now();
  const recent = (buckets.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 8) return reply(429, { error: "Too many requests" });
  recent.push(now);
  buckets.set(ip, recent);

  let prompt = "";
  try { prompt = String(JSON.parse(event.body || "{}").prompt || ""); } catch (e) {}
  if (!prompt || prompt.length > 6000) return reply(400, { error: "Bad prompt" });

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 1500 },
        }),
      }
    );
    if (!r.ok) {
      const errText = await r.text();
      console.error("Upstream error", r.status, errText);
      return reply(r.status === 429 ? 429 : 502, { error: "Upstream " + r.status });
    }
    const data = await r.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || "").join("");
    const out = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (typeof out.ja !== "string" || typeof out.en !== "string") throw new Error("bad shape");
    if (!Array.isArray(out.board)) out.board = [];
    return reply(200, out);
  } catch (e) {
    console.error("Function error", e.message);
    return reply(502, { error: "Bad response from the AI" });
  }
};
