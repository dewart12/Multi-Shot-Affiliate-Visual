
import { GoogleGenAI } from "@google/genai";

const PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to get the best available API Key
const getEffectiveApiKey = (): string => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('USER_GEMINI_API_KEY');
    if (stored && stored.length > 5) return stored;
  }
  return process.env.API_KEY as string;
};

// --- NEW: VALIDATION FUNCTION ---
export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  try {
    const ai = new GoogleGenAI({ apiKey });
    // Perform a lightweight "ping" to check if the key is valid.
    // Using 'gemini-3-flash-preview' ensures the key works with the newer model series
    // required by the app.
    await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: 'Ping' }] },
    });
    return true;
  } catch (error) {
    console.error("API Key Validation Failed:", error);
    return false;
  }
};

async function callWithRetry<T>(fn: (ai: GoogleGenAI) => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Create new instance with effective key (BYOK or Env)
      const apiKey = getEffectiveApiKey();
      if (!apiKey) throw new Error("API_KEY_MISSING");
      
      const ai = new GoogleGenAI({ apiKey });
      return await fn(ai);
    } catch (error: any) {
      lastError = error;
      const errorStr = (error.message || "").toLowerCase();
      
      if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("resource_exhausted")) {
        if (errorStr.includes("limit: 0")) {
          throw new Error("QUOTA_LIMIT_ZERO");
        }
        if (attempt < maxRetries - 1) {
          await sleep((attempt + 1) * 10000);
          continue;
        }
      }
      
      if (errorStr.includes("not found") || errorStr.includes("api key") || errorStr.includes("api_key_missing")) {
        throw new Error("API_KEY_INVALID");
      }
      
      throw error;
    }
  }
  throw lastError;
}

// --- MANUAL CROP FUNCTION (Client-Side Canvas) ---
const cropImageLocally = (base64Image: string, index: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error("Manual crop requires browser environment."));
      return;
    }

    const img = new Image();
    img.src = base64Image;
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const cols = 3;
      const rows = 3;
      const pieceWidth = img.width / cols;
      const pieceHeight = img.height / rows;

      // Padding logic
      const padding = 10; 

      const colIndex = index % cols;
      const rowIndex = Math.floor(index / cols);

      const canvas = document.createElement('canvas');
      canvas.width = 1024; 
      canvas.height = 1792; 
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error("Failed to create canvas context"));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const sourceX = (colIndex * pieceWidth) + padding;
      const sourceY = (rowIndex * pieceHeight) + padding;
      const sourceW = pieceWidth - (padding * 2);
      const sourceH = pieceHeight - (padding * 2);

      ctx.drawImage(
        img,
        sourceX, sourceY, sourceW, sourceH, 
        0, 0, canvas.width, canvas.height
      );

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => reject(new Error("Failed to load source image for cropping."));
  });
};

export const generateCombinedImage = async (modelBase64: string, productBase64: string, instruction: string = ""): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } },
          { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } },
          {
            text: `TASK: FLAWLESS VIRTUAL TRY-ON & PRODUCT INTEGRATION.
1. INPUTS: Person (Image 1) + Product (Image 2).
2. ACTION: Dress the person in the product OR place the product in their hand/scene naturally.
3. STRICT REQUIREMENTS:
   - ANATOMY: Perfect fingers, hands, and body proportions. NO GLITCHES, NO DISTORTED LIMBS, NO FLOATING PARTS.
   - IDENTITY: The face MUST be the exact person from Image 1.
   - TEXTURE: High-fidelity fabric/material rendering. Shadows must match the scene.
   - INTEGRATION: No visible cut-out edges.
4. INSTRUCTION: ${instruction || 'Ensure a realistic, high-quality fit'}.
5. OUTPUT: Photorealistic 9:16 high-fashion catalog photo.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_NO_IMAGE_RETURNED");
  });
};

export const generateRefinementVariations = async (modelBase64: string, productBase64: string, instruction: string = ""): Promise<string[]> => {
  const promises = Array(3).fill(null).map(() => generateCombinedImage(modelBase64, productBase64, instruction));
  const results = await Promise.allSettled(promises);
  const successful = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<string>).value);
  
  if (successful.length === 0) throw new Error("Generation failed");
  return successful;
};

export const generateBrandingVariations = async (baseImage: string, text: string, style: string, fontStyle: string, placement: string): Promise<string[]> => {
  const generateOne = () => callWithRetry(async (ai) => {
    
    // Check if branding text is provided. If not, explicitly ask to NOT generate text.
    const brandingLine = text && text.trim().length > 0 
      ? `- BRANDING: Neon sign "${text}" (${fontStyle}) placed ${placement}.`
      : `- BRANDING: NO TEXT. Do not generate any text or neon signs in the background.`;

    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          { text: `SCENE MASTERING (LOCK SUBJECT):
- SUBJECT: Keep person/product EXACTLY as input.
- FACE: Do not change the facial features.
- BACKGROUND: ${style}.
${brandingLine}
- QUALITY: Photorealistic, 9:16, 1K.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_STYLE_PREVIEW");
  });

  const promises = Array(3).fill(null).map(() => generateOne());
  const results = await Promise.allSettled(promises);
  const successful = results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<string>).value);
  
  if (successful.length === 0) throw new Error("Failed to generate branding variations");
  return successful;
};

export const generateStoryboardGrid = async (baseImage: string, text: string, style: string): Promise<string> => {
  return callWithRetry(async (ai) => {
    
    // Check if branding text is provided. If not, explicitly ask to NOT generate text.
    const brandingLine = text && text.trim().length > 0
      ? `- BRANDING: Neon sign "${text}" in background.`
      : `- BRANDING: NO TEXT. Do not generate any text or neon signs in the background.`;

    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          { text: `PROFESSIONAL 3x3 STORYBOARD GRID:
- Use the provided person. Generate 9 DISTINCT poses.
- NO REPETITION. Use Close-up, Medium, Full-body shots.
- IDENTITY CONSISTENCY: The face in all 9 panels MUST match the input person exactly.
${brandingLine}
- OUTPUT: 3x3 Grid Image, 9:16 Aspect Ratio, High Res.
- CRITICAL: Add thin solid black divider lines.` }
        ]
      },
      // Using 9:16 Aspect Ratio to match the final vertical output format
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_NO_GRID_RETURNED");
  });
};

// --- MAIN EXTRACTION LOGIC ---
export const extractCell = async (gridImage: string, index: number, referenceImage?: string): Promise<string> => {
  try {
    const croppedLowRes = await cropImageLocally(gridImage, index);

    return callWithRetry(async (ai) => {
      const parts: any[] = [];
      
      // If reference image provided, add it first as strict guidance
      if (referenceImage) {
        parts.push({ inlineData: { data: referenceImage.split(',')[1], mimeType: 'image/png' } });
      }
      
      parts.push({ inlineData: { data: croppedLowRes.split(',')[1], mimeType: 'image/png' } });
      
      const prompt = referenceImage 
        ? `TASK: HIGH-FIDELITY RESTORATION.
Input 1: REFERENCE FACE (Strict Identity Source).
Input 2: LOW-RES CROP (Target to upscale).
GOAL: Upscale Input 2 to 1K resolution.
CRITICAL: Reconstruct the face in Input 2 to perfectly match the identity in Input 1.
Preserve the pose, expression, and product from Input 2.`
        : `IMAGE RESTORATION TASK:
- INPUT: A low-resolution crop from a storyboard.
- GOAL: Upscale this to a sharp, high-quality 9:16 portrait.
- STRICT RULE: Do NOT change the pose, face expression, or product details. Just add details, fix blur, and improve lighting.
- OUTPUT: 1K Resolution, Photorealistic.`;

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: PRO_IMAGE_MODEL,
        contents: { parts },
        config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
      return croppedLowRes; 
    });

  } catch (error) {
    console.error("Extract error:", error);
    throw new Error("FAILED_EXTRACTION");
  }
};

export const upscaleScene = async (imageBase64: string, size: '2K' | '4K'): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
          { text: `UPSCALE TASK: Increase resolution to ${size}. Enhance textures and sharpen details. Maintain facial identity.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: size } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_UPSCALE");
  });
};

export const repairImage = async (imageBase64: string, prompt: string, referenceImage?: string): Promise<string> => {
  return callWithRetry(async (ai) => {
    const parts: any[] = [];
    if (referenceImage) {
        parts.push({ inlineData: { data: referenceImage.split(',')[1], mimeType: 'image/png' } });
    }
    parts.push({ inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } });
    
    const textPrompt = referenceImage
        ? `AI IMAGE REPAIR:
Input 1: REFERENCE IDENTITY.
Input 2: IMAGE TO REPAIR.
INSTRUCTION: ${prompt}.
CRITICAL: Ensure the face matches Input 1. Correct anatomy and lighting.`
        : `AI IMAGE REPAIR: ${prompt}. Correct anatomy and lighting while maintaining identity.`;

    parts.push({ text: textPrompt });

    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: { parts },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_REPAIR");
  });
};

// --- NEW: EDIT SCENE (Pose, Gesture, Angle) ---
export const editSceneImage = async (imageBase64: string, prompt: string, referenceImage?: string): Promise<string> => {
  return callWithRetry(async (ai) => {
    const parts: any[] = [];
    
    // Add reference for identity preservation
    if (referenceImage) {
        parts.push({ inlineData: { data: referenceImage.split(',')[1], mimeType: 'image/png' } });
    }
    
    parts.push({ inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } });
    
    const textPrompt = referenceImage 
        ? `IMAGE EDITING TASK:
- Input 1: REFERENCE FACE (Strict Identity).
- Input 2: SCENE TO EDIT.
- INSTRUCTION: ${prompt}
- CONSTRAINT: You MUST preserve the facial identity from Input 1.
- CONSTRAINT: Keep the product/clothing from Input 2.
- ACTION: Modify only the pose, gesture, or camera angle as requested.
- OUTPUT: Photorealistic 9:16 image.`
        : `IMAGE EDITING TASK:
- INSTRUCTION: ${prompt}
- CONSTRAINT: Keep the original Subject (Face & Product) and Style identical. 
- ACTION: Modify only the pose, gesture, or camera angle as requested.
- OUTPUT: Photorealistic 9:16 image.`;

    parts.push({ text: textPrompt });

    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: { parts },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_EDIT");
  });
};

export const generateSceneVideo = async (
  imageBase64: string, 
  prompt: string, 
  onProgress?: (progress: number) => void
): Promise<string> => {
  return callWithRetry(async (ai) => {
    let progress = 0;
    if (onProgress) onProgress(5); // Start

    let operation = await ai.models.generateVideos({
      model: VEO_MODEL,
      prompt: `${prompt}. Maintain absolute consistency. Cinematic slow motion.`,
      image: { imageBytes: imageBase64.split(',')[1], mimeType: 'image/png' },
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
    });
    
    // Simulation of progress since API does not return %
    const progressInterval = setInterval(() => {
        if (progress < 90) {
            progress += Math.floor(Math.random() * 5) + 2;
            if (progress > 90) progress = 90;
            if (onProgress) onProgress(progress);
        }
    }, 1000);

    try {
        while (!operation.done) {
          await sleep(5000);
          operation = await ai.operations.getVideosOperation({ operation: operation });
        }
    } finally {
        clearInterval(progressInterval);
    }
    
    if (onProgress) onProgress(100);

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    
    // Explicitly use effective API key for the download fetch as well
    const apiKey = getEffectiveApiKey();
    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  });
};
