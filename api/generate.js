// api/generate.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Middleware CORS ---
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  return handler(req, res);
};

export default withCors(async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      usage: "POST /api/generate { prompt: '...', style?: 'neutral|photorealistic|cartoon|noir|corporate|architectural|scifi|fantasy' }",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, style = "neutral" } = req.body || {};
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      return res.status(400).json({ error: "Prompt mancante o troppo corto" });
    }

    // -----------------------------
    // (Facoltativo) Scheda JSON: la lascio com'è, anche se non la usi nel frontend.
    // Puoi rimuovere tutto questo blocco se vuoi solo immagini e avere risposte più rapide.
    const sys =
      "Sei un generatore di personaggi fantasy. Rispondi SOLO con JSON valido " +
      "con esattamente queste chiavi: " +
      "nome, razza_classe, tratti (array), background, abilita (array), equipaggiamento (array).";

    let sheet;
    try {
      const chat = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });
      sheet = JSON.parse(chat.choices?.[0]?.message?.content || "{}");
    } catch {
      sheet = {
        nome: "Eroe senza nome",
        razza_classe: "",
        tratti: [],
        background: "",
        abilita: [],
        equipaggiamento: [],
      };
    }
    // -----------------------------

    // ---- Stili opzionali (senza forzare "fantasy" di default)
    const styleMap = {
      neutral: "",
      fantasy: "Fantasy illustration, epic atmosphere, vivid colors.",
      photorealistic: "Photorealistic, high detail, cinematic lighting, depth of field.",
      cartoon: "Cartoon/comic style, clean line art, bold shading, vibrant colors.",
      noir: "Film noir style, dramatic high-contrast lighting, moody shadows, black and white.",
      corporate: "Clean corporate studio style, softbox lighting, professional look, minimal background.",
      architectural: "Architectural visualization, wide angle, realistic materials and lighting.",
      scifi: "Sci-fi aesthetic, futuristic materials, holographic accents, volumetric light."
    };
    const styleText = styleMap[style] || "";

    // ✅ Nuovo prompt: usa quello dell’utente + eventuale stile scelto
    const imgPrompt = [prompt, styleText].filter(Boolean).join("\n\n");

    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size: "1024x1024",
    });

    const first = img?.data?.[0] || {};
    const image_b64 = first?.b64_json || null;
    const image_url = image_b64
      ? `data:image/png;base64,${image_b64}`
      : (first?.url || null);

    // Evita cache
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      sheet,                // puoi ignorarlo nel frontend
      image_url,
      image_meta: { revised_prompt: first?.revised_prompt || null, style_used: style }
    });
  } catch (err) {
    console.error("HeroGen API error:", err);
    const code = err?.status || err?.statusCode || 500;
    let msg = err?.message || "Errore interno del server";
    if (code === 401) msg = "API key mancante o non valida.";
    if (code === 429) msg = "Limite di richieste superato. Riprova tra poco.";
    return res.status(code).json({ error: msg });
  }
});
