
export interface SceneFrame {
  id: number;
  image: string | null;
  videoUrl: string | null;
  isExtracting: boolean;
  isGeneratingVideo: boolean;
  isUpscaling: boolean;
  isEditing: boolean; // New state for edit loading
  // Video Generation Advanced Fields
  videoProgress: number;
  bgMusicPrompt?: string;
  dialoguePrompt?: string;
  jsonMode?: boolean;
  jsonPrompt?: string;
  // Audio & Playback Controls
  isVideoMuted?: boolean;
  videoDuration?: string;
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
  editPrompts: string[]; // New state for edit inputs
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
