// api/edit.js
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import mime from "mime-types";

// --- CORS ---
const withCors = (handler) => async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  return handler(req, res);
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Parser multipart semplice ---
async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.split("boundary=")[1];
  if (!boundary) throw new Error("Missing multipart boundary");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  const parts = buffer.toString("binary").split(`--${boundary}`);
  const fields = {};

  for (const part of parts) {
    if (!part || part === "--\r\n") continue;
    const [rawHeaders, rawBody] = part.split("\r\n\r\n");
    if (!rawHeaders || !rawBody) continue;

    const nameMatch = /name="([^"]+)"/.exec(rawHeaders);
    const filenameMatch = /filename="([^"]+)"/.exec(rawHeaders);
    const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(rawHeaders);

    if (filenameMatch) {
      const filename = filenameMatch[1] || "upload.png";
      const bodyBin = rawBody.slice(0, rawBody.lastIndexOf("\r\n"));
      const buf = Buffer.from(bodyBin, "binary");

      fields.file = {
        buffer: buf,
        filename,
        partMime: ctMatch?.[1]?.trim() || "",
      };
    } else if (nameMatch) {
      const name = nameMatch[1];
      const val = rawBody.slice(0, rawBody.lastIndexOf("\r\n"));
      fields[name] = val;
    }
  }
  return fields;
}

export default withCors(async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { file, prompt } = await parseMultipart(req);

    if (!file?.buffer) {
      return res.status(400).json({ error: "File mancante" });
    }
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return res.status(400).json({ error: "Prompt mancante o troppo corto" });
    }

    // ✅ Usa mime-types per determinare il tipo corretto
    const mimeType =
      file.partMime ||
      mime.lookup(file.filename) ||
      "image/png";

    if (!/^image\/(png|jpeg|webp)$/.test(mimeType)) {
      return res.status(400).json({
        error: `Formato non supportato (${mimeType}). Usa PNG, JPG/JPEG o WEBP.`,
      });
    }

    // 🖼️ Image Edit
    const resp = await openai.images.edit({
      model: "gpt-image-1",
      prompt,
      image: await toFile(file.buffer, file.filename || "input.png", {
        contentType: mimeType,
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
        content_type: mimeType,
      },
    });
  } catch (e) {
    console.error("Edit API error:", e);
    const code = e?.status || e?.statusCode || 500;
    const msg = e?.message || "Errore interno";
    return res.status(code).json({ error: msg });
  }
});
