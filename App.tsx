import React, { useState, useEffect } from 'react';
import { Upload, Wand2, LayoutGrid, Download, ArrowRight, Sparkles, AlertTriangle, Play, ChevronRight, Sliders, Menu, X } from 'lucide-react'; // Tambah icon Menu & X
import { generateCombinedImage, refineAndCustomize, generateStoryboardGrid, extractCell, generateSceneVideo } from './services/geminiService';

// --- KOMPONEN BARU: CyberProgress (Responsif) ---
const CyberProgress = ({ progress, text }: { progress: number, text: string }) => (
  <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl px-4">
    <div className="w-full max-w-md p-6 relative">
      {/* Box Container Kaca */}
      <div className="relative bg-gray-900/50 border border-cyan-500/30 rounded-xl p-6 md:p-8 shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden ring-1 ring-white/5">
        
        {/* Hiasan Sudut Tech */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400"></div>
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400"></div>
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-purple-400"></div>
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-purple-400"></div>

        {/* Teks Atas */}
        <div className="flex justify-between items-end mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-cyan-400 font-mono text-[10px] md:text-xs tracking-[0.2em] font-bold animate-pulse">
              {text.toUpperCase() || "PROCESSING"}
            </span>
          </div>
          <span className="text-white font-mono font-bold text-xl md:text-2xl tabular-nums tracking-tighter">
            {Math.round(progress)}<span className="text-sm text-gray-500 ml-1">%</span>
          </span>
        </div>

        {/* Bar Luar */}
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden border border-white/10 relative shadow-inner">
           <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_50%,rgba(255,255,255,0.03)_50%)] bg-[length:4px_100%]"></div>
           <div 
            className="h-full bg-gradient-to-r from-cyan-600 via-blue-500 to-purple-600 transition-all duration-300 ease-out relative shadow-[0_0_15px_rgba(6,182,212,0.5)]"
            style={{ width: `${progress}%` }}
           >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full animate-[shimmer_2s_infinite]"></div>
          </div>
        </div>

        {/* Teks Bawah */}
        <div className="mt-4 flex flex-col md:flex-row justify-between text-[9px] md:text-[10px] text-gray-400 font-mono tracking-wider opacity-80 gap-1 md:gap-0">
          <div className="flex gap-2">
             <span>CPU: <span className="text-green-400">OK</span></span>
             <span className="text-gray-600">|</span>
             <span>MEM: <span className="text-yellow-400">OK</span></span>
          </div>
          <span className="text-cyan-500/80 truncate">
             {progress < 100 ? "EXECUTING NEURAL TASKS..." : "FINALIZING..."}
          </span>
        </div>
      </div>
    </div>
  </div>
);

type AppStep = 'upload' | 'refine' | 'storyboard' | 'final';

interface GeneratedScene {
  id: number;
  imageUrl: string;
  videoUrl?: string;
  isGeneratingVideo?: boolean;
}

function App() {
  const [currentStep, setCurrentStep] = useState<AppStep>('upload');
  
  // State for Upload Step
  const [modelImage, setModelImage] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<string | null>(null);
  
  // State for Refine Step
  const [combinedImage, setCombinedImage] = useState<string | null>(null);
  const [bgPrompt, setBgPrompt] = useState('Luxury modern minimalist penthouse living room with warm ambient lighting');
  const [neonText, setNeonText] = useState('LUXE');
  const [selectedStyle, setSelectedStyle] = useState('Cursive');
  const [selectedLighting, setSelectedLighting] = useState('Cinematic Warm');
  
  // State for Storyboard Step
  const [storyboardGrid, setStoryboardGrid] = useState<string | null>(null);
  
  // State for Final Step
  const [scenes, setScenes] = useState<GeneratedScene[]>([]);
  
  // General State
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [progress, setProgress] = useState(0); 
  const [error, setError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // State menu mobile

  // Helper function to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'model' | 'product') => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        if (type === 'model') setModelImage(base64);
        else setProductImage(base64);
        setError(null);
      } catch (err) {
        setError("Gagal memproses gambar");
      }
    }
  };

  const startProgressSimulation = () => {
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90; 
        }
        return prev + Math.random() * 2; 
      });
    }, 200); 
    return interval;
  };

  const handleCombineAssets = async () => {
    if (!modelImage || !productImage) return;
    setIsProcessing(true);
    setLoadingMsg("Analisis AI & Penggabungan Aset...");
    setQuotaError(null);
    const progressInterval = startProgressSimulation();

    try {
      const result = await generateCombinedImage(modelImage, productImage, (status) => setLoadingMsg(status));
      setCombinedImage(result);
      setCurrentStep('refine');
      setProgress(100); 
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("429") || err.message.includes("quota")) {
        setQuotaError("Kuota API Habis. Coba lagi nanti.");
      } else {
        setError("Gagal menggabungkan aset. Coba lagi.");
      }
    } finally {
      clearInterval(progressInterval);
      setIsProcessing(false);
    }
  };

  const handleRefineImage = async () => {
    if (!combinedImage) return;
    setIsProcessing(true);
    setLoadingMsg("Menerapkan Pencahayaan & Branding...");
    setQuotaError(null);
    const progressInterval = startProgressSimulation();

    try {
      const result = await refineAndCustomize(
        combinedImage, bgPrompt, bgPrompt, selectedLighting, neonText, selectedStyle,
        (status) => setLoadingMsg(status)
      );
      setCombinedImage(result); 
      setProgress(100);
    } catch (err: any) {
      if (err.message.includes("429")) setQuotaError("Kuota API Habis.");
      else setError("Gagal memproses gambar.");
    } finally {
      clearInterval(progressInterval);
      setIsProcessing(false);
    }
  };

  const handleGenerateStoryboard = async () => {
    if (!combinedImage) return;
    setIsProcessing(true);
    setLoadingMsg("Membuat 9 Variasi Storyboard...");
    setQuotaError(null);
    const progressInterval = startProgressSimulation();

    try {
      const result = await generateStoryboardGrid(combinedImage, neonText, (status) => setLoadingMsg(status));
      setStoryboardGrid(result);
      setCurrentStep('storyboard');
      setProgress(100);
    } catch (err: any) {
      if (err.message.includes("429")) setQuotaError("Kuota API Habis.");
      else setError("Gagal membuat storyboard.");
    } finally {
      clearInterval(progressInterval);
      setIsProcessing(false);
    }
  };

  const handleProcessFinalScenes = async () => {
    if (!storyboardGrid) return;
    setIsProcessing(true);
    setLoadingMsg("Mengekstrak Scene & Finalisasi...");
    setQuotaError(null);
    const progressInterval = startProgressSimulation();
    setScenes([]);

    try {
      const newScenes: GeneratedScene[] = [];
      for (let i = 0; i < 9; i++) {
        setLoadingMsg(`Mengekstrak Scene ${i+1}/9...`);
        setProgress(10 + ((i + 1) / 9) * 80); 
        const sceneBase64 = await extractCell(storyboardGrid, i);
        newScenes.push({ id: i, imageUrl: sceneBase64, isGeneratingVideo: false });
      }
      setScenes(newScenes);
      setCurrentStep('final');
      setProgress(100);
    } catch (err: any) {
      if (err.message.includes("429")) setQuotaError("Kuota API Habis saat ekstraksi.");
      else setError("Gagal memproses final scenes.");
    } finally {
      clearInterval(progressInterval);
      setIsProcessing(false);
    }
  };

  const handleGenerateMotion = async (sceneId: number) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGeneratingVideo: true } : s));
    setQuotaError(null);

    try {
      const videoUrl = await generateSceneVideo(scene.imageUrl, "Subtle cinematic motion, elegant model moves naturally");
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoUrl, isGeneratingVideo: false } : s));
    } catch (err: any) {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGeneratingVideo: false } : s));
      alert("Gagal membuat video/kuota habis.");
    }
  };

  // Navigasi Breadcrumb
  const steps = [
    { id: 'upload', label: 'Upload' },
    { id: 'refine', label: 'Refine' },
    { id: 'storyboard', label: 'Grid' },
    { id: 'final', label: 'Render' },
  ];

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500/30 overflow-x-hidden">
      
      {isProcessing && <CyberProgress progress={progress} text={loadingMsg} />}
      
      {/* HEADER RESPONSIVE */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent truncate">
              UGC AI <span className="text-cyan-400">AFFILIATE</span>
            </h1>
          </div>
          
          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-400">
             {steps.map((s, idx) => (
               <React.Fragment key={s.id}>
                 <span className={currentStep === s.id ? 'text-cyan-400' : ''}>{s.label}</span>
                 {idx < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
               </React.Fragment>
             ))}
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden p-2 text-gray-400" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Nav Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-gray-900 border-b border-white/10 p-4 space-y-2 animate-in slide-in-from-top-2">
             {steps.map((s) => (
               <div key={s.id} className={`p-2 rounded ${currentStep === s.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400'}`}>
                 {s.label}
               </div>
             ))}
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {quotaError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3 text-red-200 text-sm md:text-base">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p>{quotaError}</p>
          </div>
        )}

        {/* STEP 1: UPLOAD (Responsive Grid) */}
        {currentStep === 'upload' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <h2 className="text-2xl md:text-3xl font-bold text-white">Upload Assets</h2>
              <p className="text-sm md:text-base text-gray-400">Upload your model photo and the product.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {['model', 'product'].map((type) => (
                <div key={type} className="space-y-4">
                  <label className="block text-sm font-medium text-gray-300 capitalize">{type} Reference</label>
                  <div className="relative group aspect-[3/4] bg-gray-900 rounded-xl border-2 border-dashed border-gray-700 hover:border-cyan-500/50 transition-all overflow-hidden">
                    <input 
                      type="file" accept="image/*"
                      onChange={(e) => handleImageUpload(e, type as 'model' | 'product')}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    {(type === 'model' ? modelImage : productImage) ? (
                      <img src={(type === 'model' ? modelImage : productImage)!} alt={type} className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-cyan-400 transition-colors">
                        <Upload className="w-10 h-10 mb-2" />
                        <span className="text-sm">Tap to upload</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center pt-4">
              <button
                onClick={handleCombineAssets}
                disabled={!modelImage || !productImage || isProcessing}
                className="w-full sm:w-auto px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-cyan-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? 'Processing...' : 'Generate Magic'}
                <Wand2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REFINE (Responsive Stack) */}
        {currentStep === 'refine' && combinedImage && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-24">
                <div className="aspect-[9/16] rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative">
                  <img src={combinedImage} alt="Result" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-8">
              <div>
                <h2 className="text-2xl font-bold mb-2">Refine & Branding</h2>
                <p className="text-gray-400 text-sm">Customize the background & lighting.</p>
              </div>

              <div className="space-y-6 bg-gray-900/50 p-4 md:p-6 rounded-2xl border border-white/5">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-cyan-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Neon Branding
                  </label>
                  <input 
                    type="text" value={neonText} onChange={(e) => setNeonText(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-cyan-500 outline-none"
                    placeholder="Brand name..."
                  />
                </div>

                <div className="space-y-3">
                   <label className="text-sm font-medium text-gray-300">Neon Style</label>
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                     {['Cursive', 'Bold Sans', 'Cyberpunk', 'Minimal'].map((style) => (
                       <button
                         key={style} onClick={() => setSelectedStyle(style)}
                         className={`px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-all ${
                           selectedStyle === style ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-black/30 text-gray-400 border border-white/5'
                         }`}
                       >
                         {style}
                       </button>
                     ))}
                   </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-300">Background</label>
                  <textarea 
                    value={bgPrompt} onChange={(e) => setBgPrompt(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-cyan-500 outline-none h-24 resize-none text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-white/10">
                <button onClick={handleRefineImage} disabled={isProcessing} className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium">
                  Apply Refinements
                </button>
                <button onClick={handleGenerateStoryboard} disabled={isProcessing} className="flex-1 px-6 py-3 bg-white text-black hover:bg-cyan-400 rounded-lg font-bold flex items-center justify-center gap-2">
                  Generate Storyboard <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: STORYBOARD (Responsive Image) */}
        {currentStep === 'storyboard' && storyboardGrid && (
          <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <h2 className="text-2xl font-bold">Storyboard Review</h2>
                <p className="text-gray-400 text-sm">9 unique variations generated.</p>
              </div>
              <button
                onClick={handleProcessFinalScenes}
                className="w-full sm:w-auto px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
              >
                <LayoutGrid className="w-4 h-4" /> Process Final Scenes
              </button>
            </div>
            <div className="relative aspect-square w-full max-w-xl mx-auto rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl">
              <img src={storyboardGrid} alt="Grid" className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        {/* STEP 4: FINAL RENDER (Responsive Grid 1-2-3 Columns) */}
        {currentStep === 'final' && scenes.length > 0 && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <div className="text-center space-y-2 mb-8">
               <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-white">FINAL RENDER</h2>
               <p className="text-cyan-400 font-mono text-xs tracking-widest uppercase">Shot Selection & Motion Export</p>
               <div className="w-20 h-1 bg-gradient-to-r from-cyan-500 to-purple-600 mx-auto rounded-full"></div>
            </div>

            {/* GRID RESPONSIF UTAMA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {scenes.map((scene) => (
                <div key={scene.id} className="group relative bg-gray-900 rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                  <div className="aspect-[9/16] relative bg-black">
                    {scene.videoUrl ? (
                      <video src={scene.videoUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                    ) : (
                      <img src={scene.imageUrl} alt={`Scene ${scene.id}`} className="w-full h-full object-cover" />
                    )}

                    <div className="absolute top-4 left-4">
                       <span className="px-2 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-[10px] font-mono text-white">
                         SHOT 0{scene.id + 1}
                       </span>
                    </div>

                    {scene.isGeneratingVideo && (
                      <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 backdrop-blur-sm z-10">
                        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-[10px] font-mono text-cyan-400 animate-pulse">GENERATING...</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-gray-900 border-t border-white/5 space-y-3">
                     {!scene.videoUrl ? (
                       <button
                         onClick={() => handleGenerateMotion(scene.id)}
                         disabled={scene.isGeneratingVideo}
                         className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                       >
                         <Play className="w-3 h-3 fill-current" /> GENERATE MOTION
                       </button>
                     ) : (
                       <a 
                         href={scene.videoUrl} download={`scene-${scene.id}.mp4`}
                         className="w-full py-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-sm font-medium text-green-400 flex items-center justify-center gap-2"
                       >
                         <Download className="w-3 h-3" /> SAVE VIDEO
                       </a>
                     )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
