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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hasKey, setHasKey] = useState<boolean>(false);
  
  const [state, setState] = useState<GenerationState>({
    modelImage: null,
    productImage: null,
    combinedImage: null,
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
      const key = process.env.API_KEY;
      if (key && key !== 'undefined' && key.length > 5) {
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeyPicker = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
      setError(null);
    } else {
      setError("Setup Manual Diperlukan: Isi API_KEY di file .env atau hardcode di geminiService.ts");
    }
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
      setError("KONFIGURASI KEY DIBUTUHKAN: Periksa instruksi GitHub Anda untuk setup API_KEY.");
    } else {
      setError(msg);
    }
  };

  const startProcessing = async () => {
    if (!state.modelImage || !state.productImage) return;
    setError(null);
    setLoadingMsg("Processing AI Assets...");
    startProgress();
    try {
      const combined = await generateCombinedImage(state.modelImage, state.productImage, setRetryMsg);
      setState(prev => ({ ...prev, combinedImage: combined }));
      setStep(AppStep.REFINE);
    } catch (err: any) { handleError(err); } finally { setLoadingMsg(''); stopProgress(); }
  };

  const handleRefine = async () => {
    if (!state.combinedImage) return;
    setError(null);
    setLoadingMsg("Refining Details...");
    startProgress();
    try {
      const refined = await refineAndCustomize(state.combinedImage, options.background, options.backgroundRef, options.lightingRef, options.neonText, options.fontStyle, setRetryMsg);
      setState(prev => ({ ...prev, combinedImage: refined }));
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
        if (i < 8) await new Promise(r => setTimeout(r, 3000));
      } catch (err: any) {
        handleError(err);
        break;
      }
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

  const steps = [
    { id: AppStep.UPLOAD, label: 'Asset Intake', icon: 'fa-upload', isUnlocked: true },
    { id: AppStep.REFINE, label: 'AI Customizer', icon: 'fa-sliders', isUnlocked: !!state.combinedImage },
    { id: AppStep.STORYBOARD, label: 'Master View', icon: 'fa-layer-group', isUnlocked: !!state.storyboardGrid },
    { id: AppStep.RESULTS, label: 'Final Render', icon: 'fa-circle-check', isUnlocked: state.scenes.some(s => s.image !== null) },
  ];

  return (
    <div className="min-h-screen flex bg-[#0a0a0b] text-zinc-100 font-sans selection:bg-blue-500/30">
      <aside className="w-80 bg-[#0f0f11] border-r border-white/5 flex flex-col p-8 z-50 h-screen sticky top-0">
        <div className="flex items-center gap-3 mb-20 group cursor-pointer" onClick={() => window.location.reload()}>
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] group-hover:scale-105 transition-transform">
            <i className="fa-solid fa-bolt-lightning text-white text-sm"></i>
          </div>
          <span className="text-sm font-black tracking-tight uppercase">Multishot <span className="text-blue-500 italic">Pro</span></span>
        </div>

        <nav className="flex-1 space-y-2">
          {steps.map((s) => (
            <button key={s.id} disabled={!s.isUnlocked} onClick={() => setStep(s.id)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all text-left group ${step === s.id ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-zinc-500 hover:bg-white/5'} ${!s.isUnlocked ? 'opacity-30 cursor-not-allowed' : ''}`}>
              <i className={`fa-solid ${s.icon} text-xs ${step === s.id ? 'text-blue-400' : 'text-zinc-600'}`}></i>
              <span className="font-bold text-[11px] uppercase tracking-wider">{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-black/40 border border-white/5">
             <div className={`w-2 h-2 rounded-full ${hasKey ? 'bg-green-500' : 'bg-zinc-700 animate-pulse'}`}></div>
             <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{hasKey ? 'API Connected' : 'Setup Required'}</span>
          </div>
          <button onClick={handleOpenKeyPicker} className="w-full py-4 text-[11px] font-bold text-white bg-zinc-800 hover:bg-zinc-700 uppercase tracking-wider rounded-2xl transition-all border border-white/5">
            Config API Key
          </button>
        </div>
      </aside>

      <main className="flex-1 relative bg-[#0a0a0b]">
        {(loadingMsg || retryMsg) && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-3xl px-10">
            <div className="w-full max-w-lg space-y-8 text-center animate-up">
              <div className="space-y-3">
                <h2 className="text-3xl font-extrabold tracking-tight text-white uppercase">{loadingMsg || 'Processing...'}</h2>
                <p className="text-sm font-medium text-blue-400 uppercase tracking-[0.3em] h-5">{retryMsg}</p>
              </div>

              <div className="relative w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="absolute top-0 left-0 h-full bg-blue-600 transition-all duration-300 ease-out progress-shimmer" 
                  style={{ width: `${loadingProgress}%` }}
                ></div>
              </div>

              <div className="flex justify-between items-center text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                <span>System Synchronizing</span>
                <span className="text-white text-lg">{Math.floor(loadingProgress)}%</span>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-10 py-20">
          {error && (
            <div className="mb-12 p-8 bg-red-600/5 border border-red-500/20 rounded-3xl flex items-center gap-6 animate-up">
              <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center text-red-400"><i className="fa-solid fa-triangle-exclamation"></i></div>
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-red-400 mb-1">{error}</p>
                <p className="text-[11px] text-zinc-500 font-medium">Please check your configuration or try again.</p>
              </div>
            </div>
          )}

          {step === AppStep.UPLOAD && (
            <div className="grid lg:grid-cols-2 gap-10 animate-up">
              {[ {t: 'Model Subject', d: 'model', icon: 'fa-user-tie'}, {t: 'Product Asset', d: 'product', icon: 'fa-bag-shopping'} ].map((u) => (
                <div key={u.d} className="bg-[#0f0f11] p-10 rounded-[2.5rem] border border-white/5 group">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">{u.t}</h3>
                    <i className={`fa-solid ${u.icon} text-zinc-800 text-xl group-hover:text-blue-500 transition-colors`}></i>
                  </div>
                  <label className="w-full h-[400px] border-2 border-dashed border-zinc-900 hover:border-blue-500/30 rounded-3xl flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all bg-black/20 hover:bg-blue-500/5">
                    {(state as any)[`${u.d}Image`] ? 
                      <img src={(state as any)[`${u.d}Image`]} className="w-full h-full object-contain p-8" alt={u.t} /> : 
                      <div className="text-center">
                        <i className="fa-solid fa-plus-circle text-3xl mb-4 text-zinc-800 group-hover:text-blue-500/50"></i>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">Select Asset</p>
                      </div>
                    }
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, u.d as any)} />
                  </label>
                </div>
              ))}
              <div className="lg:col-span-2 flex justify-center mt-12">
                <button disabled={!state.modelImage || !state.productImage} onClick={startProcessing} className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-900 disabled:text-zinc-700 px-20 py-7 rounded-full font-bold uppercase tracking-[0.2em] text-[13px] shadow-2xl transition-all active:scale-95">Generate Composition</button>
              </div>
            </div>
          )}

          {step === AppStep.REFINE && state.combinedImage && (
            <div className="grid lg:grid-cols-2 gap-16 animate-up">
              <div className="bg-[#0f0f11] p-4 rounded-[3rem] border border-white/5 sticky top-10 shadow-2xl">
                <img src={state.combinedImage} className="w-full rounded-[2.5rem] aspect-[9/16] object-cover bg-black" />
              </div>
              <div className="space-y-10 py-6">
                <div className="space-y-2">
                  <h2 className="text-5xl font-extrabold tracking-tight uppercase leading-none">Studio <span className="text-blue-500 italic">Mastering</span></h2>
                  <p className="text-[11px] font-bold text-zinc-600 uppercase tracking-[0.5em]">Phase 02 • Refinement</p>
                </div>
                
                <div className="space-y-8 bg-[#0f0f11] p-10 rounded-3xl border border-white/5">
                  <div className="space-y-4">
                    <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Background Setting</label>
                    <textarea value={options.background} onChange={(e) => setOptions(o => ({...o, background: e.target.value}))} className="w-full bg-black/40 border border-white/5 rounded-2xl p-6 text-sm h-32 resize-none outline-none focus:border-blue-500/20 font-medium transition-all" />
                  </div>
                  <div className="space-y-4">
                    <label className="block text-[11px] font-bold text-blue-500 uppercase tracking-widest">Brand Neon Identity</label>
                    <input type="text" value={options.neonText} onChange={(e) => setOptions(o => ({...o, neonText: e.target.value}))} className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-sm font-bold uppercase tracking-wider outline-none focus:border-blue-500/20" />
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <button onClick={handleRefine} className="py-5 rounded-2xl border border-white/5 hover:bg-white/5 font-bold text-[11px] uppercase tracking-wider transition-all">Refresh Environment</button>
                  <button onClick={goToStoryboard} className="py-7 rounded-full bg-blue-600 hover:bg-blue-500 font-bold uppercase tracking-[0.2em] text-[13px] shadow-2xl transition-all active:scale-95">Commit Storyboard</button>
                </div>
              </div>
            </div>
          )}

          {step === AppStep.STORYBOARD && state.storyboardGrid && (
            <div className="max-w-3xl mx-auto flex flex-col items-center animate-up">
              <div className="text-center mb-16 space-y-4">
                <h2 className="text-5xl font-extrabold tracking-tight uppercase">Master <span className="text-blue-500">Grid</span></h2>
                <p className="text-[11px] font-bold text-zinc-600 uppercase tracking-[0.5em]">Multishot Composition Preview</p>
              </div>
              <div className="bg-[#0f0f11] p-4 rounded-[3.5rem] mb-12 border border-white/5 shadow-2xl">
                <img src={state.storyboardGrid} className="w-full rounded-[3rem] aspect-[9/16] object-cover shadow-2xl" />
              </div>
              <button onClick={startExtraction} className="bg-blue-600 hover:bg-blue-500 px-24 py-8 rounded-full font-bold text-[13px] uppercase tracking-[0.3em] shadow-2xl transition-all active:scale-95">Start Asset Extraction</button>
            </div>
          )}

          {step === AppStep.RESULTS && (
            <div className="animate-up flex flex-col lg:flex-row gap-12">
              {/* MASTER STORYBOARD PREVIEW (SIDEBAR IN RESULTS) */}
              <div className="lg:w-1/4 space-y-8">
                <div className="sticky top-10 space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.3em]">Master Source</h3>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">3x3 Storyboard Reference</p>
                  </div>
                  <div className="bg-[#0f0f11] p-3 rounded-[2rem] border border-white/10 shadow-2xl">
                    <img src={state.storyboardGrid || ''} className="w-full rounded-[1.5rem] aspect-[9/16] object-cover opacity-80" />
                  </div>
                  <div className="p-6 bg-blue-600/5 border border-blue-500/10 rounded-2xl">
                    <p className="text-[9px] font-bold text-zinc-400 uppercase leading-relaxed">System is extracting single frames from this grid for separate processing.</p>
                  </div>
                </div>
              </div>

              {/* FINAL OUTPUTS - STRICT GRID 3 COLS */}
              <div className="lg:w-3/4 space-y-12">
                <div className="flex justify-between items-end px-2">
                  <div className="space-y-2">
                    <h2 className="text-5xl font-extrabold tracking-tight uppercase leading-none">Output <span className="text-blue-500">Vault</span></h2>
                    <p className="text-[11px] font-bold text-zinc-600 uppercase tracking-[0.5em]">Phase 04 • Individual Scenics</p>
                  </div>
                  <div className="text-right space-y-3">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Progress: {state.extractionProgress}%</span>
                    <div className="w-48 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-blue-600 transition-all duration-1000 progress-shimmer" style={{ width: `${state.extractionProgress}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {state.scenes.map((scene, idx) => (
                    <div key={scene.id} className="bg-[#0f0f11] p-5 rounded-[2.5rem] border border-white/5 flex flex-col group shadow-xl">
                      {/* SINGLE FRAME PREVIEW */}
                      <div className="aspect-[9/16] bg-black rounded-3xl overflow-hidden relative mb-5 border border-white/5">
                        {scene.image ? (
                          <>
                            {scene.videoUrl ? 
                              <video src={scene.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline /> : 
                              <img src={scene.image} className="w-full h-full object-cover animate-up" alt={`Scene ${idx+1}`} />
                            }
                            <div className="absolute top-4 right-4 flex flex-col gap-2 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
                              <a href={scene.videoUrl || scene.image} download className="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center shadow-2xl hover:bg-blue-600 hover:text-white transition-all">
                                <i className="fa-solid fa-download text-xs"></i>
                              </a>
                            </div>
                            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border border-white/5">
                              Frame {idx+1}
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {scene.isExtracting ? 
                              <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div> : 
                              <i className="fa-solid fa-hourglass-start opacity-10 text-3xl"></i>
                            }
                          </div>
                        )}
                      </div>

                      {scene.image && !scene.videoUrl && (
                        <div className="space-y-4">
                          <textarea 
                            placeholder="Describe motion..." 
                            value={scenePrompts[idx]} 
                            onChange={(e) => { const n = [...scenePrompts]; n[idx] = e.target.value; setScenePrompts(n); }} 
                            className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-[10px] h-20 resize-none outline-none font-medium leading-relaxed focus:border-blue-500/20 text-zinc-400" 
                          />
                          <button 
                            disabled={scene.isGeneratingVideo} 
                            onClick={() => handleGenerateVideo(scene.id)} 
                            className="w-full py-4 rounded-xl bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider transition-all"
                          >
                            {scene.isGeneratingVideo ? 'Rendering Video...' : 'Generate Motion'}
                          </button>
                        </div>
                      )}
                      
                      {scene.videoUrl && (
                        <div className="py-2 text-center">
                          <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                            Render Complete
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
    </div>
  );
};

export default App;