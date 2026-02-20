
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
  // v18.0: Stitch Exact Replication (f408c132)
  const dummyTitle = "Salmón a la plancha con Quinoa y Espárragos";
  const dummyImageUrl = "https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=2000&auto=format&fit=crop";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-500 h-full flex flex-col">

        {/* HEADER: White Background + Centered Title */}
        <div className="flex items-center justify-between px-6 h-20 bg-white border-b border-slate-50 shrink-0">
          <button onClick={onClose} className="text-blue-600">
            <span className="material-symbols-outlined text-2xl font-black">arrow_back</span>
          </button>
          <h4 className="text-[11px] font-black tracking-[0.25em] text-slate-400 text-center uppercase">DETALLE DE ALMUERZO</h4>
          <button className="text-blue-600">
            <span className="material-symbols-outlined text-2xl font-black">share</span>
          </button>
        </div>

        {/* CONTENT AREA: Light Gray Background */}
        <div className="flex-1 overflow-y-auto bg-[#f8f9fd] no-scrollbar">

          {/* IMAGE CARD */}
          <div className="mx-6 mt-6 relative rounded-[40px] overflow-hidden aspect-square shadow-xl">
            <img src={dummyImageUrl} alt={dummyTitle} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-10 left-8 right-8">
              <span className="bg-[#1e60f1] text-[10px] font-black text-white px-5 py-2 rounded-full mb-4 inline-block shadow-lg uppercase tracking-wider">PRO NUTRICIÓN</span>
              <h1 className="text-white text-3xl font-black leading-[1.15]">{dummyTitle}</h1>
            </div>
          </div>

          {/* MACROS TILES */}
          <div className="grid grid-cols-2 gap-4 px-6 mt-6">
            <div className="bg-white rounded-[28px] p-6 flex flex-col items-center shadow-sm border border-slate-100/30">
              <span className="text-[9px] font-black text-slate-300 tracking-[0.2em] uppercase mb-1.5">CALORÍAS</span>
              <span className="text-2xl font-black text-[#1e60f1]">620</span>
              <span className="text-[9px] font-bold text-slate-300 -mt-0.5">kcal</span>
            </div>
            <div className="bg-white rounded-[28px] p-6 flex flex-col items-center shadow-sm border border-slate-100/30">
              <span className="text-[9px] font-black text-slate-300 tracking-[0.2em] uppercase mb-1.5">PROTEÍNA</span>
              <span className="text-2xl font-black text-slate-800 mb-2.5">45g</span>
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: '70%' }}></div>
              </div>
            </div>
            <div className="bg-white rounded-[28px] p-6 flex flex-col items-center shadow-sm border border-slate-100/30">
              <span className="text-[9px] font-black text-slate-300 tracking-[0.2em] uppercase mb-1.5">CARBOS</span>
              <span className="text-2xl font-black text-slate-800 mb-2.5">30g</span>
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-400" style={{ width: '45%' }}></div>
              </div>
            </div>
            <div className="bg-white rounded-[28px] p-6 flex flex-col items-center shadow-sm border border-slate-100/30">
              <span className="text-[9px] font-black text-slate-300 tracking-[0.2em] uppercase mb-1.5">GRASAS</span>
              <span className="text-2xl font-black text-slate-800 mb-2.5">18g</span>
              <div className="w-full h-1 bg-emerald-400 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: '35%' }}></div>
              </div>
            </div>
          </div>

          {/* INGREDIENTS */}
          <div className="px-6 mt-12">
            <div className="flex items-center gap-3 mb-5">
              <span className="material-symbols-outlined text-[#1e60f1] text-[28px] fill-1">shopping_basket</span>
              <h3 className="text-lg font-black text-slate-800">Ingredientes</h3>
            </div>
            <div className="space-y-3">
              {[
                "150g Salmón fresco",
                "1/2 taza Quinoa cocida",
                "6 espárragos trigueros",
                "1 cdita aceite de oliva, limón, sal y pimienta"
              ].map((ing, i) => (
                <div key={i} className="bg-white rounded-2xl p-6 flex items-center justify-between shadow-sm border border-slate-50">
                  <span className="text-[15px] font-bold text-slate-600">{ing}</span>
                  <span className="material-symbols-outlined text-slate-200 text-xl font-black">check_circle</span>
                </div>
              ))}
            </div>
          </div>

          {/* PREPARATION TIMELINE */}
          <div className="px-6 mt-14">
            <div className="flex items-center gap-3 mb-8">
              <span className="material-symbols-outlined text-[#1e60f1] text-[28px] fill-1">architecture</span>
              <h3 className="text-xl font-black text-slate-800">Preparación Profesional</h3>
            </div>
            <div className="space-y-12 relative pl-8 pb-4">
              <div className="absolute left-[13.5px] top-6 bottom-4 w-px bg-slate-100" />
              {[
                { t: "Limpieza y marinado", d: "Lavar bien el salmón y marinar con zumo de limón fresco, sal marina y pimienta negra recién molida." },
                { t: "Cocción técnica del salmón", d: "Cocinar a fuego medio. Colocar primero por el lado de la piel para obtener una textura crujiente y sellar jugos." },
                { t: "Salteado rápido", d: "Saltear los espárragos a fuego alto con el aceite de oliva durante 3-4 minutos para mantener el color verde vibrante y clorofila." }
              ].map((step, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[32px] top-1 size-7 bg-[#1e60f1] rounded-full flex items-center justify-center text-white text-[11px] font-black shadow-lg shadow-blue-100">
                    {i + 1}
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-[15px] font-black text-slate-800">{step.t}</h4>
                    <p className="text-[13px] font-bold text-slate-400 leading-relaxed max-w-[90%]">{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* BIO-HACK BOX */}
          <div className="mx-6 mt-4 mb-32 bg-[#ebf1ff] rounded-[48px] p-8 border border-blue-100/50 shadow-sm shadow-blue-50">
            <div className="flex items-center gap-3 mb-5">
              <span className="material-symbols-outlined text-blue-600 text-2xl fill-1">bolt</span>
              <h4 className="text-[12px] font-black text-blue-600 tracking-wider">BIO-HACK: SECUENCIACIÓN METABÓLICA</h4>
            </div>
            <p className="text-[13px] font-bold text-slate-500 leading-relaxed mb-8">Para optimizar la curva de glucosa y mejorar la respuesta insulínica, consume los ingredientes en este orden:</p>
            <div className="flex flex-wrap gap-3">
              {[
                { l: "1. Espárragos (Fibra)", c: "bg-emerald-400" },
                { l: "2. Salmón (Prot/Grasa)", c: "bg-blue-500" },
                { l: "3. Quinoa (Almidón)", c: "bg-orange-400" }
              ].map((p, i) => (
                <div key={i} className="bg-white rounded-full py-2.5 px-6 flex items-center gap-3 border border-blue-100/20 shadow-sm hover:scale-105 transition-transform">
                  <div className={`size-2.5 rounded-full ${p.c}`} />
                  <span className="text-[11px] font-black text-slate-700">{p.l}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default HomeView;
