import React, { useState, useEffect, useRef } from 'react';
import { Upload, Wand2, LayoutGrid, Film, Download, ArrowRight, Sparkles, AlertTriangle, Play, Pause, ChevronRight, CheckCircle2, Sliders } from 'lucide-react';
import { generateCombinedImage, refineAndCustomize, generateStoryboardGrid, extractCell, generateSceneVideo } from './services/geminiService';

// --- KOMPONEN BARU: CyberProgress (Tanpa perlu file terpisah) ---
const CyberProgress = ({ progress, text }: { progress: number, text: string }) => (
  <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl">
    <div className="w-full max-w-md p-6 relative">
      {/* Box Container Kaca */}
      <div className="relative bg-gray-900/50 border border-cyan-500/30 rounded-xl p-8 shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden ring-1 ring-white/5">
        
        {/* Hiasan Sudut Tech */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400"></div>
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400"></div>
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-purple-400"></div>
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-purple-400"></div>

        {/* Teks Atas */}
        <div className="flex justify-between items-end mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="text-cyan-400 font-mono text-xs tracking-[0.25em] font-bold animate-pulse">
              {text.toUpperCase() || "SYSTEM PROCESSING"}
            </span>
          </div>
          <span className="text-white font-mono font-bold text-2xl tabular-nums tracking-tighter">
            {Math.round(progress)}<span className="text-sm text-gray-500 ml-1">%</span>
          </span>
        </div>

        {/* Bar Luar */}
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden border border-white/10 relative shadow-inner">
           {/* Grid Background Halus */}
           <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_50%,rgba(255,255,255,0.03)_50%)] bg-[length:4px_100%]"></div>
           
           {/* Bar Isi (Animasi Lebar) */}
           <div 
            className="h-full bg-gradient-to-r from-cyan-600 via-blue-500 to-purple-600 transition-all duration-300 ease-out relative shadow-[0_0_15px_rgba(6,182,212,0.5)]"
            style={{ width: `${progress}%` }}
           >
            {/* Efek Kilat Putih Bergerak */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full animate-[shimmer_2s_infinite]"></div>
            {/* Glow Ujung Bar */}
            <div className="absolute top-0 right-0 h-full w-[2px] bg-white shadow-[0_0_10px_2px_rgba(255,255,255,0.8)]"></div>
          </div>
        </div>

        {/* Teks Bawah */}
        <div className="mt-4 flex justify-between text-[10px] text-gray-400 font-mono tracking-wider opacity-80">
          <div className="flex gap-2">
             <span>CPU: <span className="text-green-400">OPTIMAL</span></span>
             <span className="text-gray-600">|</span>
             <span>MEM: <span className="text-yellow-400">ALLOCATED</span></span>
          </div>
          <span className="text-cyan-500/80">
             {progress < 30 ? "INITIALIZING NEURAL NET..." : 
              progress < 60 ? "GENERATING PIXELS..." : 
              progress < 90 ? "REFINING DETAILS..." : "FINALIZING..."}
          </span>
        </div>
      </div>
      
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[60%] bg-cyan-500/10 blur-[80px] -z-10 rounded-full"></div>
    </div>
  </div>
);
// -----------------------------------------------------------------

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
  const [progress, setProgress] = useState(0); // State baru untuk progress bar persentase
  const [error, setError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);

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

  // --- FUNGSI PROGRESS BAR SIMULATOR ---
  // Membuat efek loading berjalan perlahan sampai 90%, lalu mentok sampai proses selesai
  const startProgressSimulation = () => {
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90; // Mentok di 90% nunggu API
        }
        // Tambah progress acak biar terlihat natural
        return prev + Math.random() * 2; 
      });
    }, 200); // Update cepat setiap 200ms
    return interval;
  };
  // -------------------------------------

  const handleCombineAssets = async () => {
    if (!modelImage || !productImage) return;
    
    setIsProcessing(true);
    setLoadingMsg("Analisis AI & Penggabungan Aset...");
    setQuotaError(null);
    const progressInterval = startProgressSimulation(); // Mulai animasi bar

    try {
      const result = await generateCombinedImage(modelImage, productImage, (status) => setLoadingMsg(status));
      setCombinedImage(result);
      setCurrentStep('refine');
      setProgress(100); // Selesai
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("429") || err.message.includes("quota")) {
        setQuotaError("Kuota API Habis. Silakan coba lagi nanti atau ganti API Key.");
      } else {
        setError("Gagal menggabungkan aset. Coba lagi.");
      }
    } finally {
      clearInterval(progressInterval); // Stop animasi
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
        combinedImage, 
        bgPrompt, 
        bgPrompt, // Using prompt as ref for now
        selectedLighting, 
        neonText, 
        selectedStyle,
        (status) => setLoadingMsg(status)
      );
      setCombinedImage(result); // Update with refined version
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("429")) {
        setQuotaError("Kuota API Habis.");
      } else {
        setError("Gagal memproses gambar.");
      }
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
      console.error(err);
      if (err.message.includes("429")) {
        setQuotaError("Kuota API Habis.");
      } else {
        setError("Gagal membuat storyboard.");
      }
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
    
    // Reset scenes
    setScenes([]);

    try {
      // Extract 9 scenes
      const newScenes: GeneratedScene[] = [];
      
      // Process sequentially to avoid rate limits if needed, or parallel for speed
      // Using sequential for safety with extracting
      for (let i = 0; i < 9; i++) {
        setLoadingMsg(`Mengekstrak Scene ${i+1}/9...`);
        // Update progress bar manual sesuai scene yang sedang diproses
        setProgress(10 + ((i + 1) / 9) * 80); 

        const sceneBase64 = await extractCell(storyboardGrid, i);
        newScenes.push({
          id: i,
          imageUrl: sceneBase64,
          isGeneratingVideo: false
        });
      }
      
      setScenes(newScenes);
      setCurrentStep('final');
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("429")) {
        setQuotaError("Kuota API Habis saat ekstraksi.");
      } else {
        setError("Gagal memproses final scenes.");
      }
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
      console.error(err);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGeneratingVideo: false } : s));
      if (err.message.includes("429")) {
        alert("Kuota API Video Habis. Coba lagi nanti.");
      } else {
        alert("Gagal membuat video.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500/30">
      
      {/* --- GANTI LOADING LAMA DENGAN CYBERPROGRESS --- */}
      {isProcessing && (
        <CyberProgress progress={progress} text={loadingMsg} />
      )}
      
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              UGC AI <span className="text-cyan-400">AFFILIATE</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-1 text-sm font-medium text-gray-400">
             <span className={currentStep === 'upload' ? 'text-cyan-400' : ''}>Upload</span>
             <ChevronRight className="w-4 h-4" />
             <span className={currentStep === 'refine' ? 'text-cyan-400' : ''}>Refine</span>
             <ChevronRight className="w-4 h-4" />
             <span className={currentStep === 'storyboard' ? 'text-cyan-400' : ''}>Storyboard</span>
             <ChevronRight className="w-4 h-4" />
             <span className={currentStep === 'final' ? 'text-cyan-400' : ''}>Render</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {quotaError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3 text-red-200">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <p>{quotaError}</p>
          </div>
        )}

        {/* STEP 1: UPLOAD */}
        {currentStep === 'upload' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-white">Upload Assets</h2>
              <p className="text-gray-400">Upload your model photo and the product you want them to wear.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Model Upload */}
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-300">Model Reference (Person)</label>
                <div className="relative group aspect-[3/4] bg-gray-900 rounded-xl border-2 border-dashed border-gray-700 hover:border-cyan-500/50 transition-all overflow-hidden">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'model')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  {modelImage ? (
                    <img src={modelImage} alt="Model" className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-cyan-400 transition-colors">
                      <Upload className="w-10 h-10 mb-2" />
                      <span className="text-sm">Click to upload model</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Upload */}
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-300">Product Reference (Item)</label>
                <div className="relative group aspect-[3/4] bg-gray-900 rounded-xl border-2 border-dashed border-gray-700 hover:border-purple-500/50 transition-all overflow-hidden">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'product')}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  {productImage ? (
                    <img src={productImage} alt="Product" className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-purple-400 transition-colors">
                      <Upload className="w-10 h-10 mb-2" />
                      <span className="text-sm">Click to upload product</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <button
                onClick={handleCombineAssets}
                disabled={!modelImage || !productImage || isProcessing}
                className="group relative px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? 'Processing...' : 'Generate Magic'}
                <Wand2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REFINE */}
        {currentStep === 'refine' && combinedImage && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-right-8 duration-500">
            {/* Left: Image Preview */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <div className="aspect-[9/16] rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative group">
                  <img src={combinedImage} alt="Result" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <button className="w-full py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg text-sm font-medium hover:bg-white/20">
                      Download Preview
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h2 className="text-2xl font-bold mb-2">Refine & Branding</h2>
                <p className="text-gray-400">Customize the background, lighting, and add your neon branding.</p>
              </div>

              <div className="space-y-6 bg-gray-900/50 p-6 rounded-2xl border border-white/5">
                {/* Branding Text */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-cyan-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Neon Branding Text
                  </label>
                  <input 
                    type="text" 
                    value={neonText}
                    onChange={(e) => setNeonText(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono tracking-wider"
                    placeholder="Enter brand name..."
                  />
                </div>

                {/* Font Style */}
                <div className="space-y-3">
                   <label className="text-sm font-medium text-gray-300">Neon Font Style</label>
                   <div className="grid grid-cols-3 gap-3">
                     {['Cursive', 'Bold Sans', 'Cyberpunk', 'Minimal'].map((style) => (
                       <button
                         key={style}
                         onClick={() => setSelectedStyle(style)}
                         className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                           selectedStyle === style 
                             ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' 
                             : 'bg-black/30 text-gray-400 border border-white/5 hover:bg-white/5'
                         }`}
                       >
                         {style}
                       </button>
                     ))}
                   </div>
                </div>

                {/* Background Prompt */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-300">Environment Prompt</label>
                  <textarea 
                    value={bgPrompt}
                    onChange={(e) => setBgPrompt(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors h-24 resize-none"
                    placeholder="Describe the background..."
                  />
                </div>

                {/* Lighting Presets */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Sliders className="w-4 h-4" /> Studio Lighting
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Cinematic Warm', 'Cyberpunk Neon', 'Soft Natural', 'Studio Dark'].map((light) => (
                      <button 
                        key={light}
                        onClick={() => setSelectedLighting(light)}
                        className={`p-3 rounded-lg text-left text-sm border transition-all ${
                          selectedLighting === light 
                            ? 'bg-purple-500/10 border-purple-500/50 text-purple-200' 
                            : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/20'
                        }`}
                      >
                        {light}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-white/10">
                <button
                  onClick={handleRefineImage}
                  disabled={isProcessing}
                  className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors"
                >
                  Apply Refinements
                </button>
                <button
                  onClick={handleGenerateStoryboard}
                  disabled={isProcessing}
                  className="flex-1 px-6 py-3 bg-white text-black hover:bg-cyan-400 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                >
                  Generate Storyboard <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: STORYBOARD GRID */}
        {currentStep === 'storyboard' && storyboardGrid && (
          <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Storyboard Review</h2>
                <p className="text-gray-400">AI has generated 9 unique variations. Ready to extract?</p>
              </div>
              <button
                onClick={handleProcessFinalScenes}
                className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)]"
              >
                <LayoutGrid className="w-4 h-4" /> Process Final Scenes
              </button>
            </div>

            <div className="relative aspect-square w-full max-w-2xl mx-auto rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl">
              <img src={storyboardGrid} alt="Grid" className="w-full h-full object-cover" />
              
              {/* Overlay Grid Lines for visual effect */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="border border-white/20 flex items-center justify-center">
                    <span className="text-white/30 text-4xl font-black">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: FINAL RENDER */}
        {currentStep === 'final' && scenes.length > 0 && (
          <div className="space-y-12 animate-in fade-in duration-700">
            <div className="text-center space-y-4 mb-12">
               <h2 className="text-4xl font-black tracking-tighter text-white">FINAL RENDER</h2>
               <p className="text-cyan-400 font-mono text-sm tracking-widest uppercase">Individual Shot Selection & Motion Export</p>
               <div className="w-24 h-1 bg-gradient-to-r from-cyan-500 to-purple-600 mx-auto rounded-full"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {scenes.map((scene) => (
                <div key={scene.id} className="group relative bg-gray-900 rounded-2xl overflow-hidden border border-white/10 hover:border-cyan-500/50 transition-all hover:-translate-y-1 duration-300 shadow-xl">
                  {/* Image/Video Display */}
                  <div className="aspect-[9/16] relative bg-black">
                    {scene.videoUrl ? (
                      <video 
                        src={scene.videoUrl} 
                        className="w-full h-full object-cover" 
                        autoPlay 
                        loop 
                        muted 
                        playsInline
                      />
                    ) : (
                      <img src={scene.imageUrl} alt={`Scene ${scene.id}`} className="w-full h-full object-cover" />
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-4 left-4">
                       <span className="px-2 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded text-xs font-mono text-white">
                         SHOT 0{scene.id + 1}
                       </span>
                    </div>

                    {/* Loading Overlay for Video Gen */}
                    {scene.isGeneratingVideo && (
                      <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 backdrop-blur-sm z-10">
                        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs font-mono text-cyan-400 animate-pulse">GENERATING MOTION...</span>
                      </div>
                    )}
                  </div>

                  {/* Action Bar */}
                  <div className="p-4 bg-gray-900 border-t border-white/5 space-y-3">
                     <p className="text-xs text-gray-500 line-clamp-2">
                       Subtle cinematic motion, elegant model moves naturally.
                     </p>
                     
                     {!scene.videoUrl ? (
                       <button
                         onClick={() => handleGenerateMotion(scene.id)}
                         disabled={scene.isGeneratingVideo}
                         className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 group-hover:bg-cyan-500/10 group-hover:text-cyan-400 group-hover:border-cyan-500/30"
                       >
                         <Play className="w-3 h-3 fill-current" /> GENERATE MOTION
                       </button>
                     ) : (
                       <div className="flex gap-2">
                         <a 
                           href={scene.videoUrl} 
                           download={`scene-${scene.id}.mp4`}
                           className="flex-1 py-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-sm font-medium text-green-400 transition-all flex items-center justify-center gap-2"
                         >
                           <Download className="w-3 h-3" /> SAVE VIDEO
                         </a>
                       </div>
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
