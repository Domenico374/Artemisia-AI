// api/generate.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware CORS
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  return handler(req, res);
};

export default withCors(async function handler(req, res) {
  // Endpoint di test con GET
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
    if (!prompt || prompt.trim().length < 10) {
      return res.status(400).json({ error: "Prompt mancante o troppo corto" });
    }

    // 1) Generazione della scheda JSON
    const sys =
      "Sei un generatore di personaggi fantasy. Rispondi SOLO con JSON valido " +
      "che abbia esattamente queste chiavi: " +
      "nome, razza_classe, tratti (array), background, abilita (array), equipaggiamento (array).";

    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    let raw = chat.choices?.[0]?.message?.content?.trim() || "{}";
    raw = raw.replace(/^```json\s*|\s*```$/g, "");

    let sheet;
    try {
      sheet = JSON.parse(raw);
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

    // 2) Generazione dell’immagine (senza response_format!)
    const imgPrompt =
      `Illustrazione in stile fumetto fantasy: ${sheet.razza_classe || "eroe"} ` +
      `con ${Array.isArray(sheet.equipaggiamento) ? sheet.equipaggiamento.join(", ") : "equipaggiamento iconico"}. ` +
      `Scenario fantasy coerente, colori bilanciati.`;

    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size: "512x512" // più veloce; puoi salire a "1024x1024"
    });

    // Preferisci URL, ma gestisci anche b64_json in fallback
    let image_url = img?.data?.[0]?.url || null;
    if (!image_url && img?.data?.[0]?.b64_json) {
      image_url = `data:image/png;base64,${img.data[0].b64_json}`;
    }

    return res.status(200).json({ sheet, image_url });
  } catch (err) {
    console.error("GENERATE_ERR", err?.status || "", err?.message || err);
    const status = err?.status || 500;
    const message = err?.message || "Errore interno";
    return res.status(status).json({ error: message });
  }
});

