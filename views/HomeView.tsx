
import React, { useState } from 'react';
import { useStore } from '../src/context/StoreContext';
import { sortMeals, getProductImage } from '../src/utils/helpers';
import { getRecipeDetails, RecipeDetails } from '../src/utils/ai';
import { firebaseConfig } from '../src/firebase';

const HomeView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
  const { store, saveStore } = useStore();
  const [selectedMeal, setSelectedMeal] = useState<{ id: string; type: string; description: string } | null>(null);

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
        <section onClick={() => setView('fitness')} className="relative overflow-hidden rounded-[24px] bg-[#1e60f1] p-6 flex items-center gap-5 shadow-lg shadow-blue-200 cursor-pointer active:scale-[0.98] transition-all group">
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
                onViewRecipe={() => setSelectedMeal({ id: `${meal.name}-${idx}`, type: meal.name, description: meal.description })}
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
  meal: { id: string; type: string; description: string };
  perfil: any;
  onClose: () => void;
}> = ({ meal, perfil, onClose }) => {
  const [loading, setLoading] = React.useState(true);
  const [details, setDetails] = React.useState<RecipeDetails | null>(null);

  React.useEffect(() => {
    // v20.0: Atomic reset of loading/details when ID changes
    setLoading(true);
    setDetails(null);

    let isMounted = true;

    const fetchDetails = async () => {
      try {
        const data = await getRecipeDetails(meal.description, perfil, firebaseConfig.geminiApiKey);
        if (isMounted) {
          setDetails(data);
          setLoading(false);
        }
      } catch (e) {
        console.error("Critical Recipe Loading Error:", e);
        if (isMounted) setLoading(false);
      }
    };

    fetchDetails();

    return () => {
      isMounted = false; // Cleanup to prevent state updates on unmounted component
    };
  }, [meal.id]); // Target the unique ID

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-500 h-full flex flex-col mx-4 sm:my-8 rounded-[48px] sm:h-auto sm:max-h-[95vh]">

        {/* HEADER: White Background + Centered Title */}
        <div className="flex items-center justify-between px-6 h-20 bg-white border-b border-slate-50 shrink-0">
          <button onClick={onClose} className="text-blue-600 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-2xl font-black">arrow_back</span>
          </button>
          <h4 className="text-[11px] font-black tracking-[0.25em] text-slate-400 text-center uppercase">DETALLE DE {meal.type}</h4>
          <button className="text-blue-600 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-2xl font-black">share</span>
          </button>
        </div>

        {/* CONTENT AREA: Light Gray Background */}
        <div className="flex-1 overflow-y-auto bg-[#f8f9fd] no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-64 px-12 text-center space-y-6">
              <div className="relative size-24">
                <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-[#1e60f1] border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-blue-100">
                  <span className="material-symbols-outlined text-4xl animate-pulse">nutrition</span>
                </div>
              </div>
              <p className="text-[#1e60f1] font-black text-[12px] tracking-[0.3em] uppercase animate-pulse">Cocinando tu receta saludable...</p>
            </div>
          ) : details ? (
            <div className="animate-in fade-in duration-700">
              {/* TÍTULO + BADGE ARRIBA */}
              <div className="px-6 pt-6 pb-4">
                <span className="inline-block bg-[#1e60f1] text-white text-[9px] font-black tracking-[0.2em] uppercase px-3 py-1.5 rounded-full mb-3">
                  PRO NUTRICIÓN
                </span>
                <h2 className="text-[20px] font-black text-slate-800 leading-tight">
                  {details.titulo || meal.description}
                </h2>
              </div>

              {/* IMAGEN LIMPIA */}
              <div className="mx-5 rounded-3xl overflow-hidden aspect-[4/3] shadow-lg">
                <img
                  src={details.imageUrl || getProductImage(meal.description, 'Gral')}
                  alt={details.titulo || meal.description}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = getProductImage(meal.description, 'Gral'); }}
                />
              </div>

              {/* INGREDIENTES */}
              <div className="px-6 mt-8">
                <div className="flex items-center gap-3 mb-5">
                  <span className="material-symbols-outlined text-[#1e60f1] text-[24px] fill-1">shopping_basket</span>
                  <h3 className="text-[17px] font-black text-slate-800">Ingredientes</h3>
                </div>
                <div className="space-y-3">
                  {details.ingredientes.map((ing, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                      <span className="mt-1.5 size-2 bg-slate-300 rounded-full shrink-0"></span>
                      <p className="text-[14px] font-semibold text-slate-600">{ing}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* PREPARACIÓN PROFESIONAL */}
              <div className="px-6 mt-10">
                <div className="flex items-center gap-3 mb-6">
                  <span className="material-symbols-outlined text-[#1e60f1] text-[24px] fill-1">restaurant</span>
                  <h3 className="text-[17px] font-black text-slate-800">Preparación Profesional</h3>
                </div>
                <div className="space-y-6 pl-2">
                  {details.preparacion.map((step, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="shrink-0 size-8 bg-[#1e60f1] rounded-full flex items-center justify-center text-white text-[13px] font-black shadow-lg shadow-blue-200 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 space-y-1">
                        <h4 className="text-[14px] font-black text-slate-800">{step.titulo}</h4>
                        <p className="text-[13px] font-medium text-slate-500 leading-relaxed">{step.descripcion}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* BIO-HACK SECUENCIACIÓN */}
              {details.bioHack && (
                <div className="mx-5 mt-10 mb-32 bg-gradient-to-br from-[#eef2ff] to-[#e8f0fe] rounded-3xl p-7 border border-blue-100">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="material-symbols-outlined text-[#1e60f1] text-2xl fill-1">biotech</span>
                    <h4 className="text-[12px] font-black text-slate-800 tracking-wider uppercase">
                      BIO-HACK: {details.bioHack.titulo}
                    </h4>
                  </div>
                  <p className="text-[13px] font-medium text-slate-500 leading-relaxed mb-5">
                    {details.bioHack.explicacion}
                  </p>
                  <div className="space-y-2">
                    {details.bioHack.pasos.map((paso, i) => (
                      <div key={i} className="bg-white/80 px-4 py-2.5 rounded-xl border border-blue-100/50">
                        <span className="text-[12px] font-bold text-slate-700">{paso}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FIXED FOOTER BUTTON */}
              <div className="fixed bottom-10 left-0 right-0 flex justify-center z-50 pointer-events-none pb-8">
                <button onClick={onClose} className="size-20 bg-[#1e60f1] rounded-full flex items-center justify-center text-white shadow-2xl shadow-blue-400 active:scale-95 transition-all pointer-events-auto">
                  <span className="material-symbols-outlined text-4xl">check</span>
                </button>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40 px-12 text-center opacity-50">
              <span className="material-symbols-outlined text-red-400 text-6xl mb-4">gpp_maybe</span>
              <p className="font-black text-slate-400 uppercase tracking-widest text-sm text-center">No pudimos cargar la receta</p>
              <button onClick={onClose} className="mt-4 text-blue-600 font-bold underline active:scale-95">REINTENTAR</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeView;
