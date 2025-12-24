
export interface SceneFrame {
  id: number;
  image: string | null;
  videoUrl: string | null;
  isExtracting: boolean;
  isGeneratingVideo: boolean;
  isUpscaling: boolean;
}

export interface GenerationState {
  modelImage: string | null;
  productImage: string | null;
  promptInstruction: string;
  combinedImage: string | null;
  combinedCandidates: string[] | null;
  brandingText: string;
  stylePrompt: string;
  fontStyle: string;
  textPlacement: string;
  storyboardGrid: string | null;
  scenes: SceneFrame[];
  extractionProgress: number;
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  REFINE = 'REFINE',
  STORYBOARD = 'STORYBOARD',
  RESULTS = 'RESULTS'
}

export interface CustomizationOptions {
  background: string;
  backgroundRef: string;
  lightingRef: string;
  neonText: string;
  fontStyle: string;
}
