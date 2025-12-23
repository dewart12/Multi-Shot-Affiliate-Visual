
import { GoogleGenAI } from "@google/genai";

const PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callWithRetry<T>(fn: () => Promise<T>, onRetry?: (msg: string) => void, maxRetries = 5): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error) || error.message || "";
      
      // Jika error "Requested entity was not found", kemungkinan besar API Key bermasalah/belum dipilih
      if (errorStr.includes("Requested entity was not found")) {
        throw new Error("API_KEY_RESET_REQUIRED");
      }

      if (errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("500") || errorStr.includes("503")) {
        const waitTime = (attempt + 1) * 12000; 
        if (onRetry) onRetry(`Server Pro Padat. Menunggu jatah (${waitTime/1000}s)...`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const getAI = () => {
  const key = process.env.API_KEY;
  if (!key) throw new Error("API_KEY_MISSING");
  return new GoogleGenAI({ apiKey: key });
};

export const generateCombinedImage = async (modelBase64: string, productBase64: string, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } },
          { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } },
          { text: `TASK: ABSOLUTE PIXEL-PERFECT CLOTHING SWAP. Use model face/pose, swap clothes with product image. 100% fidelity. 1K resolution. Aspect 9:16.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal menyatukan aset dengan model Pro.");
  }, onStatus);
};

export const refineAndCustomize = async (image: string, background: string, backgroundRef: string, lightingRef: string, neonText: string, fontStyle: string, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: image.split(',')[1], mimeType: 'image/png' } },
          { text: `Change ONLY background to ${background}. Lighting: ${lightingRef}. Add branding neon sign: "${neonText}". Aspect 9:16. 1K resolution.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal memproses detail Pro.");
  }, onStatus);
};

export const generateStoryboardGrid = async (baseImage: string, neonText: string, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          { text: `PREMIUM FASHION STORYBOARD (3x3 SEAMLESS GRID): 9 DIFFERENT scenes of SAME character with neon branding "${neonText}". No grid lines. Aspect 9:16. 1K Resolution.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal membuat storyboard Pro.");
  }, onStatus);
};

export const extractCell = async (gridImage: string, index: number, onStatus?: (s: string) => void): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const pos = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: gridImage.split(',')[1], mimeType: 'image/png' } },
          { text: `Crop and extract ONLY the ${pos[index]} frame from this montage. Output single 9:16 portrait. 1K quality.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal mengekstrak frame Pro.");
  }, onStatus);
};

export const generateSceneVideo = async (imageBase64: string, motionPrompt: string): Promise<string> => {
  const ai = getAI();
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
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  if (!response.ok) throw new Error("Gagal mengunduh video.");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
