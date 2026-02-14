import React from 'react';
import { View } from '../types';

interface TopNavProps {
    currentView: View;
    setCurrentView: (view: View) => void;
}

const TopNav: React.FC<TopNavProps> = () => {
    return (
        <header className="sticky top-0 z-50 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shadow-sm">
            {/* Logo/Branding */}
            <div className="flex items-center gap-2">
                <div className="size-8 bg-primary rounded-lg flex items-center justify-center shadow-md shadow-primary/20">
                    <span className="material-symbols-outlined text-white text-xl font-bold">nutrition</span>
                </div>
                <h1 className="text-xl font-extrabold tracking-tight text-primary">MN NutriApp</h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button className="p-2 rounded-full hover:bg-slate-50 text-slate-400 transition-colors">
                    <span className="material-symbols-outlined text-2xl">notifications</span>
                </button>
                <button className="p-2 rounded-full hover:bg-slate-50 text-slate-400 transition-colors">
                    <span className="material-symbols-outlined text-2xl">search</span>
                </button>
            </div>
        </header>
    );
};

export default TopNav;
