import React, { useState } from 'react';
import { View } from '../types';
import { useStore } from '../src/context/StoreContext';

interface TopNavProps {
    currentView: View;
    setCurrentView: (view: View) => void;
}

const TopNav: React.FC<TopNavProps> = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { setShowScheduleModal, setShowNotificationsModal } = useStore();

    return (
        <header className="sticky top-0 z-50 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-sm">
            {/* Logo/Branding */}
            <div className="flex items-center gap-2">
                <div className="size-8 bg-primary rounded-lg flex items-center justify-center shadow-md shadow-primary/20">
                    <span className="material-symbols-outlined text-white text-xl font-bold">nutrition</span>
                </div>
                <h1 className="text-xl font-extrabold tracking-tight text-primary">MN NutriApp</h1>
            </div>

            {/* Hamburger Menu Trigger */}
            <div className="relative">
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="p-2 rounded-full hover:bg-slate-50 text-slate-400 transition-colors active:scale-95"
                >
                    <span className="material-symbols-outlined text-3xl font-bold">menu</span>
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl z-[60] overflow-hidden animate-in slide-in-from-top-2 duration-200">
                        <div className="p-2 bg-slate-50 border-b border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 py-1">Acciones Pro</p>
                        </div>
                        <button
                            onClick={() => { setIsMenuOpen(false); setShowNotificationsModal(true); }}
                            className="w-full flex items-center gap-3 px-4 py-4 text-slate-600 hover:bg-slate-50 transition-colors text-left"
                            title="Abrir Centro de Alertas"
                        >
                            <span className="material-symbols-outlined text-blue-500 fill-1">notifications</span>
                            <span className="text-sm font-bold uppercase tracking-wider">Notificaciones</span>
                        </button>
                        <button
                            onClick={() => { setIsMenuOpen(false); setShowScheduleModal(true); }}
                            className="w-full flex items-center gap-3 px-4 py-4 text-slate-600 hover:bg-slate-50 transition-colors text-left border-t border-slate-50"
                        >
                            <span className="material-symbols-outlined text-emerald-500 fill-1">schedule</span>
                            <span className="text-sm font-bold uppercase tracking-wider">Horarios</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Click overlap to close menu */}
            {isMenuOpen && (
                <div
                    className="fixed inset-0 z-50"
                    onClick={() => setIsMenuOpen(false)}
                />
            )}
        </header>
    );
};

export default TopNav;
