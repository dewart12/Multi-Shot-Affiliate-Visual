
import { GoogleGenAI } from "@google/genai";

// Nano Banana Pro mapping per guidelines
const PRO_MODEL = 'gemini-3-pro-image-preview';
const VEO_MODEL = 'veo-3.1-fast-generate-preview';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robust API wrapper to handle 429 Resource Exhausted errors.
 */
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 6): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error) || error.message || "";
      
      if (errorStr.includes("429") || errorStr.includes("RESOURCE_REHAUSTED") || errorStr.includes("quota")) {
        console.warn(`[AI SERVICE] Quota limit hit (Attempt ${attempt + 1}/${maxRetries}).`);
        
        let waitTime = Math.pow(2, attempt) * 20000;
        const retryMatch = errorStr.match(/retry in ([\d\.]+)s/i);
        if (retryMatch && retryMatch[1]) {
          waitTime = (parseFloat(retryMatch[1]) + 5) * 1000;
        }
        
        console.log(`[AI SERVICE] Sleeping for ${Math.round(waitTime / 1000)}s...`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Pengecekan API Key yang support Localhost dan AI Studio Picker.
 */
export const checkApiKey = async (): Promise<boolean> => {
  try {
    // 1. Cek variabel lingkungan (untuk localhost development)
    if (process.env.API_KEY && process.env.API_KEY !== "") {
      return true;
    }
    // 2. Cek platform helper (untuk AI Studio sandbox)
    if (typeof (window as any).aistudio?.hasSelectedApiKey === 'function') {
      return await (window as any).aistudio.hasSelectedApiKey();
    }
    return false;
  } catch (e) {
    return false;
  }
};

/**
 * Memicu dialog pemilihan kunci dari platform.
 */
export const openApiKeySelector = async () => {
  if (typeof (window as any).aistudio?.openSelectKey === 'function') {
    await (window as any).aistudio.openSelectKey();
  } else {
    // Jika di localhost dan tidak ada window.aistudio, ingatkan user
    alert("Di lingkungan Localhost, pastikan variabel lingkungan API_KEY sudah diset.");
  }
};

export const generateCombinedImage = async (modelBase64: string, productBase64: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: modelBase64.split(',')[1], mimeType: 'image/png' } },
          { inlineData: { data: productBase64.split(',')[1], mimeType: 'image/png' } },
          { text: "DIGITAL COMPOSITING: Fit the garment onto the model naturally. Maintain 100% identity and anatomy. Vertical 9:16 format." }
        ]
      },
      config: {
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal menggabungkan aset.");
  });
};

export const refineAndCustomize = async (image: string, background: string, backgroundRef: string, lightingRef: string, neonText: string, fontStyle: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: image.split(',')[1], mimeType: 'image/png' } },
          { text: `ENVIRONMENT SCENE: 
          1. BACKGROUND: ${background}. Style Ref: ${backgroundRef}.
          2. LIGHTING: ${lightingRef}.
          3. NEON BRANDING: Text "${neonText}". Style: ${fontStyle}. 
             - POSITION: Placed behind the subject, balanced size, high legibility.
          4. FORMAT: 9:16 vertical 1K resolution.` }
        ]
      },
      config: {
        imageConfig: { aspectRatio: "9:16", imageSize: "1K" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal menyempurnakan gambar.");
  });
};

export const generateStoryboardGrid = async (baseImage: string, neonText: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const storyboardPrompt = `NANO BANANA PRO - 3x3 STORYBOARD TASK:
    Generate a 3x3 vertical grid (9:16 total ratio). Each cell should be a 9:16 vertical pose.
    
    CONSISTENCY REQUIREMENTS:
    - BACKGROUND/LIGHTING: Keep identical to the reference.
    - BRANDING: The neon sign "${neonText}" must be visible in the background of all 9 frames.
    - MODEL: Maintain exact same identity and clothing style.
    - POSES: 9 varied cinematic poses.
    - GRID: Thin, clear lines separating the 9 boxes.
    Output: 2K High Resolution Grid.`;

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
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Gagal membuat storyboard grid.");
  });
};

export const extractCell = async (gridImage: string, index: number): Promise<string> => {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const cellPositions = [
      "top-left", "top-center", "top-right",
      "middle-left", "center-middle", "middle-right",
      "bottom-left", "bottom-center", "bottom-right"
    ];
    
    const prompt = `URGENT CROP & ZOOM TASK: 
    From the provided 3x3 storyboard grid, you must extract ONLY the ${cellPositions[index]} cell. 
    Focus entirely on that specific individual frame. 
    
    CRITICAL REQUIREMENTS:
    1. SINGLE vertical 9:16 scene.
    2. ABSOLUTELY NO grid lines.
    3. FILL THE ENTIRE 9:16 FRAME.
    4. Maintain 1K professional quality.`;

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
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error(`Gagal mengekstrak cell.`);
  });
};

export const upscaleScene = async (imageBase64: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          { inlineData: { data: imageBase64.split(',')[1], mimeType: 'image/png' } },
          { text: "UPSCALE 2K: Enhance sharpness and textures. Maintain 100% identity. Output 2K 9:16." }
        ]
      },
      config: {
        imageConfig: { aspectRatio: "9:16", imageSize: "2K" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Upscale gagal.");
  });
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
    operation = await (ai as any).operations.getVideosOperation({ operation: (operation as any).operation });
  }

  const downloadLink = (operation as any).response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed");
  
  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
