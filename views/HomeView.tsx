import React from 'react';
import { useStore } from '../src/context/StoreContext';
import { sortMeals, getPantryItemsForDisplay } from '../src/utils/helpers';
import { auth } from '../src/firebase';

const HomeView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
  const { store, user } = useStore();

  // Date Logic
  const dias = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
  const todayName = dias[new Date().getDay()];
  const displayDay = store.selectedDay || todayName;

  // Menu Logic
  // store.menu is Record<DAY, Record<MEAL, DESC>>
  // We need to find the key that matches "displayDay" (ignoring case/accents ideally, but store.selectedDay should match keys)
  const menuForDay = store.menu[displayDay] || {};
  const meals = sortMeals(menuForDay);

  // Pantry Logic
  const pantry = getPantryItemsForDisplay(store.items);
  const shoppingCount = store.items.filter(i => i.lv <= 2).length;

  return (
    <div className="flex flex-col animate-in fade-in duration-500 pb-24">
      <div className="p-4 space-y-6">
        {/* Metabolic Coach AI */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-5 shadow-xl shadow-blue-200 group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
          <div className="relative z-10 flex items-start gap-4">
            <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-md border border-white/30 text-white shrink-0">
              <span className="material-symbols-outlined text-2xl animate-pulse">psychology</span>
            </div>
            <div className="flex-1">
              <h3 className="text-white font-extrabold text-sm uppercase tracking-widest mb-1 opacity-80">Coach Metabólico AI</h3>
              <p className="text-white text-[13px] font-bold leading-relaxed mb-3">
                {store.profile.objetivos.includes('Bajar de peso')
                  ? "Recuerda: El orden de los alimentos importa. Empieza con la fibra (ensalada) para aplanar tu curva de glucosa hoy."
                  : "Tu metabolismo está en fase de reparación. Hoy prioriza el descanso y la hidratación con electrolitos naturales."}
              </p>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-white/20 rounded-md text-[10px] font-bold text-white border border-white/20 uppercase">Bio-Hack activo</span>
                <span className="px-2 py-1 bg-emerald-400/30 rounded-md text-[10px] font-bold text-emerald-100 border border-emerald-400/30 uppercase">Estado: Óptimo</span>
              </div>
            </div>
          </div>
        </section>

        {/* Shopping List CTA */}
        <section>
          <button onClick={() => setView('shopping')} className="w-full bg-primary text-white p-4 rounded-xl shadow-lg shadow-primary/25 flex items-center justify-between group active:scale-[0.98] transition-all">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-2 rounded-lg">
                <span className="material-symbols-outlined fill-1">shopping_basket</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-lg leading-none">Lista de Compras</p>
                <p className="text-white/80 text-sm mt-1">
                  {shoppingCount > 0
                    ? `Tienes ${shoppingCount} artículos por comprar`
                    : '¡Todo en orden!'}
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
          </button>
        </section>

        {/* Menu Timeline */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight">Menú de Hoy</h2>
            <span className="text-xs font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full uppercase truncate max-w-[120px]">
              {displayDay}
            </span>
          </div>

          {meals.length > 0 ? (
            <div className="relative space-y-6 before:absolute before:left-[19px] before:top-4 before:bottom-0 before:w-[2px] before:bg-slate-100 pb-4">
              {meals.map((meal, idx) => (
                <div key={idx} className="relative z-10 flex gap-4 items-start">
                  <div className={`size-10 rounded-full flex items-center justify-center shrink-0 shadow-md border-4 border-white bg-primary/30`}>
                    <span className={`material-symbols-outlined text-xl text-primary`}>
                      {meal.icon}
                    </span>
                  </div>
                  <div className={`flex-1 p-4 rounded-xl border bg-white/50 border-dashed border-slate-200`}>
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-slate-800">{meal.name}</h3>
                      <span className="text-xs text-slate-400 font-medium">{store.schedule?.[meal.id] || ''}</span>
                    </div>
                    <p className="text-slate-600 mt-1 text-sm leading-relaxed">{meal.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <p className="text-slate-400 font-medium">No hay plan asignado para hoy.</p>
              <p className="text-xs text-slate-400 mt-1">Sincroniza tu PDF en Perfil.</p>
            </div>
          )}
        </section>

        {/* Pantry Summary */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight">Mi Despensa</h2>
            <span className="text-xs font-bold text-slate-400">Resumen</span>
          </div>
          {pantry.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {pantry.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-lg bg-slate-50 text-slate-600`}>
                      <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    </div>
                    <span className="font-bold text-sm truncate">{item.name}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>{item.status}</span>
                      <span>{item.percentage}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all duration-1000`} style={{ width: `${item.percentage}%` }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center border border-slate-100 rounded-xl bg-white shadow-sm">
              <p className="text-slate-400 text-sm">Tu inventario está vacío.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomeView;
