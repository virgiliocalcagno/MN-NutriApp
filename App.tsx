import React, { useState } from 'react';
import { View } from './types';
import HomeView from './views/HomeView';
import FitnessView from './views/FitnessView';
import ProfileView from './views/ProfileView';
import ProgressView from './views/ProgressView';
import WelcomeView from './views/WelcomeView';
import TopNav from './components/TopNav';
import InventoryView from './views/InventoryView';
import LoginScreen from './src/components/LoginScreen';
import { useStore } from './src/context/StoreContext';
import BottomNav from './components/BottomNav';
import NutriScanView from './views/NutriScanView';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('welcome');
  const { user, loading } = useStore();

  if (loading) {
    return (
      <div className="fixed top-0 left-0 w-full h-full bg-white/90 backdrop-blur-sm z-[4000] flex flex-col items-center justify-center gap-5">
        <div className="w-[50px] h-[50px] border-[5px] border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
        <strong className="text-slate-900 tracking-wider">CARGANDO...</strong>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'welcome': return <WelcomeView onStart={() => setCurrentView('home')} />;
      case 'home': return <HomeView setView={setCurrentView} />;
      case 'fitness': return <FitnessView setView={setCurrentView} />;
      case 'inventory': return <InventoryView setView={setCurrentView} />;
      case 'profile': return <ProfileView setView={setCurrentView} />;
      case 'progress': return <ProgressView />;
      case 'scan': return <NutriScanView setView={setCurrentView} />;
      default: return <HomeView setView={setCurrentView} />;
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white h-screen shadow-2xl relative flex flex-col overflow-hidden">
      {currentView !== 'inventory' && currentView !== 'welcome' && (
        <TopNav currentView={currentView} setCurrentView={setCurrentView} />
      )}
      <main className={`flex-1 overflow-y-auto no-scrollbar ${currentView !== 'welcome' ? 'pb-4' : ''}`}>
        {renderView()}
      </main>
      {currentView !== 'welcome' && (
        <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
      )}
    </div>
  );
};

export default App;
