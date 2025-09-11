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
  if (!dataUrl || typeof dataUrl !== "string") return null;
  
  // Regex più flessibile per catturare vari formati
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) {
    console.log("❌ Regex non ha matchato:", dataUrl.substring(0, 50) + "...");
    return null;
  }
  
  let mime = m[1].toLowerCase();
  const b64 = m[2];
  
  // Normalizza MIME types
  if (mime === "image/jpg") mime = "image/jpeg";
  
  // Verifica che sia un formato supportato da OpenAI
  const supportedMimes = ["image/png", "image/jpeg", "image/webp"];
  if (!supportedMimes.includes(mime)) {
    console.log("❌ MIME type non supportato:", mime);
    return null;
  }
  
  try {
    const buffer = Buffer.from(b64, "base64");
    console.log(`✅ Parsed: ${mime}, buffer size: ${buffer.length} bytes`);
    return { mime, buffer };
  } catch (err) {
    console.log("❌ Errore decodifica base64:", err);
    return null;
  }
}

export default withCors(async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  
  try {
    console.log("🔄 Inizio richiesta edit");
    
    // JSON atteso: { prompt, image_data_url }
    const { prompt, image_data_url } = req.body || {};
    console.log("📝 Prompt ricevuto:", prompt?.substring(0, 50) + "...");
    console.log("🖼️ Data URL ricevuta:", image_data_url?.substring(0, 50) + "...");
    
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      console.log("❌ Prompt non valido");
      return res.status(400).json({ error: "Prompt mancante o troppo corto" });
    }
    
    if (!image_data_url || typeof image_data_url !== "string") {
      console.log("❌ image_data_url mancante");
      return res.status(400).json({ error: "image_data_url mancante" });
    }

    const parsed = parseDataUrl(image_data_url);
    if (!parsed) {
      console.log("❌ Parsing fallito per:", image_data_url.substring(0, 50) + "...");
      return res.status(400).json({
        error: "image_data_url non valido. Usa PNG, JPG/JPEG o WEBP.",
      });
    }

    const { mime, buffer } = parsed;
    console.log(`🔄 Tentativo edit con ${mime}, ${buffer.length} bytes`);

    // Verifica dimensione file (max 4MB per DALL-E)
    if (buffer.length > 4 * 1024 * 1024) {
      console.log(`❌ File troppo grande: ${buffer.length} bytes`);
      return res.status(400).json({ 
        error: "Immagine troppo grande. Massimo 4MB." 
      });
    }

    console.log("🚀 Chiamata a OpenAI...");
    
    // Crea il file con estensione corretta
    const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
    const filename = `input.${extension}`;
    
    console.log(`📁 Creando file: ${filename} con MIME: ${mime}`);
    
    const fileObject = await toFile(buffer, filename, { type: mime });
    console.log(`📋 File object creato:`, {
      name: fileObject.name,
      type: fileObject.type,
      size: fileObject.size
    });
    
    const resp = await openai.images.edit({
      model: "dall-e-2", // DALL-E 2 per image editing
      prompt: prompt.trim(),
      image: fileObject,
      size: "1024x1024",
      n: 1,
    });
    
    console.log("✅ Risposta OpenAI ricevuta");

    const first = resp?.data?.[0] || {};
    const image_b64 = first?.b64_json || null;
    const image_url = image_b64
      ? `data:image/png;base64,${image_b64}`
      : first?.url || null;

    if (!image_url) {
      console.log("❌ Nessuna immagine nella risposta");
      return res.status(500).json({ error: "Nessuna immagine ricevuta da OpenAI" });
    }

    console.log("✅ Immagine elaborata con successo");

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      image_url,
      image_meta: {
        revised_prompt: first?.revised_prompt || null,
        content_type: mime,
      },
    });

  } catch (e) {
    console.error("❌ ERRORE COMPLETO:", e);
    console.error("Stack:", e.stack);
    console.error("Status:", e?.status);
    console.error("Message:", e?.message);
    console.error("Code:", e?.code);
    
    // Gestione errori specifici OpenAI
    if (e?.status === 400) {
      return res.status(400).json({ 
        error: `Errore OpenAI: ${e?.message || 'Richiesta non valida'}` 
      });
    }
    
    if (e?.status === 401) {
      return res.status(500).json({ 
        error: "Errore di autenticazione OpenAI" 
      });
    }
    
    if (e?.status === 429) {
      return res.status(429).json({ 
        error: "Troppo richieste. Riprova tra qualche minuto." 
      });
    }

    const code = e?.status || e?.statusCode || 500;
    const msg = e?.message || "Errore interno";
    return res.status(code).json({ 
      error: `${msg} (${e?.code || 'UNKNOWN'})` 
    });
  }
});
     
