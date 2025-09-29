// api/generate.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- CORS semplice (niente credenziali dal client) ---
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  return handler(req, res);
};

// (opzionale) suggerimento stili testuali aggiuntivi
const styleMap = {
  neutral: "",
  fantasy: "Epic fantasy illustration, vibrant colors, dramatic composition.",
  photorealistic:
    "Photorealistic image, cinematic lighting, physically-based rendering, detailed textures, depth of field.",
  cartoon:
    "2D cartoon / cel shading, bold outlines, clean shapes, playful composition, vibrant flat colors.",
  noir: "Film noir aesthetic, high-contrast chiaroscuro, moody shadows, monochrome look.",
  corporate:
    "Clean corporate studio, softbox lighting, minimal background, professional look.",
  architectural:
    "Architectural visualization, realistic materials, wide angle, clean lines.",
  scifi:
    "Futuristic sci-fi design, holographic accents, volumetric lights, advanced materials.",
};

// Mappa ratio → size supportate da gpt-image-1 (verticale/orizzontale/quadrato)
// Nota: gpt-image-1 supporta principalmente 1024x1024, 1792x1024 (orizz.), 1024x1792 (vert.)
function ratioToSize(ratio) {
  switch (ratio) {
    case "9-16":
    case "3-4":
      return "1024x1792"; // verticale
    case "16-9":
    case "4-3":
      return "1792x1024"; // orizzontale
    case "1-1":
    default:
      return "1024x1024"; // quadrato
  }
}

// Costruisce il prompt finale integrando negative e knobs UI
function buildFinalPrompt({
  prompt,
  negative_prompt,
  style,
  creativity,
  quality,
}) {
  const styleText = styleMap[style] || (style && typeof style === "string" ? style : "");

  // “Creatività” e “Qualità” non sono parametri nativi della API immagini:
  // li usiamo come “hint” testuali, non inviamo campi extra alla API.
  const creativityHint =
    typeof creativity === "number"
      ? creativity >= 75
        ? "Highly creative, imaginative composition."
        : creativity <= 25
        ? "Conservative, realistic and faithful to description."
        : ""
      : "";

  const qualityHint =
    typeof quality === "number"
      ? quality >= 4
        ? "Ultra-detailed, high fidelity, refined rendering."
        : quality === 3
        ? "High detail, refined rendering."
        : quality === 2
        ? "Standard quality."
        : "Draft quality."
      : "";

  // Negativo: non esiste un campo separato; lo integriamo come istruzione
  const negativeText =
    negative_prompt && negative_prompt.trim()
      ? `Avoid: ${negative_prompt.trim()}.`
      : "";

  // Prompt finale
  return [prompt, styleText, creativityHint, qualityHint, negativeText]
    .filter(Boolean)
    .join("\n\n");
}

export default withCors(async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      usage:
        "POST /api/generate { prompt: string, negative_prompt?: string, style?: string, creativity?: 0-100, quality?: 1-4, variants?: 1|2|4, ratio?: '1-1'|'3-4'|'9-16'|'4-3'|'16-9' }",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      prompt,
      negative_prompt = "",
      style = "neutral",
      creativity = 70,
      quality = 2,
      variants = 1,
      ratio = "1-1",
      // eventuali altri campi inviati dal frontend verranno ignorati
    } = req.body || {};

    // Validazioni base
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return res.status(400).json({ error: "Prompt mancante o troppo corto" });
    }
    if (prompt.length > 500) {
      return res
        .status(400)
        .json({ error: "Prompt troppo lungo (max 500 caratteri)" });
    }

    const n = [1, 2, 4].includes(+variants) ? +variants : 1;
    const size = ratioToSize(ratio);

    const finalPrompt = buildFinalPrompt({
      prompt: prompt.trim(),
      negative_prompt,
      style,
      creativity: +creativity,
      quality: +quality,
    });

    // Chiamata a Images API
    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size,
      n,
      // response_format: "b64_json", // opzionale, se preferisci sempre base64
    });

    const items = (img?.data || []).map((d) =>
      d?.b64_json ? `data:image/png;base64,${d.b64_json}` : d?.url || null
    ).filter(Boolean);

    if (!items.length) {
      return res
        .status(500)
        .json({ error: "Nessuna immagine ricevuta da OpenAI" });
    }

    // Retrocompatibilità: la prima come image_url
    const first = items[0];

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      image_url: first,
      images: items, // tutte le varianti
      image_meta: {
        revised_prompt: img?.data?.[0]?.revised_prompt || null,
        style_used: style,
        size_used: size,
        variants: items.length,
      },
    });
  } catch (err) {
    console.error("Generate API error:", err);
    const code = err?.status || err?.statusCode || 500;
    let msg = err?.message || "Errore interno del server";
    if (code === 401) msg = "API key mancante o non valida.";
    if (code === 429) msg = "Limite di richieste superato. Riprova tra poco.";
    return res.status(code).json({ error: msg });
  }
});
