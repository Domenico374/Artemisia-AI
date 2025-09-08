// api/generate.js
import OpenAI from "openai";

// Wrapper CORS
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  return handler(req, res);
};

export default withCors(async function handler(req, res) {
  // Ping via GET (utile da browser)
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      usage: "POST /api/generate con body JSON { prompt: '...' }"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt || prompt.trim().length < 10) {
      return res.status(400).json({ error: "Prompt troppo corto." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1) Scheda personaggio (JSON)
    const sys = "Sei un generatore di schede personaggio concise. Rispondi in JSON valido.";
    const user = `Crea una scheda personaggio con:
- nome
- razza_classe
- tratti (array di 3)
- background (max 70 parole)
- abilita (array di 3)
- equipaggiamento (array di 3)
Prompt: ${prompt}`;

    const chat = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ],
      temperature: 0.8
    });

    let sheet;
    try {
      sheet = JSON.parse(chat.choices?.[0]?.message?.content || "{}");
    } catch {
      sheet = {
        nome: "Eroe senza nome",
        razza_classe: "—",
        tratti: [],
        background: "",
        abilita: [],
        equipaggiamento: []
      };
    }

    // 2) Immagine
    const imgPrompt = `Fantasy character, ${prompt}. Cinematic lighting, clean details, illustrative style, blue-night + gold palette.`;
    const img = await client.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size: "1024x1024"
    });

    const b64 = img.data?.[0]?.b64_json;
    if (!b64) return res.status(500).json({ error: "Generazione immagine fallita" });

    return res.status(200).json({ sheet, image_url: `data:image/png;base64,${b64}` });
  } catch (err) {
    console.error("API ERROR:", err);
    return res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED" });
  }
});
