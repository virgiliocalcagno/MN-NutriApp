import React, { useState, useRef } from 'react';
import { useStore } from '../src/context/StoreContext';
import { processPdfWithGemini } from '../src/utils/ai';
import { MealItem } from '../src/types/store';
import { firebaseConfig } from '../src/firebase'; // Import config

const ProfileView: React.FC = () => {
  const { store, user, saveStore, logout } = useStore();
  const [showLogout, setShowLogout] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { profile } = store;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        alert('Por favor selecciona un archivo PDF.');
        return;
      }

      setIsProcessing(true);
      try {
        // Convert to Base64
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;

          let data;
          try {
            // Internal fallback in ai.ts handles failure now
            const activeKey = store.aiKey || firebaseConfig.apiKey;
            data = await processPdfWithGemini(profile, base64, undefined, activeKey);
          } catch (error) {
            console.error("PDF Processing failed even with fallback:", error);
            return; // Error already alerted in ai.ts
          }

          if (data) {
            // Update Store
            const newProfile = { ...store.profile, ...data.perfilAuto };

            // Clean undefined/null values
            Object.keys(newProfile).forEach(key => {
              if (newProfile[key as keyof typeof newProfile] === 'No especificado' || newProfile[key as keyof typeof newProfile] === null) {
                delete newProfile[key as keyof typeof newProfile];
              }
            });
            const mergedProfile = { ...store.profile, ...newProfile };

            const newMenu = data.semana || store.menu;
            const newExercises = data.ejercicios || store.exercises;

            // Map Compras to MealItems
            const newItems: MealItem[] = (data.compras || []).map(c => ({
              id: Date.now() + Math.random().toString(),
              n: c[0],
              q: c[1],
              lv: 4, // Default full
              cat: c[3] || 'Gral',
              p: c[3] || 'Gral',
              b: false
            }));

            const currentItems = [...store.items, ...newItems];

            saveStore({
              ...store,
              profile: mergedProfile,
              menu: newMenu,
              exercises: newExercises,
              items: currentItems
            });

            const daysCount = Object.keys(newMenu || {}).length;
            const itemsCount = newItems.length;
            const patientName = mergedProfile.paciente || 'Paciente';

            alert(`✅ ANÁLISIS COMPLETADO EXITOSAMENTE\n\n👤 Paciente: ${patientName}\n📅 Menú: ${daysCount} días generados\n🛒 Despensa: ${itemsCount} productos agregados\n\nTu perfil ha sido actualizado.`);
          }
        };
        reader.readAsDataURL(file);

      } catch (error: any) {
        console.error(error);
        alert(`⚠️ Error al procesar el PDF: ${error.message || error}\n\nNecesitas una API Key válida de AI Studio.`);
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex flex-col animate-in slide-in-from-bottom duration-500 pb-20 relative">
      {isProcessing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in-95 max-w-sm w-full text-center">
            <div className="size-20 border-[6px] border-blue-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Analizando Ficha Médica</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              Extrayendo datos clínicos...<br />
              <span className="text-xs text-blue-500">(Si tarda, te pedirá una API Key)</span>
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center p-4 pt-6 justify-between bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button className="flex items-center justify-center p-2 rounded-lg hover:bg-primary/10 transition-colors text-slate-600">
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold tracking-tight">Mi Perfil Médico</h1>
        </div>
        <div className="relative">
          <button onClick={() => setShowLogout(!showLogout)} className="p-2 rounded-lg hover:bg-primary/10 transition-colors text-slate-600">
            <span className="material-symbols-outlined text-2xl">settings</span>
          </button>
          {showLogout && (
            <div className="absolute right-0 top-12 bg-white shadow-xl rounded-xl border border-slate-100 p-2 w-40 z-50 animate-in slide-in-from-top-2">
              <button onClick={logout} className="w-full text-left px-4 py-2 text-red-500 font-bold hover:bg-red-50 rounded-lg flex items-center gap-2">
                <span className="material-symbols-outlined">logout</span>
                Cerrar Sesión
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Profile Bio */}
      <div className="px-6 py-6 flex items-center gap-5 bg-white border-b border-slate-100">
        <div className="relative">
          <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20 overflow-hidden shadow-inner">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-4xl text-primary">person</span>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 bg-primary text-white size-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
            <span className="material-symbols-outlined text-[14px] font-bold">verified</span>
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{profile.paciente || user?.displayName || 'Usuario'}</h2>
          <p className="text-sm text-primary font-bold bg-primary/5 px-2 py-0.5 rounded-md inline-block mt-1">Dr. {profile.doctor || 'No asignado'}</p>
          <p className="text-xs text-slate-400 mt-1">{user?.email}</p>
        </div>
      </div>

      {/* Import Action */}
      <div className="px-6 py-6">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="application/pdf"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-base transition-all shadow-lg shadow-slate-900/20 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed group"
        >
          <span className="material-symbols-outlined group-hover:animate-bounce">upload_file</span>
          <span>Importar Ficha Médica (PDF)</span>
        </button>
        <p className="text-center text-xs text-slate-400 mt-3 px-4">
          Sube tu Plan Nutricional. Si falla la clave interna, se te pedirá una Key propia.
        </p>
      </div>

      {/* Medical Record */}
      <main className="px-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800">
              <span className="material-symbols-outlined text-primary">clinical_notes</span>
              Expediente de Salud
            </h3>
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[10px]">lock</span>
              Cifrado
            </span>
          </div>

          <div className="space-y-3">
            {/* Card Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-slate-400 text-lg">cake</span>
                  <p className="text-xs text-slate-400 font-bold uppercase">Edad</p>
                </div>
                <p className="text-2xl font-bold text-slate-800">{profile.edad || '--'} <span className="text-sm font-medium text-slate-400">años</span></p>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-slate-400 text-lg">monitor_weight</span>
                  <p className="text-xs text-slate-400 font-bold uppercase">Peso</p>
                </div>
                <p className="text-2xl font-bold text-slate-800">{profile.peso || '--'} <span className="text-sm font-medium text-slate-400">lbs</span></p>
              </div>
            </div>

            {/* Card Comorbidities */}
            <div className="p-5 rounded-2xl border border-pink-100 bg-pink-50/30 flex items-start gap-4">
              <div className="bg-pink-100 p-2.5 rounded-xl text-pink-500">
                <span className="material-symbols-outlined text-2xl">medical_information</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800 mb-2">Historial Clínico</p>
                <div className="flex flex-wrap gap-2">
                  {profile.comorbilidades && profile.comorbilidades.length > 0 ? (
                    profile.comorbilidades.map((c, i) => (
                      <span key={i} className="text-xs font-bold bg-white px-2.5 py-1 rounded-lg border border-pink-100 text-pink-600 shadow-sm">{c}</span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">No registradas</span>
                  )}
                  {profile.alergias && profile.alergias !== 'Ninguna' && (
                    <span className="text-xs font-bold bg-white px-2.5 py-1 rounded-lg border border-red-100 text-red-500 shadow-sm flex items-center gap-1">
                      <span className="material-symbols-outlined text-[10px]">warning</span>
                      Alergia: {profile.alergias}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card Observaciones */}
            <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex items-start gap-4">
              <div className="bg-slate-100 p-2.5 rounded-xl text-slate-500">
                <span className="material-symbols-outlined text-2xl">description</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800 mb-1">Observaciones Médicas</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {profile.observaciones || 'Sin observaciones particulares.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="pb-4">
          <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800 mb-4">
            <span className="material-symbols-outlined text-red-500">contact_emergency</span>
            Contacto de Emergencia
          </h3>
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                <span className="material-symbols-outlined">sos</span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{profile.emergencia || 'No configurado'}</p>
                <p className="text-xs text-red-400 font-medium">Toque para llamar</p>
              </div>
            </div>
            {profile.emergencia && (
              <a href={`tel:${profile.emergencia}`} className="bg-red-500 text-white size-10 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95 transition-all">
                <span className="material-symbols-outlined">call</span>
              </a>
            )}
          </div>
        </div>

        {/* AI Settings */}
        <div className="pb-10">
          <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800 mb-4">
            <span className="material-symbols-outlined text-indigo-500">smart_toy</span>
            Configuración de IA
          </h3>
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-slate-900">Motor de Análisis Gemini</p>
                <p className="text-xs text-indigo-600 font-medium">
                  {store.aiKey ? '✅ Clave Personal Activa' : '⚠️ Usando Clave de Sistema'}
                </p>
              </div>
              <button
                onClick={() => {
                  const newKey = prompt("Configura tu API Key de AI Studio:", store.aiKey || "");
                  if (newKey !== null) saveStore({ ...store, aiKey: newKey });
                }}
                className="bg-white text-indigo-600 p-2 rounded-xl border border-indigo-200 shadow-sm active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined">settings_input_component</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              La IA procesa tus PDF sin costo adicional usando tu propia clave. Puedes obtener una gratis en aistudio.google.com.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProfileView;
