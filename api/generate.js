// api/generate.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// CORS semplice
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  return handler(req, res);
};

export default withCors(async function handler(req, res) {
  // GET di test/usage
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

    // 1) Genera la SCHEDA (JSON)
    const sys =
      "Sei un generatore di personaggi fantasy. Rispondi SOLO con JSON valido " +
      "che abbia esattamente queste chiavi: " +
      "nome, razza_classe, tratti (array), background, abilita (array), equipaggiamento (array).";
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });

    let raw = chat.choices?.[0]?.message?.content?.trim() || "{}";

    // rimuovi eventuali ```json ... ```
    raw = raw.replace(/^```json\s*|\s*```$/g, "");
    let sheet;
    try {
      sheet = JSON.parse(raw);
    } catch {
      // fallback: chiedi al modello di "parse" (caso raro)
      sheet = { nome: "Eroe senza nome", razza_classe: "", tratti: [], background: "", abilita: [], equipaggiamento: [] };
    }

    // 2) Genera l'IMMAGINE (base64 → data URL)
    const imgPrompt =
      `Logo/illustrazione in stile fumetto pulito: ${sheet.razza_classe || "eroe"} ` +
      `con ${Array.isArray(sheet.equipaggiamento) ? sheet.equipaggiamento.join(", ") : "equipaggiamento iconico"}. ` +
      `Scenario fantasy coerente. Colori bilanciati.`;

    const img = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size: "1024x1024",
      response_format: "b64_json"
    });

    const b64 = img.data?.[0]?.b64_json;
    const image_data_url = b64 ? `data:image/png;base64,${b64}` : null;

    return res.status(200).json({ sheet, image_data_url });
  } catch (err) {
    console.error("GENERATE_ERR", err);
    return res.status(500).json({ error: "Errore interno" });
  }
});
