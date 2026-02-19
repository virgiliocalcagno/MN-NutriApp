
import React, { useState } from 'react';
import { useStore } from '../src/context/StoreContext';
import { sortMeals, getProductImage } from '../src/utils/helpers';
import { getRecipeDetails, RecipeDetails } from '../src/utils/ai';

const HomeView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
  const { store, saveStore } = useStore();
  const [selectedMeal, setSelectedMeal] = useState<{ type: string; description: string } | null>(null);

  // Helper to normalize strings for comparison (remove accents and uppercase)
  const normalize = (str: string) =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  // Days logic
  const diasSemana = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
  const todayIndex = new Date().getDay();
  const todayName = diasSemana[todayIndex];
  const selectedDay = store.selectedDay || todayName;

  // Generate current week items
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
                onViewRecipe={() => setSelectedMeal({ type: meal.name, description: meal.description })}
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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-white rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-500 max-h-[92vh] flex flex-col">
        {/* Header Visual con Imagen */}
        <div className="h-44 bg-slate-100 relative overflow-hidden shrink-0">
          <img
            src={getProductImage(meal.description, 'Gral')}
            alt={meal.description}
            className="w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />

          <div className="absolute bottom-6 left-6 right-6">
            <span className="text-[10px] font-black text-white/70 tracking-[0.2em] uppercase">{meal.type}</span>
            <h2 className="text-white font-black text-xl leading-tight line-clamp-2">{meal.description}</h2>
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 size-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-all border border-white/20"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <div className="size-12 border-4 border-slate-100 border-t-primary rounded-full animate-spin" />
              <p className="text-slate-400 font-bold text-[10px] tracking-widest animate-pulse uppercase text-center px-10">Calculando Bio-Hacks y Receta Experta...</p>
            </div>
          ) : details ? (
            <>
              {/* Información Nutricional IA */}
              <div className="bg-slate-50 flex items-center justify-between p-5 rounded-3xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined fill-1">local_fire_department</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Energía Real x Porción</p>
                    <p className="text-lg font-black text-slate-800">{details.kcal} kcal</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-primary/50 uppercase tracking-tighter">Planificado por IA</p>
                  <p className="text-[11px] font-bold text-slate-400 italic">Nutrición de Precisión</p>
                </div>
              </div>

              {/* Bio-Hacks Expertos */}
              <div className="space-y-4">
                {/* Mental Bio-Hack (Orden de Ingesta) - PRIORIDAD */}
                <div className="bg-primary/5 p-6 rounded-[32px] border border-primary/10 space-y-3 relative overflow-hidden group">
                  <div className="absolute top-[-10px] right-[-10px] size-24 bg-primary/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                  <div className="flex items-center gap-3 text-primary relative z-10">
                    <span className="material-symbols-outlined text-[28px] fill-1">psychology</span>
                    <h4 className="font-black text-xs tracking-[0.1em] uppercase">Mental Bio-Hack: Orden de Ingesta</h4>
                  </div>
                  <p className="text-slate-700 text-sm font-bold leading-relaxed relative z-10">{details.ordenIngesta}</p>
                  <div className="p-3 bg-white/60 rounded-2xl border border-primary/5 relative z-10">
                    <p className="text-[11px] font-medium text-slate-500 italic leading-relaxed">{details.bioHack}</p>
                  </div>
                </div>

                {/* Sugerencia de Cocina */}
                <div className="bg-emerald-50/50 p-5 rounded-3xl border border-emerald-100/50 flex gap-4">
                  <div className="size-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                    <span className="material-symbols-outlined text-[20px] fill-1">temp_preferences_eco</span>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-black text-emerald-700 tracking-widest uppercase">Sugerencia Pro-Salud</h4>
                    <p className="text-slate-600 text-sm font-medium leading-relaxed">{details.sugerencia}</p>
                  </div>
                </div>
              </div>

              {/* Preparación Guiada */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 px-2">
                  <div className="h-[1px] flex-1 bg-slate-100" />
                  <span className="text-[10px] font-black text-slate-300 tracking-[0.3em] uppercase">Guía de Preparación</span>
                  <div className="h-[1px] flex-1 bg-slate-100" />
                </div>

                <div className="space-y-4 pt-2">
                  {details.preparacion.map((step, i) => (
                    <div key={i} className="flex gap-4 group">
                      <div className="size-7 rounded-2xl bg-slate-50 border border-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-black shrink-0 transition-all group-hover:bg-primary group-hover:text-white group-hover:border-primary group-hover:scale-110">
                        {i + 1}
                      </div>
                      <p className="text-slate-600 text-sm font-medium leading-relaxed group-hover:text-slate-800 transition-colors flex-1">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer Credentials */}
              <div className="pt-6 pb-2 border-t border-slate-50">
                <div className="flex items-center justify-center gap-2 grayscale opacity-40">
                  <span className="material-symbols-outlined text-[16px]">verified_user</span>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
                    Protocolo Generado por MN-Expert Engine
                  </p>
                </div>
              </div>
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
