
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
// This guarantees a single image is extracted based on coordinates, preventing AI hallucinations.
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

      // Padding logic: Crop slightly inside (10px) to avoid getting grid lines
      const padding = 10; 

      const colIndex = index % cols;
      const rowIndex = Math.floor(index / cols);

      const canvas = document.createElement('canvas');
      // Set target to High Res Vertical (9:16) for the final shot
      canvas.width = 1024; 
      canvas.height = 1792; 
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error("Failed to create canvas context"));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Source coordinates from the grid
      const sourceX = (colIndex * pieceWidth) + padding;
      const sourceY = (rowIndex * pieceHeight) + padding;
      const sourceW = pieceWidth - (padding * 2);
      const sourceH = pieceHeight - (padding * 2);

      // Draw the cropped portion stretched to the full HD canvas
      ctx.drawImage(
        img,
        sourceX, sourceY, sourceW, sourceH,  // Source crop
        0, 0, canvas.width, canvas.height    // Destination full size
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
            text: `TASK: INTELLIGENT PRODUCT TRY-ON.
1. ANALYZE Image 2 to identify the product category.
2. INTEGRATE the product onto the person from Image 1 naturally.
3. IDENTITY: Ensure the face is 100% identical to Image 1.
4. USER INSTRUCTION: ${instruction || 'Natural fit'}.
5. OUTPUT: Professional 9:16 high-fashion catalog photo.` }
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
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          { text: `SCENE MASTERING (LOCK SUBJECT):
- SUBJECT: Keep person/product EXACTLY as input.
- BACKGROUND: ${style}.
- BRANDING: Neon sign "${text}" (${fontStyle}) placed ${placement}.
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
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          { text: `PROFESSIONAL 3x3 STORYBOARD GRID:
- Use the provided person. Generate 9 DISTINCT poses.
- NO REPETITION. Use Close-up, Medium, Full-body shots.
- CONSISTENCY: Keep Face & Product identical.
- BRANDING: Neon sign "${text}" in background.
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
export const extractCell = async (gridImage: string, index: number): Promise<string> => {
  try {
    // STEP 1: Crop Locally (Client-side)
    // This physically cuts the image so the AI never sees the full grid for the next step.
    const croppedLowRes = await cropImageLocally(gridImage, index);

    // STEP 2: Upscale & Refine with Gemini
    return callWithRetry(async (ai) => {
      const response = await ai.models.generateContent({
        model: PRO_IMAGE_MODEL,
        contents: {
          parts: [
            { inlineData: { data: croppedLowRes.split(',')[1], mimeType: 'image/png' } },
            { 
              text: `IMAGE RESTORATION TASK:
- INPUT: A low-resolution crop from a storyboard.
- GOAL: Upscale this to a sharp, high-quality 9:16 portrait.
- STRICT RULE: Do NOT change the pose, face expression, or product details. Just add details, fix blur, and improve lighting.
- OUTPUT: 1K Resolution, Photorealistic.` 
            }
          ]
        },
        config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
      // Fallback: return the cropped image if AI fails
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
          { text: `UPSCALE TASK: Increase resolution to ${size}. Enhance textures and sharpen details.` }
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

export const repairImage = async (imageBase64: string, prompt: string): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
          { text: `AI IMAGE REPAIR: ${prompt}. Correct anatomy and lighting while maintaining identity.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_REPAIR");
  });
};

export const generateSceneVideo = async (imageBase64: string, prompt: string): Promise<string> => {
  return callWithRetry(async (ai) => {
    let operation = await ai.models.generateVideos({
      model: VEO_MODEL,
      prompt: `${prompt}. Maintain absolute consistency. Cinematic slow motion.`,
      image: { imageBytes: imageBase64.split(',')[1], mimeType: 'image/png' },
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
    });
    while (!operation.done) {
      await sleep(10000);
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    
    // Explicitly use effective API key for the download fetch as well
    const apiKey = getEffectiveApiKey();
    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  });
};
