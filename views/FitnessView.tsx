import React, { useState, useRef } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { firebaseConfig } from '@/src/firebase';
import { analyzeImageWithGemini, getFitnessAdvice, generateFullRoutine } from '@/src/utils/ai';

const FitnessView: React.FC<{ setView?: (v: any) => void }> = ({ setView }) => {
  const { store, saveStore } = useStore();
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
  const [isGeneratingRoutine, setIsGeneratingRoutine] = useState(false);

  // --- Fit Logic (from CP002) ---
  const meta = store.profile?.metas_y_objetivos?.agua_objetivo_ml || 2800;
  const currentWater = store.water || 0;
  const hydration = currentWater / 1000;
  const metaLiters = meta / 1000;
  const hydrationPercent = Math.min((currentWater / meta) * 100, 100);

  const handleUpdateWater = (amount: number, type: string = 'Agua') => {
    const newEntry = {
      id: Date.now().toString(),
      type,
      amount,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };

    const newWater = Math.max(0, currentWater + amount);
    saveStore({
      ...store,
      water: newWater,
      waterHistory: [newEntry, ...(store.waterHistory || [])]
    });
  };

  const handleUndoWater = () => {
    if (!store.waterHistory || store.waterHistory.length === 0) return;
    const [last, ...rest] = store.waterHistory;
    const newWater = Math.max(0, currentWater - last.amount);
    saveStore({
      ...store,
      water: newWater,
      waterHistory: rest
    });
    alert(`✅ Toma de ${last.type} (${last.amount}ml) eliminada.`);
  };

  const getNextSuggestedIntake = () => {
    if (!store.schedule) return "Programar horario primero";

    const now = new Date();
    const schedule = store.schedule;
    const entries = Object.entries(schedule).filter(([k]) =>
      ['DESAYUNO', 'ALMUERZO', 'CENA'].includes(k.toUpperCase())
    );

    // Convert schedule times to Date objects for today
    const exclusionZones = entries.map(([name, timeStr]) => {
      const [time, period] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;

      const mealDate = new Date();
      mealDate.setHours(hours, minutes, 0, 0);

      return {
        name,
        start: new Date(mealDate.getTime() - 30 * 60000),
        end: new Date(mealDate.getTime() + 60 * 60000)
      };
    });

    // Check if currently in exclusion zone
    const currentZone = exclusionZones.find(z => now >= z.start && now <= z.end);
    if (currentZone) {
      const nextAvailable = new Date(currentZone.end.getTime() + 10 * 60000); // 10 min after zone
      return `Sugerido: ${nextAvailable.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    }

    // Otherwise, suggest 1 hour from now, but check if that hits a future zone
    let suggested = new Date(now.getTime() + 60 * 60000);
    const futureZone = exclusionZones.find(z => suggested >= z.start && suggested <= z.end);
    if (futureZone) {
      suggested = new Date(futureZone.end.getTime() + 10 * 60000);
    }

    return `${suggested.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} (350ml)`;
  };

  const normalizeDay = (day: string) => day.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const dias = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
  const todayName = dias[new Date().getDay()];
  const displayDay = store.selectedDay || todayName;

  // Normalización para búsqueda de rutina
  const normalizedDisplayDay = normalizeDay(displayDay);
  const exKey = Object.keys(store.exercises || {}).find(k => normalizeDay(k) === normalizedDisplayDay) || displayDay;

  const exercisesList = store.exercises?.[exKey] || [];
  const completedList = store.doneEx?.[displayDay] || [];

  const toggleExercise = (idx: number) => {
    const newDone = [...completedList];
    const pos = newDone.indexOf(idx);
    if (pos === -1) newDone.push(idx);
    else newDone.splice(pos, 1);
    saveStore({ ...store, doneEx: { ...store.doneEx, [displayDay]: newDone } });
  };

  const handleGenerateAdvice = async () => {
    if (!store.profile) return;
    setIsGeneratingAdvice(true);
    try {
      const advice = await getFitnessAdvice(store.profile, (firebaseConfig as any).geminiApiKey || '');
      setAiAdvice(advice);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingAdvice(false);
    }
  };

  const handleGenerateRoutine = async () => {
    if (!store.profile) return;
    setIsGeneratingRoutine(true);
    try {
      const apiKey = (firebaseConfig as any).geminiApiKey || '';
      const routine = await generateFullRoutine(store.profile, apiKey);
      if (routine && Object.keys(routine).length > 0) {
        saveStore({ ...store, exercises: routine, doneEx: {} });
      }
    } catch (error) {
      console.error('Error generating routine:', error);
    } finally {
      setIsGeneratingRoutine(false);
    }
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
                title="Video del ejercicio"
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
          {/* Control Hídrico Premium */}
          <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-10">
              <div>
                <h2 className="text-xl font-black text-[#1e60f1] tracking-tight">Control Hídrico</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">META: {meta} ML</p>
              </div>
              <div className="size-12 bg-blue-50 rounded-2xl flex items-center justify-center text-[#1e60f1]">
                <span className="material-symbols-outlined text-2xl">inventory_2</span>
              </div>
            </div>

            {/* Premium Water Drop with Glassmorphism and Depth */}
            <div
              className="relative size-56 flex items-center justify-center cursor-pointer select-none active:scale-95 transition-all"
              onContextMenu={(e) => { e.preventDefault(); setShowHistory(true); }}
              onTouchStart={() => {
                longPressTimer.current = window.setTimeout(() => setShowHistory(true), 800);
              }}
              onTouchEnd={() => {
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
              }}
              onMouseDown={() => {
                longPressTimer.current = window.setTimeout(() => setShowHistory(true), 800);
              }}
              onMouseUp={() => {
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
              }}
            >
              <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-2xl">
                <defs>
                  <linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#1e60f1" />
                  </linearGradient>
                  <clipPath id="waterDropRefined">
                    <path d="M50,118 C28,118 10,98 10,75 C10,55 50,15 50,10 C50,15 90,55 90,75 C90,98 72,118 50,118 Z" />
                  </clipPath>
                  <filter id="glass">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="1" />
                  </filter>
                </defs>

                {/* Background Glass Layer */}
                <path
                  d="M50,118 C28,118 10,98 10,75 C10,55 50,15 50,10 C50,15 90,55 90,75 C90,98 72,118 50,118 Z"
                  fill="white"
                  fillOpacity="0.4"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  className="backdrop-blur-sm"
                />

                {/* Animated Filling Liquid */}
                <g clipPath="url(#waterDropRefined)">
                  <rect
                    x="0"
                    y={118 - (hydrationPercent * 1.08)}
                    width="100"
                    height="120"
                    fill="url(#waterGradient)"
                    className="transition-all duration-1000 ease-in-out"
                  />
                  {/* Organic Wave Effect */}
                  <path
                    d={`M-10,${118 - (hydrationPercent * 1.08)} C20,${118 - (hydrationPercent * 1.08) - 4} 40,${118 - (hydrationPercent * 1.08) + 4} 60,${118 - (hydrationPercent * 1.08) - 2} C80,${118 - (hydrationPercent * 1.08) - 6} 110,${118 - (hydrationPercent * 1.08)} 110,${118 - (hydrationPercent * 1.08)} V130 H-10 Z`}
                    fill="url(#waterGradient)"
                    className="animate-pulse opacity-80"
                  />
                  {/* Surface Light Reflection */}
                  <ellipse
                    cx="50"
                    cy={118 - (hydrationPercent * 1.08) + 2}
                    rx="30"
                    ry="3"
                    fill="white"
                    fillOpacity="0.2"
                    className="transition-all duration-1000"
                  />
                </g>

                {/* Outer Glow / Reflection */}
                <path
                  d="M35,35 C30,40 25,50 25,65"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeOpacity="0.3"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center pt-8 pointer-events-none">
                <div className="text-center group-hover:scale-105 transition-transform duration-500">
                  <span className={`text-[36px] font-black tracking-tight leading-none transition-colors duration-700 ${hydrationPercent > 55 ? 'text-white drop-shadow-md' : 'text-slate-800'}`}>
                    {currentWater}
                  </span>
                  <div className={`flex items-center justify-center gap-1 mt-0.5 transition-colors duration-700 ${hydrationPercent > 55 ? 'text-white/80' : 'text-slate-400'}`}>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">ml</span>
                  </div>
                </div>

                <div className={`mt-4 px-3 py-1 rounded-full backdrop-blur-md border transition-all duration-700 ${hydrationPercent > 55 ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                  <p className="font-black text-[8px] uppercase tracking-widest leading-none">
                    {(store.waterHistory?.length || 0)} / 8 Tomas
                  </p>
                </div>
              </div>
            </div>

            {/* Next Intake Suggestion */}
            <div className="bg-blue-50/50 px-6 py-3 rounded-full mt-10 mb-8 border border-blue-100/50">
              <p className="text-[11px] font-black text-[#1e60f1] tracking-wide">
                Próxima toma sugerida: <span className="font-extrabold">{getNextSuggestedIntake()}</span>
              </p>
            </div>

            {/* Quick Buttons */}
            <div className="grid grid-cols-4 gap-4 w-full">
              {[
                { label: 'Agua', amount: 350, icon: 'water_drop', color: 'text-blue-400' },
                { label: 'Café/Té', amount: 150, icon: 'coffee', color: 'text-amber-700' },
                { label: 'Colación', amount: 200, icon: 'soup_kitchen', color: 'text-blue-500' },
                { label: 'Bebida', amount: 300, icon: 'glass_cup', color: 'text-orange-500' }
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleUpdateWater(item.amount, item.label)}
                  className="flex flex-col items-center gap-2 bg-slate-50/50 p-4 rounded-3xl hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all active:scale-95 border border-transparent hover:border-slate-100"
                >
                  <span className={`material-symbols-outlined text-2xl ${item.color}`}>{item.icon}</span>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-slate-800 leading-tight">{item.label}</p>
                    <p className="text-[9px] text-slate-400 font-bold">{item.amount}ml</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Daily Plan Headers */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-bold text-slate-900">Entrenamiento</h3>
            <div className="flex items-center gap-2">
              {exercisesList.length > 0 && (
                <button
                  onClick={handleGenerateRoutine}
                  disabled={isGeneratingRoutine}
                  className="size-8 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all active:scale-95 disabled:opacity-50"
                  title="Regenerar rutina"
                >
                  <span className={`material-symbols-outlined text-sm ${isGeneratingRoutine ? 'animate-spin' : ''}`}>sync</span>
                </button>
              )}
              <span className="text-xs font-bold text-primary bg-primary/5 px-3 py-1 rounded-full uppercase">{displayDay}</span>
            </div>
          </div>

          {/* AI Recommendations Section */}
          <div className="bg-slate-900 p-6 rounded-[32px] shadow-2xl shadow-slate-900/20 border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[60px] text-white">psychology</span>
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="size-2 bg-primary rounded-full animate-pulse"></span>
                  <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em]">Bio-Análisis IA</p>
                </div>
                <button
                  onClick={handleGenerateAdvice}
                  disabled={isGeneratingAdvice}
                  className="bg-white/10 hover:bg-white/20 text-white size-8 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                >
                  <span className={`material-symbols-outlined text-lg ${isGeneratingAdvice ? 'animate-spin' : ''}`}>sync</span>
                </button>
              </div>

              {!aiAdvice && !isGeneratingAdvice && (
                <div className="py-2">
                  <h4 className="text-white font-black text-sm mb-1 uppercase">Recomendaciones de Élite</h4>
                  <p className="text-white/30 text-[10px] leading-relaxed">Analiza tu perfil clínico para recibir ajustes técnicos personalizados.</p>
                  <button
                    onClick={handleGenerateAdvice}
                    className="mt-4 w-full bg-primary text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                  >
                    GENERAR PROTOCOLO
                  </button>
                </div>
              )}

              {isGeneratingAdvice && (
                <div className="py-4 space-y-2">
                  <div className="h-4 bg-white/5 rounded-lg animate-pulse w-3/4"></div>
                  <div className="h-4 bg-white/5 rounded-lg animate-pulse w-1/2"></div>
                  <div className="h-4 bg-white/5 rounded-lg animate-pulse w-2/3"></div>
                </div>
              )}

              {aiAdvice && !isGeneratingAdvice && (
                <div className="space-y-3 py-2">
                  {aiAdvice.split('\n').filter(l => l.trim()).map((line, i) => (
                    <div key={i} className="flex gap-3 items-start bg-white/5 p-3 rounded-2xl border border-white/5">
                      <p className="text-xs text-blue-200 font-medium leading-relaxed">{line}</p>
                    </div>
                  ))}
                  {store.profile?.diagnostico_clinico?.comorbilidades?.includes('Hipertensión') && (
                    <div className="flex items-center gap-2 bg-red-500/10 p-3 rounded-2xl border border-red-500/20 mt-2">
                      <span className="material-symbols-outlined text-red-500 text-sm">warning</span>
                      <p className="text-[9px] text-red-400 font-black uppercase tracking-widest">Alerta HTA: Evitar Valsalva</p>
                    </div>
                  )}
                </div>
              )}
            </div>
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
              <div className="p-10 text-center bg-white rounded-3xl border border-dashed border-slate-200 space-y-4">
                {isGeneratingRoutine ? (
                  <>
                    <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
                    <p className="text-sm font-bold text-slate-600">Generando rutina personalizada...</p>
                    <p className="text-xs text-slate-400">Analizando perfil clínico, objetivos y prescripción</p>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-4xl text-slate-200 mb-2">fitness_center</span>
                    <p className="text-sm font-bold text-slate-500">Sin rutina asignada</p>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">Genera una rutina semanal personalizada basada en tu ficha médica, objetivos y prescripción de ejercicio.</p>
                    <button
                      onClick={handleGenerateRoutine}
                      className="mt-2 bg-primary text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:shadow-2xl hover:scale-[1.02] transition-all active:scale-95"
                    >
                      Generar Mi Rutina Semanal
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <VideoModal />
      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        history={store.waterHistory || []}
        onUndo={handleUndoWater}
      />
    </div>
  );
};

const HistoryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  history: any[];
  onUndo: () => void;
}> = ({ isOpen, onClose, history, onUndo }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white rounded-t-[40px] p-8 space-y-6 animate-in slide-in-from-bottom duration-500 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] max-h-[80vh] flex flex-col">

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Historial Hoy</h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-auto">Últimas {history.length} tomas</span>
          </div>
          <button onClick={onClose} className="size-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar py-2">
          {history.length > 0 ? history.map((entry) => (
            <div key={entry.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50 flex items-center gap-4">
              <div className="size-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-500 font-bold border border-slate-50">
                <span className="material-symbols-outlined text-xl">
                  {entry.type === 'Agua' ? 'water_drop' : (entry.type === 'Café/Té' ? 'coffee' : (entry.type === 'Colación' ? 'soup_kitchen' : 'glass_cup'))}
                </span>
              </div>
              <div className="flex-1">
                <h4 className="font-black text-slate-800 text-sm">{entry.type}</h4>
                <p className="text-[11px] text-slate-400 font-bold">{entry.amount} ml</p>
              </div>
              <span className="text-xs font-black text-slate-400">{entry.time}</span>
            </div>
          )) : (
            <div className="text-center py-10">
              <p className="text-slate-300 font-bold">Sin registros hoy</p>
            </div>
          )}
        </div>

        <div className="pt-4">
          <button
            onClick={() => { onUndo(); onClose(); }}
            disabled={history.length === 0}
            className="w-full bg-[#ef4444] text-white font-black py-5 rounded-[24px] text-xs uppercase tracking-[0.2em] shadow-xl shadow-red-100 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:shadow-none"
          >
            <span className="material-symbols-outlined text-lg">undo</span>
            Deshacer Última Toma {history.length > 0 ? `(${history[0].amount} ml)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FitnessView;
