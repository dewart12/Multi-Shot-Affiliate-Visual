import React, { useState, useEffect, useRef } from 'react';
import { AppStep, GenerationState, CustomizationOptions } from './types.ts';
import { 
  generateCombinedImage, 
  refineAndCustomize, 
  generateStoryboardGrid, 
  extractCell,
  generateSceneVideo
} from './services/geminiService.ts';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [userApiKey, setUserApiKey] = useState<string>('');
  
  const [state, setState] = useState<GenerationState>({
    modelImage: null,
    productImage: null,
    combinedImage: null,
    combinedCandidates: null,
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
  const [options, setOptions] = useState<CustomizationOptions>({
    background: 'Luxury minimalist modern prayer room, cinematic lighting',
    backgroundRef: 'Minimalist Zen',
    lightingRef: 'Cinematic Soft Golden Hour',
    neonText: 'ALANA ZIVANA',
    fontStyle: 'Elegant Script'
  });
  
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [retryMsg, setRetryMsg] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const progressIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const checkKey = () => {
      const storedKey = localStorage.getItem('GEMINI_API_KEY');
      const envKey = process.env.API_KEY;
      if ((storedKey && storedKey.length > 5) || (envKey && envKey !== 'undefined' && envKey.length > 5)) {
        setHasKey(true);
        if (storedKey) setUserApiKey(storedKey);
      }
    };
    checkKey();
  }, []);

  const saveApiKey = () => {
    if (userApiKey.trim().length > 5) {
      localStorage.setItem('GEMINI_API_KEY', userApiKey.trim());
      setHasKey(true);
      setShowKeyModal(false);
      setError(null);
    } else {
      alert("Please enter a valid API Key.");
    }
  };

  const clearApiKey = () => {
    localStorage.removeItem('GEMINI_API_KEY');
    setUserApiKey('');
    setHasKey(false);
  };

  const handleOpenKeyPicker = () => {
    setShowKeyModal(true);
  };

  const startProgress = () => {
    setLoadingProgress(0);
    progressIntervalRef.current = window.setInterval(() => {
      setLoadingProgress(prev => (prev >= 98 ? prev : parseFloat((prev + 0.5).toFixed(1))));
    }, 200);
  };

  const stopProgress = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setLoadingProgress(100);
    setTimeout(() => setLoadingProgress(0), 500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'model' | 'product') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setState(prev => ({ ...prev, [type === 'model' ? 'modelImage' : 'productImage']: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleError = (err: any) => {
    const msg = err.message || "An unexpected error occurred.";
    if (msg.includes("API_KEY")) {
      setError("API KEY REQUIRED: Please provide a valid Gemini API Key from your Google AI Studio dashboard.");
      setShowKeyModal(true);
    } else {
      setError(msg);
    }
  };

  const startProcessing = async () => {
    if (!state.modelImage || !state.productImage) return;
    setError(null);
    setLoadingMsg("Generating 3 Variations...");
    startProgress();
    try {
      const results = await Promise.all([
        generateCombinedImage(state.modelImage, state.productImage, (m) => setRetryMsg(`Var 1: ${m}`)),
        generateCombinedImage(state.modelImage, state.productImage, (m) => setRetryMsg(`Var 2: ${m}`)),
        generateCombinedImage(state.modelImage, state.productImage, (m) => setRetryMsg(`Var 3: ${m}`))
      ]);
      setState(prev => ({ ...prev, combinedCandidates: results, combinedImage: results[0] }));
      setStep(AppStep.REFINE);
    } catch (err: any) { handleError(err); } finally { setLoadingMsg(''); stopProgress(); }
  };

  const handleRefine = async () => {
    if (!state.combinedImage) return;
    setError(null);
    setLoadingMsg("Refining Selected Image...");
    startProgress();
    try {
      const refined = await refineAndCustomize(state.combinedImage, options.background, options.backgroundRef, options.lightingRef, options.neonText, options.fontStyle, setRetryMsg);
      setState(prev => ({ 
        ...prev, 
        combinedImage: refined,
        combinedCandidates: prev.combinedCandidates?.map(c => c === prev.combinedImage ? refined : c) || null
      }));
    } catch (err: any) { handleError(err); } finally { setLoadingMsg(''); stopProgress(); }
  };

  const goToStoryboard = async () => {
    if (!state.combinedImage) return;
    setError(null);
    setLoadingMsg("Generating Master Storyboard...");
    startProgress();
    try {
      const grid = await generateStoryboardGrid(state.combinedImage, options.neonText, setRetryMsg);
      setState(prev => ({ ...prev, storyboardGrid: grid }));
      setStep(AppStep.STORYBOARD);
    } catch (err: any) { handleError(err); } finally { setLoadingMsg(''); stopProgress(); }
  };

  const startExtraction = async () => {
    setStep(AppStep.RESULTS);
    setError(null);
    for (let i = 0; i < 9; i++) {
      setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === i ? { ...s, isExtracting: true } : s) }));
      try {
        const img = await extractCell(state.storyboardGrid!, i, (msg) => setRetryMsg(`Extracting Frame ${i+1}: ${msg}`));
        setState(prev => ({
          ...prev,
          scenes: prev.scenes.map(s => s.id === i ? { ...s, image: img, isExtracting: false } : s),
          extractionProgress: Math.round(((i + 1) / 9) * 100)
        }));
        setRetryMsg('');
        if (i < 8) await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) { handleError(err); break; }
    }
  };

  const handleGenerateVideo = async (id: number) => {
    const scene = state.scenes[id];
    if (!scene.image) return;
    setError(null);
    setState(prev => ({...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, isGeneratingVideo: true } : s)}));
    try {
      const videoUrl = await generateSceneVideo(scene.image, scenePrompts[id]);
      setState(prev => ({...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, videoUrl, isGeneratingVideo: false } : s)}));
    } catch (err: any) {
      handleError(err);
      setState(prev => ({...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, isGeneratingVideo: false } : s)}));
    }
  };

  const workflowSteps = [
    { id: AppStep.UPLOAD, label: 'Upload Assets', isCompleted: !!state.modelImage && !!state.productImage },
    { id: AppStep.REFINE, label: 'Refine Image', isCompleted: !!state.combinedCandidates },
    { id: AppStep.STORYBOARD, label: 'Storyboard Grid', isCompleted: !!state.storyboardGrid },
    { id: AppStep.RESULTS, label: 'Final Render', isCompleted: state.scenes.some(s => s.image !== null) },
  ];

  const currentStepIdx = workflowSteps.findIndex(s => s.id === step);

  return (
    <div className="min-h-screen bg-[#080809] text-zinc-100 selection:bg-blue-500/30">
      
      {/* BYOK MODAL */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <div className="w-full max-w-md bg-[#121214] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl animate-up">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase tracking-widest">API Configuration</h2>
              <button onClick={() => setShowKeyModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="space-y-6">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest leading-relaxed">
                Enter your Google Gemini API Key. To use Veo Video Generation, ensure you use a key from a paid GCP project.
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="block mt-2 text-blue-500 hover:underline">Billing Documentation →</a>
              </p>
              <input 
                type="password" 
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                placeholder="Paste AI Studio Key here..."
                className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-sm font-mono outline-none focus:border-blue-500/30 transition-all text-white"
              />
              <div className="flex gap-4">
                <button onClick={saveApiKey} className="flex-1 bg-blue-600 hover:bg-blue-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Save Key</button>
                <button onClick={clearApiKey} className="px-6 border border-white/5 hover:bg-white/5 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-zinc-500">Clear</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER WITH WORKFLOW DIAGRAM */}
      <header className="sticky top-0 z-[60] bg-[#080809]/80 backdrop-blur-xl border-b border-white/5 pt-12 pb-8">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <div className="flex flex-col items-center gap-10">
            <div className="flex flex-col items-center gap-4">
              <h1 className="text-xl md:text-3xl lg:text-4xl font-black uppercase tracking-tight text-white text-center">
                UGC AI Affiliate Storyboard Scene
              </h1>
              <button 
                onClick={handleOpenKeyPicker} 
                className={`flex items-center gap-3 px-6 py-2 rounded-full border transition-all text-[9px] font-black uppercase tracking-widest ${hasKey ? 'border-green-500/20 bg-green-500/5 text-green-500' : 'border-blue-500/20 bg-blue-500/5 text-blue-500'}`}
              >
                <i className={`fa-solid ${hasKey ? 'fa-check-circle' : 'fa-key'}`}></i>
                {hasKey ? 'API Key Connected' : 'Connect Gemini API'}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 w-full">
              {workflowSteps.map((ws, idx) => (
                <React.Fragment key={ws.id}>
                  <div 
                    className={`relative px-4 md:px-8 py-3 md:py-5 rounded-2xl border transition-all duration-500 flex items-center gap-2 md:gap-3 overflow-hidden ${
                      step === ws.id 
                        ? 'border-blue-500/50 bg-blue-500/5 shadow-[0_0_30px_rgba(59,130,246,0.1)]' 
                        : idx < currentStepIdx 
                          ? 'border-green-500/30 bg-green-500/5 opacity-70' 
                          : 'border-white/5 bg-zinc-900/50 opacity-40'
                    }`}
                  >
                    {idx < currentStepIdx && (
                      <div className="absolute inset-0 bg-green-500/10 animate-pulse"></div>
                    )}
                    <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${idx < currentStepIdx ? 'bg-green-500' : step === ws.id ? 'bg-blue-500 animate-ping' : 'bg-zinc-700'}`}></div>
                    <span className={`text-[9px] md:text-[11px] font-bold uppercase tracking-widest ${step === ws.id ? 'text-white' : idx < currentStepIdx ? 'text-green-500' : 'text-zinc-500'}`}>
                      {ws.label}
                    </span>
                  </div>
                  {idx < workflowSteps.length - 1 && (
                    <div className="w-6 md:w-10 flex justify-center">
                      <i className={`fa-solid fa-arrow-right-long text-[10px] md:text-xs ${idx < currentStepIdx ? 'text-green-500/30' : 'text-zinc-800'}`}></i>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="relative z-10">
        {(loadingMsg || retryMsg) && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-3xl px-10">
            <div className="w-full max-w-lg space-y-8 text-center animate-up">
              <div className="space-y-3">
                <h2 className="text-3xl font-extrabold tracking-tight text-white uppercase">{loadingMsg || 'Processing...'}</h2>
                <p className="text-sm font-medium text-blue-400 uppercase tracking-[0.3em] h-5">{retryMsg}</p>
              </div>
              <div className="relative w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                <div className="absolute top-0 left-0 h-full bg-blue-600 transition-all duration-300 ease-out progress-shimmer" style={{ width: `${loadingProgress}%` }}></div>
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                <span>Synchronizing Assets</span>
                <span className="text-white">{Math.floor(loadingProgress)}%</span>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-6 md:px-10 py-16">
          {error && (
            <div className="mb-12 p-8 bg-red-600/5 border border-red-500/20 rounded-[2rem] flex items-center gap-6 animate-up">
              <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center text-red-400"><i className="fa-solid fa-triangle-exclamation"></i></div>
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-red-400 mb-1">{error}</p>
                <p className="text-[11px] text-zinc-500 font-medium">Please verify your connection or API configuration.</p>
              </div>
              <button onClick={handleOpenKeyPicker} className="px-6 py-3 bg-zinc-800 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider">Configure Key</button>
            </div>
          )}

          {step === AppStep.UPLOAD && (
            <div className="grid lg:grid-cols-2 gap-10 animate-up">
              {[ {t: 'Model Subject', d: 'model', i: 'fa-user-tie'}, {t: 'Product Asset', d: 'product', i: 'fa-bag-shopping'} ].map((u) => (
                <div key={u.d} className="bg-[#0f0f11] p-10 rounded-[2.5rem] border border-white/5 group transition-all hover:border-white/10">
                  <div className="flex items-center justify-between mb-8 px-2">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-zinc-500">{u.t}</h3>
                    <i className={`fa-solid ${u.i} text-zinc-800 text-lg group-hover:text-blue-500 transition-all`}></i>
                  </div>
                  <label className="w-full h-[450px] border-2 border-dashed border-zinc-900 hover:border-blue-500/30 rounded-3xl flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all bg-black/20 hover:bg-blue-500/5">
                    {(state as any)[`${u.d}Image`] ? 
                      <img src={(state as any)[`${u.d}Image`]} className="w-full h-full object-contain p-8 animate-up" /> : 
                      <div className="text-center group-hover:scale-110 transition-transform">
                        <i className="fa-solid fa-plus-circle text-2xl mb-4 text-zinc-800 group-hover:text-blue-500/50"></i>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-700">Select Input</p>
                      </div>
                    }
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, u.d as any)} />
                  </label>
                </div>
              ))}
              <div className="lg:col-span-2 flex justify-center mt-12">
                <button disabled={!state.modelImage || !state.productImage} onClick={startProcessing} className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-900 disabled:text-zinc-800 px-24 py-8 rounded-full font-black uppercase tracking-[0.3em] text-[12px] shadow-2xl transition-all active:scale-95">
                  Merge & Sync Assets
                </button>
              </div>
            </div>
          )}

          {step === AppStep.REFINE && state.combinedCandidates && (
            <div className="flex flex-col gap-12 animate-up">
              <div className="flex flex-col md:flex-row justify-between items-center md:items-end border-b border-white/5 pb-8 gap-6">
                <div className="space-y-3 text-center md:text-left">
                  <h2 className="text-3xl md:text-4xl font-black tracking-tight uppercase">AI <span className="text-blue-500 italic">Candidate</span> Selector</h2>
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.5em]">Choose the most optimal composition to move forward</p>
                </div>
                <button onClick={startProcessing} className="w-full md:w-auto px-8 py-5 rounded-2xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-800 text-[10px] font-black uppercase tracking-widest transition-all">
                  <i className="fa-solid fa-rotate-right mr-3 text-blue-500"></i> Regenerate Variants
                </button>
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                {state.combinedCandidates.map((candidate, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setState(s => ({...s, combinedImage: candidate}))}
                    className={`relative p-3 rounded-[3rem] border-2 transition-all duration-500 cursor-pointer group ${state.combinedImage === candidate ? 'border-blue-500 bg-blue-500/5 scale-105 shadow-2xl z-10' : 'border-white/5 bg-[#0f0f11] hover:border-white/20'}`}
                  >
                    <img src={candidate} className="w-full rounded-[2.5rem] aspect-[9/16] object-cover" />
                    <div className={`absolute top-8 right-8 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${state.combinedImage === candidate ? 'bg-blue-500 border-white text-white shadow-xl' : 'bg-black/60 border-white/10 text-transparent'}`}>
                      <i className="fa-solid fa-check text-xs"></i>
                    </div>
                    <div className="mt-6 text-center">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${state.combinedImage === candidate ? 'text-blue-400' : 'text-zinc-600'}`}>Candidate 0{idx + 1}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-12 mt-12 bg-[#0f0f11] p-6 md:p-12 rounded-[3.5rem] border border-white/5">
                <div className="space-y-10">
                  <div className="space-y-4">
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Environment Customization</label>
                    <textarea value={options.background} onChange={(e) => setOptions(o => ({...o, background: e.target.value}))} className="w-full bg-black/40 border border-white/10 rounded-3xl p-6 md:p-8 text-sm h-32 resize-none outline-none focus:border-blue-500/30 font-medium transition-all text-zinc-300" />
                  </div>
                  <div className="space-y-4">
                    <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Brand Identity (Neon)</label>
                    <input type="text" value={options.neonText} onChange={(e) => setOptions(o => ({...o, neonText: e.target.value}))} className="w-full bg-black/40 border border-white/10 rounded-2xl px-8 py-5 text-sm font-bold uppercase tracking-wider outline-none focus:border-blue-500/30" />
                  </div>
                  <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                    <button onClick={handleRefine} className="flex-1 py-6 rounded-2xl border border-white/5 hover:bg-white/5 font-black text-[10px] uppercase tracking-widest transition-all">Refine Selection</button>
                    <button onClick={goToStoryboard} className="flex-1 py-6 rounded-2xl bg-blue-600 hover:bg-blue-500 font-black uppercase tracking-widest text-[10px] shadow-2xl transition-all shadow-blue-600/20">Finalize Composition</button>
                  </div>
                </div>
                
                <div className="flex flex-col justify-center space-y-6 p-10 bg-blue-600/5 rounded-[2.5rem] border border-blue-500/10">
                   <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400"><i className="fa-solid fa-wand-magic-sparkles"></i></div>
                   <h4 className="text-[12px] font-black uppercase text-blue-400 tracking-widest">Optimized Integration</h4>
                   <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">Select the candidate with the sharpest facial details and product texture. Use the Refine tool to adjust the background environment or lighting conditions before committing to the storyboard.</p>
                </div>
              </div>
            </div>
          )}

          {step === AppStep.STORYBOARD && state.storyboardGrid && (
            <div className="max-w-4xl mx-auto flex flex-col items-center animate-up">
              <div className="text-center mb-20 space-y-4">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight uppercase">Master <span className="text-blue-500">Grid</span> Generation</h2>
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.5em]">Phase 03 • 3x3 Composition Preview</p>
              </div>
              <div className="bg-[#0f0f11] p-4 rounded-[3rem] md:rounded-[4rem] mb-16 border border-white/5 shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
                <img src={state.storyboardGrid} className="w-full rounded-[2.5rem] md:rounded-[3.5rem] aspect-[9/16] object-cover" />
              </div>
              <button onClick={startExtraction} className="bg-blue-600 hover:bg-blue-500 px-16 md:px-28 py-6 md:py-9 rounded-full font-black text-[11px] md:text-[13px] uppercase tracking-[0.4em] shadow-2xl transition-all active:scale-95 shadow-blue-600/20">
                Execute Frame Extraction
              </button>
            </div>
          )}

          {step === AppStep.RESULTS && (
            <div className="animate-up flex flex-col lg:flex-row gap-16">
              <aside className="lg:w-1/4">
                <div className="sticky top-48 space-y-8">
                  <div className="space-y-4 text-center md:text-left">
                    <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em]">Master Reference</h3>
                    <p className="text-[10px] text-zinc-600 uppercase font-bold leading-relaxed">System is slicing individual scenes from the master grid for motion rendering.</p>
                  </div>
                  <div className="bg-[#0f0f11] p-4 rounded-[3rem] border border-white/10 shadow-2xl">
                    <img src={state.storyboardGrid || ''} className="w-full rounded-[2.5rem] aspect-[9/16] object-cover opacity-60 hover:opacity-100 transition-opacity cursor-zoom-in" />
                  </div>
                  <div className="text-center">
                     <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] bg-blue-500/5 px-6 py-3 rounded-full border border-blue-500/10">Extraction Active</span>
                  </div>
                </div>
              </aside>

              <div className="lg:w-3/4 space-y-16">
                <div className="flex flex-col md:flex-row justify-between items-center md:items-end border-b border-white/5 pb-10 gap-6">
                  <div className="space-y-4 text-center md:text-left">
                    <h2 className="text-4xl md:text-5xl font-black tracking-tight uppercase">Final <span className="text-blue-500">Render</span></h2>
                    <p className="text-[10px] md:text-[11px] font-bold text-zinc-600 uppercase tracking-[0.5em]">Individual Shot Selection & Motion Export</p>
                  </div>
                  <div className="text-right space-y-4 w-full md:w-auto">
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest block md:inline">Global Progress: {state.extractionProgress}%</span>
                    <div className="w-full md:w-56 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-blue-600 transition-all duration-1000 progress-shimmer" style={{ width: `${state.extractionProgress}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {state.scenes.map((scene, idx) => (
                    <div key={scene.id} className="bg-[#0f0f11] p-6 rounded-[3rem] border border-white/5 flex flex-col group shadow-xl hover:border-blue-500/20 transition-all">
                      <div className="aspect-[9/16] bg-black rounded-[2.5rem] overflow-hidden relative mb-6 border border-white/5 shadow-inner">
                        {scene.image ? (
                          <>
                            {scene.videoUrl ? 
                              <video src={scene.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline /> : 
                              <img src={scene.image} className="w-full h-full object-cover animate-up" />
                            }
                            <div className="absolute top-5 right-5 flex flex-col gap-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
                              <a href={scene.videoUrl || scene.image} download className="w-12 h-12 bg-white text-black rounded-2xl flex items-center justify-center shadow-2xl hover:bg-blue-600 hover:text-white transition-all">
                                <i className="fa-solid fa-download text-sm"></i>
                              </a>
                            </div>
                            <div className="absolute bottom-5 left-5 bg-black/70 backdrop-blur-xl px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 shadow-2xl">
                              Shot 0{idx+1}
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-4 opacity-30">
                            {scene.isExtracting ? 
                              <div className="w-10 h-10 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div> : 
                              <i className="fa-solid fa-image text-3xl"></i>
                            }
                            <span className="text-[10px] font-black uppercase tracking-widest">Waiting</span>
                          </div>
                        )}
                      </div>

                      {scene.image && !scene.videoUrl && (
                        <div className="space-y-4 animate-up">
                          <textarea 
                            placeholder="Input motion directions..." 
                            value={scenePrompts[idx]} 
                            onChange={(e) => { const n = [...scenePrompts]; n[idx] = e.target.value; setScenePrompts(n); }} 
                            className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-[10px] h-24 resize-none outline-none font-medium leading-relaxed focus:border-blue-500/20 text-zinc-500 placeholder:text-zinc-800" 
                          />
                          <button 
                            disabled={scene.isGeneratingVideo} 
                            onClick={() => handleGenerateVideo(scene.id)} 
                            className="w-full py-5 rounded-2xl bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                          >
                            {scene.isGeneratingVideo ? 'Rendering...' : 'Generate Motion'}
                          </button>
                        </div>
                      )}
                      
                      {scene.videoUrl && (
                        <div className="py-2 text-center animate-up">
                          <span className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em] bg-green-500/10 px-8 py-3 rounded-full border border-green-500/20">
                            Export Ready
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="py-20 border-t border-white/5 opacity-20 text-center">
         <span className="text-[9px] font-black uppercase tracking-[1em]">Engineered for Affiliate Excellence</span>
      </footer>
    </div>
  );
};

export default App;