// Sends text to a public, community-run VOICEVOX server (Japanese TTS) and
// returns WAV audio. No key needed, since this is a free public service.
// If it's unreachable, the page falls back to the browser's own voice.
const SPACE_HOSTS = [
  "https://soiz1-voicevox-engine.hf.space",
  "https://meowsky49887-voicevox-engine.hf.space",
];

const buckets = new Map();
let speakersCache = null; // { host, list, at }

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// Looks up the numeric "style id" VOICEVOX actually wants, by character
// name and style name, from the server's own live list. This avoids
// hardcoding numeric ids that could be wrong or change.
async function resolveStyleId(host, charName, styleName) {
  if (!speakersCache || speakersCache.host !== host || Date.now() - speakersCache.at > 3600000) {
    const r = await fetchWithTimeout(host + "/speakers", { method: "GET" }, 8000);
    if (!r.ok) throw new Error("speakers " + r.status);
    speakersCache = { host, list: await r.json(), at: Date.now() };
  }
  const sp = speakersCache.list.find((s) => s.name === charName);
  if (!sp) {
    const names = speakersCache.list.map((s) => s.name).join(", ");
    throw new Error('Voice "' + charName + '" not found. Available: ' + names);
  }
  const style = sp.styles.find((s) => s.name === styleName) || sp.styles[0];
  return style.id;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };

  const ip = event.headers["x-nf-client-connection-ip"] || "unknown";
  const now = Date.now();
  const recent = (buckets.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 8) return { statusCode: 429, body: JSON.stringify({ error: "Too many requests" }) };
  recent.push(now);
  buckets.set(ip, recent);

  let text = "", charName = "", styleName = "ノーマル";
  try {
    const b = JSON.parse(event.body || "{}");
    text = String(b.text || "").slice(0, 400);
    charName = String(b.charName || "");
    styleName = String(b.styleName || "ノーマル");
  } catch (e) {}
  if (!text || !charName) return { statusCode: 400, body: JSON.stringify({ error: "Missing text or charName" }) };

  let lastErr = "";
  for (const host of SPACE_HOSTS) {
    try {
      const styleId = await resolveStyleId(host, charName, styleName);

      const qs = new URLSearchParams({ speaker: String(styleId), text }).toString();
      const qRes = await fetchWithTimeout(host + "/audio_query?" + qs, { method: "POST" }, 8000);
      if (!qRes.ok) { lastErr = "audio_query " + qRes.status; continue; }
      const query = await qRes.json();

      const sRes = await fetchWithTimeout(
        host + "/synthesis?speaker=" + styleId,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) },
        8000
      );
      if (!sRes.ok) { lastErr = "synthesis " + sRes.status; continue; }

      const buf = Buffer.from(await sRes.arrayBuffer());
      return { statusCode: 200, headers: { "Content-Type": "audio/wav" }, body: buf.toString("base64"), isBase64Encoded: true };
    } catch (e) {
      console.error("VOICEVOX host failed", host, e.message);
      lastErr = e.message;
    }
  }
  return { statusCode: 502, body: JSON.stringify({ error: "VOICEVOX unavailable: " + lastErr }) };
};
