import { GoogleGenAI } from "@google/genai";

/**
 * PENTING UNTUK USER GITHUB:
 * File .env atau .env.local TIDAK AKAN ADA di GitHub karena alasan keamanan (rahasia).
 * Anda harus MEMBUAT SENDIRI file tersebut di root folder project Anda.
 * 
 * Isi file .env.local:
 * GEMINI_API_KEY=AIzaSy... (Masukan Key Anda)
 */
const getApiKey = () => {
  // Prioritas ke GEMINI_API_KEY sesuai standar deployment AI Studio
  return process.env.GEMINI_API_KEY || process.env.API_KEY || "";
};

// Menggunakan Gemini 3 Pro sesuai request untuk stabilitas lebih baik
const PRO_MODEL = 'gemini-3-pro-preview';
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
      
      if (errorStr.includes("not found") || errorStr.includes("api_key_missing") || errorStr.includes("401")) {
        throw new Error("API_KEY_INVALID_OR_MISSING");
      }
      
      if (errorStr.includes("429") || errorStr.includes("resource_exhausted") || errorStr.includes("500") || errorStr.includes("503")) {
        const waitTime = (attempt + 1) * 12000; 
        if (onRetry) onRetry(`Server Busy. Retrying in ${waitTime/1000}s...`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const generateCombinedImage = async (modelBase64: string, productBase64: string, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } },
          { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } },
          { text: `TASK: ABSOLUTE PIXEL-PERFECT CLOTHING SWAP. Use model face/pose, swap clothes with product image. 100% fidelity. 1K resolution. Aspect 9:16.` }
        ]
      },
      config: { 
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" },
        seed: 42 // Mengunci hasil agar lebih konsisten
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
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: image.split(',')[1], mimeType: 'image/png' } },
          { text: `Change ONLY background to ${background}. Lighting: ${lightingRef}. Add branding neon sign: "${neonText}". Aspect 9:16. 1K resolution.` }
        ]
      },
      config: { 
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" },
        seed: 42
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
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          { text: `PREMIUM FASHION STORYBOARD (3x3 SEAMLESS GRID): 9 DIFFERENT scenes of SAME character with neon branding "${neonText}". Aspect 9:16. 1K Resolution.` }
        ]
      },
      config: { 
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" },
        seed: 42
      }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal membuat storyboard.");
  }, onStatus);
};

export const extractCell = async (gridImage: string, index: number, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async (ai) => {
    const pos = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: gridImage.split(',')[1], mimeType: 'image/png' } },
          { text: `Crop and extract ONLY the ${pos[index]} frame from this montage. Output single 9:16 portrait. 1K quality.` }
        ]
      },
      config: { 
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" },
        seed: 42
      }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal mengekstrak frame.");
  }, onStatus);
};

export const generateSceneVideo = async (imageBase64: string, motionPrompt: string): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  let operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt: motionPrompt,
    image: { imageBytes: imageBase64.split(',')[1], mimeType: 'image/png' },
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
  });

  while (!operation.done) {
    await sleep(10000);
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  const response = await fetch(`${downloadLink}&key=${apiKey}`);
  if (!response.ok) throw new Error("Gagal mengunduh video.");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};