import React, { useState } from 'react';
import { View } from './types';
import HomeView from './views/HomeView';
import FitnessView from './views/FitnessView';
import ProgressView from './views/ProgressView';
import ProfileView from './views/ProfileView';
import TopNav from './components/TopNav';
import ShoppingView from './views/ShoppingView';
import LoginScreen from './src/components/LoginScreen';
import { useStore } from './src/context/StoreContext';
import BottomNav from './components/BottomNav';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');
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
      case 'home': return <HomeView setView={setCurrentView} />;
      case 'fitness': return <FitnessView />;
      case 'progress': return <ProgressView />;
      case 'profile': return <ProfileView />;
      case 'shopping': return <ShoppingView setView={setCurrentView} />;
      default: return <HomeView setView={setCurrentView} />;
    }
  };

  return (
    <div className="max-w-md mx-auto bg-[#f8fafc] h-screen shadow-2xl relative flex flex-col overflow-hidden">
      {currentView !== 'shopping' && (
        <TopNav currentView={currentView} setCurrentView={setCurrentView} />
      )}
      <main className="flex-1 overflow-y-auto no-scrollbar pb-24">
        {renderView()}
      </main>
      {currentView !== 'shopping' && (
        <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
      )}
    </div>
  );
};

export default App;
