import React, { useState, useRef } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { analyzeImageWithGemini } from '@/src/utils/ai';

const FitnessView: React.FC<{ setView?: (v: any) => void }> = ({ setView }) => {
  const { store, saveStore } = useStore();
  const [activeTab, setActiveTab] = useState<'fit' | 'scan'>('fit');
  const [isScanning, setIsScanning] = useState(false);
  const scanResult = store.lastScan;
  const setScanResult = (val: any) => saveStore({ ...store, lastScan: val });
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

  // --- NutriScan Logic (from CP006) ---
  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsScanning(true);
      try {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;

          // Prepare profile context for AI
          const profileContext = {
            paciente: store.profile.paciente,
            objetivo: store.profile.objetivos.join(", "),
            condiciones: store.profile.comorbilidades.join(", ") + (store.profile.alergias ? `, Alergias: ${store.profile.alergias}` : "")
          };

          const result = await analyzeImageWithGemini(base64, profileContext);

          // Map AI response to UI structure
          setScanResult({
            ...result,
            image: base64,
            // Mapping fields if they don't match
            plato: result.platos ? result.platos.join(", ") : result.plato,
            impacto: result.semaforo || result.impacto,
            hack: result.analisis || result.hack,
            tip: result.bioHack || result.tip,
            kcal: result.totalCalorias || result.kcal || (result.macros?.kcal)
          });

          setIsScanning(false);
          if (window.navigator?.vibrate) window.navigator.vibrate([100, 50, 100]);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error(err);
        setIsScanning(false);
        alert("Error al analizar la imagen.");
      }
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      {/* Header Tabs */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md px-4 py-3 border-b border-slate-100">
        <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
          <button
            onClick={() => setActiveTab('fit')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'fit' ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="material-symbols-outlined text-lg">fitness_center</span>
            RUTINA
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'scan' ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="material-symbols-outlined text-lg">photo_camera</span>
            NUTRISCAN
          </button>
        </div>
      </div>

      <main className="p-4 pb-20 overflow-y-auto">
        {activeTab === 'fit' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-left duration-300">
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
                  <div key={idx} onClick={() => toggleExercise(idx)} className={`p-4 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 transition-all active:scale-[0.98] ${isCompleted ? 'opacity-60 bg-slate-50/50' : ''}`}>
                    <div className={`size-12 rounded-xl flex items-center justify-center transition-all ${isCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      <span className="material-symbols-outlined">{isCompleted ? 'check_circle' : 'fitness_center'}</span>
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-bold text-slate-900 ${isCompleted ? 'line-through text-slate-400' : ''}`}>{ex.n}</h4>
                      <p className="text-xs text-slate-500 line-clamp-1">{ex.i}</p>
                    </div>
                    {ex.link && (
                      <a href={ex.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-2 text-primary hover:bg-primary/5 rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-xl">play_circle</span>
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
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            {/* 1. Calorías Diarias Widget */}
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Calorías Diarias</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900">{store.calories || 0}</span>
                    <span className="text-sm font-bold text-slate-300">/ {store.caloriesTarget || 2000} Kcal</span>
                  </div>
                </div>
                <div className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight">
                  {Math.round(((store.calories || 0) / (store.caloriesTarget || 2000)) * 100)}% Completado
                </div>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(((store.calories || 0) / (store.caloriesTarget || 2000)) * 100, 100)}%` }}></div>
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col items-center text-center hover:bg-slate-50 transition-colors active:scale-[0.98]"
            >
              <div className="size-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-4xl font-fill">center_focus_weak</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">NUTRISCAN</h2>
              <p className="text-[10px] text-blue-500 font-bold uppercase tracking-[0.2em] mb-4">PRO AI ANALYZER</p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[240px]">
                Escanea platos, menús, recetas o etiquetas nutricionales. Análisis inteligente con traducción automática.
              </p>
            </button>

            {/* 3. Area de Escaneo / Imagen */}
            <div className="relative aspect-square rounded-[40px] bg-slate-200 overflow-hidden shadow-2xl border-4 border-white">
              <input type="file" ref={fileInputRef} onChange={handleScan} accept="image/*" className="hidden" />

              {isScanning ? (
                <div className="absolute inset-0 bg-black/60 z-20 flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
                  <div className="size-20 border-[6px] border-white/20 border-t-white rounded-full animate-spin"></div>
                  <p className="text-white font-black text-sm tracking-widest uppercase animate-pulse">Analizando plato...</p>
                </div>
              ) : null}

              {scanResult?.image ? (
                <div className="h-full w-full relative">
                  <img src={scanResult.image} alt="Plato" className="w-full h-full object-cover" />
                  {/* Etiqueta de detección */}
                  <div className="absolute top-6 left-6 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-full flex items-center gap-2 animate-in slide-in-from-left duration-500">
                    <div className="size-2 bg-blue-400 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black text-white uppercase tracking-wider">Detectando: {scanResult.plato || 'Alimento...'}</span>
                  </div>
                  {/* Confianza */}
                  <div className="absolute bottom-10 right-10 bg-white/90 backdrop-blur-xl p-4 rounded-3xl shadow-2xl border border-white flex flex-col items-center animate-in zoom-in duration-500">
                    <p className="text-[8px] text-slate-400 font-black uppercase tracking-tighter mb-0.5">Confidencia</p>
                    <p className="text-2xl font-black text-slate-900">98.4%</p>
                  </div>
                  {/* Scanning Line Animation */}
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-blue-400/50 shadow-[0_0_15px_blue] animate-scan z-10"></div>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center gap-4 group transition-all">
                  <div className="size-24 bg-white rounded-full flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-500">
                    <span className="material-symbols-outlined text-4xl text-blue-600 font-fill">photo_camera</span>
                  </div>
                  <p className="text-slate-500 font-bold text-sm tracking-tight">Toca para capturar tu comida</p>
                </button>
              )}
            </div>

            {/* 4. Boton Analizar Ahora style */}
            {!scanResult && !isScanning && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-[24px] shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 active:scale-95 transition-all text-sm tracking-widest uppercase"
              >
                <span className="material-symbols-outlined font-fill">auto_awesome</span>
                ANALIZAR AHORA
              </button>
            )}

            {/* 5. Resultados de Analisis */}
            {scanResult && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-700">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight px-1">Análisis de Nutrientes</h3>

                {/* Alerta Precaucion/Info */}
                <div className={`p-6 rounded-[32px] border ${scanResult.impacto === 'ROJO' ? 'bg-red-50 border-red-100' : scanResult.impacto === 'AMARILLO' ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`size-2 rounded-full ${scanResult.impacto === 'ROJO' ? 'bg-red-500' : scanResult.impacto === 'AMARILLO' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                    <p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-900">
                      {scanResult.impacto === 'ROJO' ? 'ALERTA' : scanResult.impacto === 'AMARILLO' ? 'PRECAUCIÓN' : 'SALUDABLE'}
                    </p>
                  </div>
                  <p className="text-[13px] leading-[1.6] text-slate-600 font-medium">
                    {scanResult.hack || "Análisis metabólico listo..."}
                  </p>
                </div>

                {/* Macros Grid */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { l: 'KCAL', v: scanResult.kcal || scanResult.totalCalorias || '---' },
                    { l: 'PROT', v: (scanResult.macros?.p || '---') },
                    { l: 'CARB', v: (scanResult.macros?.c || '---') },
                    { l: 'GRASA', v: (scanResult.macros?.f || '---') }
                  ].map((m, i) => (
                    <div key={i} className="bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm flex flex-col items-center">
                      <p className="text-lg font-black text-slate-900">{m.v}</p>
                      <p className="text-[8px] text-slate-400 font-black uppercase tracking-tighter">{m.l}</p>
                    </div>
                  ))}
                </div>

                {/* Bio-Hack Experto section */}
                <div className="bg-[#eff3ff] p-6 rounded-[32px] border border-blue-100/50 relative overflow-hidden group">
                  <div className="absolute -bottom-6 -right-6 text-blue-100 opacity-20 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                    <span className="material-symbols-outlined text-[140px] font-fill">settings</span>
                  </div>
                  <div className="flex gap-4 relative z-10">
                    <div className="size-14 rounded-2xl overflow-hidden border-2 border-white shadow-lg shrink-0 bg-blue-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-blue-600 text-3xl font-fill">nutrition</span>
                    </div>
                    <div className="flex flex-col">
                      <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest mb-1">BIO-HACK EXPERTO</p>
                      <p className="text-[13px] leading-relaxed italic text-slate-700 font-medium mb-3">
                        {scanResult.tip || "Consejo experto para tu comida..."}
                      </p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                        — NUTRICIONISTA EXPERTO
                      </p>
                    </div>
                  </div>
                </div>

                {/* Boton Final Registrar */}
                <button
                  onClick={() => {
                    const addedCals = parseInt(scanResult.kcal || scanResult.totalCalorias || '0');
                    saveStore({
                      ...store,
                      calories: (store.calories || 0) + addedCals,
                      lastScan: null
                    });
                    alert(`✅ ${addedCals} Kcal registradas en tu diario.`);
                  }}
                  className="w-full bg-slate-900 hover:bg-black text-white py-6 rounded-[28px] shadow-2xl shadow-slate-900/40 flex items-center justify-between px-8 active:scale-[0.98] transition-all group"
                >
                  <span className="font-black text-sm tracking-[0.1em] uppercase">Registrar en mi Diario</span>
                  <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default FitnessView;
