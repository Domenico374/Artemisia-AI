// api/edit.js
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp"; // <-- conversione in PNG se l'input non è PNG

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Aumentiamo il limite del body per accettare data URL "grandi"
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

// --- CORS semplice (niente credenziali dal client) ---
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  if (req.method === "OPTIONS") return res.status(200).end();
  return handler(req, res);
};

// Parse "data:image/png;base64,AAAA..." -> { mime, buffer }
function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;

  // Supporta png/jpg/jpeg/webp
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;

  let mime = m[1].toLowerCase();
  const b64 = m[2];

  if (mime === "image/jpg") mime = "image/jpeg";
  try {
    const buffer = Buffer.from(b64, "base64");
    return { mime, buffer };
  } catch {
    return null;
  }
}

export default withCors(async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, image_data_url } = req.body || {};

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return res.status(400).json({ error: "Prompt mancante o troppo corto" });
    }
    if (!image_data_url || typeof image_data_url !== "string") {
      return res.status(400).json({ error: "image_data_url mancante" });
    }

    const parsed = parseDataUrl(image_data_url);
    if (!parsed) {
      return res.status(400).json({
        error: "image_data_url non valido. Usa PNG, JPG/JPEG o WEBP.",
      });
    }

    let { mime, buffer } = parsed;

    // Limite difensivo input (prima della conversione)
    if (buffer.length > 10 * 1024 * 1024) {
      return res
        .status(400)
        .json({ error: "Immagine troppo grande. Massimo 10MB." });
    }

    // gpt-image-1 per EDIT preferisce PNG -> convertiamo se diverso
    if (mime !== "image/png") {
      try {
        buffer = await sharp(buffer).png().toBuffer();
        mime = "image/png";
      } catch (e) {
        return res
          .status(400)
          .json({ error: "Conversione a PNG fallita. Riprova con un PNG." });
      }
    }

    // Creiamo un "file" pronto per l'SDK
    const fileObject = await toFile(buffer, "input.png", { type: mime });

    // Chiamata corretta (SDK v4): images.edits + gpt-image-1
    const resp = await openai.images.edits({
      model: "gpt-image-1",
      prompt: prompt.trim(),
      image: fileObject,
      size: "1024x1024",
      n: 1,
      // response_format: "b64_json", // opzionale: se vuoi SEMPRE base64
    });

    const first = resp?.data?.[0];
    if (!first) {
      return res
        .status(500)
        .json({ error: "Nessuna immagine ricevuta da OpenAI" });
    }

    // Se arriva base64, lo trasformiamo in data URL, altrimenti usiamo la URL
    const image_url =
      first.b64_json
        ? `data:image/png;base64,${first.b64_json}`
        : first.url || null;

    if (!image_url) {
      return res
        .status(500)
        .json({ error: "Impossibile ottenere l'URL dell'immagine" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      image_url,
      image_meta: {
        revised_prompt: first.revised_prompt || null,
        content_type: "image/png",
      },
    });
  } catch (e) {
    console.error("❌ Edit error:", e);

    // Mappatura errori comune
    const code = e?.status || e?.statusCode || 500;
    let msg = e?.message || "Errore interno";

    if (code === 400 && /format|png/i.test(msg))
      msg = "Formato immagine non valido (usa PNG)";
    if (code === 401) msg = "API key non valida";
    if (code === 429) msg = "Troppe richieste. Riprova tra poco";

    return res.status(code).json({ error: msg });
  }
});
