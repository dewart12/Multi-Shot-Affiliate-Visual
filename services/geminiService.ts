import { GoogleGenAI } from "@google/genai";

/**
 * PENTING UNTUK USER GITHUB:
 * File .env atau .env.local TIDAK AKAN ADA di GitHub karena alasan keamanan (rahasia).
 * Anda harus MEMBUAT SENDIRI file tersebut di root folder project Anda.
 */
const getApiKey = () => {
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
          { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } }, // Image 1: Person
          { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } }, // Image 2: Product
          { text: `TASK: INTELLIGENT PRODUCT TRY-ON.
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
          { text: `SCENE MASTERING (LOCK SUBJECT):
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
          { text: `PROFESSIONAL 3x3 STORYBOARD (CONSISTENT IDENTITY):
          - REFERENCE: The provided image shows a specific person and a specific product.
          - TASK: Generate a 3x3 grid (9 frames) showing the SAME person wearing the SAME product.
          - CONSISTENCY: Face identity, hair-coverage (if applicable), and product details must remain 100% constant across all 9 frames.
          - VARIATIONS: Change camera angles (close-up, full shot, side profile), poses, and lighting slightly for each frame.
          - BRANDING: The "${neonText}" neon sign must be visible in the backgrounds.
          - OUTPUT: High-quality fashion montage, 9:16.` }
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
          { text: `EXTRACT SINGLE FRAME (CROP TASK):
          - TARGET: Take ONLY the ${pos[index]} cell from the provided 3x3 grid.
          - STRICT RULE: Do NOT return the 3x3 grid. Return only ONE SINGLE cropped image.
          - CONTENT: The output must show the full portrait of the character in that specific cell.
          - CLEANUP: Remove any grid lines, borders, or artifacts.
          - OUTPUT: 9:16 Portrait, High Quality 1K.` }
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
    prompt: `${motionPrompt}. Maintain absolute consistency of the person's face and the product they are wearing. Cinematic movement.`,
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