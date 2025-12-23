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
  const [isActivated, setIsActivated] = useState<boolean>(false);
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
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
  const [retryMsg, setRetryMsg] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const progressIntervalRef = useRef<number | null>(null);

  // Cek awal apakah sudah ada key
  useEffect(() => {
    const checkInitial = async () => {
      if (process.env.API_KEY && process.env.API_KEY !== 'undefined') {
        setIsActivated(true);
      } else if (window.aistudio?.hasSelectedApiKey) {
        const has = await window.aistudio.hasSelectedApiKey();
        if (has) setIsActivated(true);
      }
    };
    checkInitial();
  }, []);

  const handleActivate = async () => {
    // TRIGGER JENDELA PEMILIHAN
    if (window.aistudio?.openSelectKey) {
      window.aistudio.openSelectKey();
    }
    
    // ATURAN RACE CONDITION: Langsung anggap sukses dan masuk ke dashboard
    // Ini menjamin tombol "ada reaksi" dan user tidak terjebak di landing page
    setIsActivated(true);
    setError(null);
  };

  const startProgress = () => {
    setLoadingProgress(0);
    progressIntervalRef.current = window.setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 98) return prev;
        return parseFloat((prev + 0.5).toFixed(1));
      });
    }, 200);
  };

  const stopProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setLoadingProgress(100);
    setTimeout(() => {
      setLoadingProgress(0);
    }, 500);
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
    const msg = err.message || "Terjadi kendala teknis.";
    // Jika API Key hilang saat proses, kembalikan ke pemilihan key
    if (msg.includes("API_KEY_MISSING") || msg.includes("Requested entity was not found")) {
      setError("DIBLOKIR: Google memerlukan Project Key. Silakan klik tombol 'PILIH PROJECT' untuk mengaktifkan.");
    } else {
      setError(msg);
    }
  };

  const startProcessing = async () => {
    if (!state.modelImage || !state.productImage) return;
    setError(null);
    setLoadingMsg("Menyelaraskan busana (Gemini Pro)...");
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
    setLoadingMsg("Mengonfigurasi detail Pro...");
    startProgress();
    try {
      const refined = await refineAndCustomize(state.combinedImage, options.background, options.backgroundRef, options.lightingRef, options.neonText, options.fontStyle, setRetryMsg);
      setState(prev => ({ ...prev, combinedImage: refined }));
    } catch (err: any) { handleError(err); } finally { setLoadingMsg(''); stopProgress(); }
  };

  const goToStoryboard = async () => {
    if (!state.combinedImage) return;
    setError(null);
    setLoadingMsg("Menyusun Storyboard Pro...");
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
        const img = await extractCell(state.storyboardGrid!, i, (msg) => setRetryMsg(`Frame ${i+1}: ${msg}`));
        setState(prev => ({
          ...prev,
          scenes: prev.scenes.map(s => s.id === i ? { ...s, image: img, isExtracting: false } : s),
          extractionProgress: Math.round(((i + 1) / 9) * 100)
        }));
        setRetryMsg('');
        if (i < 8) await new Promise(r => setTimeout(r, 4000));
      } catch (err: any) {
        handleError(err);
        setState(prev => ({ ...prev, scenes: prev.scenes.map(s => s.id === i ? { ...s, isExtracting: false } : s) }));
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

  if (!isActivated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080809] p-6 relative">
        <div className="absolute top-0 left-0 w-full h-full bg-blue-600/5 blur-[120px] pointer-events-none"></div>
        <div className="max-w-md w-full glass p-10 sm:p-14 rounded-[3.5rem] border border-white/5 text-center animate-up relative z-10 shadow-2xl">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-3xl mx-auto flex items-center justify-center mb-8 rotate-6 shadow-xl">
            <i className="fa-solid fa-crown text-3xl text-white"></i>
          </div>
          <h1 className="text-3xl font-black mb-3 tracking-tighter uppercase leading-none">Gemini 3 Pro <br/><span className="text-blue-500">Production Mode</span></h1>
          <p className="text-zinc-500 text-sm mb-10 leading-relaxed">Pilih Project Google Cloud Anda untuk akses Tier 1 (Cepat) atau Free Tier.</p>
          
          <button onClick={handleActivate} className="w-full bg-blue-600 hover:bg-blue-500 py-6 rounded-2xl font-black transition-all uppercase tracking-widest text-xs shadow-lg shadow-blue-600/20 active:scale-95">MASUK KE DASHBOARD</button>
          
          <div className="mt-8 flex flex-col gap-4">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest hover:text-blue-400 transition-colors">
              Tutorial Aktivasi Billing <i className="fa-solid fa-external-link ml-1"></i>
            </a>
            <p className="text-[8px] text-zinc-700 uppercase font-black tracking-widest">Penanganan API Key dikelola sepenuhnya oleh Google Cloud</p>
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { id: AppStep.UPLOAD, label: 'Upload Assets', icon: 'fa-cloud-arrow-up', isUnlocked: true },
    { id: AppStep.REFINE, label: 'Refine & Text', icon: 'fa-wand-magic-sparkles', isUnlocked: !!state.combinedImage },
    { id: AppStep.STORYBOARD, label: 'Pro Storyboard', icon: 'fa-border-all', isUnlocked: !!state.storyboardGrid },
    { id: AppStep.RESULTS, label: 'Final Output', icon: 'fa-film', isUnlocked: state.scenes.some(s => s.image !== null) },
  ];

  return (
    <div className="min-h-screen flex bg-[#0a0a0b] text-zinc-100 relative overflow-hidden">
      <aside className={`fixed inset-y-0 left-0 z-50 w-80 bg-[#0f0f11]/95 backdrop-blur-2xl border-r border-white/5 transition-transform lg:translate-x-0 lg:static flex-shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 h-full flex flex-col">
          <div className="flex items-center gap-4 mb-16">
            <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg"><i className="fa-solid fa-crown text-white"></i></div>
            <span className="text-lg font-black tracking-tighter uppercase leading-tight">Multishot <br/><span className="text-blue-500">Pro Edition</span></span>
          </div>
          <nav className="space-y-3 flex-1">
            {steps.map((s) => (
              <button key={s.id} disabled={!s.isUnlocked} onClick={() => setStep(s.id)} className={`w-full flex items-center gap-5 px-6 py-5 rounded-2xl transition-all border text-left ${step === s.id ? 'bg-blue-600/10 text-blue-400 border-blue-500/20' : 'text-zinc-500 border-transparent hover:bg-white/5'} ${!s.isUnlocked ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <i className={`fa-solid ${s.isUnlocked ? s.icon : 'fa-lock'}`}></i>
                <span className="font-bold text-xs uppercase tracking-widest">{s.label}</span>
              </button>
            ))}
          </nav>
          <div className="pt-8 border-t border-white/5">
             <button onClick={handleActivate} className="w-full py-4 text-[10px] font-black text-blue-500 border border-blue-500/20 uppercase tracking-widest hover:bg-blue-500/10 rounded-xl transition-all"><i className="fa-solid fa-key mr-2"></i> Ganti Project Key</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 relative overflow-y-auto p-6 sm:p-14 min-w-0 bg-[#0a0a0b] h-screen">
        {(loadingMsg || retryMsg) && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/98 backdrop-blur-2xl px-6">
            <div className="relative w-24 h-24 mb-10">
              <div className="absolute inset-0 border-4 border-blue-500/10 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center font-black text-xl text-blue-400">{Math.floor(loadingProgress)}%</div>
            </div>
            <p className="text-2xl font-black gradient-text uppercase tracking-tighter mb-4 text-center">{loadingMsg || 'Memproses...'}</p>
            {retryMsg && <p className="text-blue-400/80 text-[11px] font-black uppercase tracking-[0.2em] animate-pulse bg-blue-500/5 px-6 py-2 rounded-full border border-blue-500/10">{retryMsg}</p>}
          </div>
        )}

        <div className="max-w-[1400px] mx-auto pb-32">
          {error && (
            <div className="mb-8 p-6 bg-red-500/10 border border-red-500/20 text-red-400 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 animate-up">
              <div className="flex items-center gap-4">
                <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
                <div>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1">{error}</p>
                    <p className="text-[9px] font-medium opacity-60">Jendela Project mungkin tidak sengaja tertutup atau Project Anda belum memiliki API Gemini aktif.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={handleActivate} className="px-8 py-4 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-400 transition-all shadow-xl">PILIH PROJECT</button>
                <button onClick={() => setError(null)} className="p-4 text-red-400/50 hover:text-red-400 transition-colors">&times;</button>
              </div>
            </div>
          )}

          {step === AppStep.UPLOAD && (
            <div className="grid lg:grid-cols-2 gap-8 animate-up">
              {[ {t: 'Subject Model', d: 'model'}, {t: 'Product Asset', d: 'product'} ].map((u) => (
                <div key={u.d} className="glass p-10 rounded-[2.5rem] flex flex-col items-center text-center">
                  <h3 className="text-xl font-black mb-8 uppercase tracking-tighter">{u.t}</h3>
                  <label className="w-full h-96 border-2 border-dashed border-zinc-800 hover:border-blue-500/50 rounded-[2rem] flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group">
                    {(state as any)[`${u.d}Image`] ? <img src={(state as any)[`${u.d}Image`]} className="w-full h-full object-contain p-6" alt={u.t} /> : <div className="flex flex-col items-center opacity-40 group-hover:opacity-100 transition-opacity"><i className="fa-solid fa-plus text-3xl mb-4"></i><span className="text-[10px] font-black uppercase">Pilih File</span></div>}
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, u.d as any)} />
                  </label>
                </div>
              ))}
              <div className="lg:col-span-2 flex justify-center pt-8">
                <button disabled={!state.modelImage || !state.productImage} onClick={startProcessing} className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 px-20 py-7 rounded-3xl font-black uppercase tracking-[0.3em] shadow-2xl transition-all">Mulai Produksi Pro</button>
              </div>
            </div>
          )}

          {step === AppStep.REFINE && state.combinedImage && (
            <div className="grid lg:grid-cols-2 gap-12 animate-up">
              <div className="glass p-4 rounded-[3rem] sticky top-14 self-start"><img src={state.combinedImage} className="w-full rounded-[2.5rem] aspect-[9/16] object-contain bg-black/50" /></div>
              <div className="space-y-10">
                <h2 className="text-3xl font-black tracking-tighter uppercase">Kustomisasi Ruang (Pro)</h2>
                <div className="glass p-8 rounded-[2.5rem] space-y-6">
                  <div><label className="block text-[10px] font-black text-zinc-500 uppercase mb-3">Prompt Lingkungan</label><textarea value={options.background} onChange={(e) => setOptions(o => ({...o, background: e.target.value}))} className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-xs h-32 resize-none outline-none focus:border-blue-500/30" /></div>
                  <div><label className="block text-[10px] font-black text-blue-500 uppercase mb-3">Nama Brand (Neon Sign)</label><input type="text" value={options.neonText} onChange={(e) => setOptions(o => ({...o, neonText: e.target.value}))} className="w-full bg-black/40 border border-white/5 rounded-xl px-5 py-4 text-sm font-black uppercase tracking-widest" /></div>
                </div>
                <div className="flex flex-col gap-4">
                  <button onClick={handleRefine} className="py-5 rounded-2xl border border-white/10 hover:bg-white/5 font-bold text-[10px] uppercase">Perbarui Preview</button>
                  <button onClick={goToStoryboard} className="py-7 rounded-[2rem] bg-blue-600 hover:bg-blue-500 font-black uppercase tracking-[0.3em] shadow-xl">Rancang Storyboard</button>
                </div>
              </div>
            </div>
          )}

          {step === AppStep.STORYBOARD && state.storyboardGrid && (
            <div className="max-w-3xl mx-auto flex flex-col items-center animate-up">
              <h2 className="text-3xl font-black mb-10 tracking-tighter uppercase">Master Montage Pro (1K)</h2>
              <div className="glass p-5 rounded-[3rem] mb-12 shadow-2xl"><img src={state.storyboardGrid} className="w-full rounded-[2.5rem] aspect-[9/16] object-contain" /></div>
              <button onClick={startExtraction} className="bg-blue-600 hover:bg-blue-500 px-24 py-8 rounded-[2rem] font-black text-lg uppercase tracking-[0.3em] shadow-xl">Mulai Ekstraksi</button>
            </div>
          )}

          {step === AppStep.RESULTS && (
            <div className="space-y-12 animate-up">
              <div className="flex justify-between items-end px-4">
                <div><h2 className="text-3xl font-black tracking-tighter mb-2">Final Pro Assets</h2><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">High Fidelity Output</p></div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-blue-500 uppercase mb-2">Progress Ekstraksi</p>
                  <div className="w-48 h-1 bg-zinc-900 rounded-full overflow-hidden"><div className="h-full bg-blue-600 transition-all duration-700" style={{ width: `${state.extractionProgress}%` }}></div></div>
                </div>
              </div>

              <div className="grid lg:grid-cols-4 gap-10">
                <div className="lg:col-span-1 space-y-6">
                  <div className="glass p-4 rounded-[2rem] sticky top-10 border-blue-500/10">
                    <p className="text-[10px] font-black text-blue-500 uppercase mb-4 text-center tracking-widest">Master Reference</p>
                    <img src={state.storyboardGrid || ''} className="w-full rounded-[1.5rem] aspect-[9/16] object-contain shadow-2xl bg-black/20" />
                  </div>
                </div>

                <div className="lg:col-span-3 grid md:grid-cols-3 gap-6">
                  {state.scenes.map((scene, idx) => (
                    <div key={scene.id} className="glass p-5 rounded-[2.5rem] flex flex-col h-full group">
                      <div className="aspect-[9/16] bg-black/40 rounded-[2rem] overflow-hidden relative mb-6 border border-white/5 shadow-inner">
                        {scene.image ? (
                          <>
                            {scene.videoUrl ? <video src={scene.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline /> : <img src={scene.image} className="w-full h-full object-cover" />}
                            <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a href={scene.videoUrl || scene.image} download className="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center shadow-2xl hover:bg-blue-600 hover:text-white transition-all"><i className="fa-solid fa-download"></i></a>
                            </div>
                            <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/10">Scene {idx+1}</div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {scene.isExtracting ? <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div> : <i className="fa-solid fa-hourglass opacity-20 text-2xl"></i>}
                          </div>
                        )}
                      </div>
                      {scene.image && !scene.videoUrl && (
                        <div className="mt-auto space-y-3">
                          <textarea placeholder="Motion prompt..." value={scenePrompts[idx]} onChange={(e) => { const n = [...scenePrompts]; n[idx] = e.target.value; setScenePrompts(n); }} className="w-full bg-black/20 border border-white/5 rounded-xl p-3 text-[10px] h-16 resize-none outline-none font-medium" />
                          <button disabled={scene.isGeneratingVideo} onClick={() => handleGenerateVideo(scene.id)} className="w-full py-3 rounded-xl bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 text-[10px] font-black uppercase tracking-widest transition-all">
                            {scene.isGeneratingVideo ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-video mr-2"></i> Render Video</>}
                          </button>
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