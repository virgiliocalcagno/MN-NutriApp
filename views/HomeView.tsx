
import React from 'react';
import { useStore } from '../src/context/StoreContext';

const HomeView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
  const { store } = useStore();

  const days = [
    { label: 'LUN', date: '12', active: true },
    { label: 'MAR', date: '13', active: false },
    { label: 'MIÉ', date: '14', active: false },
    { label: 'JUE', date: '15', active: false },
    { label: 'VIE', date: '16', active: false },
  ];

  const macros = [
    { label: 'PROTEÍNA', value: '85g', target: '120', color: 'bg-primary', percentage: 70 },
    { label: 'CARBOS', value: '150g', target: '200', color: 'bg-emerald-500', percentage: 75 },
    { label: 'GRASAS', value: '45g', target: '65', color: 'bg-orange-500', percentage: 69 },
  ];

  return (
    <div className="flex flex-col bg-slate-50 min-h-screen pb-32 animate-in fade-in duration-700">
      {/* Header Section */}
      <header className="px-6 pt-8 pb-4 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-30">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Menú de Hoy</h1>
          <p className="text-slate-400 font-medium text-sm">Lunes, 12 de Junio</p>
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
          className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-blue-600 to-indigo-500 p-6 flex items-center gap-5 shadow-lg shadow-blue-200 cursor-pointer active:scale-[0.98] transition-all group"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:scale-110 transition-transform duration-700"></div>
          <div className="size-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30 text-white shrink-0">
            <span className="material-symbols-outlined text-3xl">filter_center_focus</span>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-black text-lg leading-none mb-1">NUTRISCAN AI</h3>
            <p className="text-white/80 text-[11px] font-bold leading-tight">Analiza tu plato actual con inteligencia artificial</p>
          </div>
          <span className="material-symbols-outlined text-white/60 group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
        </section>

        {/* Date Selector */}
        <section className="flex justify-between items-center gap-3 py-2 overflow-x-auto no-scrollbar">
          {days.map((day, idx) => (
            <div
              key={idx}
              className={`flex flex-col items-center justify-center min-w-[64px] h-20 rounded-2xl border transition-all duration-300 ${day.active
                  ? 'bg-primary border-primary text-white shadow-md shadow-primary/30 scale-105'
                  : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                }`}
            >
              <span className={`text-[10px] font-black tracking-widest ${day.active ? 'text-white/70' : 'text-slate-300'}`}>{day.label}</span>
              <span className="text-lg font-black mt-0.5">{day.date}</span>
            </div>
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
          {/* Vertical Line */}
          <div className="absolute left-[15px] top-6 bottom-0 w-[2px] bg-slate-100 z-0"></div>

          {/* Meals */}
          <MealCard
            type="DESAYUNO"
            time="08:30"
            title="Huevos revueltos con aguacate"
            kcal="350 kcal"
            status="completed"
          />

          <MealCard
            type="ALMUERZO"
            time="13:30"
            title="Salmón a la plancha con quinoa"
            kcal="550 kcal"
            status="active"
            image="https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&q=80&w=800"
            macros={{ p: '35g', c: '45g' }}
          />

          <MealCard
            type="MERIENDA"
            time="17:00"
            title="Yogur griego y nueces"
            kcal="200 kcal"
            status="pending"
          />

          <MealCard
            type="CENA"
            time="20:30"
            title="Ensalada de garbanzos"
            kcal="400 kcal"
            status="pending"
          />
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
  image?: string;
  macros?: { p: string; c: string };
}

const MealCard: React.FC<MealCardProps> = ({ type, time, title, kcal, status, image, macros }) => {
  return (
    <div className="relative z-10 flex gap-5 group items-start">
      {/* Indicator Dot */}
      <div className={`size-8 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm mt-1 transition-all ${status === 'completed' ? 'bg-emerald-500' :
          status === 'active' ? 'bg-primary' : 'bg-slate-200'
        }`}>
        {status === 'completed' && <span className="material-symbols-outlined text-white text-sm font-bold">check</span>}
        {status === 'active' && <div className="size-2.5 bg-white rounded-full"></div>}
      </div>

      <div className={`flex-1 bg-white rounded-[28px] border p-5 transition-all duration-300 ${status === 'active' ? 'border-primary/50 shadow-lg shadow-primary/5 ring-1 ring-primary/5' : 'border-slate-50 shadow-sm'
        }`}>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-black text-primary tracking-widest">{type}</span>
          <span className="text-[11px] font-black text-slate-400">{time}</span>
        </div>
        <h3 className="text-slate-800 font-extrabold text-lg leading-tight mb-4">{title}</h3>

        {image && (
          <div className="relative w-full h-48 rounded-[24px] overflow-hidden mb-4 shadow-inner">
            <img src={image} className="w-full h-full object-cover" alt={title} />
            <div className="absolute bottom-3 right-3 flex gap-2">
              {macros && (
                <>
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-white text-[10px] font-bold">
                    P: {macros.p}
                  </div>
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-white text-[10px] font-bold">
                    C: {macros.c}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-center gap-1.5 text-primary">
            <span className="material-symbols-outlined text-[18px] fill-1">local_fire_department</span>
            <span className="text-xs font-black">{kcal}</span>
          </div>
          {status === 'active' ? (
            <div className="flex gap-2">
              <button className="bg-slate-50 text-slate-500 font-black text-[10px] px-4 py-2.5 rounded-xl hover:bg-slate-100 transition-colors uppercase tracking-wider">Sustituir</button>
              <button className="bg-primary text-white font-black text-[10px] px-4 py-2.5 rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-all uppercase tracking-wider">Registrar</button>
            </div>
          ) : (
            <button className="text-primary font-black text-[10px] hover:underline uppercase tracking-wider">Ver Receta</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeView;
