
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

      // Use proportional padding to maintain aspect ratio and avoid distortion.
      // 5% padding ensures we clear grid lines without squeezing the image content unproportionally.
      const paddingX = pieceWidth * 0.05; 
      const paddingY = pieceHeight * 0.05;

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

      const sourceX = (colIndex * pieceWidth) + paddingX;
      const sourceY = (rowIndex * pieceHeight) + paddingY;
      const sourceW = pieceWidth - (paddingX * 2);
      const sourceH = pieceHeight - (paddingY * 2);

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

export const generateStoryboardGrid = async (baseImage: string, text: string, style: string, instruction: string = ""): Promise<string> => {
  return callWithRetry(async (ai) => {
    
    const brandingLine = text && text.trim().length > 0
      ? `- BRANDING: Neon sign "${text}" in background.`
      : `- BRANDING: NO TEXT. Do not generate any text or neon signs in the background.`;

    const lowerInstr = (instruction + " " + (text || "")).toLowerCase();
    
    // --- SMART CATEGORIZATION ---
    let category = 'GENERAL_FASHION';
    
    // 1. BEAUTY & COSMETICS (Lipstick, Makeup, Skincare) - Needs Extreme Macro
    if (/lipstick|lipstik|mascara|eyeliner|blush|cosmetic|kosmetik|makeup|skincare|serum|cream|wajah|muka/i.test(lowerInstr)) {
        category = 'BEAUTY_COSMETIC';
    } 
    // 2. LUXURY & JEWELRY (Watch, Ring, Necklace, Glasses) - Needs Macro & Elegance
    else if (/watch|jam|jewelry|perhiasan|ring|cincin|necklace|kalung|earring|anting|glasses|kacamata|spectacles/i.test(lowerInstr)) {
         category = 'LUXURY_ACCESSORY';
    }
    // 3. HANDHELD GADGETS & BAGS (Phone, Bag, Wallet) - Needs Hand Interaction
    else if (/phone|hp|handphone|mobile|gadget|tablet|camera|kamera|bag|tas|handbag|tote|purse|wallet|dompet/i.test(lowerInstr)) {
        category = 'HANDHELD_PRODUCT';
    } 
    // 4. FOOTWEAR (Shoes, Sandals) - Needs Low angles
    else if (/shoe|sepatu|sneaker|boots|sandal|heels|footwear/i.test(lowerInstr)) {
        category = 'FOOTWEAR';
    }
    // 5. APPAREL (Clothes, Hijab, Jackets) - Needs Fit & Texture
    else if (/mukena|hijab|kerudung|gamis|abaya|koko|shirt|kemeja|t-shirt|kaos|jacket|jaket|hoodie|sweater|coat|blazer|dress|gaun|pants|celana|jeans|skirt|rok/i.test(lowerInstr)) {
        category = 'APPAREL';
    }
    
    // --- TAILORED SHOT LISTS FOR PROMOTION ---
    let shotList = "";
    
    if (category === 'BEAUTY_COSMETIC') {
        shotList = `
        STRATEGY: COSMETIC ADVERTISING CAMPAIGN (FOCUS ON PIGMENT & APPLICATION).
        - Row 1 (PRODUCT MACRO): Extreme close-up of the product (lipstick bullet, cream texture). Background blurred.
        - Row 2 (APPLICATION): Model applying the product to lips/face. Focus strictly on the application area.
        - Row 3 (FINAL LOOK): Model holding the product next to their face, showing the result.`;
    } else if (category === 'LUXURY_ACCESSORY') {
        shotList = `
        STRATEGY: HIGH-END LUXURY COMMERCIAL (FOCUS ON SHINE & DETAIL).
        - Row 1 (HERO MACRO): Extreme close-up of the watch dial / jewelry detail. Show light reflections.
        - Row 2 (ON BODY): Focused shot on the Wrist (for watch) or Neck/Ears (for jewelry). Shallow depth of field.
        - Row 3 (ELEGANCE): Model posing elegantly with hand placement emphasizing the accessory.`;
    } else if (category === 'HANDHELD_PRODUCT') {
        shotList = `
        STRATEGY: TECH & LIFESTYLE PROMOTION (FOCUS ON PRODUCT DESIGN).
        - Row 1 (HERO PRODUCT): Clean shot of the product in hand or floating. Show logo and sleek design.
        - Row 2 (INTERACTION): Model using the device (e.g. taking a selfie, scrolling). Product MUST be visible.
        - Row 3 (LIFESTYLE): Model in environment, but the product is the clear focal point (in hand or on table).`;
    } else if (category === 'FOOTWEAR') {
        shotList = `
        STRATEGY: FOOTWEAR CAMPAIGN (FOCUS ON STYLE & GROUNDING).
        - Row 1 (PRODUCT DETAIL): Close-up of the shoe on the ground or floating. Show texture/material.
        - Row 2 (ON FEET): Low-angle shot of model walking or standing. Focus on legs and shoes.
        - Row 3 (FULL LOOK): Full body shot where the shoes complement the outfit.`;
    } else if (category === 'APPAREL') {
        shotList = `
        STRATEGY: FASHION CATALOG (FOCUS ON FABRIC, FIT & DRAPE).
        - Row 1 (FABRIC DETAIL): Close-up on the collar, buttons, or fabric pattern/texture.
        - Row 2 (UPPER BODY): Half-body shot showing how the garment fits the shoulders and chest.
        - Row 3 (FULL SILHOUETTE): Full-body shot showing the movement and fall of the fabric.`;
    } else {
        // Fallback
        shotList = `
        STRATEGY: COMMERCIAL PRODUCT SHOWCASE.
        - Row 1: Close-up details of the key product features.
        - Row 2: Model interacting with the product naturally.
        - Row 3: Dynamic lifestyle shot featuring the product.`;
    }

    const contextInstruction = instruction ? `USER CONTEXT: ${instruction}` : "";

    const basePrompt = `
    COMMERCIAL PRODUCT PHOTOGRAPHY STORYBOARD (3x3 GRID)
    
    INPUT IMAGE: This is the **MASTER REFERENCE (Source of Truth)**.
    GOAL: Create a promotional storyboard CAMPAIGN for the specific PRODUCT shown in the Input Image.
    
    ${contextInstruction}
    
    CRITICAL CONSISTENCY RULES:
    1. **PRODUCT INTEGRITY**: The product in the Input Image MUST NOT CHANGE. Use the EXACT same design, color, and logo in all 9 panels.
    2. **MODEL IDENTITY**: The model's face and hair must remain consistent with the Input Image.
    3. **PROMOTIONAL FOCUS**: This is NOT a generic photoshoot. It is an ADVERTISEMENT for the product.
    
    COMPOSITION PLAN (${category}):
    ${shotList}
    
    STYLE: ${style}. High-end Commercial Advertisement. Professional Studio Lighting.
    ${brandingLine}
    
    OUTPUT SPEC: High-resolution 3x3 grid image with thin black dividers. Aspect Ratio 9:16.
    `;

    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: baseImage.split(',')[1], mimeType: 'image/png' } },
          { text: basePrompt }
        ]
      },
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
    // DIRECT CROP ONLY to prevent hallucinations during slice.
    return await cropImageLocally(gridImage, index);
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

// --- NEW: REGENERATE SCENE WITH REFERENCE (For Fixing Inconsistent Products) ---
export const regenerateSceneFromReference = async (
  referenceBase64: string, 
  prompt: string, 
  style: string
): Promise<string> => {
  return callWithRetry(async (ai) => {
    const response = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: referenceBase64.split(',')[1], mimeType: 'image/png' } },
          { text: `REGENERATE SCENE WITH REFERENCE:
- REFERENCE IMAGE: Use this object/person as the PRIMARY SUBJECT.
- TASK: Create a new scene featuring this subject.
- CONTEXT: ${prompt}
- STYLE: ${style}
- CONSTRAINT: The subject from the image must be clearly visible and preserved.
- OUTPUT: Photorealistic 9:16 image.` }
        ]
      },
      config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("FAILED_REGEN");
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
