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
  const [debugLog, setDebugLog] = useState<string>("System Ready");
  
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

  const handleOpenKeyPicker = async () => {
    setDebugLog("Triggering Google Project Dialog...");
    try {
      if (window.aistudio?.openSelectKey) {
        // Trigger dialog tapi jangan ditunggu (Race condition mitigation)
        window.aistudio.openSelectKey();
        setDebugLog("Dialog Triggered. Please select project in the popup.");
        setError(null);
      } else {
        setDebugLog("Error: aistudio object not found.");
        setError("Sistem Google tidak terdeteksi. Pastikan Anda menggunakan Chrome.");
      }
    } catch (e) {
      setDebugLog("Dialog Exception: " + String(e));
    }
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
    const msg = err.message || "Terjadi kendala teknis.";
    if (msg.includes("API_KEY_MISSING") || msg.includes("Requested entity was not found")) {
      setError("DIBUTUHKAN PROJECT KEY: Klik 'HUBUNGKAN PROJECT' di sidebar kiri dan pilih project Anda.");
      setDebugLog("Status: Key missing from environment.");
    } else {
      setError(msg);
      setDebugLog("Error: " + msg);
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
            <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg transition-transform hover:rotate-12 cursor-pointer" onClick={() => window.location.reload()}>
                <i className="fa-solid fa-crown text-white"></i>
            </div>
            <span className="text-lg font-black tracking-tighter uppercase leading-tight">Multishot <br/><span className="text-blue-500">Pro Edition</span></span>
          </div>
          
          <nav className="space-y-3 flex-1">
            {steps.map((s) => (
              <button key={s.id} disabled={!s.isUnlocked} onClick={() => setStep(s.id)} className={`w-full flex items-center gap-5 px-6 py-5 rounded-2xl transition-all border text-left ${step === s.id ? 'bg-blue-600/10 text-blue-400 border-blue-500/20 shadow-lg shadow-blue-500/5' : 'text-zinc-500 border-transparent hover:bg-white/5'} ${!s.isUnlocked ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <i className={`fa-solid ${s.isUnlocked ? s.icon : 'fa-lock'}`}></i>
                <span className="font-bold text-xs uppercase tracking-widest">{s.label}</span>
              </button>
            ))}
          </nav>

          <div className="pt-8 border-t border-white/5 space-y-4">
             <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                <p className="text-[8px] font-black uppercase text-zinc-600 mb-2 tracking-[0.2em]">Console Debug</p>
                <p className="text-[9px] font-mono text-blue-400/70 truncate">{debugLog}</p>
             </div>
             <button onClick={handleOpenKeyPicker} className="w-full py-5 text-[11px] font-black text-white bg-blue-600 hover:bg-blue-500 uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-600/20 active:scale-95">
                <i className="fa-solid fa-link"></i> Hubungkan Project
             </button>
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
            <p className="text-2xl font-black gradient-text uppercase tracking-tighter mb-4 text-center">{loadingMsg || 'Sabar dulu bos...'}</p>
            {retryMsg && <p className="text-blue-400/80 text-[11px] font-black uppercase tracking-[0.2em] animate-pulse bg-blue-500/5 px-6 py-2 rounded-full border border-blue-500/10">{retryMsg}</p>}
          </div>
        )}

        <div className="max-w-[1400px] mx-auto pb-32">
          {error && (
            <div className="mb-8 p-8 bg-red-600/10 border border-red-500/20 text-red-400 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-6 animate-up shadow-2xl shadow-red-600/5">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-red-500/20 rounded-2xl flex items-center justify-center text-2xl shadow-inner"><i className="fa-solid fa-key"></i></div>
                <div>
                    <p className="text-sm font-black uppercase tracking-tighter mb-1 leading-none">{error}</p>
                    <p className="text-[10px] font-medium opacity-60 uppercase tracking-widest">Pilih project dengan billing aktif untuk akses Tier 1 yang lebih cepat.</p>
                </div>
              </div>
              <button onClick={handleOpenKeyPicker} className="px-10 py-5 bg-white text-black rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-xl active:scale-95">HUBUNGKAN SEKARANG</button>
            </div>
          )}

          {step === AppStep.UPLOAD && (
            <div className="grid lg:grid-cols-2 gap-10 animate-up">
              {[ {t: 'Subject Model', d: 'model'}, {t: 'Product Asset', d: 'product'} ].map((u) => (
                <div key={u.d} className="glass p-12 rounded-[3.5rem] flex flex-col items-center text-center transition-transform hover:scale-[1.01]">
                  <h3 className="text-2xl font-black mb-10 uppercase tracking-tighter gradient-text">{u.t}</h3>
                  <label className="w-full h-[450px] border-2 border-dashed border-zinc-800/50 hover:border-blue-500/50 rounded-[3rem] flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group transition-all bg-black/20 shadow-inner">
                    {(state as any)[`${u.d}Image`] ? <img src={(state as any)[`${u.d}Image`]} className="w-full h-full object-contain p-10 drop-shadow-2xl" alt={u.t} /> : <div className="flex flex-col items-center opacity-30 group-hover:opacity-100 transition-opacity"><i className="fa-solid fa-cloud-arrow-up text-5xl mb-6 text-blue-500"></i><span className="text-xs font-black uppercase tracking-[0.3em]">Klik atau Tarik File</span></div>}
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, u.d as any)} />
                  </label>
                </div>
              ))}
              <div className="lg:col-span-2 flex justify-center pt-10">
                <button disabled={!state.modelImage || !state.productImage} onClick={startProcessing} className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:opacity-50 px-24 py-8 rounded-[2.5rem] font-black uppercase tracking-[0.4em] text-sm shadow-2xl transition-all active:scale-95 shadow-blue-600/20">Mulai Produksi Pro</button>
              </div>
            </div>
          )}

          {step === AppStep.REFINE && state.combinedImage && (
            <div className="grid lg:grid-cols-2 gap-16 animate-up">
              <div className="glass p-5 rounded-[4rem] sticky top-14 self-start shadow-2xl border-white/10"><img src={state.combinedImage} className="w-full rounded-[3.5rem] aspect-[9/16] object-contain bg-black/50" /></div>
              <div className="space-y-12 py-6">
                <div className="space-y-2">
                    <h2 className="text-5xl font-black tracking-tighter uppercase leading-none">Kustomisasi <br/><span className="text-blue-500">Ruang (Pro)</span></h2>
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em]">Personalized Brand Experience</p>
                </div>
                <div className="glass p-10 rounded-[3rem] space-y-10 border-white/5 bg-white/[0.02]">
                  <div><label className="block text-[11px] font-black text-zinc-500 uppercase mb-4 tracking-widest">Prompt Lingkungan (Background)</label><textarea value={options.background} onChange={(e) => setOptions(o => ({...o, background: e.target.value}))} className="w-full bg-black/60 border border-white/10 rounded-3xl p-6 text-xs h-40 resize-none outline-none focus:border-blue-500/50 transition-all font-medium leading-relaxed" /></div>
                  <div><label className="block text-[11px] font-black text-blue-500 uppercase mb-4 tracking-widest">Nama Brand (Neon Signage)</label><input type="text" value={options.neonText} onChange={(e) => setOptions(o => ({...o, neonText: e.target.value}))} className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-5 text-sm font-black uppercase tracking-[0.2em] outline-none focus:border-blue-500/50" /></div>
                </div>
                <div className="flex flex-col gap-5 pt-4">
                  <button onClick={handleRefine} className="py-6 rounded-3xl border border-white/10 hover:bg-white/5 font-black text-[11px] uppercase tracking-widest transition-all">Perbarui Preview Detail</button>
                  <button onClick={goToStoryboard} className="py-8 rounded-[3rem] bg-blue-600 hover:bg-blue-500 font-black uppercase tracking-[0.4em] shadow-2xl text-sm transition-all active:scale-95 shadow-blue-600/30">Rancang Storyboard</button>
                </div>
              </div>
            </div>
          )}

          {step === AppStep.STORYBOARD && state.storyboardGrid && (
            <div className="max-w-4xl mx-auto flex flex-col items-center animate-up">
              <div className="text-center mb-16 space-y-3">
                  <h2 className="text-5xl font-black tracking-tighter uppercase leading-none">Master <span className="text-blue-500">Montage</span></h2>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.5em]">High Fidelity 1K Grid System</p>
              </div>
              <div className="glass p-6 rounded-[4.5rem] mb-16 shadow-2xl border-white/10 bg-white/[0.01]"><img src={state.storyboardGrid} className="w-full rounded-[3.5rem] aspect-[9/16] object-contain shadow-2xl" /></div>
              <button onClick={startExtraction} className="bg-blue-600 hover:bg-blue-500 px-32 py-10 rounded-[3.5rem] font-black text-xl uppercase tracking-[0.4em] shadow-2xl transition-all active:scale-95 shadow-blue-600/30">Mulai Ekstraksi</button>
            </div>
          )}

          {step === AppStep.RESULTS && (
            <div className="space-y-16 animate-up">
              <div className="flex flex-col md:flex-row justify-between items-end gap-6 px-6">
                <div>
                    <h2 className="text-5xl font-black tracking-tighter mb-2 uppercase leading-none">Final <span className="text-blue-500">Assets</span></h2>
                    <p className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.5em]">Commercial Ready Output</p>
                </div>
                <div className="text-right glass px-8 py-5 rounded-3xl border-white/5">
                  <p className="text-[10px] font-black text-blue-500 uppercase mb-3 tracking-widest">Extraction Progress</p>
                  <div className="w-64 h-1.5 bg-zinc-900 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-blue-600 transition-all duration-1000 shadow-[0_0_15px_rgba(59,130,246,0.5)]" style={{ width: `${state.extractionProgress}%` }}></div></div>
                </div>
              </div>

              <div className="grid lg:grid-cols-4 gap-12">
                <div className="lg:col-span-1">
                  <div className="glass p-5 rounded-[3.5rem] sticky top-10 border-blue-500/10 shadow-2xl bg-white/[0.01]">
                    <p className="text-[10px] font-black text-blue-500 uppercase mb-6 text-center tracking-[0.3em]">Master Reference</p>
                    <img src={state.storyboardGrid || ''} className="w-full rounded-[2.5rem] aspect-[9/16] object-contain shadow-2xl bg-black/40" />
                  </div>
                </div>

                <div className="lg:col-span-3 grid md:grid-cols-3 gap-8">
                  {state.scenes.map((scene, idx) => (
                    <div key={scene.id} className="glass p-6 rounded-[3.5rem] flex flex-col h-full group border-white/5 hover:border-blue-500/20 transition-all bg-white/[0.01]">
                      <div className="aspect-[9/16] bg-black/60 rounded-[2.5rem] overflow-hidden relative mb-8 border border-white/5 shadow-inner">
                        {scene.image ? (
                          <>
                            {scene.videoUrl ? <video src={scene.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline /> : <img src={scene.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />}
                            <div className="absolute top-6 right-6 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                              <a href={scene.videoUrl || scene.image} download className="w-12 h-12 bg-white text-black rounded-2xl flex items-center justify-center shadow-2xl hover:bg-blue-600 hover:text-white transition-all transform hover:scale-110"><i className="fa-solid fa-download"></i></a>
                            </div>
                            <div className="absolute bottom-6 left-6 bg-black/70 backdrop-blur-md px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-white/10 shadow-xl">Scene {idx+1}</div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-black/40">
                            {scene.isExtracting ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-10 h-10 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
                                    <span className="text-[9px] font-black uppercase text-blue-500 tracking-widest animate-pulse">Extracting</span>
                                </div>
                            ) : <i className="fa-solid fa-hourglass opacity-10 text-4xl"></i>}
                          </div>
                        )}
                      </div>
                      {scene.image && !scene.videoUrl && (
                        <div className="mt-auto space-y-4">
                          <textarea placeholder="Motion prompt (e.g. elegant walk)..." value={scenePrompts[idx]} onChange={(e) => { const n = [...scenePrompts]; n[idx] = e.target.value; setScenePrompts(n); }} className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-[11px] h-20 resize-none outline-none font-medium leading-relaxed focus:border-blue-500/30 transition-all" />
                          <button disabled={scene.isGeneratingVideo} onClick={() => handleGenerateVideo(scene.id)} className="w-full py-4 rounded-2xl bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 text-[10px] font-black uppercase tracking-[0.3em] transition-all shadow-lg active:scale-95">
                            {scene.isGeneratingVideo ? <><i className="fa-solid fa-spinner fa-spin mr-2"></i> Rendering</> : <><i className="fa-solid fa-video mr-2"></i> Render Motion</>}
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