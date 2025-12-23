
import { GoogleGenAI } from "@google/genai";

// Menggunakan model 'gemini-3-pro-image-preview' (Nano Banana Pro) sesuai instruksi untuk kualitas tertinggi
const PRO_MODEL = 'gemini-3-pro-image-preview';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 6): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error) || error.message || "";
      if (errorStr.includes("429") || errorStr.includes("RESOURCE_REHAUSTED")) {
        await sleep(Math.pow(2, attempt) * 15000);
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

export const generateCombinedImage = async (modelBase64: string, productBase64: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    // Prompt ini dirancang untuk memaksa model melakukan "Pixel-Perfect Replacement"
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } },
          { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } },
          { text: `TASK: ABSOLUTE PIXEL-PERFECT CLOTHING SWAP.
          SOURCE 1 (MODEL): Use the human model's face, skin, and pose as the base.
          SOURCE 2 (PRODUCT): This is the ONLY source for the garment. 100% IDENTICAL FIDELITY REQUIRED.
          
          STRICT REQUIREMENTS:
          - NO HALLUCINATIONS: Do not change the lace, embroidery, or fabric texture of the product from Source 2.
          - NO GLITCHES: Ensure the edges where the fabric meets the skin (face, neck, hands) are perfectly clean with zero artifacts, blurring, or double lines.
          - ANATOMICAL WRAPPING: The product from Source 2 must be wrapped around the model's body perfectly, respecting the pose and gravity (natural draping).
          - LIGHTING MATCH: Apply the lighting environment from Source 1 onto the product from Source 2 seamlessly.
          - OUTPUT: A high-end, clean fashion photograph. 2K resolution. Aspect 9:16.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "2K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal menyatukan aset secara sempurna.");
  });
};

export const refineAndCustomize = async (image: string, background: string, backgroundRef: string, lightingRef: string, neonText: string, fontStyle: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: image.split(',')[1], mimeType: 'image/png' } },
          { text: `PROFESSIONAL STUDIO EDIT: Change ONLY the background.
          NEW BACKGROUND: ${background}.
          LIGHTING: ${lightingRef}.
          ADD BRANDING: A sleek, bright neon sign on the wall behind the model saying "${neonText}".
          MAINTAIN OUTFIT INTEGRITY: Do not modify the model or the garment at all. High-end fashion aesthetic. 9:16.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal memproses detail.");
  });
};

export const generateStoryboardGrid = async (baseImage: string, neonText: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          { text: `PREMIUM MUKENA FASHION STORYBOARD (3x3 SEAMLESS GRID): 
          Generate 9 DIFFERENT scenes of the SAME character in the SAME studio.
          
          VISUAL RULES:
          - NO grid lines, NO white borders, NO dividers. The frames must be seamless and touch each other edge-to-edge.
          - STRICTLY PROHIBITED: NO Low Angle, NO High Angle (unsuitable for Mukena).
          - REQUIRED ANGLES: Eye Level only. Mix of Wide Full Body, Medium Shot (Waist up), Extreme Close Up (ECU - Focus on fabric/lace detail), and Eye Close Up (Focus on model's serene expression).
          - INTELLIGENT POSING: Analyze the garment. Include a variety of graceful poses: standing elegantly, sitting prayerfully, hands together, side profiles, and subtle fabric movements.
          - CONSISTENCY: Model face, outfit texture, background, and neon branding "${neonText}" must be IDENTICAL across all 9 frames.
          
          Output as a clean 3x3 seamless montage. Aspect 9:16.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "2K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal membuat storyboard.");
  });
};

export const extractCell = async (gridImage: string, index: number): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const pos = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];
    
    const prompt = `ACT AS AN IMAGE CROPPER. 
    COMMAND: ISOLATION MODE. 
    INPUT: A seamless 3x3 montage of storyboards (no grid lines). 
    TARGET: Only the ${pos[index]} segment. 
    ACTION: Precisely extract the ${pos[index]} section. Crop the image so that ONLY that specific frame fills the entire 9:16 output. 
    RESTRICTION: 
    1. OUTPUT must be a single clean 9:16 portrait.
    2. Ensure no slivers of adjacent frames are visible.`;

    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: gridImage.split(',')[1], mimeType: 'image/png' } },
          { text: prompt }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal mengekstrak frame.");
  });
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
