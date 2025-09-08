// /api/generate.js
import OpenAI from "openai";

// Crea client OpenAI con la chiave salvata in Vercel
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Wrapper per gestire i CORS
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return handler(req, res);
};

export default withCors(async function handler(req, res) {
  // Rotta di test con GET
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      usage: "POST /api/generate con body JSON { prompt: '...' }",
    });
  }

  // Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body;

    if (!prompt || prompt.length < 5) {
      return res
        .status(400)
        .json({ error: "Prompt mancante o troppo corto." });
    }

    // Chiamata API a OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Sei un generatore di personaggi fantasy. Rispondi con JSON contenente nome, razza/classe, tratti, background, abilità ed equipaggiamento.",
        },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices[0].message.content;

    res.status(200).json({ result: text });
  } catch (error) {
    console.error("Errore API OpenAI:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
