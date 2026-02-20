import React, { useState, useRef } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { analyzeImageWithGemini } from '@/src/utils/ai';

const FitnessView: React.FC<{ setView?: (v: any) => void }> = ({ setView }) => {
  const { store, saveStore } = useStore();
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Fit Logic (from CP002) ---
  const meta = store.profile?.metaAgua || 2800;
  const currentWater = store.water || 0;
  const hydration = currentWater / 1000;
  const metaLiters = meta / 1000;
  const hydrationPercent = Math.min((currentWater / meta) * 100, 100);

  const handleUpdateWater = (amount: number) => {
    const newWater = Math.max(0, Math.min(currentWater + amount, meta));
    saveStore({ ...store, water: newWater });
  };

  const dias = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
  const todayName = dias[new Date().getDay()];
  const displayDay = store.selectedDay || todayName;
  const exKey = Object.keys(store.exercises || {}).find(k => k.toUpperCase() === displayDay) || displayDay;
  const exercisesList = store.exercises?.[exKey] || [];
  const completedList = store.doneEx?.[displayDay] || [];

  const toggleExercise = (idx: number) => {
    const newDone = [...completedList];
    const pos = newDone.indexOf(idx);
    if (pos === -1) newDone.push(idx);
    else newDone.splice(pos, 1);
    saveStore({ ...store, doneEx: { ...store.doneEx, [displayDay]: newDone } });
  };

  // --- Video Parsing ---
  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      // modestbranding=1, rel=0 for clean experience
      return `https://www.youtube.com/embed/${match[2]}?modestbranding=1&rel=0&iv_load_policy=3`;
    }
    return null;
  };

  const isDirectMedia = (url: string) => {
    return url.match(/\.(mp4|webm|ogg|gif|jpg|jpeg|png)$|^data:image\/(gif|png|jpeg)/i);
  };

  const VideoModal = () => {
    if (!activeVideoUrl) return null;
    const embedUrl = getYouTubeEmbedUrl(activeVideoUrl);
    const directMedia = isDirectMedia(activeVideoUrl);

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-2xl rounded-[40px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-slate-900 tracking-tight">GUÍA TÉCNICA</h3>
              <p className="text-[10px] text-primary font-bold uppercase tracking-widest">Sin distracciones</p>
            </div>
            <button
              onClick={() => setActiveVideoUrl(null)}
              className="size-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all active:scale-90"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="aspect-video bg-black relative flex items-center justify-center text-center">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            ) : directMedia ? (
              <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                {activeVideoUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                  <video src={activeVideoUrl} controls autoPlay loop className="max-w-full max-h-full" />
                ) : (
                  <img src={activeVideoUrl} alt="Guía" className="max-w-full max-h-full object-contain" />
                )}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-10 gap-6 bg-slate-900">
                <div className="size-20 bg-white/10 rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-4xl text-white/40">video_library</span>
                </div>
                <div>
                  <p className="text-white font-black text-lg">Contenido Externo</p>
                  <p className="text-white/40 text-xs mt-1">Este ejercicio debe verse en su sitio original.</p>
                </div>
                <a
                  href={activeVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-xs tracking-widest uppercase shadow-2xl shadow-primary/40 hover:scale-105 transition-transform"
                >
                  Ver Ejercicio ↗
                </a>
              </div>
            )}
          </div>
          <div className="p-6 bg-slate-50 text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Powered by MN-NutriScan Pro</p>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <main className="p-4 pb-20 overflow-y-auto">
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Hydration */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-6xl text-primary font-fill">water_drop</span>
            </div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Hidratación</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">Status: {hydrationPercent === 100 ? 'Meta lograda' : 'En progreso'}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-primary">{hydration.toFixed(1)}<span className="text-sm">L</span></span>
                <p className="text-[10px] text-slate-400 font-bold">META: {metaLiters}L</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full transition-all duration-700" style={{ width: `${hydrationPercent}%` }}></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleUpdateWater(-250)} className="size-10 rounded-xl bg-slate-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-lg">remove</span>
                </button>
                <button onClick={() => handleUpdateWater(250)} className="size-10 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 flex items-center justify-center active:scale-95 transition-all">
                  <span className="material-symbols-outlined text-lg">add</span>
                </button>
              </div>
            </div>
          </section>

          {/* Daily Plan Headers */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-bold text-slate-900">Entrenamiento</h3>
            <span className="text-xs font-bold text-primary bg-primary/5 px-3 py-1 rounded-full uppercase">{displayDay}</span>
          </div>

          {/* Exercises */}
          <div className="space-y-3">
            {exercisesList.length > 0 ? exercisesList.map((ex: any, idx: number) => {
              const isCompleted = completedList.includes(idx);
              return (
                <div key={idx} className={`p-4 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 transition-all ${isCompleted ? 'opacity-60 bg-slate-50/50' : ''}`}>
                  <div
                    onClick={() => toggleExercise(idx)}
                    className={`size-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${isCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <span className="material-symbols-outlined">{isCompleted ? 'check_circle' : 'fitness_center'}</span>
                  </div>
                  <div className="flex-1" onClick={() => toggleExercise(idx)}>
                    <h4 className={`font-bold text-slate-900 ${isCompleted ? 'line-through text-slate-400' : ''}`}>{ex.n}</h4>
                    <p className="text-xs text-slate-500 line-clamp-1">{ex.i}</p>
                  </div>
                  {ex.link ? (
                    <button
                      onClick={() => setActiveVideoUrl(ex.link)}
                      className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all active:scale-95 shadow-lg shadow-primary/5"
                      title="Ver Video"
                    >
                      <span className="material-symbols-outlined text-xl font-fill">play_circle</span>
                    </button>
                  ) : (
                    <a
                      href={`https://www.youtube.com/results?search_query=ejercicio+${encodeURIComponent(ex.n)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="size-10 rounded-xl bg-slate-50 text-slate-300 flex items-center justify-center hover:bg-blue-50 hover:text-blue-500 transition-all active:scale-95 shadow-sm"
                      title="Buscar Video"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="material-symbols-outlined text-xl">search</span>
                    </a>
                  )}
                </div>
              )
            }) : (
              <div className="p-10 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                <span className="material-symbols-outlined text-4xl text-slate-200 mb-2">hotel</span>
                <p className="text-sm font-bold text-slate-400 italic">Día de recuperación.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <VideoModal />
    </div>
  );
};

export default FitnessView;
