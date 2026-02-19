
import React, { useState } from 'react';
import { useStore } from '../src/context/StoreContext';
import { sortMeals, getProductImage } from '../src/utils/helpers';
import { getRecipeDetails, RecipeDetails } from '../src/utils/ai';

const HomeView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
  const { store, saveStore } = useStore();
  const [selectedMeal, setSelectedMeal] = useState<{ title: string; description: string } | null>(null);

  // Helper to normalize strings for comparison (remove accents and uppercase)
  const normalize = (str: string) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  // Days logic
  const diasSemana = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
  const todayIndex = new Date().getDay();
  const todayName = diasSemana[todayIndex];
  const selectedDay = store.selectedDay || todayName;

  // Generate current week items (simple logic for display)
  const getWeekDays = () => {
    const week = [];
    const now = new Date();
    // Start from Monday of current week
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

  // Improved Menu Logic
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
      {/* Recipe Modal */}
      {selectedMeal && (
        <RecipeModal
          meal={selectedMeal}
          perfil={store.profile}
          onClose={() => setSelectedMeal(null)}
        />
      )}

      {/* Header Section */}
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
        {/* NutriScan AI Banner */}
        <section
          onClick={() => setView('progress')}
          className="relative overflow-hidden rounded-[24px] bg-[#1e60f1] p-6 flex items-center gap-5 shadow-lg shadow-blue-200 cursor-pointer active:scale-[0.98] transition-all group"
        >
          <div className="size-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30 text-white shrink-0">
            <span className="material-symbols-outlined text-3xl">filter_center_focus</span>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-black text-lg leading-none mb-1 uppercase">NUTRISCAN AI</h3>
            <p className="text-white/90 text-[11px] font-bold leading-tight">Analiza tu plato actual con inteligencia artificial</p>
          </div>
          <span className="material-symbols-outlined text-white transition-transform group-hover:translate-x-1">arrow_forward</span>
        </section>

        {/* Date Selector */}
        <section className="flex justify-between items-center gap-3 py-2 overflow-x-auto no-scrollbar">
          {weekDays.map((day, idx) => (
            <button
              key={idx}
              onClick={() => handleDaySelect(day.fullDay)}
              className={`flex flex-col items-center justify-center min-w-[64px] h-20 rounded-2xl border transition-all duration-300 ${day.active
                ? 'bg-primary border-primary text-white shadow-md shadow-primary/30 scale-105'
                : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                }`}
            >
              <span className={`text-[10px] font-black tracking-widest ${day.active ? 'text-white/70' : 'text-slate-300'}`}>{day.label}</span>
              <span className="text-lg font-black mt-0.5">{day.date}</span>
            </button>
          ))}
        </section>

        {/* Macros Summary */}
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

        {/* Meal Timeline */}
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
                onViewRecipe={() => setSelectedMeal({ title: meal.name, description: meal.description })}
              />
            ))
          ) : (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white/50">
              <span className="material-symbols-outlined text-slate-300 text-5xl mb-2">event_busy</span>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Sin plan para el {selectedDay.toLowerCase()}</p>
              <button
                onClick={() => setView('profile')}
                className="mt-4 text-primary font-black text-xs uppercase tracking-widest border border-primary/20 bg-primary/5 px-6 py-3 rounded-xl active:scale-95 transition-all"
              >
                Sincronizar PDF
              </button>
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
      <div className={`size-8 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm mt-1 transition-all ${status === 'completed' ? 'bg-emerald-500' :
          status === 'active' ? 'bg-primary' : 'bg-slate-200'
        }`}>
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
          <button
            onClick={onViewRecipe}
            className="text-primary font-black text-[10px] hover:underline uppercase tracking-wider"
          >
            Ver Receta
          </button>
        </div>
      </div>
    </div>
  );
};

const RecipeModal: React.FC<{
  meal: { title: string; description: string };
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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-white rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-500 max-h-[90vh] flex flex-col">
        {/* Header Visual */}
        <div className="h-32 bg-primary relative overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-blue-600 to-indigo-700 opacity-90" />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
          <div className="relative h-full flex flex-col justify-end p-6">
            <span className="text-[10px] font-black text-white/70 tracking-[0.2em] uppercase">{meal.title}</span>
            <h2 className="text-white font-black text-xl leading-tight line-clamp-1">{meal.description}</h2>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 size-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-all border border-white/20"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="size-12 border-4 border-slate-100 border-t-primary rounded-full animate-spin" />
              <p className="text-slate-400 font-bold text-sm tracking-wider animate-pulse uppercase">IA GENERANDO RECETA...</p>
            </div>
          ) : details ? (
            <>
              {/* Portion Kcal */}
              <div className="bg-slate-50 flex items-center justify-between p-5 rounded-3xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined fill-1">local_fire_department</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Energía x Porción</p>
                    <p className="text-lg font-black text-slate-800">{details.kcal} kcal</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-slate-400 italic">Estimación IA ✨</span>
              </div>

              {/* Bio-Hacks (Sugestión Saludable & Orden) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-emerald-50/50 p-5 rounded-3xl border border-emerald-100/50 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-600 mb-1">
                    <span className="material-symbols-outlined text-[20px]">verified</span>
                    <span className="text-[10px] font-black tracking-widest uppercase">Sugerencia Saludable</span>
                  </div>
                  <p className="text-slate-700 text-sm font-medium leading-relaxed">{details.sugerencia}</p>
                </div>

                <div className="bg-blue-50/50 p-5 rounded-3xl border border-blue-100/50 space-y-2">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <span className="material-symbols-outlined text-[20px]">low_priority</span>
                    <span className="text-[10px] font-black tracking-widest uppercase">Orden de Ingesta</span>
                  </div>
                  <p className="text-slate-700 text-sm font-medium leading-relaxed">{details.ordenIngesta}</p>
                </div>
              </div>

              {/* Bio-Hack Destacado */}
              <div className="bg-primary/5 p-5 rounded-3xl border border-primary/10 flex gap-4">
                <span className="material-symbols-outlined text-primary text-3xl shrink-0">psychology</span>
                <div>
                  <h4 className="text-primary font-black text-[10px] tracking-widest uppercase mb-1">Mental Bio-Hack</h4>
                  <p className="text-slate-700 text-sm font-bold leading-relaxed">{details.bioHack}</p>
                </div>
              </div>

              {/* Preparación */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 px-2">
                  <div className="h-[2px] flex-1 bg-slate-100" />
                  <span className="text-[10px] font-black text-slate-300 tracking-[0.3em] uppercase">Preparación</span>
                  <div className="h-[2px] flex-1 bg-slate-100" />
                </div>

                <div className="space-y-4">
                  {details.preparacion.map((step, i) => (
                    <div key={i} className="flex gap-4 group">
                      <div className="size-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-black shrink-0 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                        {i + 1}
                      </div>
                      <p className="text-slate-600 text-sm font-medium leading-relaxed group-hover:text-slate-800 transition-colors">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Note */}
              <p className="text-center text-[10px] text-slate-300 font-bold pt-4 pb-2 uppercase tracking-widest">
                Creado por el Cerebro IA de MN-NutriApp
              </p>
            </>
          ) : (
            <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest">
              Error al generar receta
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeView;
