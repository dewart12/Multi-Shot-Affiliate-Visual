
import { GoogleGenAI } from "@google/genai";

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
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } },
          { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } },
          { text: "DIGITAL COMPOSITING: Fit the garment onto the model naturally. Vertical 9:16 portrait format." }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal gabungkan.");
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
          { text: `BACKGROUND: ${background}. NEON BRANDING: Add text "${neonText}". Aspect 9:16.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal refine.");
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
          { text: `3x3 STORYBOARD GRID: Generate 9 DIFFERENT frames of the SAME character in the SAME environment. 
          REQUIRED VARIETY: Each frame MUST use a unique camera angle and pose. 
          Include a mix of: Medium Shot, Extreme Close Up (face/detail), Eye Close Up, Wide Full Body, Low Angle, and Side Profile. 
          The background, lighting, character features, outfit, and neon branding "${neonText}" must remain perfectly consistent across all 9 boxes. 
          Output as a single 3x3 grid image. Aspect 9:16.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "2K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal storyboard.");
  });
};

export const extractCell = async (gridImage: string, index: number): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const pos = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];
    
    const prompt = `ACT AS AN IMAGE CROPPER.
COMMAND: ISOLATION MODE.
INPUT: A 3x3 Grid of storyboards.
TARGET: Only the ${pos[index]} cell.
ACTION: Zoom into the ${pos[index]} box. Crop the grid image so that ONLY the contents of the ${pos[index]} frame fill the entire 9:16 output.
RESTRICTION: 
1. DO NOT return the original 9-grid image. 
2. REMOVE all black grid lines and borders. 
3. OUTPUT must be a single clean 9:16 portrait image of one single pose.
4. If there are surrounding boxes, cut them out completely.`;

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
    throw new Error("Gagal ekstrak.");
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
  if (!response.ok) throw new Error("Gagal download video.");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
