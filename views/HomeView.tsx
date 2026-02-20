
import React, { useState } from 'react';
import { useStore } from '../src/context/StoreContext';
import { sortMeals, getProductImage } from '../src/utils/helpers';
import { getRecipeDetails, RecipeDetails } from '../src/utils/ai';
import { firebaseConfig } from '../src/firebase';

const HomeView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
  const { store, saveStore } = useStore();
  const [selectedMeal, setSelectedMeal] = useState<{ id: string; type: string; description: string } | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [breakfastTime, setBreakfastTime] = useState("08:00");

  const generateSchedule = () => {
    const [hours, minutes] = breakfastTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0);

    const newSchedule: Record<string, string> = { ...store.schedule };
    const mealKeys = ["DESAYUNO", "MERIENDA_AM", "ALMUERZO", "MERIENDA_PM", "CENA"];

    // Match existing menu keys to the standard intervals
    const currentMenuKeys = Object.keys(menuForDay);

    mealKeys.forEach((standardKey, idx) => {
      const mealDate = new Date(date.getTime() + idx * 3 * 60 * 60 * 1000);
      const timeStr = mealDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      // Find the key in the menu that matches this standard slot
      const matchingKey = currentMenuKeys.find(k => k.toUpperCase().replace(/\s+/g, '_') === standardKey);
      if (matchingKey) {
        newSchedule[matchingKey] = timeStr;
      }
    });

    saveStore({ ...store, schedule: newSchedule });
    alert("✅ Horario nutricional generado exitosamente.");
  };

  const resetSchedule = () => {
    if (confirm("¿Estás seguro de limpiar el horario programado?")) {
      saveStore({
        ...store,
        schedule: null
      });
      alert("✅ Horarios limpiados.");
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
          <button onClick={() => setShowScheduleModal(true)} className="bg-slate-100 p-2.5 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined text-2xl">schedule</span>
          </button>
          <button className="bg-slate-100 p-2.5 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined text-2xl">notifications</span>
          </button>
        </div>
      </header>

      <div className="px-6 space-y-6 pt-2">
        {showScheduleModal && (
          <ScheduleModal
            breakfastTime={breakfastTime}
            setBreakfastTime={setBreakfastTime}
            onGenerate={generateSchedule}
            onReset={resetSchedule}
            onClose={() => setShowScheduleModal(false)}
          />
        )}
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
              {/* TÍTULO + BADGES ARRIBA */}
              <div className="px-6 pt-8 pb-4">
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="bg-blue-600 text-white text-[9px] font-black tracking-[0.2em] uppercase px-3 py-1.5 rounded-full">
                    PRO NUTRICIÓN
                  </span>
                  {details.tiempo && (
                    <span className="bg-slate-100 text-slate-500 text-[9px] font-black tracking-[0.2em] uppercase px-3 py-1.5 rounded-full flex items-center gap-1">
                      <span className="material-symbols-outlined text-[10px]">schedule</span>
                      {details.tiempo}
                    </span>
                  )}
                  {details.dificultad && (
                    <span className="bg-slate-100 text-slate-500 text-[9px] font-black tracking-[0.2em] uppercase px-3 py-1.5 rounded-full flex items-center gap-1">
                      <span className="material-symbols-outlined text-[10px]">stairs</span>
                      {details.dificultad}
                    </span>
                  )}
                </div>
                <h2 className="text-[26px] font-black text-slate-900 leading-[1.1] tracking-tight">
                  {details.titulo || meal.description}
                </h2>
              </div>

              {/* IMAGEN LIMPIA CON OVERLAY DE KCAL */}
              <div className="mx-6 rounded-[32px] overflow-hidden aspect-[16/10] shadow-2xl relative group bg-slate-100">
                <img
                  src={details.imageUrl || getProductImage(meal.description, 'Gral')}
                  alt={details.titulo || meal.description}
                  className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).src = getProductImage(meal.description, 'Gral'); }}
                />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-white/20">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter text-center">Energía</p>
                  <p className="text-xl font-black text-slate-900 leading-none">{details.kcal} <span className="text-[10px] text-slate-400">kcal</span></p>
                </div>
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

const ScheduleModal: React.FC<{
  breakfastTime: string;
  setBreakfastTime: (t: string) => void;
  onGenerate: () => void;
  onReset: () => void;
  onClose: () => void;
}> = ({ breakfastTime, setBreakfastTime, onGenerate, onReset, onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-white rounded-t-[40px] p-8 space-y-6 animate-in slide-in-from-bottom duration-500 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⏰</span>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Programar Horario</h3>
          </div>
          <button onClick={onClose} className="size-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="text-[13px] text-slate-500 leading-relaxed font-medium">
          Establece la hora de tu **Desayuno** para generar automáticamente los horarios de comidas y las tomas de agua, respetando la regla médica.
        </p>

        <div className="flex items-center justify-between gap-4 p-5 bg-slate-50 rounded-3xl border border-slate-100/50">
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Hora de Desayuno:</span>
          <div className="relative flex-1 max-w-[140px]">
            <input
              type="time"
              value={breakfastTime}
              onChange={(e) => setBreakfastTime(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-base font-black text-slate-900 focus:outline-none focus:ring-4 focus:ring-primary/10 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">schedule</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => { onGenerate(); onClose(); }}
            className="w-full bg-[#1e60f1] text-white font-black py-5 rounded-[24px] text-xs uppercase tracking-[0.2em] shadow-xl shadow-blue-200 active:scale-[0.98] transition-all"
          >
            Generar Horario Automático
          </button>
          <button
            onClick={() => { onReset(); onClose(); }}
            className="w-full bg-white border-2 border-slate-100 text-slate-400 font-black py-5 rounded-[24px] text-xs uppercase tracking-[0.2em] active:scale-[0.98] transition-all"
          >
            Limpiar Horario Actual
          </button>
        </div>

        <button onClick={onClose} className="w-full py-2 text-slate-300 font-black text-[10px] tracking-[0.4em] uppercase">
          Cancelar
        </button>
      </div>
    </div>
  );
};

export default HomeView;
