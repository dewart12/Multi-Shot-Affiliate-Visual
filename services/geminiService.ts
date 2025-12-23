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
  return process.env.GEMINI_API_KEY || process.env.API_KEY || "";
};

// Menggunakan model IMAGE PRO agar mendukung Aspect Ratio dan Image Size
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
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } },
          { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } },
          { text: `TASK: PHOTOREALISTIC CLOTHING SWAP.
          1. KEEP the exact face, hair, and body pose from the MODEL image.
          2. REPLACE the model's outfit with the EXACT clothes from the PRODUCT image.
          3. Maintain lighting, texture, and 100% fidelity to the original person.
          Output: 1K resolution, Portrait 9:16.` }
        ]
      },
      config: { 
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" }
      }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal menyatukan aset. Cek API Key Anda.");
  }, onStatus);
};

export const refineAndCustomize = async (image: string, background: string, backgroundRef: string, lightingRef: string, neonText: string, fontStyle: string, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: image.split(',')[1], mimeType: 'image/png' } },
          { text: `REPRODUCTION TASK: Keep the person exactly the same.
          1. Replace ONLY the background with: ${background}.
          2. Apply ${lightingRef} lighting effects.
          3. Add a high-end glowing neon sign saying "${neonText}" in ${fontStyle} style on the wall.
          Maintain character consistency.` }
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
          { text: `FASHION EDITORIAL STORYBOARD (3x3 GRID):
          Generate 9 different cinematic shots of the SAME CHARACTER.
          Include: Close-up, wide shot, side profile, and dynamic poses.
          All frames must show the "${neonText}" branding.
          Maintain consistent outfit and lighting across all 9 frames.
          Output: One single 9:16 image containing the grid.` }
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

export const extractCell = async (gridImage: string, index: number, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async (ai) => {
    const pos = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: gridImage.split(',')[1], mimeType: 'image/png' } },
          { text: `CROP AND EXTRACT: Take only the ${pos[index]} frame from this 3x3 grid.
          Restore it to a full 9:16 portrait. Enhance quality to 1K.` }
        ]
      },
      config: { 
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" }
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