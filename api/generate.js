// api/generate.js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Middleware CORS semplice
 */
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  return handler(req, res);
};

/**
 * Handler principale
 */
export default withCors(async function handler(req, res) {
  // GET di test/usage
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      usage: "POST /api/generate con body JSON { prompt: '...' } e query opzionali ?format=url|b64&size=1024x1024",
      query_supported: {
        format: "url | b64 (default: url)",
        size: "1024x1024 | 512x512 | 256x256 (default: 1024x1024)",
      },
    });
  }

  // Solo POST oltre alla preflight
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body || {};
    const format = String((req.query?.format || "url")).toLowerCase(); // 'url' | 'b64'
    const size = String(req.query?.size || "1024x1024"); // 1024x1024, 512x512, 256x256

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
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
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    let raw = chat.choices?.[0]?.message?.content?.trim() || "{}";

    // rimuove eventuali blocchi ```json ... ```
    raw = raw.replace(/^```json\s*|\s*```$/g, "");
    let sheet;
    try {
      sheet = JSON.parse(raw);
    } catch {
      // fallback di sicurezza
      sheet = {
        nome: "Eroe senza nome",
        razza_classe: "",
        tratti: [],
        background: "",
        abilita: [],
        equipaggiamento: [],
      };
    }

    // 2) Genera l'IMMAGINE (gpt-image-1)
    const imgPrompt = [
      "Logo/illustrazione in stile fumetto pulito:",
      sheet.razza_classe || "eroe",
      "con",
      Array.isArray(sheet.equipaggiamento) && sheet.equipaggiamento.length
        ? sheet.equipaggiamento.join(", ")
        : "equipaggiamento iconico",
      ". Scenario fantasy coerente. Colori bilanciati.",
    ]
      .join(" ")
      .trim();

    // Chiamata immagine (preferibilmente ritorna un URL; alcune regioni/conti possono restituire b64_json)
    const imgRes = await openai.images.generate({
      model: "gpt-image-1",
      prompt: imgPrompt,
      size, // 1024x1024 (default) | 512x512 | 256x256
    });

    // Normalizzazione output immagine
    let imageUrl = imgRes.data?.[0]?.url || null;
    let imageB64 = imgRes.data?.[0]?.b64_json || null;

    // Data URL se b64 presente
    if (imageB64 && !imageUrl) {
      imageUrl = `data:image/png;base64,${imageB64}`;
    }

    // Se l'utente ha chiesto espressamente b64, preferisci il campo b64
    // (ma non buttiamo via l'URL se esiste: ritorniamo entrambi)
    if (format !== "b64") {
      // Default: preferisci URL
      // (se non c'è URL ma c'è b64_json, l'URL è già data:base64)
    }

    return res.status(200).json({
      sheet,
      image: {
        url: imageUrl, // URL https o data:base64
        b64: imageB64, // raw base64 (se fornito dal modello)
        meta: { size, format: format === "b64" ? "b64" : "url" },
      },
    });
  } catch (err) {
    // Errori tipici: 403 (org non verificata), 429 (quota), ecc.
    const status = err?.status || 500;
    const message =
      err?.message ||
      (typeof err === "string" ? err : "Errore interno durante la generazione");

    console.error("GENERATE_ERR", status, message);
    return res.status(status).json({ error: message });
  }
});
