
import React, { useState, useEffect, useRef } from 'react';
import { AppStep, GenerationState, CustomizationOptions, SceneFrame } from './types';
import { 
  checkApiKey, 
  openApiKeySelector, 
  generateCombinedImage, 
  refineAndCustomize, 
  generateStoryboardGrid, 
  extractCell,
  generateSceneVideo,
  upscaleScene
} from './services/geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
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

  const [scenePrompts, setScenePrompts] = useState<string[]>(Array(9).fill("Subtle cinematic motion, the model moves naturally, elegant flow of the mukena fabric."));
  
  const [options, setOptions] = useState<CustomizationOptions>({
    background: 'Luxury minimalist modern prayer room, marble floor, soft sunlight through slats, cinematic lighting',
    backgroundRef: 'Minimalist Zen',
    lightingRef: 'Cinematic Soft Golden Hour',
    neonText: 'ALANA ZIVANA',
    fontStyle: 'Elegant Script'
  });
  
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const progressIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const init = async () => {
      const ok = await checkApiKey();
      setHasApiKey(ok);
    };
    init();
  }, []);

  const startProgress = () => {
    setLoadingProgress(0);
    progressIntervalRef.current = window.setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 98) return prev;
        const increment = Math.max(0.1, (100 - prev) / 40);
        return parseFloat((prev + increment).toFixed(1));
      });
    }, 200);
  };

  const stopProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setLoadingProgress(100);
    setTimeout(() => setLoadingProgress(0), 500);
  };

  const handleKeySelection = async () => {
    await openApiKeySelector();
    setHasApiKey(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'model' | 'product') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setState(prev => ({
          ...prev,
          [type === 'model' ? 'modelImage' : 'productImage']: base64
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (type: 'model' | 'product') => {
    setState(prev => ({
      ...prev,
      [type === 'model' ? 'modelImage' : 'productImage']: null
    }));
  };

  const startProcessing = async () => {
    if (!state.modelImage || !state.productImage) {
      setError("Please upload both model and product images.");
      return;
    }
    setError(null);
    setLoadingMsg("Analysing anatomy & merging assets...");
    startProgress();
    try {
      const combined = await generateCombinedImage(state.modelImage, state.productImage);
      setState(prev => ({ ...prev, combinedImage: combined }));
      setStep(AppStep.REFINE);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMsg('');
      stopProgress();
    }
  };

  const handleRefine = async () => {
    if (!state.combinedImage) return;
    setLoadingMsg("Architecting environment & branding...");
    startProgress();
    try {
      const refined = await refineAndCustomize(
        state.combinedImage, 
        options.background, 
        options.backgroundRef, 
        options.lightingRef, 
        options.neonText, 
        options.fontStyle
      );
      setState(prev => ({ ...prev, combinedImage: refined }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMsg('');
      stopProgress();
    }
  };

  const goToStoryboard = async () => {
    if (!state.combinedImage) return;
    setLoadingMsg("Generating 2K Sequence Grid...");
    startProgress();
    try {
      const grid = await generateStoryboardGrid(state.combinedImage);
      setState(prev => ({ ...prev, storyboardGrid: grid }));
      setStep(AppStep.STORYBOARD);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMsg('');
      stopProgress();
    }
  };

  const startExtraction = async () => {
    if (!state.storyboardGrid) return;
    setStep(AppStep.RESULTS);
    setState(prev => ({ ...prev, extractionProgress: 0 }));
    for (let i = 0; i < 9; i++) {
      setState(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => s.id === i ? { ...s, isExtracting: true } : s)
      }));
      try {
        const img = await extractCell(state.storyboardGrid, i);
        setState(prev => ({
          ...prev,
          scenes: prev.scenes.map(s => s.id === i ? { ...s, image: img, isExtracting: false } : s),
          extractionProgress: Math.round(((i + 1) / 9) * 100)
        }));
      } catch (err) {
        console.error(`Extraction failed for cell ${i}`, err);
      }
    }
  };

  const handleUpscale = async (id: number) => {
    const scene = state.scenes[id];
    if (!scene.image) return;
    
    setState(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === id ? { ...s, isUpscaling: true } : s)
    }));
    
    try {
      const upscaled = await upscaleScene(scene.image);
      setState(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => s.id === id ? { ...s, image: upscaled, isUpscaling: false } : s)
      }));
    } catch (err: any) {
      setError(`Upscale failed: ${err.message}`);
      setState(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => s.id === id ? { ...s, isUpscaling: false } : s)
      }));
    }
  };

  const handleGenerateVideo = async (id: number) => {
    const scene = state.scenes[id];
    if (!scene.image) return;
    
    setState(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === id ? { ...s, isGeneratingVideo: true } : s)
    }));
    
    try {
      const videoUrl = await generateSceneVideo(scene.image, scenePrompts[id]);
      setState(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => s.id === id ? { ...s, videoUrl, isGeneratingVideo: false } : s)
      }));
    } catch (err: any) {
      setError(`Video generation failed: ${err.message}`);
      setState(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => s.id === id ? { ...s, isGeneratingVideo: false } : s)
      }));
    }
  };

  const steps = [
    { id: AppStep.UPLOAD, label: 'Upload Assets', icon: 'fa-cloud-arrow-up' },
    { id: AppStep.REFINE, label: 'Refine & Text', icon: 'fa-wand-magic-sparkles' },
    { id: AppStep.STORYBOARD, label: 'Storyboard', icon: 'fa-border-all' },
    { id: AppStep.RESULTS, label: 'Final Output', icon: 'fa-film' },
  ];

  if (!hasApiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0a0b]">
        <div className="max-w-md w-full glass p-8 sm:p-10 rounded-3xl border border-white/5 shadow-2xl text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-2xl sm:rounded-3xl mx-auto flex items-center justify-center mb-6 sm:mb-8 rotate-3">
            <i className="fa-solid fa-key text-2xl sm:text-3xl text-white"></i>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black mb-4 gradient-text">VEO PRO</h1>
          <p className="text-zinc-400 mb-8 sm:mb-10 text-base sm:text-lg leading-relaxed">Connect your AI Pro API key to access professional campaign generation tools.</p>
          <button
            onClick={handleKeySelection}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-4 sm:py-5 rounded-xl sm:rounded-2xl transition-all shadow-lg active:scale-95"
          >
            Authorize Access
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#0a0a0b] text-zinc-100 relative overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 sm:w-80 bg-[#0f0f11]/95 backdrop-blur-2xl border-r border-white/5 transition-transform duration-300 lg:translate-x-0 lg:static flex-shrink-0
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl shadow-black' : '-translate-x-full'}
      `}>
        <div className="p-6 sm:p-8 h-full flex flex-col overflow-y-auto">
          <div className="flex items-center gap-4 mb-10 sm:mb-14">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/20">
              <i className="fa-solid fa-bolt text-white text-xl sm:text-2xl"></i>
            </div>
            <span className="text-2xl sm:text-3xl font-black tracking-tighter uppercase">VEO <span className="text-violet-500">PRO</span></span>
          </div>

          <nav className="space-y-3 sm:space-y-4 flex-1">
            {steps.map((s) => {
              const isActive = step === s.id;
              const isPast = steps.findIndex(x => x.id === step) > steps.findIndex(x => x.id === s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setStep(s.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-4 sm:gap-6 px-4 sm:px-6 py-4 sm:py-6 rounded-2xl sm:rounded-3xl transition-all group border text-left
                    ${isActive ? 'bg-violet-600/15 text-violet-400 border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.1)]' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5 border-transparent'}
                  `}
                >
                  <div className={`
                    w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all flex-shrink-0
                    ${isActive ? 'bg-violet-600 text-white shadow-xl shadow-violet-600/30 scale-105 sm:scale-110' : 'bg-zinc-800 group-hover:bg-zinc-700'}
                  `}>
                    <i className={`fa-solid ${s.icon} text-lg sm:text-xl`}></i>
                  </div>
                  <span className="font-bold text-lg leading-none">{s.label}</span>
                  {isPast && <i className="fa-solid fa-check ml-auto text-emerald-500 text-lg"></i>}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-y-auto p-4 sm:p-8 lg:p-14 scroll-smooth min-w-0 bg-[#0a0a0b] h-screen">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="lg:hidden fixed bottom-6 right-6 z-[60] w-14 h-14 bg-violet-600 shadow-2xl rounded-full flex items-center justify-center border border-white/20 active:scale-90"
        >
          <i className={`fa-solid ${isSidebarOpen ? 'fa-xmark' : 'fa-bars'} text-2xl`}></i>
        </button>

        {loadingMsg && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-2xl px-6 text-center">
            <div className="relative w-32 h-32 mb-12">
              <div className="absolute inset-0 border-4 border-violet-500/10 rounded-full"></div>
              <div 
                className="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"
                style={{ animationDuration: '0.8s' }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center font-black text-2xl text-violet-400">
                {Math.floor(loadingProgress)}%
              </div>
            </div>
            <p className="text-2xl sm:text-4xl font-black gradient-text animate-pulse mb-6 tracking-tight uppercase leading-tight">{loadingMsg}</p>
            <div className="w-full max-w-md h-2 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all duration-300 shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {previewImage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/98 backdrop-blur-3xl p-4 sm:p-8" onClick={() => setPreviewImage(null)}>
            <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
              <img src={previewImage} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" alt="Preview" />
              <button 
                onClick={() => setPreviewImage(null)}
                className="absolute top-4 right-4 bg-zinc-900/50 hover:bg-zinc-900 w-12 h-12 rounded-full text-white text-3xl flex items-center justify-center transition-all"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        <div className="max-w-[1500px] mx-auto pb-32">
          {error && (
            <div className="mb-8 p-6 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center gap-6 animate-up">
              <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
              <span className="font-bold text-lg flex-1 leading-relaxed">{error}</span>
              <button onClick={() => setError(null)} className="text-4xl opacity-50 hover:opacity-100">&times;</button>
            </div>
          )}

          {step === AppStep.UPLOAD && (
            <div className="grid lg:grid-cols-2 gap-8 animate-up">
              <div className="glass p-10 rounded-[3rem] border border-white/5 flex flex-col items-center text-center shadow-2xl">
                <div className="w-20 h-20 bg-zinc-800 rounded-[1.5rem] flex items-center justify-center mb-8 border border-white/5">
                  <i className="fa-solid fa-user-tie text-4xl text-violet-400"></i>
                </div>
                <h3 className="text-2xl font-black mb-2 uppercase tracking-tight">Subject Model</h3>
                <p className="text-zinc-500 text-sm mb-10 font-medium">Upload your clean model reference.</p>
                <div className="w-full relative group">
                  <label className={`
                    w-full h-[400px] border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center transition-all overflow-hidden relative
                    ${state.modelImage ? 'border-transparent bg-black/40' : 'border-zinc-800 hover:border-violet-500/50 hover:bg-violet-500/5 cursor-pointer'}
                  `}>
                    {state.modelImage ? (
                      <img src={state.modelImage} className="absolute inset-0 w-full h-full object-contain p-4" alt="Model" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <i className="fa-solid fa-plus text-5xl text-zinc-700 mb-6 group-hover:text-violet-400 transition-colors"></i>
                        <span className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-xs">Attach Reference</span>
                      </div>
                    )}
                    {!state.modelImage && <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'model')} />}
                  </label>
                  {state.modelImage && (
                    <button onClick={() => removeImage('model')} className="absolute -top-4 -right-4 w-12 h-12 bg-zinc-900 border border-white/10 rounded-full flex items-center justify-center text-zinc-500 hover:text-red-400 shadow-2xl active:scale-90 z-10">
                      <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                  )}
                </div>
              </div>

              <div className="glass p-10 rounded-[3rem] border border-white/5 flex flex-col items-center text-center shadow-2xl">
                <div className="w-20 h-20 bg-zinc-800 rounded-[1.5rem] flex items-center justify-center mb-8 border border-white/5">
                  <i className="fa-solid fa-shirt text-4xl text-emerald-400"></i>
                </div>
                <h3 className="text-2xl font-black mb-2 uppercase tracking-tight">Product Asset</h3>
                <p className="text-zinc-500 text-sm mb-10 font-medium">Upload high-res Mukena asset.</p>
                <div className="w-full relative group">
                  <label className={`
                    w-full h-[400px] border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center transition-all overflow-hidden relative
                    ${state.productImage ? 'border-transparent bg-black/40' : 'border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 cursor-pointer'}
                  `}>
                    {state.productImage ? (
                      <img src={state.productImage} className="absolute inset-0 w-full h-full object-contain p-4" alt="Product" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <i className="fa-solid fa-plus text-5xl text-zinc-700 mb-6 group-hover:text-emerald-400 transition-colors"></i>
                        <span className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-xs">Attach Product</span>
                      </div>
                    )}
                    {!state.productImage && <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'product')} />}
                  </label>
                  {state.productImage && (
                    <button onClick={() => removeImage('product')} className="absolute -top-4 -right-4 w-12 h-12 bg-zinc-900 border border-white/10 rounded-full flex items-center justify-center text-zinc-500 hover:text-red-400 shadow-2xl active:scale-90 z-10">
                      <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2 flex justify-center pt-10">
                <button 
                  onClick={startProcessing}
                  disabled={!state.modelImage || !state.productImage}
                  className="w-full sm:w-auto bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 px-20 py-8 rounded-[3rem] font-black text-xl transition-all shadow-xl active:scale-95 uppercase tracking-[0.3em] leading-none"
                >
                  Merge Production Suite
                </button>
              </div>
            </div>
          )}

          {step === AppStep.REFINE && state.combinedImage && (
            <div className="grid lg:grid-cols-2 gap-12 animate-up">
              <div className="glass p-6 rounded-[3rem] border border-white/5 shadow-2xl sticky top-10 self-start">
                 <img src={state.combinedImage} className="w-full rounded-[2rem] object-contain aspect-[9/16]" alt="Refined" />
              </div>

              <div className="space-y-10">
                <h2 className="text-4xl font-black gradient-text uppercase tracking-tighter leading-none">Master Styling</h2>
                <p className="text-zinc-400 text-base font-medium leading-relaxed">
                  Refine the final look by describing the production environment, lighting, and branding details.
                </p>
                
                <div className="space-y-8">
                  <div className="glass p-8 rounded-[2.5rem] border border-white/5">
                    <label className="block text-xs font-black text-violet-400 uppercase tracking-widest mb-4">Production Environment</label>
                    <textarea 
                      value={options.background}
                      onChange={(e) => setOptions(o => ({...o, background: e.target.value}))}
                      className="w-full bg-black/60 border border-white/10 rounded-2xl p-6 focus:ring-2 focus:ring-violet-500 outline-none text-zinc-100 h-32 resize-none text-sm font-medium leading-relaxed"
                      placeholder="e.g., Luxury minimalist modern prayer room..."
                    />
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Style Reference</label>
                        <input 
                          type="text"
                          value={options.backgroundRef}
                          onChange={(e) => setOptions(o => ({...o, backgroundRef: e.target.value}))}
                          className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-medium"
                          placeholder="e.g., Zen Modern"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Lighting Style</label>
                        <input 
                          type="text"
                          value={options.lightingRef}
                          onChange={(e) => setOptions(o => ({...o, lightingRef: e.target.value}))}
                          className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-medium"
                          placeholder="e.g., Golden Hour"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass p-8 rounded-[2.5rem] border border-white/5">
                    <label className="block text-xs font-black text-violet-400 uppercase tracking-widest mb-4">Neon Branding (Behind Subject)</label>
                    <input 
                      type="text"
                      value={options.neonText}
                      onChange={(e) => setOptions(o => ({...o, neonText: e.target.value}))}
                      className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-violet-500 outline-none text-xl font-black"
                      placeholder="Input branding text..."
                    />
                    <div className="mt-6">
                      <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Font Aesthetic</label>
                      <select 
                        value={options.fontStyle}
                        onChange={(e) => setOptions(o => ({...o, fontStyle: e.target.value}))}
                        className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-4 text-sm font-bold text-violet-400 outline-none cursor-pointer hover:bg-black/80 transition-colors"
                      >
                        <option value="Elegant Script">Elegant Script (Handwritten)</option>
                        <option value="Modern Sans Serif">Modern Sans Serif (Clean)</option>
                        <option value="Bold Futuristic">Bold Futuristic (Sci-Fi)</option>
                        <option value="Minimalist Serif">Minimalist Serif (Luxury)</option>
                        <option value="Neon Tube Signature">Neon Tube Signature (Authentic)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <button onClick={handleRefine} className="bg-zinc-900 hover:bg-zinc-800 py-6 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all border border-white/5 active:scale-95 shadow-xl">
                    Re-Style Image
                  </button>
                  <button onClick={goToStoryboard} className="bg-violet-600 hover:bg-violet-500 py-8 rounded-[2.5rem] font-black text-lg uppercase tracking-[0.3em] transition-all shadow-xl active:scale-95 leading-none">
                    Generate Sequence Storyboard
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === AppStep.STORYBOARD && state.storyboardGrid && (
            <div className="max-w-6xl mx-auto flex flex-col items-center animate-up">
              <h2 className="text-4xl sm:text-6xl font-black mb-10 tracking-tighter text-center uppercase leading-none">Sequence Blueprint</h2>
              <div className="w-full glass p-8 rounded-[4rem] border border-white/10 shadow-2xl mb-12">
                <img src={state.storyboardGrid} className="w-full rounded-[3rem] aspect-[9/16] object-contain shadow-2xl" alt="Storyboard Grid" />
              </div>
              <button 
                onClick={startExtraction} 
                className="w-full sm:w-auto bg-violet-600 hover:bg-violet-500 px-24 py-10 rounded-[3rem] font-black text-2xl uppercase tracking-[0.2em] shadow-2xl active:scale-95 leading-none"
              >
                Extract Production Layers
              </button>
            </div>
          )}

          {step === AppStep.RESULTS && (
            <div className="grid lg:grid-cols-12 gap-10 items-start animate-up">
              {/* Sidebar Preview */}
              <div className="lg:col-span-3 space-y-8 sticky top-10 self-start">
                <h3 className="text-sm font-black text-violet-400 px-4 uppercase tracking-[0.2em]">Master Look</h3>
                <div className="glass p-4 rounded-[3rem] border border-white/10 shadow-2xl cursor-pointer group relative" onClick={() => setPreviewImage(state.storyboardGrid)}>
                  <div className="absolute inset-0 bg-violet-600/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center z-10 backdrop-blur-sm rounded-[3rem]">
                    <i className="fa-solid fa-expand text-4xl"></i>
                  </div>
                  <img src={state.storyboardGrid!} className="w-full rounded-[2.5rem] aspect-[9/16] object-contain" alt="Master Reference" />
                </div>
              </div>

              {/* Grid of Results */}
              <div className="lg:col-span-9 space-y-12">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 px-4">
                  <div>
                    <h2 className="text-4xl font-black tracking-tighter mb-2 leading-none">Extracted Scenes</h2>
                    <p className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-xs">Campaign Assets Ready</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black text-violet-400 tracking-widest uppercase mb-2 block">Extraction Progress</span>
                    <div className="w-64 h-2 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-violet-600 transition-all duration-500" style={{ width: `${state.extractionProgress}%` }}></div>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                  {state.scenes.map((scene, idx) => (
                    <div key={scene.id} className="glass p-8 rounded-[3.5rem] border border-white/5 flex flex-col h-full hover:border-violet-500/30 transition-all">
                      <div className="aspect-[9/16] bg-black/60 rounded-[2.5rem] overflow-hidden relative mb-8 shadow-inner border border-white/10 cursor-pointer" onClick={() => scene.image && setPreviewImage(scene.image)}>
                        {scene.image ? (
                          <>
                            {scene.videoUrl ? (
                              <video src={scene.videoUrl} className="w-full h-full object-contain" autoPlay loop muted playsInline />
                            ) : (
                              <img src={scene.image} className="w-full h-full object-contain p-2" alt={`Frame ${idx+1}`} />
                            )}
                            <div className="absolute top-6 right-6 z-20 flex flex-col gap-3">
                              <a href={scene.videoUrl || scene.image} download className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center shadow-xl hover:bg-violet-500 hover:text-white transition-all">
                                <i className="fa-solid fa-download"></i>
                              </a>
                              {!scene.videoUrl && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleUpscale(scene.id); }}
                                  disabled={scene.isUpscaling}
                                  className="w-12 h-12 bg-zinc-900 text-violet-400 rounded-full flex items-center justify-center shadow-xl hover:bg-violet-600 hover:text-white transition-all border border-violet-500/20"
                                  title="Upscale to 2K"
                                >
                                  {scene.isUpscaling ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-wand-sparkles"></i>}
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {scene.isExtracting ? (
                              <div className="flex flex-col items-center">
                                <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <span className="text-[10px] font-black uppercase text-zinc-600">Extracting...</span>
                              </div>
                            ) : <i className="fa-solid fa-image text-4xl text-zinc-900"></i>}
                          </div>
                        )}
                      </div>

                      <div className="mt-auto">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <p className="text-[10px] font-black text-violet-500 uppercase tracking-[0.2em]">Asset Sequence 0{idx+1}</p>
                            <p className="text-base font-black tracking-tight">Status: {scene.image ? 'Processed' : 'Pending'}</p>
                          </div>
                        </div>

                        {scene.image && !scene.videoUrl && (
                          <div className="space-y-4">
                            <textarea
                              placeholder="Describe unique motion..."
                              value={scenePrompts[idx]}
                              onChange={(e) => {
                                const newPrompts = [...scenePrompts];
                                newPrompts[idx] = e.target.value;
                                setScenePrompts(newPrompts);
                              }}
                              className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-xs focus:ring-1 focus:ring-violet-500 outline-none h-20 resize-none font-medium text-zinc-300"
                            />
                            <button 
                              onClick={() => handleGenerateVideo(scene.id)}
                              disabled={scene.isGeneratingVideo}
                              className="w-full py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] bg-white/5 border border-white/10 hover:bg-violet-600 hover:border-violet-600 transition-all flex items-center justify-center gap-3 leading-none"
                            >
                              {scene.isGeneratingVideo ? <><i className="fa-solid fa-spinner fa-spin"></i> Veo Simulating...</> : <><i className="fa-solid fa-film"></i> Simulate Veo Motion</>}
                            </button>
                          </div>
                        )}
                      </div>
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
