
import React, { useState } from 'react';
import { useStore } from '../src/context/StoreContext';
import { sortMeals, getProductImage } from '../src/utils/helpers';
import { getRecipeDetails, RecipeDetails } from '../src/utils/ai';
import { firebaseConfig } from '../src/firebase';

const HomeView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
  const { store, saveStore } = useStore();
  const [selectedMeal, setSelectedMeal] = useState<{ id: string; type: string; description: string } | null>(null);


  const toggleMealStatus = (mealId: string) => {
    const dayKey = selectedDay.toUpperCase();
    const currentDone = store.doneMeals?.[dayKey] || [];
    const isDone = currentDone.includes(mealId);

    if (isDone) {
      if (confirm("¿Deseas desmarcar esta comida como completada?")) {
        const newDone = currentDone.filter(id => id !== mealId);
        saveStore({ ...store, doneMeals: { ...store.doneMeals, [dayKey]: newDone } });
      }
    } else {
      if (confirm("¿Deseas marcar esta comida como completada?")) {
        const newDone = [...currentDone, mealId];
        saveStore({ ...store, doneMeals: { ...store.doneMeals, [dayKey]: newDone } });
      }
    }
  };

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

      <header className="px-6 pt-10 pb-8 bg-white/80 backdrop-blur-xl border-b border-slate-100 rounded-b-[40px] shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-1">Menú de Hoy</h1>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">{selectedDay}, {new Date().getDate()} {new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(new Date())}</p>
          </div>
          <div className="flex items-center gap-3">
          </div>
        </div>
      </header>

      <div className="px-6 space-y-6 pt-2">
        <section onClick={() => setView('scan')} className="relative overflow-hidden rounded-[24px] bg-[#1e60f1] p-6 flex items-center gap-5 shadow-lg shadow-blue-200 cursor-pointer active:scale-[0.98] transition-all group">
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
            mealItems.map((meal, idx) => {
              const isDone = (store.doneMeals?.[selectedDay.toUpperCase()] || []).includes(meal.id);
              const isNext = !isDone && (idx === 0 || (store.doneMeals?.[selectedDay.toUpperCase()] || []).includes(mealItems[idx - 1].id));

              return (
                <MealCard
                  key={idx}
                  type={meal.name}
                  time={store.schedule?.[meal.id] || "Horario"}
                  title={meal.description}
                  status={isDone ? 'completed' : isNext ? 'active' : 'pending'}
                  onToggle={() => toggleMealStatus(meal.id)}
                  onViewRecipe={() => setSelectedMeal({ id: `${meal.name}-${idx}`, type: meal.name, description: meal.description })}
                />
              );
            })
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
  status: 'completed' | 'active' | 'pending';
  onToggle: () => void;
  onViewRecipe: () => void;
}

const MealCard: React.FC<MealCardProps> = ({ type, time, title, status, onToggle, onViewRecipe }) => {
  return (
    <div className="relative z-10 flex gap-5 group items-start">
      <div
        onClick={onToggle}
        className={`size-8 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm mt-1 transition-all cursor-pointer select-none active:scale-90 ${status === 'completed' ? 'bg-emerald-500' : status === 'active' ? 'bg-primary' : 'bg-slate-200'}`}
      >
        {status === 'completed' && <span className="material-symbols-outlined text-white text-sm font-bold">check</span>}
        {status === 'active' && <div className="size-2.5 bg-white rounded-full"></div>}
      </div>
      <div className="flex-1 bg-white rounded-[28px] border border-slate-100 p-5 shadow-sm transition-all duration-300">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-black text-primary tracking-widest uppercase">{type}</span>
          <span className="text-[11px] font-black text-slate-400">{time}</span>
        </div>
        <h3 className="text-slate-800 font-extrabold text-base leading-tight mb-4">{title}</h3>
        <div className="flex items-center justify-end mt-auto">
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
        console.error("Recipe Error:", e);
        if (isMounted) setLoading(false);
      }
    };
    fetchDetails();
    return () => { isMounted = false; };
  }, [meal.id]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-500" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white shadow-2xl animate-in slide-in-from-bottom duration-500 h-[92vh] sm:h-auto sm:max-h-[85vh] flex flex-col rounded-t-[48px] sm:rounded-[48px] overflow-hidden">

        {/* HERO IMAGE SECTION */}
        <div className="relative h-64 sm:h-72 w-full shrink-0 group">
          <img
            src={details?.imageUrl || "https://placehold.co/800x600?text=Cocinando..."}
            alt={details?.titulo || meal.description}
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

          <button
            onClick={onClose}
            className="absolute top-6 left-6 size-11 bg-white/20 backdrop-blur-xl border border-white/30 rounded-full flex items-center justify-center text-white active:scale-90 transition-all z-10"
          >
            <span className="material-symbols-outlined text-2xl font-bold">close</span>
          </button>

          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex gap-2 mb-2">
              <span className="bg-blue-600 text-white text-[8px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full">ALTA COCINA AI</span>
              {details?.dificultad && <span className="bg-white/20 backdrop-blur-md text-white text-[8px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full border border-white/10">{details.dificultad}</span>}
            </div>
            <h2 className="text-white text-2xl sm:text-3xl font-black leading-tight drop-shadow-md">
              {details?.titulo || meal.description}
            </h2>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto no-scrollbar bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full py-20 px-12 text-center animate-pulse">
              <div className="size-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-slate-400 font-black text-[10px] tracking-widest uppercase">Diseñando experiencia culinaria...</p>
            </div>
          ) : details ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">

              {/* MACRO BAR */}
              <div className="flex justify-between items-center px-6 py-8 border-b border-slate-50">
                <div className="text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Proteína</p>
                  <p className="text-lg font-black text-emerald-600 leading-none">{details.nutrientes.proteina || "—"}</p>
                </div>
                <div className="h-8 w-px bg-slate-100" />
                <div className="text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Grasas</p>
                  <p className="text-lg font-black text-orange-500 leading-none">{details.nutrientes.grasas || "—"}</p>
                </div>
                <div className="h-8 w-px bg-slate-100" />
                <div className="text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Carbos</p>
                  <p className="text-lg font-black text-blue-500 leading-none">{details.nutrientes.carbos || "—"}</p>
                </div>
                <div className="h-8 w-px bg-slate-100" />
                <div className="text-center bg-slate-50 px-4 py-2 rounded-2xl">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Energía</p>
                  <p className="text-xl font-black text-slate-900 leading-none">{details.kcal}<span className="text-[10px] ml-0.5 opacity-40">kcal</span></p>
                </div>
              </div>

              {/* INGREDIENTS */}
              <section className="px-6 py-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="size-8 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <span className="material-symbols-outlined text-xl fill-1">pantry</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-800">Cesta de Ingredientes</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {details.ingredientes.map((ing, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                      <div className="size-2 bg-blue-400 rounded-full" />
                      <p className="text-[13px] font-bold text-slate-600">{ing}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* PREPARATION STEPS */}
              <section className="px-6 py-8 bg-slate-50/30">
                <div className="flex items-center gap-3 mb-8">
                  <div className="size-8 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <span className="material-symbols-outlined text-xl fill-1">restaurant_menu</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-800">Preparación de Autor</h3>
                </div>
                <div className="space-y-8 relative">
                  <div className="absolute left-[15px] top-4 bottom-4 w-px bg-slate-200 border-dashed" />
                  {details.preparacion.map((step, i) => (
                    <div key={i} className="flex gap-6 relative z-10">
                      <div className="shrink-0 size-8 bg-white border-2 border-slate-100 rounded-full flex items-center justify-center text-[11px] font-black text-slate-400 shadow-sm">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-[13px] font-black text-slate-900 uppercase tracking-wide mb-1.5">{step.titulo}</h4>
                        <p className="text-[13px] font-medium text-slate-500 leading-relaxed bg-white p-4 rounded-2xl border border-slate-100 shadow-sm italic">
                          "{step.descripcion}"
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* BIO-HACK SECTION */}
              {details.bioHack && (
                <section className="m-6 p-8 bg-[#1e60f1] rounded-[40px] text-white shadow-xl shadow-blue-200 relative overflow-hidden group">
                  <div className="absolute -right-10 -top-10 size-40 bg-white/10 rounded-full blur-3xl" />
                  <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined text-3xl">psychology</span>
                    <h4 className="text-[11px] font-black tracking-[0.2em] uppercase">Mente & Metabolismo</h4>
                  </div>
                  <h3 className="text-2xl font-black mb-3 leading-tight">{details.bioHack.titulo}</h3>
                  <p className="text-white/80 text-[13px] font-medium leading-relaxed mb-6 italic">
                    {details.bioHack.explicacion}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {details.bioHack.pasos.map((paso, i) => (
                      <span key={i} className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-[11px] font-black border border-white/10">{paso}</span>
                    ))}
                  </div>
                </section>
              )}

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40 px-12 text-center">
              <span className="material-symbols-outlined text-slate-200 text-6xl mb-4">sentiment_very_dissatisfied</span>
              <p className="font-black text-slate-400 uppercase tracking-widest text-xs">No pudimos sincronizar esta receta</p>
              <button onClick={onClose} className="mt-6 text-blue-600 font-black text-xs border-b-2 border-blue-600 pb-1">VOLVER AL MENÚ</button>
            </div>
          )}
        </div>

        {/* FLOATING ACTION BOTTOM */}
        {!loading && details && (
          <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-white via-white/90 to-transparent flex justify-center z-[110]">
            <button
              onClick={onClose}
              className="w-full h-16 bg-[#1e60f1] text-white rounded-3xl flex items-center justify-center gap-3 shadow-xl shadow-blue-400 active:scale-95 transition-all"
            >
              <span className="text-[13px] font-black tracking-[0.2em] uppercase">TODO LISTO</span>
              <span className="material-symbols-outlined">verified</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


export default HomeView;
