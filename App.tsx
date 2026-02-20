import React, { useState } from 'react';
import { View } from './types';
import HomeView from './views/HomeView';
import FitnessView from './views/FitnessView';
import ProfileView from './views/ProfileView';
import ProgressView from './views/ProgressView';
import WelcomeView from './views/WelcomeView';
import TopNav from './components/TopNav';
import ShoppingView from './views/ShoppingView';
import LoginScreen from './src/components/LoginScreen';
import { useStore } from './src/context/StoreContext';
import BottomNav from './components/BottomNav';

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
      case 'shopping': return <ShoppingView setView={setCurrentView} />;
      case 'profile': return <ProfileView setView={setCurrentView} />;
      case 'progress': return <ProgressView />;
      default: return <HomeView setView={setCurrentView} />;
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen shadow-2xl relative flex flex-col overflow-x-hidden">
      {currentView !== 'shopping' && currentView !== 'welcome' && (
        <TopNav currentView={currentView} setCurrentView={setCurrentView} />
      )}
      <main className={`flex-1 overflow-y-auto ${currentView !== 'welcome' ? 'pb-20' : ''}`}>
        {renderView()}
      </main>
      {currentView !== 'welcome' && (
        <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
      )}
    </div>
  );
};

export default App;
