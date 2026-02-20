
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

  // v17.0: Sincronización automática con el día actual al entrar en la pestaña
  React.useEffect(() => {
    if (store.selectedDay !== todayName) {
      saveStore({ ...store, selectedDay: todayName });
    }
  }, []);

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
        const data = await getRecipeDetails(meal.description, perfil, perfil?.apiKey);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#f8f9fd] rounded-[48px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-500 h-full max-h-[96vh] flex flex-col mx-4 my-8">

        {/* TOP BAR CUSTOM (REPLACING NAV) */}
        <div className="absolute top-8 left-8 right-8 z-20 flex justify-between items-center">
          <button onClick={onClose} className="size-11 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/30 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <h4 className="text-white text-[11px] font-black tracking-[0.2em] uppercase opacity-80">Detalle de Almuerzo</h4>
          <button className="size-11 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/30 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-2xl">share</span>
          </button>
        </div>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar">

          {/* HEADER IMAGE & TITLE */}
          <div className="relative h-[420px] shrink-0">
            <img
              src={details?.imageUrl || getProductImage(meal.description, 'Gral')}
              alt={meal.description}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#f8f9fd] via-transparent to-black/40" />

            <div className="absolute bottom-10 left-8 right-8">
              <span className="bg-[#1e60f1] text-[9px] font-black text-white px-4 py-1.5 rounded-full tracking-widest uppercase mb-4 inline-block">PRO NUTRICIÓN</span>
              <h1 className="text-white text-4xl font-black leading-[1.1] [text-shadow:_0_4px_12px_rgba(0,0,0,0.5)]">{meal.description}</h1>
            </div>
          </div>

          {!loading && details ? (
            <div className="px-8 pb-32 -mt-6 relative z-10 space-y-10">

              {/* MACROS CARDS GRID (Stitch Style) */}
              <div className="grid grid-cols-2 gap-4">
                {/* CALORÍAS */}
                <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100/50 flex flex-col items-center text-center">
                  <span className="text-[10px] font-black text-slate-300 tracking-widest uppercase mb-2">CALORÍAS</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-[#1e60f1]">{details.kcal}</span>
                    <span className="text-[10px] font-bold text-slate-300 lowercase">kcal</span>
                  </div>
                </div>
                {/* PROTEÍNA */}
                <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100/50 flex flex-col items-center">
                  <span className="text-[10px] font-black text-slate-300 tracking-widest uppercase mb-2">PROTEÍNA</span>
                  <span className="text-2xl font-black text-slate-800 mb-3">{details.nutrientes.proteina}</span>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '75%' }}></div>
                  </div>
                </div>
                {/* CARBOHIDRATOS */}
                <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100/50 flex flex-col items-center">
                  <span className="text-[10px] font-black text-slate-300 tracking-widest uppercase mb-2">CARBOS</span>
                  <span className="text-2xl font-black text-slate-800 mb-3">{details.nutrientes.carbos}</span>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
                {/* GRASAS */}
                <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100/50 flex flex-col items-center">
                  <span className="text-[10px] font-black text-slate-300 tracking-widest uppercase mb-2">GRASAS</span>
                  <span className="text-2xl font-black text-slate-800 mb-3">{details.nutrientes.grasas}</span>
                  <div className="w-full h-1.5 bg-emerald-400 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: '35%' }}></div>
                  </div>
                </div>
              </div>

              {/* INGREDIENTES (Stitch List) */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#1e60f1] size-8 rounded-xl flex items-center justify-center text-white">
                    <span className="material-symbols-outlined text-[18px]">shopping_basket</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-800">Ingredientes</h3>
                </div>
                <div className="space-y-3">
                  {details.ingredientes.map((ing, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-50 flex items-center justify-between group">
                      <p className="text-sm font-bold text-slate-600">{ing}</p>
                      <div className="size-6 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 group-hover:bg-blue-50 group-hover:text-[#1e60f1] transition-all">
                        <span className="material-symbols-outlined text-sm font-black">check_circle</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* PREPARACIÓN PROFESIONAL */}
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="bg-[#1e60f1] size-8 rounded-xl flex items-center justify-center text-white">
                    <span className="material-symbols-outlined text-[18px]">architecture</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-800">Preparación Profesional</h3>
                </div>
                <div className="space-y-8 relative pl-4">
                  <div className="absolute left-0 top-4 bottom-4 w-px bg-slate-100" />
                  {details.preparacion.map((step, i) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-[29px] top-1 size-7 bg-[#1e60f1] rounded-full border-4 border-[#f8f9fd] flex items-center justify-center text-white text-[10px] font-extrabold shadow-md shadow-blue-200">
                        {i + 1}
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                          {step.includes(':') ? step.split(':')[0] : `Paso ${i + 1}`}
                        </h4>
                        <p className="text-[13px] font-bold text-slate-400 leading-relaxed">
                          {step.includes(':') ? step.split(':')[1].trim() : step}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* BIO-HACK: SECUENCIACIÓN METABÓLICA */}
              <section className="bg-blue-50/50 rounded-[40px] p-8 border border-blue-100/50 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="text-[#1e60f1]">
                    <span className="material-symbols-outlined text-3xl fill-1">bolt</span>
                  </div>
                  <h3 className="text-[#1e60f1] text-[13px] font-black tracking-widest uppercase leading-tight">
                    BIO-HACK: SECUENCIACIÓN<br />METABÓLICA
                  </h3>
                </div>

                <p className="text-[#1e60f1]/70 text-sm font-bold leading-relaxed">
                  {details.bioHack.explicacion}
                </p>

                <div className="space-y-3 pt-2">
                  {details.bioHack.pasos.map((paso, i) => (
                    <div key={i} className="bg-white rounded-full p-2.5 pl-4 pr-10 border border-blue-100/30 flex items-center gap-3 inline-flex shadow-sm">
                      <div className={`size-2.5 rounded-full ${i === 0 ? 'bg-emerald-400' : i === 1 ? 'bg-blue-500' : 'bg-orange-400'}`}></div>
                      <p className="text-[11px] font-black text-slate-700 whitespace-nowrap">
                        <span className="text-slate-400 mr-2">{i + 1}.</span> {paso}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* FOOTER BUTTON */}
              <div className="flex justify-center pt-8">
                <button onClick={onClose} className="size-20 bg-[#1e60f1] rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-200 active:scale-95 transition-all">
                  <span className="material-symbols-outlined text-4xl">check</span>
                </button>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-64 space-y-6">
              <div className="relative size-24">
                <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-[#1e60f1] border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-[#1e60f1] font-black text-[10px] tracking-[0.3em] uppercase animate-pulse">Optimizando Protocolo VIP...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeView;
