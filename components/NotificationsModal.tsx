import React from 'react';
import { useStore } from '../src/context/StoreContext';

const NotificationsModal: React.FC = () => {
    const { store, saveStore, showNotificationsModal, setShowNotificationsModal } = useStore();

    if (!showNotificationsModal) return null;

    const config = store.notifications || {
        enabled: true,
        mode: 'both',
        categories: { meds: true, meals: true, appointments: true, hydration: true }
    };

    const toggleMaster = () => {
        saveStore({
            ...store,
            notifications: { ...config, enabled: !config.enabled }
        });
    };

    const toggleCategory = (cat: keyof typeof config.categories) => {
        saveStore({
            ...store,
            notifications: {
                ...config,
                categories: { ...config.categories, [cat]: !config.categories[cat] }
            }
        });
    };

    const setMode = (mode: 'sound' | 'vibrate' | 'both') => {
        saveStore({
            ...store,
            notifications: { ...config, mode }
        });
    };

    const testAlert = () => {
        if (config.mode === 'vibrate' || config.mode === 'both') {
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        }
        if (config.mode === 'sound' || config.mode === 'both') {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(e => console.log("Audio play blocked", e));
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowNotificationsModal(false)}></div>
            <div className="relative w-full max-w-lg bg-white rounded-t-[40px] p-8 space-y-6 animate-in slide-in-from-bottom duration-500 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">

                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🔔</span>
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Centro de Alertas</h3>
                    </div>
                    <button onClick={() => setShowNotificationsModal(false)} className="size-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-all">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Master Switch */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                        <p className="font-black text-slate-800 text-sm uppercase">Notificaciones Pro</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Activar sistema de alarmas</p>
                    </div>
                    <button
                        onClick={toggleMaster}
                        title={config.enabled ? "Desactivar Notificaciones" : "Activar Notificaciones"}
                        className={`w-14 h-8 rounded-full transition-all relative ${config.enabled ? 'bg-primary' : 'bg-slate-200'}`}
                    >
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${config.enabled ? 'left-7' : 'left-1'}`} />
                    </button>
                </div>

                {config.enabled && (
                    <>
                        {/* Mode Selection */}
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'sound', label: 'Sonar', icon: 'volume_up' },
                                { id: 'vibrate', label: 'Vibrar', icon: 'vibration' },
                                { id: 'both', label: 'Ambos', icon: 'notifications_active' }
                            ].map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setMode(m.id as any)}
                                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${config.mode === m.id ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-100 text-slate-400'}`}
                                >
                                    <span className="material-symbols-outlined mb-1">{m.icon}</span>
                                    <span className="text-[10px] font-black uppercase tracking-tighter">{m.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Categories */}
                        <div className="space-y-3">
                            {[
                                { id: 'meds', label: 'Medicamentos', icon: 'medication' },
                                { id: 'meals', label: 'Comidas y Snacks', icon: 'restaurant' },
                                { id: 'appointments', label: 'Citas Médicas', icon: 'event' },
                                { id: 'hydration', label: 'Hidratación', icon: 'water_drop' }
                            ].map((c) => (
                                <div key={c.id} className="flex items-center justify-between py-2 px-1">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-slate-400">{c.icon}</span>
                                        <span className="text-sm font-bold text-slate-600 uppercase tracking-tight">{c.label}</span>
                                    </div>
                                    <button
                                        onClick={() => toggleCategory(c.id as any)}
                                        title={`Alternar ${c.label}`}
                                        className={`w-10 h-6 rounded-full transition-all relative ${config.categories[c.id as keyof typeof config.categories] ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${config.categories[c.id as keyof typeof config.categories] ? 'left-4.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={testAlert}
                            className="w-full py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-sm">play_circle</span>
                            Probar Alerta Actual
                        </button>
                    </>
                )}

                <button onClick={() => setShowNotificationsModal(false)} className="w-full py-2 text-slate-300 font-black text-[10px] tracking-widest uppercase">
                    Volver
                </button>
            </div>
        </div>
    );
};

export default NotificationsModal;
