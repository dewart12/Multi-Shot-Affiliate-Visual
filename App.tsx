
import React, { useState, useEffect } from 'react';
import { AppStep, GenerationState } from './types.ts';
import { 
  generateCombinedImage,
  generateRefinementVariations,
  generateBrandingVariations,
  generateStoryboardGrid, 
  extractCell,
  generateSceneVideo,
  upscaleScene,
  repairImage,
  validateApiKey // Import the new validation function
} from './services/geminiService.ts';

// --- COMPONENTS ---

const SciFiProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  // Est. time calculation: Assume approx 45s total process
  const remainingSeconds = Math.max(0, Math.ceil(((100 - progress) / 100) * 45));

  return (
    <div className="w-full font-sans select-none">
      <div className="flex justify-between items-end mb-2">
        <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-blue-500 rounded-full animate-ping"></div>
            <span className="text-[9px] md:text-[10px] font-mono font-bold text-blue-400 tracking-widest uppercase">
                System_Processing
            </span>
        </div>
        <span className="text-[9px] md:text-[10px] font-mono font-bold text-zinc-500 tracking-widest">
            EST: {remainingSeconds}s
        </span>
      </div>

      <div className="relative h-6 md:h-7 bg-[#08090a] border border-blue-900/40 skew-x-[-12deg] overflow-hidden group shadow-[0_0_20px_rgba(0,0,0,0.5)]">
        {/* Grid Background Effect */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_2px,rgba(0,0,0,0.8)_2px)] bg-[length:6px_100%] opacity-40 z-10 pointer-events-none"></div>
        
        {/* Animated Fill */}
        <div 
          className="absolute inset-y-0 left-0 bg-blue-600 transition-all duration-700 ease-out z-0 relative"
          style={{ width: `${progress}%` }}
        >
             {/* Glow leading edge */}
             <div className="absolute right-0 top-0 bottom-0 w-0.5 md:w-1 bg-blue-300 shadow-[0_0_15px_rgba(59,130,246,1)]"></div>
             {/* Inner Shine */}
             <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent"></div>
        </div>
        
        {/* Text Overlay centered */}
        <div className="absolute inset-0 flex items-center justify-center z-20 skew-x-[12deg]">
            <span className="text-[9px] md:text-[10px] font-black text-white/90 tracking-[0.3em] mix-blend-difference">
                {progress}% COMPLETED
            </span>
        </div>
      </div>
      
      {/* Tech Footer Deco */}
      <div className="flex justify-between mt-1.5 px-1 opacity-60">
        <div className="flex gap-1">
             <div className={`w-3 h-1 md:w-4 md:h-1 rounded-sm ${progress > 10 ? 'bg-blue-500' : 'bg-zinc-800'} transition-colors duration-500`}></div>
             <div className={`w-3 h-1 md:w-4 md:h-1 rounded-sm ${progress > 40 ? 'bg-blue-500' : 'bg-zinc-800'} transition-colors duration-500`}></div>
             <div className={`w-3 h-1 md:w-4 md:h-1 rounded-sm ${progress > 70 ? 'bg-blue-500' : 'bg-zinc-800'} transition-colors duration-500`}></div>
             <div className={`w-3 h-1 md:w-4 md:h-1 rounded-sm ${progress >= 100 ? 'bg-[#10b981]' : 'bg-zinc-800'} transition-colors duration-500`}></div>
        </div>
        <span className="text-[7px] md:text-[8px] font-mono text-blue-500/80 tracking-widest">DATA_STREAM_v3.1</span>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(true); // Default true to force check
  const [loadingMsg, setLoadingMsg] = useState('');
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [useCustomKey, setUseCustomKey] = useState<boolean>(false);
  
  // State for the BYOK Input in the modal
  const [tempApiKey, setTempApiKey] = useState('');
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  
  const [state, setState] = useState<GenerationState>({
    modelImage: null,
    productImage: null,
    promptInstruction: '',
    combinedImage: null,
    combinedCandidates: null,
    brandingText: 'LUXE',
    stylePrompt: 'High-end minimalist studio with soft moody lighting',
    fontStyle: 'Modern Sans',
    textPlacement: 'Behind Subject',
    storyboardGrid: null,
    scenes: Array.from({ length: 9 }, (_, i) => ({
      id: i,
      image: null,
      videoUrl: null,
      isExtracting: false,
      isGeneratingVideo: false,
      isUpscaling: false
    })),
    extractionProgress: 0,
  });

  const [scenePrompts, setScenePrompts] = useState<string[]>(Array(9).fill("Subtle cinematic motion, elegant model moves naturally."));
  const [repairPrompts, setRepairPrompts] = useState<string[]>(Array(9).fill("Fix any glitches and enhance facial details."));

  const checkKeys = async () => {
    // Check local BYOK first
    const localKey = localStorage.getItem('USER_GEMINI_API_KEY');
    
    // If local key exists, validate it silently
    if (localKey && localKey.length > 5) {
       // Optional: We can validate silently here or assume it's good. 
       // For better UX, let's assume it's good if present, but if calls fail later, handleDisconnect.
       setUseCustomKey(true);
       setShowKeyModal(false);
       return;
    }
    
    setUseCustomKey(false);
    
    // Fallback to Env/IDX check
    const aistudio = (window as any).aistudio;
    if (aistudio && await aistudio.hasSelectedApiKey()) {
       setShowKeyModal(false);
    } else {
       setShowKeyModal(true);
    }
  };

  useEffect(() => {
    checkKeys();
  }, []);

  const handleSaveCustomKey = async () => {
    setKeyError('');
    if (tempApiKey.trim().length < 10) {
      setKeyError("Invalid Key format");
      return;
    }

    setIsValidatingKey(true);
    
    // Perform live validation against Google servers
    const isValid = await validateApiKey(tempApiKey.trim());
    
    if (isValid) {
      localStorage.setItem('USER_GEMINI_API_KEY', tempApiKey.trim());
      setUseCustomKey(true);
      setShowKeyModal(false);
    } else {
      setKeyError("Validation Failed. Key invalid or inactive.");
    }
    
    setIsValidatingKey(false);
  };

  const handleDisconnect = () => {
      localStorage.removeItem('USER_GEMINI_API_KEY');
      setUseCustomKey(false);
      setShowKeyModal(true); // Re-open modal
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'model' | 'product') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setState(prev => ({ ...prev, [type === 'model' ? 'modelImage' : 'productImage']: ev.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleError = (e: any) => {
    console.error(e);
    if (e.message === "QUOTA_LIMIT_ZERO") {
      setQuotaError("YOUR API QUOTA IS ZERO. Please upgrade your Google Cloud Project to a PAID plan and enable billing for Gemini 3 Pro & Veo 3.1.");
    } else if (e.message === "API_KEY_INVALID") {
      alert("API Key is invalid or expired. Please re-authenticate.");
      localStorage.removeItem('USER_GEMINI_API_KEY');
      setShowKeyModal(true);
    } else {
      alert("Error occurred: " + (e.message || "Unknown error"));
    }
  };

  const onRefineClick = async () => {
    if (!state.modelImage || !state.productImage) return;
    setLoadingMsg("GENERATING 3 REFINEMENT VARIATIONS...");
    setQuotaError(null);
    try {
      const res = await generateRefinementVariations(
        state.modelImage, 
        state.productImage,
        state.promptInstruction
      );
      setState(prev => ({ 
        ...prev, 
        combinedCandidates: res,
        combinedImage: res[0]
      }));
      setStep(AppStep.REFINE);
    } catch (e: any) { 
      handleError(e);
    }
    setLoadingMsg("");
  };

  const onApplyBrandingClick = async () => {
    if (!state.combinedImage) return;
    setLoadingMsg("GENERATING 3 BRANDING VARIATIONS...");
    setQuotaError(null);
    try {
      const res = await generateBrandingVariations(
        state.combinedImage,
        state.brandingText || "LUXE",
        state.stylePrompt || "Cinematic",
        state.fontStyle || "Modern Sans",
        state.textPlacement || "Behind Subject"
      );
      setState(prev => ({ 
        ...prev, 
        combinedImage: res[0],
        combinedCandidates: res 
      }));
    } catch (e: any) { 
      handleError(e);
    }
    setLoadingMsg("");
  };

  const onGridClick = async () => {
    if (!state.combinedImage) return;
    setLoadingMsg("GENERATING PRODUCTION GRID...");
    setQuotaError(null);
    try {
      const res = await generateStoryboardGrid(
        state.combinedImage, 
        state.brandingText || "LUXE", 
        state.stylePrompt || "Cinematic"
      );
      setState(prev => ({ ...prev, storyboardGrid: res }));
      setStep(AppStep.STORYBOARD);
    } catch (e: any) { 
      handleError(e);
    }
    setLoadingMsg("");
  };

  const onFinalRenderClick = async () => {
    if (!state.storyboardGrid) return;
    setStep(AppStep.RESULTS);
    setQuotaError(null);
    for (let i = 0; i < 9; i++) {
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === i ? { ...s, isExtracting: true } : s) }));
      try {
        const img = await extractCell(state.storyboardGrid!, i);
        setState(prev => ({
          ...prev,
          scenes: prev.scenes.map(s => s.id === i ? { ...s, image: img, isExtracting: false } : s),
          extractionProgress: Math.round(((i + 1) / 9) * 100)
        }));
      } catch (e: any) { 
        console.error("Extraction failed for index " + i, e);
        if (e.message === "QUOTA_LIMIT_ZERO") {
          setQuotaError("Quota Limit Reached during extraction. Some scenes might not load.");
          break;
        }
      }
    }
  };

  const onUpscale = async (idx: number, size: '2K' | '4K') => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isUpscaling: true } : s) }));
    try {
      const img = await upscaleScene(state.scenes[idx].image!, size);
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: img, isUpscaling: false } : s) }));
    } catch (e) { handleError(e); }
  };

  const onRepair = async (idx: number) => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isExtracting: true } : s) }));
    try {
      const img = await repairImage(state.scenes[idx].image!, repairPrompts[idx]);
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, image: img, isExtracting: false } : s) }));
    } catch (e) { handleError(e); }
  };

  const onVideo = async (idx: number) => {
    setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, isGeneratingVideo: true } : s) }));
    try {
      const url = await generateSceneVideo(state.scenes[idx].image!, scenePrompts[idx]);
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === idx ? { ...s, videoUrl: url, isGeneratingVideo: false } : s) }));
    } catch (e) { handleError(e); }
  };

  return (
    <div className="min-h-screen bg-[#050506] text-white selection:bg-blue-500/30 font-sans pb-20 relative overflow-x-hidden">
      
      {/* 1. Header Section */}
      <header className="pt-8 md:pt-12 pb-6 md:pb-8 relative px-4">
        
        {/* Status Indicator / Disconnect */}
        <div className="absolute top-8 right-4 md:right-8 z-50">
           <div 
             onClick={handleDisconnect}
             className={`bg-[#0c1a11] border ${useCustomKey ? 'border-blue-900/40 bg-blue-950/20' : 'border-[#1e3a24]'} rounded-full px-4 py-2 flex items-center gap-2 transition-all duration-300 cursor-pointer hover:opacity-80 group`}
             title="Click to Disconnect / Change Key"
           >
                <div className={`w-1.5 h-1.5 rounded-full ${useCustomKey ? 'bg-blue-400 shadow-[0_0_8px_#3b82f6]' : 'bg-[#10b981] shadow-[0_0_8px_#10b981]'} `}></div>
                <span className={`${useCustomKey ? 'text-blue-400' : 'text-[#10b981]'} text-[9px] font-bold uppercase tracking-widest`}>
                    {useCustomKey ? 'Custom Key' : 'Project Key'}
                </span>
                <i className="fa-solid fa-power-off text-[10px] text-zinc-500 group-hover:text-red-400 ml-2 transition-colors"></i>
           </div>
        </div>

        <div className="text-center space-y-4">
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-tight">UGC AI Affiliate Storyboard Scene</h1>
        </div>
      </header>

      {/* 2. Responsive Navigation Flow */}
      <nav className="flex flex-wrap justify-center items-center gap-x-2 gap-y-3 md:gap-8 mb-8 md:mb-16 px-4">
        {[
          { step: AppStep.UPLOAD, label: 'Upload Assets' },
          { step: AppStep.REFINE, label: 'Refine Image' },
          { step: AppStep.STORYBOARD, label: 'Storyboard Grid' },
          { step: AppStep.RESULTS, label: 'Final Render' }
        ].map((item, idx, arr) => {
          const isActive = step === item.step;
          const isCompleted = arr.findIndex(x => x.step === step) > idx;
          const canNavigate = 
            (item.step === AppStep.UPLOAD) ||
            (item.step === AppStep.REFINE && (state.combinedImage || state.modelImage)) ||
            (item.step === AppStep.STORYBOARD && state.storyboardGrid) ||
            (item.step === AppStep.RESULTS && state.scenes.some(s => s.image));

          return (
            <React.Fragment key={item.step}>
              <div 
                onClick={() => canNavigate && setStep(item.step)}
                className={`flex items-center gap-2 md:gap-3 px-4 py-3 md:px-6 md:py-4 rounded-xl md:rounded-2xl border transition-all ${
                isActive 
                  ? 'bg-[#0f172a] border-blue-600/50 text-white shadow-[0_0_20px_rgba(37,99,235,0.15)] scale-105' 
                  : isCompleted 
                    ? 'bg-[#0c1a11]/20 border-green-600/30 text-green-500 hover:bg-[#0c1a11]/40'
                    : 'bg-[#0c0c0e] border-white/5 text-zinc-600'
              } ${canNavigate ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-blue-500' : isCompleted ? 'bg-green-500' : 'bg-zinc-800'}`}></div>
                <span className="text-[9px] md:text-[11px] font-black uppercase tracking-widest whitespace-nowrap">{item.label}</span>
              </div>
              {idx < arr.length - 1 && (
                <i className="fa-solid fa-arrow-right text-[10px] opacity-10 hidden md:block"></i>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <main className="max-w-[1440px] mx-auto px-4 md:px-6 lg:px-12">
        {loadingMsg && (
          <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 text-center">
            <div className="w-16 h-16 border-2 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-6"></div>
            <p className="text-[12px] font-black uppercase tracking-[0.4em] text-blue-500">{loadingMsg}</p>
          </div>
        )}

        {/* Global Error Notice */}
        {quotaError && (
          <div className="mb-8 p-6 bg-red-600/10 border border-red-500/30 rounded-[2rem] animate-in flex items-center gap-6">
            <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-triangle-exclamation text-red-500"></i>
            </div>
            <div>
              <h4 className="text-[12px] font-black uppercase tracking-widest text-red-500 mb-1">Quota Warning</h4>
              <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-tight leading-relaxed">{quotaError}</p>
            </div>
          </div>
        )}

        {/* UPLOAD STEP */}
        {step === AppStep.UPLOAD && (
          <div className="animate-in flex flex-col items-center max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full">
              {[{id:'model', label:'Model Base'}, {id:'product', label:'Product Item'}].map(u => (
                <label key={u.id} className="aspect-[16/9] md:aspect-[16/7] bg-[#0c0c0e] rounded-[2rem] md:rounded-[3rem] border border-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/40 transition-all overflow-hidden relative group">
                  <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, u.id as any)} />
                  {state[`${u.id}Image` as keyof GenerationState] ? (
                    <img src={state[`${u.id}Image` as keyof GenerationState] as string} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="text-center opacity-40 group-hover:opacity-100 transition-opacity p-4">
                      <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="fa-solid fa-plus text-xl"></i>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]">{u.label}</p>
                    </div>
                  )}
                </label>
              ))}
            </div>

            <div className="w-full mt-8 md:mt-10 bg-[#0c0c0e] rounded-[2rem] border border-white/5 p-6 shadow-xl">
               <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500 block mb-4">
                 Custom Integration Instruction
               </label>
               <textarea 
                  value={state.promptInstruction}
                  onChange={(e) => setState(prev => ({...prev, promptInstruction: e.target.value}))}
                  placeholder="Describe exactly how the model should interact with the product..."
                  className="w-full bg-[#050506] text-[13px] text-white rounded-xl p-4 border border-white/10 outline-none focus:border-blue-600/50 h-24 resize-none transition-colors"
               />
            </div>

            <button 
              disabled={!state.modelImage || !state.productImage} 
              onClick={onRefineClick} 
              className="mt-8 md:mt-12 w-full md:w-auto bg-[#1d4ed8] hover:bg-blue-600 disabled:opacity-20 px-8 md:px-24 py-5 md:py-6 rounded-full font-black uppercase tracking-[0.2em] text-[12px] shadow-[0_15px_40px_rgba(37,99,235,0.3)] transition-all active:scale-95"
            >
              Start Refinement
            </button>
          </div>
        )}

        {/* REFINE STEP */}
        {step === AppStep.REFINE && (
          <div className="animate-in flex flex-col items-center w-full">
            <h3 className="text-[12px] md:text-[14px] font-black uppercase tracking-[0.4em] text-zinc-500 mb-8 md:mb-10 text-center">Select Preferred Variation</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 w-full max-w-6xl mb-12 px-4 md:px-0">
              {(state.combinedCandidates || [state.combinedImage]).filter(Boolean).map((img, idx) => (
                <div 
                  key={idx}
                  onClick={() => setState(prev => ({ ...prev, combinedImage: img }))}
                  className={`
                    group relative rounded-[2.5rem] md:rounded-[3rem] overflow-hidden cursor-pointer transition-all duration-500 aspect-[9/16]
                    ${state.combinedImage === img ? 'scale-[1.02] md:scale-105 z-10 shadow-2xl' : 'scale-95 opacity-80 hover:opacity-100 hover:scale-100'}
                  `}
                >
                  <div className={`absolute inset-0 ${state.combinedImage === img ? 'animated-gradient-border' : ''}`}>
                    <div className="bg-inner-card w-full h-full relative z-10">
                        <img src={img as string} className="w-full h-full object-cover" />
                    </div>
                  </div>
                  {state.combinedImage === img && (
                    <div className="absolute top-6 right-6 z-20 bg-blue-600 w-10 h-10 rounded-full flex items-center justify-center shadow-lg">
                      <i className="fa-solid fa-check text-white text-sm"></i>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="w-full max-w-4xl bg-[#0c0c0e] border border-white/5 rounded-[2.5rem] md:rounded-[3rem] p-6 md:p-8 mb-12 shadow-2xl relative">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6 text-center">Creative Direction</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">
                 {/* Inputs... */}
                 <div className="space-y-3">
                   <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 ml-4">Neon Brand Text</label>
                   <input type="text" value={state.brandingText} onChange={(e) => setState(prev => ({...prev, brandingText: e.target.value}))} placeholder="e.g. ALANA" className="w-full bg-[#050506] border border-white/10 rounded-full px-6 py-4 text-[12px] font-bold tracking-widest outline-none focus:border-blue-600/50 transition-colors placeholder:text-zinc-800"/>
                 </div>
                 <div className="space-y-3">
                   <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 ml-4">Background / Atmosphere</label>
                   <input type="text" value={state.stylePrompt} onChange={(e) => setState(prev => ({...prev, stylePrompt: e.target.value}))} placeholder="e.g. Cyberpunk City" className="w-full bg-[#050506] border border-white/10 rounded-full px-6 py-4 text-[12px] font-bold tracking-widest outline-none focus:border-blue-600/50 transition-colors placeholder:text-zinc-800"/>
                 </div>
                 <div className="space-y-3">
                   <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 ml-4">Font Style</label>
                   <select value={state.fontStyle} onChange={(e) => setState(prev => ({...prev, fontStyle: e.target.value}))} className="w-full bg-[#050506] border border-white/10 rounded-full px-6 py-4 text-[12px] font-bold tracking-widest outline-none focus:border-blue-600/50 transition-colors cursor-pointer appearance-none">
                     <option value="Modern Sans">Modern Sans</option>
                     <option value="Elegant Serif">Elegant Serif</option>
                     <option value="Bold Graffiti">Bold Graffiti</option>
                     <option value="Neon Script">Neon Script</option>
                     <option value="Futuristic Mono">Futuristic Mono</option>
                   </select>
                 </div>
                 <div className="space-y-3">
                   <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 ml-4">Text Placement</label>
                   <select value={state.textPlacement} onChange={(e) => setState(prev => ({...prev, textPlacement: e.target.value}))} className="w-full bg-[#050506] border border-white/10 rounded-full px-6 py-4 text-[12px] font-bold tracking-widest outline-none focus:border-blue-600/50 transition-colors cursor-pointer appearance-none">
                     <option value="Behind Subject">Behind Subject</option>
                     <option value="Floating Above">Floating Above</option>
                     <option value="Integrated Neon Sign">Integrated Neon</option>
                     <option value="Overlay Bottom">Overlay Bottom</option>
                     <option value="Vertical Side">Vertical Side</option>
                   </select>
                 </div>
              </div>
              
              <div className="flex justify-center">
                 <button onClick={onApplyBrandingClick} className="w-full md:w-auto bg-[#2563eb]/20 hover:bg-[#2563eb]/40 border border-[#2563eb]/50 text-[#3b82f6] px-8 md:px-12 py-4 rounded-full font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-3">
                   <i className="fa-solid fa-wand-magic-sparkles"></i>
                   Apply Style & Branding
                 </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto px-4 md:px-0">
              <button onClick={() => setStep(AppStep.UPLOAD)} className="w-full md:w-auto px-10 py-5 border border-white/10 rounded-full font-black uppercase tracking-widest text-[11px] hover:bg-white/5 transition-colors">Back</button>
              <button onClick={onGridClick} className="w-full md:w-auto bg-[#1d4ed8] hover:bg-blue-600 px-16 py-5 rounded-full font-black uppercase tracking-widest text-[11px] shadow-xl transition-all transform hover:scale-105">
                Generate Grid
              </button>
            </div>
          </div>
        )}

        {/* STORYBOARD GRID STEP */}
        {step === AppStep.STORYBOARD && (
          <div className="animate-in flex flex-col items-center px-4">
            <div className="bg-[#0c0c0e] p-4 md:p-6 rounded-[3rem] md:rounded-[4.5rem] w-full max-w-md mb-8 md:mb-12 shadow-2xl border border-white/5">
              <img src={state.storyboardGrid!} className="rounded-[2.5rem] md:rounded-[3.5rem] w-full aspect-[9/16]" />
            </div>
            <button onClick={onFinalRenderClick} className="w-full md:w-auto bg-[#1d4ed8] hover:bg-blue-600 px-12 md:px-24 py-5 md:py-6 rounded-full font-black uppercase tracking-[0.2em] text-[12px] shadow-2xl">
              Proceed to Final Render
            </button>
          </div>
        )}

        {/* 3. FINAL RENDER (RESULTS) */}
        {step === AppStep.RESULTS && (
          <div className="animate-in grid grid-cols-12 gap-8 md:gap-12">
            
            {/* Sidebar (Stacks on mobile) */}
            <aside className="col-span-12 lg:col-span-3 space-y-6 md:space-y-10 order-2 lg:order-1">
              <div className="space-y-4">
                <h3 className="text-[13px] font-black uppercase tracking-[0.3em] text-blue-500">Master Reference</h3>
                <p className="text-[11px] font-medium text-zinc-500 leading-relaxed uppercase">
                  System slicing scenes from master grid.
                </p>
              </div>

              <div className="bg-[#0c0c0e] p-4 rounded-[2.5rem] border border-white/5 overflow-hidden max-w-xs mx-auto lg:max-w-none">
                {state.storyboardGrid && <img src={state.storyboardGrid} className="rounded-[1.5rem] w-full aspect-[9/16] object-cover opacity-80" />}
              </div>
            </aside>

            {/* Main Content */}
            <section className="col-span-12 lg:col-span-9 space-y-8 md:space-y-12 order-1 lg:order-2">
              
              <div className="flex flex-col xl:flex-row justify-between items-end gap-6 md:gap-8">
                <div className="space-y-2 w-full xl:w-auto">
                  <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter italic">
                    Final <span className="text-[#4dabf7] not-italic">Render</span>
                  </h2>
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-600">Shot Selection & Motion Export</p>
                </div>
                
                {/* NEW SCI-FI PROGRESS BAR */}
                <div className="w-full xl:w-2/5">
                   <SciFiProgressBar progress={state.extractionProgress} />
                </div>
              </div>

              {/* Individual Shot Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
                {state.scenes.map((scene, idx) => (
                  <div key={scene.id} className="bg-[#0c0c0e] border border-white/5 rounded-[2.5rem] md:rounded-[3.5rem] p-5 md:p-6 flex flex-col gap-5 md:gap-6 relative group overflow-hidden">
                    
                    <div className={`aspect-[9/16] rounded-[2rem] md:rounded-[2.5rem] overflow-hidden relative shadow-2xl ${
                      (scene.isExtracting || scene.isUpscaling || scene.isGeneratingVideo) ? 'animated-gradient-border' : 'border border-white/5'
                    }`}>
                      <div className="bg-inner-card w-full h-full relative z-10">
                        {scene.image ? (
                            scene.videoUrl ? 
                            <video src={scene.videoUrl} autoPlay loop muted className="w-full h-full object-cover" /> :
                            <img src={scene.image} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-zinc-900/10">
                            {scene.isExtracting ? (
                                <>
                                <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                                <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">Slicing Shot</span>
                                </>
                            ) : (
                                <i className="fa-solid fa-image-slash text-zinc-800 text-2xl"></i>
                            )}
                            </div>
                        )}
                      </div>

                      {(scene.isExtracting || scene.isUpscaling || scene.isGeneratingVideo) && (
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in">
                          <div className="w-10 h-10 border-2 border-blue-600/10 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">Processing</p>
                        </div>
                      )}

                      {scene.image && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-3 z-40 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 w-full justify-center px-4">
                           <div className="flex bg-black/60 backdrop-blur-md rounded-2xl p-1 border border-white/10 shadow-lg">
                             <button onClick={() => onUpscale(idx, '2K')} className="px-3 py-1.5 text-[8px] font-black uppercase rounded-xl hover:bg-blue-600 transition-colors text-white">2K</button>
                             <button onClick={() => onUpscale(idx, '4K')} className="px-3 py-1.5 text-[8px] font-black uppercase rounded-xl hover:bg-blue-600 transition-colors text-white">4K</button>
                           </div>
                           <button onClick={() => onRepair(idx)} className="w-10 h-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-center hover:bg-blue-600 transition-colors shadow-lg">
                             <i className="fa-solid fa-wand-magic-sparkles text-[12px] text-white"></i>
                           </button>
                        </div>
                      )}

                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/80 px-6 py-2 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl z-40">
                        Shot 0{idx + 1}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-[#070708] rounded-2xl p-4 border border-white/5">
                        <textarea 
                          value={scenePrompts[idx]}
                          onChange={(e) => {const p = [...scenePrompts]; p[idx] = e.target.value; setScenePrompts(p);}}
                          className="w-full bg-transparent text-[11px] font-medium text-zinc-400 h-20 resize-none outline-none leading-relaxed placeholder:text-zinc-800"
                          placeholder="Subtle cinematic motion..."
                        />
                      </div>

                      <button 
                        onClick={() => onVideo(idx)}
                        disabled={!scene.image || scene.isGeneratingVideo}
                        className="w-full bg-[#12141a] hover:bg-[#1d4ed8] border border-white/5 py-4 md:py-5 rounded-2xl text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] transition-all disabled:opacity-10 active:scale-95 shadow-xl"
                      >
                        {scene.isGeneratingVideo ? 'Processing...' : 'Generate Motion'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ENTRY GATE / ACCESS CONTROL */}
      {showKeyModal && !useCustomKey && (
        <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="bg-[#0c0c0e] p-8 md:p-12 rounded-[3rem] md:rounded-[4rem] w-full max-w-md border border-blue-600/20 text-center space-y-10 shadow-2xl relative overflow-hidden">
            
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-green-500"></div>

            <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto border border-blue-500/20">
               <i className="fa-solid fa-fingerprint text-blue-500 text-2xl md:text-3xl"></i>
            </div>
            
            <div>
              <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter mb-3 italic">System Access</h2>
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Identity verification required. Connect credentials to initialize.</p>
            </div>

            {/* OPTION 1: GOOGLE PROJECT */}
            <div className="space-y-3">
               <button 
                onClick={async () => { 
                    const aistudio = (window as any).aistudio; 
                    if (aistudio) { 
                    await aistudio.openSelectKey(); 
                    setShowKeyModal(false); 
                    } 
                }}
                className="w-full bg-blue-600/20 border border-blue-600/50 text-blue-400 py-4 md:py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-[0_10px_30px_rgba(37,99,235,0.1)] hover:bg-blue-600/40 transition-colors flex items-center justify-center gap-3"
                >
                <i className="fa-brands fa-google"></i>
                Connect Google Cloud Project
                </button>
            </div>

            <div className="relative flex items-center gap-4 opacity-50">
               <div className="h-px bg-white/10 flex-1"></div>
               <span className="text-[9px] font-bold uppercase text-zinc-600">OR</span>
               <div className="h-px bg-white/10 flex-1"></div>
            </div>

            {/* OPTION 2: CUSTOM KEY (BYOK) - MANUAL INPUT WITH VALIDATION */}
            <div className="space-y-3">
               <div className="flex gap-2">
                 <div className="relative flex-1">
                    <i className={`fa-solid ${isValidatingKey ? 'fa-circle-notch fa-spin' : 'fa-key'} absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 text-xs`}></i>
                    <input 
                        type="password" 
                        value={tempApiKey}
                        onChange={(e) => setTempApiKey(e.target.value)}
                        placeholder="Enter API Key"
                        disabled={isValidatingKey}
                        className="w-full bg-[#050506] border border-white/10 rounded-xl py-4 pl-10 pr-4 text-[11px] font-mono text-white outline-none focus:border-blue-600/50 transition-colors placeholder:text-zinc-700 disabled:opacity-50"
                    />
                 </div>
                 <button 
                    onClick={handleSaveCustomKey}
                    disabled={isValidatingKey || tempApiKey.length < 5}
                    className="bg-[#1e1e24] hover:bg-blue-600 disabled:opacity-50 border border-white/5 text-white w-12 rounded-xl flex items-center justify-center transition-all duration-300"
                 >
                    <i className={`fa-solid ${isValidatingKey ? 'fa-spinner fa-spin' : 'fa-arrow-right'} text-xs`}></i>
                 </button>
               </div>
               
               {keyError && (
                 <p className="text-[9px] text-red-500 font-bold uppercase tracking-wide animate-in">
                   {keyError}
                 </p>
               )}

               <p className="text-[9px] text-zinc-600 uppercase tracking-wide">
                   <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-zinc-500 hover:text-white underline">Get Paid Key</a> for full features.
               </p>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default App;
