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
      usage: "POST /api/generate con body JSON { prompt: '...' }",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      return res.status(400).json({ error: "Prompt mancante o troppo corto" });
    }

    // 1) Genera la scheda JSON (forza JSON valido)
    const sys =
      "Sei un generatore di personaggi fantasy. Rispondi SOLO con JSON valido " +
      "con esattamente queste chiavi: " +
      "nome, razza_classe, tratti (array), background, abilita (array), equipaggiamento (array).";

    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    let sheet;
    try {
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

    // 2) Genera immagine
    const imgPrompt =
      `Illustrazione in stile fumetto fantasy: ${sheet.razza_classe || "eroe"} ` +
      `con ${Array.isArray(sheet.equipaggiamento) && sheet.equipaggiamento.length
        ? sheet.equipaggiamento.join(", ")
        : "equipaggiamento iconico"
      }. ` +
      `Scenario fantasy coerente, colori bilanciati.`;

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

    return res.status(200).json({
      sheet,
      image_url,
      image_meta: { revised_prompt: first?.revised_prompt || null },
    });
  } catch (err) {
    console.error("HeroGen API error:", err);
    const status = err?.status || 500;
    const msg = err?.message || "Errore interno del server";
    return res.status(status).json({ error: msg });
  }
});
