import React from 'react';
import { View } from '../types';

interface BottomNavProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, setCurrentView }) => {
  const navItems = [
    { id: 'home', label: 'Menú', icon: 'home' },
    { id: 'fitness', label: 'Zona Fit', icon: 'fitness_center' },
    { id: 'inventory', label: 'Insumos', icon: 'inventory_2' },
    { id: 'profile', label: 'Perfil', icon: 'person' }
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-lg border-t border-slate-100 flex justify-around items-center px-2 py-3 pb-8 z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-20 ${isActive ? 'text-primary scale-110' : 'text-slate-400 hover:text-slate-600'
              }`}
          >
            <div className={`flex items-center justify-center p-1 rounded-xl transition-all ${isActive ? 'bg-primary/10 shadow-sm shadow-primary/5' : ''
              }`}>
              <span
                className="material-symbols-outlined text-[26px]"
                style={{ fontVariationSettings: isActive ? "'FILL' 1, 'wght' 600" : "'FILL' 0, 'wght' 400" }}
              >
                {item.icon}
              </span>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-opacity ${isActive ? 'opacity-100' : 'opacity-60'
              }`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
