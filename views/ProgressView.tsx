import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '../src/context/StoreContext';

const ProgressView: React.FC = () => {
  const { store } = useStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const { profile, medals } = store;
  const currentWeight = parseFloat(profile.analisis_inbody_actual?.peso_actual_kg || '0');
  const targetWeight = parseFloat(profile.metas_y_objetivos?.peso_ideal_meta || '0');

  // Mock history for chart (since store history format is unknown/complex)
  const data = [
    { name: 'Inicio', weight: currentWeight + 2 },
    { name: 'HOY', weight: currentWeight },
  ];

  const handleNutriScan = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.[0]) return;
    const file = event.target.files[0];

    setAnalyzing(true);
    setAnalysisResult(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];

        try {
          const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/analizarComida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imagenBase64: base64Data,
              perfilPaciente: store.profile
            })
          });

          if (!response.ok) throw new Error("Error en el análisis");

          const result = await response.json();
          setAnalysisResult(result);
        } catch (error) {
          console.error("Error NutriScan:", error);
          alert("Hubo un error al analizar la imagen. Por favor, intenta de nuevo.");
        } finally {
          setAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error Leyendo Archivo:", error);
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col animate-in fade-in zoom-in-95 duration-500">
      <main className="p-4 space-y-6">
        {/* Results Section */}
        {analysisResult && (
          <div className="animate-in slide-in-from-top-4 duration-500 space-y-4">
            <div className={`p-5 rounded-2xl border-2 shadow-sm ${analysisResult.semaforo === 'VERDE' ? 'bg-emerald-50 border-emerald-100' :
              analysisResult.semaforo === 'AMARILLO' ? 'bg-amber-50 border-amber-100' :
                'bg-rose-50 border-rose-100'
              }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`size-10 rounded-full flex items-center justify-center ${analysisResult.semaforo === 'VERDE' ? 'bg-emerald-500' :
                    analysisResult.semaforo === 'AMARILLO' ? 'bg-amber-500' :
                      'bg-rose-500'
                    } text-white shadow-lg`}>
                    <span className="material-symbols-outlined font-bold">
                      {analysisResult.semaforo === 'VERDE' ? 'check_circle' :
                        analysisResult.semaforo === 'AMARILLO' ? 'warning' : 'block'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-800">Nutri-Semáforo: {analysisResult.semaforo}</h3>
                    <p className="text-xs font-bold text-slate-500">Análisis Metabólico AI</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-slate-900 leading-none">{analysisResult.totalCalorias}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Calorías Est.</p>
                </div>
              </div>

              <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white/40 mb-3">
                <p className="text-sm font-bold text-slate-700 leading-relaxed italic">
                  "{analysisResult.analisis}"
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/40 p-2 rounded-lg text-center border border-white/20">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Proteína</p>
                  <p className="text-sm font-black text-slate-800">{analysisResult.macros.p}</p>
                </div>
                <div className="bg-white/40 p-2 rounded-lg text-center border border-white/20">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Carbos</p>
                  <p className="text-sm font-black text-slate-800">{analysisResult.macros.c}</p>
                </div>
                <div className="bg-white/40 p-2 rounded-lg text-center border border-white/20">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Grasas</p>
                  <p className="text-sm font-black text-slate-800">{analysisResult.macros.f}</p>
                </div>
              </div>
            </div>

            {analysisResult.bioHack && (
              <div className="bg-indigo-600 p-5 rounded-2xl shadow-lg shadow-indigo-200 flex items-start gap-4">
                <div className="bg-white/20 p-2.5 rounded-xl text-white">
                  <span className="material-symbols-outlined text-2xl font-light">bolt</span>
                </div>
                <div className="flex-1">
                  <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-1">Bio-Hack Estrella</p>
                  <p className="text-white font-bold leading-relaxed">{analysisResult.bioHack}</p>
                </div>
              </div>
            )}

            <button
              onClick={() => setAnalysisResult(null)}
              className="w-full py-3 text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              Cerrar Análisis
            </button>
          </div>
        )}

        {/* Stats Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight">Estadísticas Pro</h2>
            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">ACTUAL</span>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Peso Actual</p>
                <p className="text-slate-900 text-3xl font-extrabold">{currentWeight} <span className="text-lg font-medium text-slate-400">kg</span></p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-xs">Objetivo: {targetWeight}kg</p>
              </div>
            </div>

            <div className="h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1e60f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#1e60f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="weight" stroke="#1e60f1" strokeWidth={3} fillOpacity={1} fill="url(#colorWeight)" />
                  <Tooltip />
                  <XAxis dataKey="name" hide />
                  <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary text-sm">straighten</span>
                <p className="text-slate-400 text-[10px] font-bold uppercase">Cintura</p>
              </div>
              <p className="text-slate-900 text-xl font-bold">{profile.historico_antropometrico?.slice(-1)?.[0]?.cintura_cm || '--'} cm</p>
            </div>
            <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary text-sm">fitness_center</span>
                <p className="text-slate-400 text-[10px] font-bold uppercase">Medallas</p>
              </div>
              <p className="text-slate-900 text-xl font-bold flex gap-2">
                <span>🥇 {medals?.gold || 0}</span>
                <span>🥈 {medals?.silver || 0}</span>
              </p>
            </div>
          </div>
        </section>

        {/* Achievements */}
        <section>
          <h2 className="text-xl font-bold mb-4">Tus Logros</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
            {[
              { id: '1', title: 'Oro', subtitle: `${medals?.gold || 0} Medallas`, icon: 'workspace_premium', color: 'text-yellow-600', bg: 'bg-yellow-100', ring: 100 },
              { id: '2', title: 'Plata', subtitle: `${medals?.silver || 0} Medallas`, icon: 'military_tech', color: 'text-slate-500', bg: 'bg-slate-200', ring: 100 },
            ].map((ach) => (
              <div key={ach.id} className="flex flex-col items-center gap-3 min-w-[110px] text-center">
                <div className="relative flex size-20 items-center justify-center">
                  <div className={`size-14 rounded-full flex items-center justify-center ${ach.bg} ${ach.color} shadow-sm`}>
                    <span className="material-symbols-outlined text-3xl">{ach.icon}</span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-bold leading-tight">{ach.title}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{ach.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProgressView;
