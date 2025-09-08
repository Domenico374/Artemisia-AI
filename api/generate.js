// api/generate.js
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt } = req.body || {};
    if (!prompt || prompt.length < 10) {
      return res.status(400).json({ error: "Prompt troppo corto." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1) Testo: scheda personaggio
    const sys = "Sei un generatore di schede personaggio concise. Rispondi in JSON.";
    const user = `Crea una scheda personaggio con:
- nome
- razza/classe
- tratti (3)
- background (max 70 parole)
- abilità (3)
- equipaggiamento (3)

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
    try { sheet = JSON.parse(chat.choices[0].message.content); }
    catch { sheet = { nome:"Eroe senza nome", razza_classe:"—", tratti:[], background:"", abilita:[], equipaggiamento:[] }; }

    // 2) Immagine
    const imgPrompt = `Fantasy character, ${prompt}. Cinematic lighting, clean details, artstation style, blue-night + gold palette.`;
    const img = await client.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size: "1024x1024"
    });

    const image_base64 = img.data[0].b64_json;
    const image_url = `data:image/png;base64,${image_base64}`;

    res.status(200).json({ sheet, image_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore generazione" });
  }
}

