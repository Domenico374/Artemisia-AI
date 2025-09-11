// api/edit.js - Versione corretta per gestire image editing

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, image_data_url } = req.body;

    if (!prompt || !image_data_url) {
      return res.status(400).json({ error: 'Prompt e immagine richiesti' });
    }

    // Estrai i dati base64 dalla Data URL
    const matches = image_data_url.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Formato immagine non valido' });
    }

    const mimeType = `image/${matches[1]}`;
    const base64Data = matches[2];

    // Verifica che il formato sia supportato
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(mimeType)) {
      return res.status(400).json({ 
        error: `Formato ${mimeType} non supportato. Usa JPG, PNG o WEBP` 
      });
    }

    // Converti base64 in Buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Crea FormData per OpenAI
    const FormData = require('form-data');
    const formData = new FormData();
    
    // Aggiungi l'immagine come stream con il MIME type corretto
    formData.append('image', imageBuffer, {
      filename: `image.${matches[1]}`,
      contentType: mimeType
    });
    
    formData.append('prompt', prompt);
    formData.append('n', '1');
    formData.append('size', '1024x1024');

    // Chiama OpenAI API
    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('OpenAI Error:', result);
      return res.status(response.status).json({ 
        error: result.error?.message || 'Errore OpenAI' 
      });
    }

    const imageUrl = result.data?.[0]?.url;
    if (!imageUrl) {
      return res.status(500).json({ error: 'Nessuna immagine ricevuta' });
    }

    res.json({ image_url: imageUrl });

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
}
