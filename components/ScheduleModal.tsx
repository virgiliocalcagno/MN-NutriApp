import React, { useState } from 'react';
import { useStore } from '../src/context/StoreContext';

const ScheduleModal: React.FC = () => {
    const { showScheduleModal, setShowScheduleModal, generateSchedule, resetSchedule } = useStore();
    const [breakfastTime, setBreakfastTime] = useState("08:00");

    if (!showScheduleModal) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowScheduleModal(false)}></div>
            <div className="relative w-full max-w-lg bg-white rounded-t-[40px] p-8 space-y-6 animate-in slide-in-from-bottom duration-500 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">

                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">⏰</span>
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Programar Horario</h3>
                    </div>
                    <button onClick={() => setShowScheduleModal(false)} className="size-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-all">
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
                            title="Hora de desayuno"
                            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-base font-black text-slate-900 focus:outline-none focus:ring-4 focus:ring-primary/10 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">schedule</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    <button
                        onClick={() => { generateSchedule(breakfastTime); setShowScheduleModal(false); }}
                        className="w-full bg-[#1e60f1] text-white font-black py-5 rounded-[24px] text-xs uppercase tracking-[0.2em] shadow-xl shadow-blue-200 active:scale-[0.98] transition-all"
                    >
                        Generar Horario Automático
                    </button>
                    <button
                        onClick={() => { if (confirm("¿Estás seguro de limpiar el horario?")) { resetSchedule(); setShowScheduleModal(false); } }}
                        className="w-full bg-white border-2 border-slate-100 text-slate-400 font-black py-5 rounded-[24px] text-xs uppercase tracking-[0.2em] active:scale-[0.98] transition-all"
                    >
                        Limpiar Horario Actual
                    </button>
                </div>

                <button onClick={() => setShowScheduleModal(false)} className="w-full py-2 text-slate-300 font-black text-[10px] tracking-[0.4em] uppercase">
                    Cancelar
                </button>
            </div>
        </div>
    );
};

export default ScheduleModal;
