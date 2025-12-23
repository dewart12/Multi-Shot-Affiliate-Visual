
import { GoogleGenAI } from "@google/genai";

const PRO_MODEL = 'gemini-3-pro-image-preview';
const FLASH_MODEL = 'gemini-2.5-flash-image';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';

export const checkApiKey = async (): Promise<boolean> => {
  try {
    if (typeof window.aistudio?.hasSelectedApiKey === 'function') {
      return await window.aistudio.hasSelectedApiKey();
    }
    return false;
  } catch (e) {
    return false;
  }
};

export const openApiKeySelector = async () => {
  if (typeof window.aistudio?.openSelectKey === 'function') {
    await window.aistudio.openSelectKey();
  }
};

export const generateCombinedImage = async (modelBase64: string, productBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: {
      parts: [
        { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } },
        { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } },
        { text: "EXPERT DIGITAL COMPOSITING TASK: Dress the model in the Mukena garment. Maintain 100% identity. 9:16 vertical format." }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: "9:16",
        imageSize: "1K"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to generate combined image");
};

export const refineAndCustomize = async (image: string, background: string, backgroundRef: string, lightingRef: string, neonText: string, fontStyle: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: {
      parts: [
        { inlineData: { data: image.split(',')[1], mimeType: 'image/png' } },
        { text: `PROFESSIONAL SCENE EXTENSION: 
        1. BACKGROUND: ${background}. Style: ${backgroundRef}.
        2. LIGHTING: ${lightingRef}.
        3. NEON BRANDING: Signage "${neonText}". Style: ${fontStyle}. 
           - PLACEMENT: Behind model. Medium size, clearly visible but balanced.
        4. 9:16 4K vertical master.` }
      ]
    },
    config: {
      imageConfig: { aspectRatio: "9:16", imageSize: "1K" }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to customize image");
};

export const generateStoryboardGrid = async (baseImage: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const storyboardPrompt = `HIGH-RESOLUTION 3x3 VERTICAL STORYBOARD GRID (9:16).
  Generate a single 3x3 grid of 9 scenes.
  
  CONSISTENCY RULES:
  - Background and lighting must be IDENTICAL in all 9 cells.
  - The neon branding "${baseImage}" must stay consistent in the same background position. Not too big, balanced legibility.
  - Grid lines must be thin, black, and perfectly straight.
  
  SCENE POSES: 1.Front 2.Side 3.Daily 4.Length 5.Detail 6.Flow 7.Back 8.Sitting 9.Closing.
  Output: 2K resolution 9:16 vertical grid.`;

  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: {
      parts: [
        { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
        { text: storyboardPrompt }
      ]
    },
    config: {
      imageConfig: { aspectRatio: "9:16", imageSize: "2K" }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to generate storyboard grid");
};

export const extractCell = async (gridImage: string, index: number): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const cellPositions = [
    "top-left", "top-center", "top-right",
    "middle-left", "center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right"
  ];
  
  const prompt = `Extract ONLY the ${cellPositions[index]} cell of this 3x3 image grid.
  Rules:
  - Crop exactly one cell (${cellPositions[index]})
  - No resize, no padding, no border
  - Keep original sharpness and color
  - Output as PNG
  - ONE IMAGE ONLY.
  - EXTREME PRECISION: Do not show parts of adjacent cells or grid lines.`;

  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: {
      parts: [
        { inlineData: { data: gridImage.split(',')[1], mimeType: 'image/png' } },
        { text: prompt }
      ]
    },
    config: {
      imageConfig: { aspectRatio: "9:16", imageSize: "1K" }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error(`Failed to extract cell ${index + 1}`);
};

export const upscaleScene = async (imageBase64: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: {
      parts: [
        { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
        { text: "UPSCALE TO 2K RESOLUTION. Enhance details, sharpness, and clean up artifacts while maintaining original aesthetics. Return only the upscaled 9:16 image." }
      ]
    },
    config: {
      imageConfig: { aspectRatio: "9:16", imageSize: "2K" }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Upscale failed");
};

export const generateSceneVideo = async (imageBase64: string, motionPrompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  let operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt: motionPrompt,
    image: {
      imageBytes: imageBase64.split(',')[1],
      mimeType: 'image/png',
    },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '9:16'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed");
  
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
