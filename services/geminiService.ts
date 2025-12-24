import { GoogleGenAI } from "@google/genai";

/**
 * BYOK (Bring Your Own Key) implementation.
 * Checks localStorage first, then fallback to environment variables.
 */
const getApiKey = () => {
  if (typeof window !== 'undefined') { // Check if running in browser
    const storedKey = localStorage.getItem('GEMINI_API_KEY');
    if (storedKey && storedKey.trim().length > 5) {
      return storedKey;
    }
  }
  return process.env.GEMINI_API_KEY || process.env.API_KEY || "";
};

const PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callWithRetry<T>(fn: (ai: any) => Promise<T>, onRetry?: (msg: string) => void, maxRetries = 5): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("API_KEY_MISSING");

      const ai = new GoogleGenAI({ apiKey });
      return await fn(ai);
    } catch (error: any) {
      lastError = error;
      const errorStr = (error.message || "").toLowerCase();

      if (errorStr.includes("not found") || errorStr.includes("api_key_missing") || errorStr.includes("401") || errorStr.includes("invalid")) {
        throw new Error("API_KEY_INVALID_OR_MISSING");
      }

      if (errorStr.includes("429") || errorStr.includes("resource_exhausted") || errorStr.includes("500") || errorStr.includes("503")) {
        const waitTime = (attempt + 1) * 12000;
        if (onRetry) onRetry(`Server Busy. Retrying in ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// --- HELPER FUNCTION UNTUK CROP GAMBAR (BARU) ---
// Fungsi ini memotong gambar secara manual tanpa AI untuk menghindari glitch/halusinasi.
const cropImageLocally = (base64Image: string, index: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Pastikan kode ini berjalan di browser
    if (typeof window === 'undefined') {
      reject(new Error("Fungsi crop manual hanya berjalan di sisi client (browser)."));
      return;
    }

    const img = new Image();
    img.src = base64Image;
    img.crossOrigin = "anonymous"; // Penting untuk gambar external

    img.onload = () => {
      // Asumsi grid Master Reference selalu 3x3
      const cols = 3;
      const rows = 3;

      const pieceWidth = img.width / cols;
      const pieceHeight = img.height / rows;

      // Hitung posisi kolom dan baris dari index (0-8)
      const colIndex = index % cols;
      const rowIndex = Math.floor(index / cols);

      const canvas = document.createElement('canvas');
      canvas.width = pieceWidth;
      canvas.height = pieceHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error("Gagal membuat context canvas"));
        return;
      }

      // Potong gambar: ambil bagian spesifik dari master grid
      ctx.drawImage(
        img,
        colIndex * pieceWidth, rowIndex * pieceHeight, // Source X, Y (Titik potong)
        pieceWidth, pieceHeight,                       // Source W, H (Ukuran potong)
        0, 0,                                          // Dest X, Y
        pieceWidth, pieceHeight                        // Dest W, H
      );

      // Return hasil potongan sebagai base64 string
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = (err) => reject(new Error("Gagal memuat gambar master untuk dipotong."));
  });
};
// ------------------------------------------------

export const generateCombinedImage = async (modelBase64: string, productBase64: string, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } },
          { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } },
          {
            text: `TASK: INTELLIGENT PRODUCT TRY-ON.
1. ANALYZE Image 2 to identify the product category (e.g., Mukena, Clothing, Accessory, Bag).
2. INTEGRATE the product onto the person from Image 1 naturally:
- IF HEADWEAR/MUKENA/HIJAB: Extract only the face from Image 1 and wrap it perfectly within the product. HAIR MUST BE COMPLETELY COVERED.
- IF CLOTHING: Maintain the face identity and pose from Image 1, but replace their outfit with the product from Image 2.
- IF ACCESSORY: Have the person from Image 1 wear or hold the product naturally.
3. IDENTITY: Ensure the face (eyes, nose, mouth) in the output is 100% identical to the person in Image 1.
4. OUTPUT: Professional 9:16 high-fashion catalog photo.` }
        ]
      },
      config: {
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal menyatukan aset.");
  }, onStatus);
};

export const refineAndCustomize = async (image: string, background: string, backgroundRef: string, lightingRef: string, neonText: string, fontStyle: string, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: image.split(',')[1], mimeType: 'image/png' } },
          {
            text: `SCENE MASTERING (LOCK SUBJECT):
- SUBJECT: Keep the person and the garment/product EXACTLY as they appear in the input image. DO NOT modify the face or the product details.
- BACKGROUND: Replace the environment with: ${background}.
- LIGHTING: Apply ${lightingRef} professional studio lighting.
- BRANDING: Place a realistic neon sign reading "${neonText}" in ${fontStyle} style on the background.
- QUALITY: Photorealistic, 9:16, 1K.` }
        ]
      },
      config: {
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal memproses detail.");
  }, onStatus);
};

export const generateStoryboardGrid = async (baseImage: string, neonText: string, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          {
            text: `PROFESSIONAL 3x3 STORYBOARD (MAX VARIETY & CONSISTENCY):
- REFERENCE: Use the provided person and product as the anchor.
- TASK: Generate a 3x3 grid (9 frames). Each frame MUST be significantly different.
- NO REPETITION: Do NOT repeat any pose or angle. Each frame must be a unique scene.
- CAMERA VARIATION:
1. Macro/Close-up: Face and garment texture focus.
2. Profile: Left and right side profile shots.
3. Medium: Waist-up shots with different gestures.
4. Wide/Full-body: Full standing, walking, or sitting poses.
- GESTURES: Change hands positioning, head tilt, and expression (neutral, slight smile, looking away, looking at lens).
- CONSISTENCY: Face identity and product design MUST stay identical across all 9 variations.
- BRANDING: The "${neonText}" neon sign must appear in varied background positions.
- OUTPUT: Professional 9:16 storyboard grid, high fashion quality.` }
        ]
      },
      config: {
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal membuat storyboard.");
  }, onStatus);
};

// --- FUNGSI EXTRACT CELL YANG SUDAH DIPERBAIKI (MENGGUNAKAN CROP MANUAL) ---
export const extractCell = async (gridImage: string, index: number, onStatus?: (s: string) => void): Promise<string> => {
  if (onStatus) onStatus("Memproses ekstraksi frame...");
  
  try {
    // Kita panggil fungsi crop manual di sini.
    // Tidak ada request ke Gemini API, jadi tidak ada glitch dan tidak ada biaya token.
    const result = await cropImageLocally(gridImage, index);
    
    // Opsional: Delay sedikit agar UI terasa ada proses (UX)
    // await sleep(500); 
    
    return result;
  } catch (error) {
    console.error("Gagal melakukan cropping:", error);
    // Fallback jika crop manual gagal (sangat jarang terjadi), baru panggil AI (opsional)
    // Tapi sebaiknya biarkan error agar ketahuan masalahnya di mana.
    throw new Error("Gagal mengekstrak frame dari grid.");
  }
};

export const generateSceneVideo = async (imageBase64: string, motionPrompt: string): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  let operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt: `${motionPrompt}. Maintain absolute consistency of the person's face and the product they are wearing. Cinematic movement.`,
    image: { imageBytes: imageBase64.split(',')[1], mimeType: 'image/png' },
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
  });

  // Polling loop untuk menunggu video selesai
  while (true) { // Loop until done or error
    // Tunggu 10 detik sebelum cek status
    await sleep(10000); 

    // Cek status operasi terbaru
    operation = await ai.operations.getVideosOperation({ operation: operation });

    // Jika sudah selesai (done)
    if (operation.done) {
       // Cek apakah ada error di metadata
      if (operation.error) {
        throw new Error(`Video generation failed: ${operation.error.message}`);
      }

      // Ambil link video
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) throw new Error("Gagal mendapatkan link video.");

      // Download dan convert ke Blob URL agar bisa diputar di browser
      const response = await fetch(`${downloadLink}&key=${apiKey}`);
      if (!response.ok) throw new Error("Gagal mengunduh file video.");

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
    // Jika belum selesai, loop akan lanjut (polling lagi)
  }
};
