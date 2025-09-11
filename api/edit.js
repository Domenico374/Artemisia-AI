// api/edit.js
import OpenAI from "openai";
import { toFile } from "openai/uploads";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- CORS ---
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  return handler(req, res);
};

// Parse "data:image/png;base64,AAAA..." -> { mime, buffer }
function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/i.exec(dataUrl || "");
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2];
  const buffer = Buffer.from(b64, "base64");
  return { mime, buffer };
}

export default withCors(async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // JSON atteso: { prompt, image_data_url }
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

    const { mime, buffer } = parsed;

    const resp = await openai.images.edit({
      model: "gpt-image-1",
      prompt,
      image: await toFile(buffer, `input.${mime.split("/")[1]}`, {
        contentType: mime,
      }),
      size: "1024x1024",
    });

    const first = resp?.data?.[0] || {};
    const image_b64 = first?.b64_json || null;
    const image_url = image_b64
      ? `data:image/png;base64,${image_b64}`
      : first?.url || null;

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      image_url,
      image_meta: {
        revised_prompt: first?.revised_prompt || null,
        content_type: mime,
      },
    });
  } catch (e) {
    console.error("Edit API error:", e);
    const code = e?.status || e?.statusCode || 500;
    const msg = e?.message || "Errore interno";
    return res.status(code).json({ error: msg });
  }
});
