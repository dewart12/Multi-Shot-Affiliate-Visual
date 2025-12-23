
import React, { useState, useEffect, useRef } from 'react';
import { AppStep, GenerationState, CustomizationOptions } from './types.ts';
import { 
  checkApiKey, 
  openApiKeySelector, 
  generateCombinedImage, 
  refineAndCustomize, 
  generateStoryboardGrid, 
  extractCell,
  generateSceneVideo,
  upscaleScene
} from './services/geminiService.ts';

const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
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

  const [scenePrompts, setScenePrompts] = useState<string[]>(Array(9).fill("Subtle cinematic motion, the model moves naturally, elegant flow of the fabric."));
  
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
        const increment = Math.max(0.1, (100 - prev) / 80);
        return parseFloat((prev + increment).toFixed(1));
      });
    }, 300);
  };

  const stopProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setLoadingProgress(100);
    setTimeout(() => setLoadingProgress(0), 500);
  };

  const handleActivateKey = async () => {
    try {
      await openApiKeySelector();
      // Mengikuti aturan: asumsikan kunci dipilih untuk menghindari race condition
      setHasApiKey(true);
    } catch (err) {
      setError("Gagal memicu pemilih API Key.");
    }
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
      setError("Silakan unggah gambar model dan produk terlebih dahulu.");
      return;
    }
    setError(null);
    setLoadingMsg("Menganalisis & Menggabungkan Aset...");
    startProgress();
    try {
      const combined = await generateCombinedImage(state.modelImage, state.productImage);
      setState(prev => ({ ...prev, combinedImage: combined }));
      setStep(AppStep.REFINE);
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes("Requested entity was not found")) {
        setHasApiKey(false);
      }
    } finally {
      setLoadingMsg('');
      stopProgress();
    }
  };

  const handleRefine = async () => {
    if (!state.combinedImage) return;
    setLoadingMsg("Merancang Lingkungan...");
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
    setLoadingMsg("Menghasilkan Grid Storyboard...");
    startProgress();
    try {
      const grid = await generateStoryboardGrid(state.combinedImage, options.neonText);
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
    setError(null);
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
        
        if (i < 8) {
          await new Promise(resolve => setTimeout(resolve, 12000));
        }
        
      } catch (err: any) {
        setError(`Limit tercapai. Mencoba kembali secara otomatis.`);
        setState(prev => ({
          ...prev,
          scenes: prev.scenes.map(s => s.id === i ? { ...s, isExtracting: false } : s)
        }));
      }
    }
  };

  const handleUpscale = async (id: number) => {
    const scene = state.scenes[id];
    if (!scene.image) return;
    setState(prev => ({...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, isUpscaling: true } : s)}));
    try {
      const upscaled = await upscaleScene(scene.image);
      setState(prev => ({...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, image: upscaled, isUpscaling: false } : s)}));
    } catch (err: any) {
      setError(`Upscale gagal: ${err.message}`);
      setState(prev => ({...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, isUpscaling: false } : s)}));
    }
  };

  const handleGenerateVideo = async (id: number) => {
    const scene = state.scenes[id];
    if (!scene.image) return;
    setState(prev => ({...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, isGeneratingVideo: true } : s)}));
    try {
      const videoUrl = await generateSceneVideo(scene.image, scenePrompts[id]);
      setState(prev => ({...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, videoUrl, isGeneratingVideo: false } : s)}));
    } catch (err: any) {
      setError(`Video gagal: ${err.message}`);
      setState(prev => ({...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, isGeneratingVideo: false } : s)}));
    }
  };

  if (hasApiKey === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Menyiapkan Engine...</p>
      </div>
    );
  }

  if (hasApiKey === false) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#080809] p-6">
        <div className="fixed inset-0 bg-blue-900/5 blur-[120px] pointer-events-none"></div>
        <div className="max-w-md w-full glass p-12 rounded-[3rem] border border-blue-500/20 shadow-2xl text-center animate-up relative z-10">
          <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-3xl mx-auto flex items-center justify-center mb-10 rotate-3 shadow-xl">
            <i className="fa-solid fa-lock text-4xl text-white"></i>
          </div>
          <h1 className="text-3xl font-black mb-6 gradient-text tracking-tighter uppercase leading-none">Aktivasi Alat</h1>
          <p className="text-zinc-400 mb-10 text-sm font-medium leading-relaxed">
            Multishot Affiliate AI membutuhkan <b>Gemini API Key</b> pribadi Anda untuk menjalankan fitur video dan gambar 2K.
          </p>
          <div className="space-y-6">
            <button
              onClick={handleActivateKey}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-6 rounded-2xl transition-all shadow-xl active:scale-95 uppercase tracking-widest text-sm flex items-center justify-center gap-3"
            >
              <i className="fa-solid fa-key"></i> AKTIFKAN & MULAI
            </button>
            <div className="pt-6 border-t border-white/5">
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-blue-400 transition-colors font-bold uppercase tracking-widest text-[10px]">
                Panduan Mendapatkan API KEY <i className="fa-solid fa-external-link ml-1"></i>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { id: AppStep.UPLOAD, label: 'Upload Assets', icon: 'fa-cloud-arrow-up', isUnlocked: true },
    { id: AppStep.REFINE, label: 'Refine & Text', icon: 'fa-wand-magic-sparkles', isUnlocked: !!state.combinedImage },
    { id: AppStep.STORYBOARD, label: 'Storyboard', icon: 'fa-border-all', isUnlocked: !!state.storyboardGrid },
    { id: AppStep.RESULTS, label: 'Final Output', icon: 'fa-film', isUnlocked: state.scenes.some(s => s.image !== null) },
  ];

  return (
    <div className="min-h-screen flex bg-[#0a0a0b] text-zinc-100 relative overflow-hidden">
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-80 bg-[#0f0f11]/95 backdrop-blur-2xl border-r border-white/5 transition-transform duration-300 lg:translate-x-0 lg:static flex-shrink-0
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <div className="p-8 h-full flex flex-col overflow-y-auto">
          <div className="flex items-center gap-4 mb-16">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg">
              <i className="fa-solid fa-bolt text-white text-xl"></i>
            </div>
            <span className="text-xl font-black tracking-tighter uppercase leading-tight">Multishot <br/><span className="text-blue-500">Affiliate AI</span></span>
          </div>

          <nav className="space-y-4 flex-1">
            {steps.map((s) => {
              const isActive = step === s.id;
              const canClick = s.isUnlocked;
              return (
                <button
                  key={s.id}
                  disabled={!canClick}
                  onClick={() => canClick && setStep(s.id)}
                  className={`
                    w-full flex items-center gap-5 px-6 py-5 rounded-2xl transition-all group border text-left relative
                    ${isActive ? 'bg-blue-600/15 text-blue-400 border-blue-500/30' : 'text-zinc-500 hover:text-zinc-200 border-transparent'}
                    ${!canClick ? 'opacity-30 cursor-not-allowed bg-black/10' : 'hover:bg-white/5 cursor-pointer'}
                  `}
                >
                  <div className={`
                    w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0
                    ${isActive ? 'bg-blue-600 text-white shadow-xl' : 'bg-zinc-800'}
                  `}>
                    <i className={`fa-solid ${canClick ? s.icon : 'fa-lock'} text-base`}></i>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm leading-none">{s.label}</span>
                    {!canClick && <span className="text-[9px] uppercase tracking-widest mt-1 text-zinc-600 font-black">TERKUNCI</span>}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="flex-1 relative overflow-y-auto p-6 sm:p-14 min-w-0 bg-[#0a0a0b] h-screen">
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden fixed bottom-6 right-6 z-[60] w-14 h-14 bg-blue-600 shadow-2xl rounded-full flex items-center justify-center border border-white/20">
          <i className={`fa-solid ${isSidebarOpen ? 'fa-xmark' : 'fa-bars'} text-xl text-white`}></i>
        </button>

        {loadingMsg && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-2xl px-6 text-center">
            <div className="relative w-28 h-28 mb-12">
              <div className="absolute inset-0 border-4 border-blue-500/10 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center font-black text-2xl text-blue-400">{Math.floor(loadingProgress)}%</div>
            </div>
            <p className="text-3xl font-black gradient-text animate-pulse mb-6 uppercase tracking-tight">{loadingMsg}</p>
            <div className="w-full max-w-md h-2 bg-zinc-900 rounded-full overflow-hidden border border-white/5 shadow-inner">
              <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-300" style={{ width: `${loadingProgress}%` }}></div>
            </div>
          </div>
        )}

        {previewImage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/98 backdrop-blur-3xl p-8" onClick={() => setPreviewImage(null)}>
            <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
              <img src={previewImage} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" alt="Preview" />
              <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 bg-zinc-900/50 hover:bg-zinc-900 w-12 h-12 rounded-full text-white text-3xl flex items-center justify-center transition-all">&times;</button>
            </div>
          </div>
        )}

        <div className="max-w-[1400px] mx-auto pb-32">
          {error && (
            <div className="mb-8 p-6 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center gap-4 animate-up">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
              <span className="font-bold text-sm flex-1 leading-relaxed">{error}</span>
              <button onClick={() => setError(null)} className="text-3xl opacity-50 hover:opacity-100">&times;</button>
            </div>
          )}

          {step === AppStep.UPLOAD && (
            <div className="grid lg:grid-cols-2 gap-10 animate-up">
              <div className="glass p-10 rounded-[2.5rem] border border-white/5 flex flex-col items-center text-center shadow-2xl">
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-8 border border-white/5">
                  <i className="fa-solid fa-user-tie text-3xl text-blue-400"></i>
                </div>
                <h3 className="text-2xl font-black mb-2 uppercase tracking-tight">Subject Model</h3>
                <p className="text-zinc-500 text-sm mb-10 font-medium italic">Wajib: Foto model pose tegak.</p>
                <div className="w-full relative group">
                  <label className={`
                    w-full h-[450px] border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all overflow-hidden relative
                    ${state.modelImage ? 'border-transparent bg-black/40' : 'border-zinc-800 hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer'}
                  `}>
                    {state.modelImage ? (
                      <img src={state.modelImage} className="absolute inset-0 w-full h-full object-contain p-4" alt="Model" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <i className="fa-solid fa-plus text-5xl text-zinc-700 mb-6 group-hover:text-blue-400 transition-colors"></i>
                        <span className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-xs">Pilih Foto Model</span>
                      </div>
                    )}
                    {!state.modelImage && <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'model')} />}
                  </label>
                  {state.modelImage && (
                    <button onClick={() => removeImage('model')} className="absolute -top-3 -right-3 w-10 h-10 bg-zinc-900 border border-white/10 rounded-full flex items-center justify-center text-zinc-500 hover:text-red-400 shadow-2xl active:scale-90 z-10">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  )}
                </div>
              </div>

              <div className="glass p-10 rounded-[2.5rem] border border-white/5 flex flex-col items-center text-center shadow-2xl">
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-8 border border-white/5">
                  <i className="fa-solid fa-shirt text-3xl text-emerald-400"></i>
                </div>
                <h3 className="text-2xl font-black mb-2 uppercase tracking-tight">Product Asset</h3>
                <p className="text-zinc-500 text-sm mb-10 font-medium italic">Wajib: Detail produk resolusi tinggi.</p>
                <div className="w-full relative group">
                  <label className={`
                    w-full h-[450px] border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all overflow-hidden relative
                    ${state.productImage ? 'border-transparent bg-black/40' : 'border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 cursor-pointer'}
                  `}>
                    {state.productImage ? (
                      <img src={state.productImage} className="absolute inset-0 w-full h-full object-contain p-4" alt="Product" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <i className="fa-solid fa-plus text-5xl text-zinc-700 mb-6 group-hover:text-emerald-400 transition-colors"></i>
                        <span className="text-zinc-500 font-bold uppercase tracking-[0.2em] text-xs">Pilih Foto Produk</span>
                      </div>
                    )}
                    {!state.productImage && <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'product')} />}
                  </label>
                  {state.productImage && (
                    <button onClick={() => removeImage('product')} className="absolute -top-3 -right-3 w-10 h-10 bg-zinc-900 border border-white/10 rounded-full flex items-center justify-center text-zinc-500 hover:text-red-400 shadow-2xl active:scale-90 z-10">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2 flex justify-center pt-10">
                <button 
                  onClick={startProcessing}
                  disabled={!state.modelImage || !state.productImage}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 px-24 py-8 rounded-[2rem] font-black text-xl transition-all shadow-xl active:scale-95 uppercase tracking-[0.4em]"
                >
                  MULAI PROSES AI
                </button>
              </div>
            </div>
          )}

          {step === AppStep.REFINE && state.combinedImage && (
            <div className="grid lg:grid-cols-2 gap-14 animate-up">
              <div className="glass p-5 rounded-[2.5rem] border border-white/5 shadow-2xl sticky top-14 self-start">
                 <img src={state.combinedImage} className="w-full rounded-2xl object-contain aspect-[9/16]" alt="Refined Master" />
              </div>

              <div className="space-y-12">
                <h2 className="text-4xl font-black gradient-text uppercase tracking-tighter leading-none">Styling Ruangan</h2>
                <div className="space-y-8">
                  <div className="glass p-8 rounded-[2rem] border border-white/5">
                    <label className="block text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Latar Belakang & Suasana</label>
                    <textarea 
                      value={options.background}
                      onChange={(e) => setOptions(o => ({...o, background: e.target.value}))}
                      className="w-full bg-black/60 border border-white/10 rounded-xl p-6 focus:ring-2 focus:ring-blue-500 outline-none text-zinc-100 h-40 resize-none text-sm font-medium leading-relaxed"
                    />
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Ref Style</label>
                        <input type="text" value={options.backgroundRef} onChange={(e) => setOptions(o => ({...o, backgroundRef: e.target.value}))} className="w-full bg-black/60 border border-white/10 rounded-xl px-5 py-3 text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Lighting</label>
                        <input type="text" value={options.lightingRef} onChange={(e) => setOptions(o => ({...o, lightingRef: e.target.value}))} className="w-full bg-black/60 border border-white/10 rounded-xl px-5 py-3 text-xs" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass p-8 rounded-[2rem] border border-white/5">
                    <label className="block text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Neon Branding (Text)</label>
                    <input 
                      type="text"
                      value={options.neonText}
                      onChange={(e) => setOptions(o => ({...o, neonText: e.target.value}))}
                      className="w-full bg-black/60 border border-white/10 rounded-xl px-6 py-5 focus:ring-2 focus:ring-blue-500 outline-none text-xl font-black uppercase"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-5 pt-4">
                  <button onClick={handleRefine} className="bg-zinc-900 hover:bg-zinc-800 py-6 rounded-2xl font-bold text-xs uppercase tracking-[0.3em] transition-all border border-white/5 active:scale-95">
                    UPDATE PREVIEW
                  </button>
                  <button onClick={goToStoryboard} className="bg-blue-600 hover:bg-blue-500 py-8 rounded-[2.5rem] font-black text-lg uppercase tracking-[0.4em] transition-all shadow-xl active:scale-95">
                    LANJUT KE STORYBOARD
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === AppStep.STORYBOARD && state.storyboardGrid && (
            <div className="max-w-4xl mx-auto flex flex-col items-center animate-up">
              <h2 className="text-4xl font-black mb-12 tracking-tighter text-center uppercase">Sequence Grid 3x3</h2>
              <div className="w-full glass p-6 rounded-[2.5rem] border border-white/10 shadow-2xl mb-14">
                <img src={state.storyboardGrid} className="w-full rounded-2xl aspect-[9/16] object-contain shadow-2xl" alt="Storyboard Grid" />
              </div>
              <button onClick={startExtraction} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 px-24 py-10 rounded-[3rem] font-black text-2xl uppercase tracking-[0.3em] shadow-2xl active:scale-95 leading-none">
                EKSTRAK POSISI 1-9
              </button>
            </div>
          )}

          {step === AppStep.RESULTS && (
            <div className="grid lg:grid-cols-12 gap-12 items-start animate-up">
              <div className="lg:col-span-3 space-y-10 sticky top-14 self-start">
                <h3 className="text-[10px] font-black text-blue-400 px-4 uppercase tracking-[0.3em]">Master Template</h3>
                <div className="glass p-4 rounded-[2.5rem] border border-white/10 shadow-2xl cursor-pointer group relative" onClick={() => setPreviewImage(state.storyboardGrid)}>
                  <div className="absolute inset-0 bg-blue-600/30 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center z-10 backdrop-blur-sm rounded-[2.5rem]">
                    <i className="fa-solid fa-expand text-3xl text-white"></i>
                  </div>
                  <img src={state.storyboardGrid!} className="w-full rounded-2xl aspect-[9/16] object-contain" alt="Master Reference" />
                </div>
              </div>

              <div className="lg:col-span-9 space-y-12">
                <div className="flex flex-col sm:flex-row justify-between items-end gap-6 px-6">
                  <div>
                    <h2 className="text-4xl font-black tracking-tighter mb-2">Assets Selesai</h2>
                    <p className="text-zinc-500 font-black uppercase tracking-[0.3em] text-[10px]">Ready for Animation</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black text-blue-400 tracking-widest uppercase mb-3 block">Extraction Progress</span>
                    <div className="w-64 h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5 shadow-inner">
                      <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-700" style={{ width: `${state.extractionProgress}%` }}></div>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10 pb-32">
                  {state.scenes.map((scene, idx) => (
                    <div key={scene.id} className="glass p-7 rounded-[3rem] border border-white/5 flex flex-col h-full hover:border-blue-500/30 transition-all group/card">
                      <div className="aspect-[9/16] bg-black/60 rounded-[2rem] overflow-hidden relative mb-10 shadow-inner border border-white/10 cursor-pointer" onClick={() => scene.image && setPreviewImage(scene.image)}>
                        {scene.image ? (
                          <>
                            {scene.videoUrl ? (
                              <video src={scene.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                            ) : (
                              <img src={scene.image} className="w-full h-full object-cover" alt={`Frame ${idx+1}`} />
                            )}
                            <div className="absolute top-5 right-5 z-20 flex flex-col gap-4 opacity-0 group-hover/card:opacity-100 transition-all">
                              <a href={scene.videoUrl || scene.image} download className="w-11 h-11 bg-white text-black rounded-2xl flex items-center justify-center shadow-2xl hover:bg-blue-600 hover:text-white transition-all">
                                <i className="fa-solid fa-download text-lg"></i>
                              </a>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {scene.isExtracting ? (
                              <div className="flex flex-col items-center">
                                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <span className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Processing...</span>
                              </div>
                            ) : <i className="fa-solid fa-lock text-3xl text-zinc-900 opacity-20"></i>}
                          </div>
                        )}
                      </div>

                      <div className="mt-auto px-2 pb-2">
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-2 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span> SCENE 0{idx+1}
                        </p>
                        {scene.image && !scene.videoUrl && (
                          <div className="space-y-5">
                            <textarea
                              placeholder="Ketik instruksi gerakan..."
                              value={scenePrompts[idx]}
                              onChange={(e) => {
                                const newPrompts = [...scenePrompts];
                                newPrompts[idx] = e.target.value;
                                setScenePrompts(newPrompts);
                              }}
                              className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-xs focus:ring-1 focus:ring-blue-500 outline-none h-20 resize-none font-medium text-zinc-400"
                            />
                            <button 
                              onClick={() => handleGenerateVideo(scene.id)}
                              disabled={scene.isGeneratingVideo}
                              className="w-full py-5 rounded-[1.5rem] font-bold text-[11px] uppercase tracking-[0.3em] bg-white/5 border border-white/10 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-4 text-zinc-400"
                            >
                              {scene.isGeneratingVideo ? <><i className="fa-solid fa-spinner fa-spin"></i> Rendering...</> : <><i className="fa-solid fa-clapperboard"></i> Buat Animasi Video</>}
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
