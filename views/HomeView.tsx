
import React, { useState } from 'react';
import { useStore } from '../src/context/StoreContext';
import { sortMeals, getProductImage } from '../src/utils/helpers';
import { getRecipeDetails, RecipeDetails } from '../src/utils/ai';

const HomeView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
  const { store, saveStore } = useStore();
  const [selectedMeal, setSelectedMeal] = useState<{ type: string; description: string } | null>(null);

  const normalize = (str: string) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  const diasSemana = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
  const todayIndex = new Date().getDay();
  const todayName = diasSemana[todayIndex];
  const selectedDay = store.selectedDay || todayName;

  const getWeekDays = () => {
    const week = [];
    const now = new Date();
    const currentDay = now.getDay();
    const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const name = diasSemana[d.getDay()];
      week.push({
        label: name.substring(0, 3).replace('IÉR', 'MIÉ').replace('ÁBA', 'SÁB'),
        fullDay: name,
        date: d.getDate().toString(),
        active: selectedDay === name
      });
    }
    return week;
  };

  const weekDays = getWeekDays();

  const handleDaySelect = (dayName: string) => {
    saveStore({ ...store, selectedDay: dayName });
  };

  const getMenuForDay = () => {
    const normalizedSelected = normalize(selectedDay);
    const originalKey = Object.keys(store.menu).find(key => normalize(key) === normalizedSelected);
    return originalKey ? store.menu[originalKey] : {};
  };

  const menuForDay = getMenuForDay();
  const mealItems = sortMeals(menuForDay);

  const macros = [
    { label: 'PROTEÍNA', value: '85g', target: '120', color: 'bg-primary', percentage: 70 },
    { label: 'CARBOS', value: '150g', target: '200', color: 'bg-emerald-500', percentage: 75 },
    { label: 'GRASAS', value: '45g', target: '65', color: 'bg-orange-500', percentage: 69 },
  ];

  return (
    <div className="flex flex-col bg-slate-50 min-h-screen pb-32 animate-in fade-in duration-700">
      {selectedMeal && (
        <RecipeModal
          meal={selectedMeal}
          perfil={store.profile}
          onClose={() => setSelectedMeal(null)}
        />
      )}

      <header className="px-6 pt-8 pb-4 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-30">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Menú de Hoy</h1>
          <p className="text-slate-400 font-medium text-sm capitalize">{selectedDay.toLowerCase()}, {new Date().getDate()} de {new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date())}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative size-12 flex items-center justify-center">
            <svg className="size-full transform -rotate-90">
              <circle cx="24" cy="24" r="20" className="stroke-slate-100 fill-none" strokeWidth="4" />
              <circle cx="24" cy="24" r="20" className="stroke-primary fill-none" strokeWidth="4" strokeDasharray="125.6" strokeDashoffset="37.6" strokeLinecap="round" />
            </svg>
            <span className="absolute text-[11px] font-bold text-slate-700">70%</span>
          </div>
          <button className="bg-slate-100 p-2.5 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined text-2xl">notifications</span>
          </button>
        </div>
      </header>

      <div className="px-6 space-y-6 pt-2">
        <section onClick={() => setView('progress')} className="relative overflow-hidden rounded-[24px] bg-[#1e60f1] p-6 flex items-center gap-5 shadow-lg shadow-blue-200 cursor-pointer active:scale-[0.98] transition-all group">
          <div className="size-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30 text-white shrink-0">
            <span className="material-symbols-outlined text-3xl">filter_center_focus</span>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-black text-lg leading-none mb-1 uppercase">NUTRISCAN AI</h3>
            <p className="text-white/90 text-[11px] font-bold leading-tight">Analiza tu plato actual con inteligencia artificial</p>
          </div>
          <span className="material-symbols-outlined text-white transition-transform group-hover:translate-x-1">arrow_forward</span>
        </section>

        <section className="flex justify-between items-center gap-3 py-2 overflow-x-auto no-scrollbar">
          {weekDays.map((day, idx) => (
            <button key={idx} onClick={() => handleDaySelect(day.fullDay)} className={`flex flex-col items-center justify-center min-w-[64px] h-20 rounded-2xl border transition-all duration-300 ${day.active ? 'bg-primary border-primary text-white shadow-md shadow-primary/30 scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}>
              <span className={`text-[10px] font-black tracking-widest ${day.active ? 'text-white/70' : 'text-slate-300'}`}>{day.label}</span>
              <span className="text-lg font-black mt-0.5">{day.date}</span>
            </button>
          ))}
        </section>

        <section className="grid grid-cols-3 gap-3">
          {macros.map((macro, idx) => (
            <div key={idx} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-2">
              <span className="text-[10px] font-black text-slate-400 tracking-widest">{macro.label}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-black text-slate-800">{macro.value}</span>
                <span className="text-[10px] font-bold text-slate-300">/ {macro.target}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${macro.color} rounded-full`} style={{ width: `${macro.percentage}%` }}></div>
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-6 pt-4 relative">
          <div className="absolute left-[15px] top-6 bottom-0 w-[2px] bg-slate-100 z-0"></div>
          {mealItems.length > 0 ? (
            mealItems.map((meal, idx) => (
              <MealCard
                key={idx}
                type={meal.name}
                time={store.schedule?.[meal.id] || "Horario"}
                title={meal.description}
                kcal={`${meal.kcal || '---'} kcal`}
                status={idx === 0 ? 'completed' : idx === 1 ? 'active' : 'pending'}
                onViewRecipe={() => setSelectedMeal({ type: meal.name, description: meal.description })}
              />
            ))
          ) : (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white/50">
              <span className="material-symbols-outlined text-slate-300 text-5xl mb-2">event_busy</span>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Sin plan para el {selectedDay.toLowerCase()}</p>
              <button onClick={() => setView('profile')} className="mt-4 text-primary font-black text-xs uppercase tracking-widest border border-primary/20 bg-primary/5 px-6 py-3 rounded-xl active:scale-95 transition-all">Sincronizar PDF</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

interface MealCardProps {
  type: string;
  time: string;
  title: string;
  kcal: string;
  status: 'completed' | 'active' | 'pending';
  onViewRecipe: () => void;
}

const MealCard: React.FC<MealCardProps> = ({ type, time, title, kcal, status, onViewRecipe }) => {
  return (
    <div className="relative z-10 flex gap-5 group items-start">
      <div className={`size-8 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm mt-1 transition-all ${status === 'completed' ? 'bg-emerald-500' : status === 'active' ? 'bg-primary' : 'bg-slate-200'}`}>
        {status === 'completed' && <span className="material-symbols-outlined text-white text-sm font-bold">check</span>}
        {status === 'active' && <div className="size-2.5 bg-white rounded-full"></div>}
      </div>
      <div className="flex-1 bg-white rounded-[28px] border border-slate-100 p-5 shadow-sm transition-all duration-300">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-black text-primary tracking-widest uppercase">{type}</span>
          <span className="text-[11px] font-black text-slate-400">{time}</span>
        </div>
        <h3 className="text-slate-800 font-extrabold text-base leading-tight mb-4">{title}</h3>
        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-center gap-1.5 text-primary">
            <span className="material-symbols-outlined text-[18px] fill-1">local_fire_department</span>
            <span className="text-xs font-black">{kcal}</span>
          </div>
          <button onClick={onViewRecipe} className="text-primary font-black text-[10px] hover:underline uppercase tracking-wider">Ver Receta</button>
        </div>
      </div>
    </div>
  );
};

const RecipeModal: React.FC<{
  meal: { type: string; description: string };
  perfil: any;
  onClose: () => void;
}> = ({ meal, perfil, onClose }) => {
  const [loading, setLoading] = React.useState(true);
  const [details, setDetails] = React.useState<RecipeDetails | null>(null);

  React.useEffect(() => {
    const fetchDetails = async () => {
      try {
        const data = await getRecipeDetails(meal.description, perfil);
        setDetails(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [meal.description]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white rounded-[40px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-500 max-h-[94vh] flex flex-col">
        {/* Header Visual */}
        <div className="h-44 bg-slate-100 relative overflow-hidden shrink-0">
          <img src={getProductImage(meal.description, 'Gral')} alt={meal.description} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-white/60 tracking-[0.2em] uppercase">{meal.type}</span>
              <div className="h-px w-8 bg-white/20"></div>
            </div>
            <h2 className="text-white font-black text-xl leading-tight line-clamp-2">Receta: Protocolo Nutricional</h2>
          </div>
          <button onClick={onClose} className="absolute top-4 right-4 size-10 bg-white/10 hover:bg-white/30 rounded-full flex items-center justify-center text-white backdrop-blur-xl border border-white/20 transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <div className="size-14 border-4 border-slate-100 border-t-primary rounded-full animate-spin" />
              <p className="text-slate-400 font-bold text-[10px] tracking-widest animate-pulse uppercase">Generando Estándar de Precisión...</p>
            </div>
          ) : details ? (
            <div className="p-6 space-y-10">

              {/* 1. Ingredientes Exactos */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="size-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-lg">nutrition</span>
                  </div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Ingredientes (Cantidades Exactas)</h3>
                </div>
                <div className="bg-slate-50/50 rounded-3xl p-5 border border-slate-100 grid grid-cols-1 gap-3">
                  {details.ingredientes.map((ing, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="size-1.5 bg-primary rounded-full mt-1.5 shrink-0"></div>
                      <p className="text-sm font-bold text-slate-600 leading-relaxed">{ing}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2. Preparación Profesional */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="size-8 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-600">
                    <span className="material-symbols-outlined text-lg">restaurant</span>
                  </div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Preparación Profesional</h3>
                </div>
                <div className="space-y-6">
                  {details.preparacion.map((step, i) => (
                    <div key={i} className="flex gap-4 group">
                      <div className="size-7 rounded-2xl bg-white border-2 border-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-black shrink-0 group-hover:border-primary group-hover:text-primary transition-all">
                        {i + 1}
                      </div>
                      <p className="text-slate-600 text-sm font-bold leading-relaxed flex-1 pt-0.5">{step}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 3. El Bio-Hack */}
              <section className="bg-primary/5 rounded-[40px] p-7 border border-primary/10 space-y-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 text-primary/10 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                  <span className="material-symbols-outlined text-8xl">bolt</span>
                </div>

                <div className="flex items-center gap-3 relative z-10">
                  <div className="size-10 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
                    <span className="material-symbols-outlined text-xl">psychology</span>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-primary tracking-widest uppercase">EL BIO-HACK</h4>
                    <h3 className="text-lg font-black text-slate-800 leading-none">"{details.bioHack.titulo}"</h3>
                  </div>
                </div>

                <div className="space-y-5 relative z-10">
                  <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/50">
                    <p className="text-slate-500 text-[11px] font-medium leading-relaxed italic">"{details.bioHack.explicacion}"</p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 tracking-wider uppercase">Sigue este orden de consumo:</p>
                    {details.bioHack.pasos.map((paso, i) => (
                      <div key={i} className="flex items-center gap-3 bg-white/40 p-3 rounded-xl border border-primary/5">
                        <span className="text-xs font-black text-primary">{i + 1}.</span>
                        <p className="text-sm font-bold text-slate-700">{paso}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* 4. Valor Nutricional */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="size-8 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600">
                    <span className="material-symbols-outlined text-lg">analytics</span>
                  </div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Valor Nutricional (Aproximado)</h3>
                </div>
                <div className="overflow-hidden rounded-3xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 font-black text-slate-400 text-[10px] uppercase">Nutriente</th>
                        <th className="px-5 py-3 font-black text-slate-800 text-[10px] uppercase">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-bold text-slate-600">
                      <tr>
                        <td className="px-5 py-3">Energía</td>
                        <td className="px-5 py-3 text-slate-800 font-black">{details.kcal} kcal</td>
                      </tr>
                      <tr>
                        <td className="px-5 py-3">Proteína</td>
                        <td className="px-5 py-3">{details.nutrientes.proteina}</td>
                      </tr>
                      <tr>
                        <td className="px-5 py-3">Grasas</td>
                        <td className="px-5 py-3">{details.nutrientes.grasas}</td>
                      </tr>
                      <tr>
                        <td className="px-5 py-3">Carbohidratos</td>
                        <td className="px-5 py-3">{details.nutrientes.carbos}</td>
                      </tr>
                      <tr>
                        <td className="px-5 py-3">Fibra</td>
                        <td className="px-5 py-3">{details.nutrientes.fibra}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 5. Nota Pro */}
              <section className="bg-slate-900 rounded-[32px] p-6 flex gap-4 items-start relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent pointer-events-none" />
                <div className="size-10 bg-white/10 rounded-2xl flex items-center justify-center text-white shrink-0 relative z-10">
                  <span className="material-symbols-outlined text-xl">star</span>
                </div>
                <div className="space-y-1 relative z-10">
                  <h4 className="text-[10px] font-black text-primary tracking-widest uppercase">Nota Pro</h4>
                  <p className="text-slate-300 text-sm font-bold leading-relaxed">{details.notaPro}</p>
                </div>
              </section>

              <div className="flex flex-col items-center justify-center py-6 opacity-30 gap-1">
                <span className="material-symbols-outlined text-slate-400">verified_user</span>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Protocolo Certificado MN-NutriApp v10</p>
              </div>

            </div>
          ) : (
            <div className="text-center py-20 text-slate-400 font-bold uppercase">Error de Protocolo</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeView;
