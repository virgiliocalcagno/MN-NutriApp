import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { processPdfWithGemini } from '@/src/utils/ai';
import { MealItem, initialStore } from '@/src/types/store';
import { firebaseConfig } from '@/src/firebase';
import { useLongPress } from '@/src/hooks/useLongPress';

const ProfileView: React.FC<{ setView?: (v: any) => void }> = ({ setView }) => {
  const { store, user, saveStore, logout } = useStore();
  const [showLogout, setShowLogout] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ ...store.profile });
  const [isLocked, setIsLocked] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { profile } = store;

  // Sync local state when store changes
  useEffect(() => {
    setEditData({ ...store.profile });
  }, [store.profile]);

  const onLongPress = () => {
    setIsLocked(!isLocked);
    if (window.navigator?.vibrate) window.navigator.vibrate(50);
  };

  const longPressProps = useLongPress(onLongPress, undefined, { delay: 800 });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      alert("El perfil está bloqueado. Mantén presionado el nombre para desbloquear.");
      return;
    }
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        alert('Por favor selecciona un archivo PDF.');
        return;
      }
      setIsProcessing(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          const activeKey = (firebaseConfig as any).geminiApiKey;
          const data = await processPdfWithGemini(profile, base64, undefined, activeKey);
          if (data) {
            const mergedProfile = { ...initialStore.profile, ...data.perfilAuto };
            const newMenu = data.semana || {};
            const newExercises = data.ejercicios || {};
            const newItems: MealItem[] = (data.compras || []).map((c: any, idx: number) => ({
              id: Date.now() + '-' + idx,
              n: c[0], q: c[1], lv: 4, cat: c[3] || 'Gral', p: c[3] || 'Gral', b: false
            }));

            saveStore({
              ...store,
              profile: mergedProfile,
              menu: newMenu,
              exercises: newExercises,
              items: newItems
            });
            alert(`✅ ANÁLISIS COMPLETADO EXITOSAMENTE\n\n👤 Paciente: ${mergedProfile.paciente || 'Paciente'}\n📅 Menú: ${Object.keys(newMenu).length} días\n🛒 Despensa: ${newItems.length} productos\n\nTu perfil ha sido actualizado.`);
          }
        };
        reader.readAsDataURL(file);
      } catch (error: any) {
        console.error(error);
        alert(`⚠️ Error al procesar el PDF: ${error.message || error}`);
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveManual = () => {
    saveStore({ ...store, profile: editData });
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col bg-slate-50 min-h-screen pb-24">
      {isProcessing && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in-95 max-w-sm w-full text-center">
            <div className="size-20 border-[6px] border-blue-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Analizando Datos</h3>
            <p className="text-slate-500 text-sm">Extrayendo información clínica...</p>
          </div>
        </div>
      )}

      {/* Profile Header Block */}
      <div className="bg-white px-6 pt-10 pb-6 rounded-b-[40px] shadow-sm border-b border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50"></div>
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="size-24 rounded-full bg-slate-100 flex items-center justify-center border-4 border-white shadow-xl overflow-hidden ring-4 ring-primary/5">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-4xl text-slate-300">person</span>
              )}
            </div>
            {isLocked && (
              <div className="absolute -bottom-1 -right-1 bg-primary text-white size-8 rounded-full flex items-center justify-center border-4 border-white shadow-lg animate-in zoom-in duration-300">
                <span className="material-symbols-outlined text-[18px] font-fill">lock</span>
              </div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-1" {...longPressProps}>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.paciente || ''}
                    onChange={e => setEditData({ ...editData, paciente: e.target.value })}
                    className="bg-slate-50 border-none p-0 w-full focus:ring-0 rounded font-black"
                  />
                ) : (profile.paciente || user?.displayName || 'Usuario')}
              </h2>
              <button onClick={() => setShowLogout(!showLogout)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">settings</span>
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-primary bg-primary/5 px-3 py-0.5 rounded-full inline-block">
                  {isEditing ? (
                    <span className="flex items-center gap-1">Dr. <input value={editData.doctor || ''} onChange={e => setEditData({ ...editData, doctor: e.target.value })} className="bg-transparent border-none p-0 w-24 text-primary font-bold focus:ring-0" /></span>
                  ) : `Dr. ${profile.doctor || 'No asignado'}`}
                </p>
              </div>
              <p className="text-[11px] text-slate-400 font-medium px-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">mail</span> {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Logout Dropdown */}
        {showLogout && (
          <div className="absolute right-6 top-16 bg-white shadow-2xl rounded-2xl border border-slate-100 p-2 w-48 z-[110] animate-in slide-in-from-top-4">
            <button onClick={logout} className="w-full text-left px-4 py-3 text-red-500 text-sm font-black hover:bg-red-50 rounded-xl flex items-center gap-3 transition-colors">
              <span className="material-symbols-outlined text-xl">logout</span>
              Cerrar Sesión
            </button>
          </div>
        )}
      </div>

      {/* Actions Bar */}
      <div className="px-6 -mt-6 flex gap-3 z-10">
        {!isLocked && (
          <>
            <button
              onClick={() => isEditing ? handleSaveManual() : setIsEditing(true)}
              className="flex-1 bg-white hover:bg-slate-50 py-4 rounded-2xl shadow-lg border border-slate-100 font-black text-sm flex items-center justify-center gap-3 active:scale-95 transition-all text-slate-700"
            >
              <span className="material-symbols-outlined text-primary font-fill">{isEditing ? 'save' : 'edit_note'}</span>
              {isEditing ? 'GUARDAR' : 'EDITAR'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="bg-slate-900 hover:bg-black text-white px-6 py-4 rounded-2xl shadow-lg border border-slate-100 font-black text-sm flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined font-fill">upload_file</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="application/pdf" className="hidden" />
          </>
        )}
      </div>

      {/* Medical Content */}
      <main className="px-6 py-8 space-y-8 animate-in fade-in duration-500">
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="size-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <span className="material-symbols-outlined font-fill">clinical_notes</span>
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Ficha Técnica</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <p className="text-[10px] text-slate-400 font-black uppercase mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">cake</span> EDAD
              </p>
              <div className="flex items-baseline gap-1">
                {isEditing ? (
                  <input
                    type="number"
                    value={editData.edad || ''}
                    onChange={e => setEditData({ ...editData, edad: e.target.value })}
                    className="text-2xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-16"
                  />
                ) : <span className="text-3xl font-black text-slate-800">{profile.edad || '--'}</span>}
                <span className="text-xs font-bold text-slate-400 uppercase">años</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <p className="text-[10px] text-slate-400 font-black uppercase mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">monitor_weight</span> PESO
              </p>
              <div className="flex items-baseline gap-1">
                {isEditing ? (
                  <input
                    type="number"
                    value={editData.peso || ''}
                    onChange={e => setEditData({ ...editData, peso: e.target.value })}
                    className="text-2xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-16"
                  />
                ) : <span className="text-3xl font-black text-slate-800">{profile.peso || '--'}</span>}
                <span className="text-xs font-bold text-slate-400 uppercase">lbs</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <p className="text-[10px] text-slate-400 font-black uppercase mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">straighten</span> ESTATURA
              </p>
              <div className="flex items-baseline gap-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.estatura || ''}
                    onChange={e => setEditData({ ...editData, estatura: e.target.value })}
                    className="text-2xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-20"
                  />
                ) : <span className="text-3xl font-black text-slate-800">{profile.estatura || '--'}</span>}
                <span className="text-xs font-bold text-slate-400 uppercase">cms</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <p className="text-[10px] text-slate-400 font-black uppercase mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">wc</span> SEXO
              </p>
              <div className="flex items-baseline gap-1">
                {isEditing ? (
                  <select
                    value={editData.sexo || ''}
                    onChange={e => setEditData({ ...editData, sexo: e.target.value })}
                    className="text-lg font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-full"
                  >
                    <option value="Hombre">Hombre</option>
                    <option value="Mujer">Mujer</option>
                  </select>
                ) : <span className="text-xl font-black text-slate-800 lowercase first-letter:uppercase">{profile.sexo || '--'}</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <p className="text-[10px] text-slate-400 font-black uppercase mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">bloodtype</span> SANGRE
              </p>
              <div className="flex items-baseline gap-1">
                {isEditing ? (
                  <input
                    value={editData.sangre || ''}
                    onChange={e => setEditData({ ...editData, sangre: e.target.value })}
                    className="text-2xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-20 uppercase"
                  />
                ) : <span className="text-3xl font-black text-slate-800 uppercase">{profile.sangre || '--'}</span>}
              </div>
            </div>
            <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm transition-all hover:shadow-md">
              <p className="text-[10px] text-slate-400 font-black uppercase mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">personal_injury</span> CINTURA
              </p>
              <div className="flex items-baseline gap-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.cintura || ''}
                    onChange={e => setEditData({ ...editData, cintura: e.target.value })}
                    className="text-2xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-20"
                  />
                ) : <span className="text-3xl font-black text-slate-800">{profile.cintura || '--'}</span>}
                <span className="text-xs font-bold text-slate-400 uppercase">cms</span>
              </div>
            </div>
          </div>
        </section>

        {/* Patient History */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-pink-500">medical_information</span>
              <h4 className="font-black text-slate-800 text-sm uppercase tracking-wide">Comorbilidades</h4>
            </div>
            {isEditing ? (
              <textarea
                value={(editData.comorbilidades || []).join(', ')}
                onChange={e => setEditData({ ...editData, comorbilidades: e.target.value.split(',').map(s => s.trim()) })}
                className="w-full bg-slate-50 border-none rounded-xl text-sm focus:ring-primary h-24 p-3 font-medium text-slate-600"
                placeholder="Diabetes, Hipertensión..."
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {profile.comorbilidades && profile.comorbilidades.length > 0 ? (
                  profile.comorbilidades.map((c, i) => (
                    <span key={i} className="text-xs font-black bg-slate-50 px-4 py-2 rounded-xl text-slate-600 border border-slate-100 shadow-sm">{c}</span>
                  ))
                ) : <p className="text-xs text-slate-400 italic">No hay registros clínicos.</p>}
              </div>
            )}
          </section>

          <section className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-blue-500">vaccines</span>
              <h4 className="font-black text-slate-800 text-sm uppercase tracking-wide">Alergias</h4>
            </div>
            {isEditing ? (
              <textarea
                value={editData.alergias || ''}
                onChange={e => setEditData({ ...editData, alergias: e.target.value })}
                className="w-full bg-slate-50 border-none rounded-xl text-sm focus:ring-primary h-24 p-3 font-medium text-slate-600"
                placeholder="Penicilina, Mani..."
              />
            ) : (
              <p className="text-sm font-medium text-slate-600">
                {profile.alergias || "Sin alergias reportadas."}
              </p>
            )}
          </section>
        </div>

        <section className="bg-slate-900 p-6 rounded-[32px] text-white shadow-xl shadow-slate-900/20">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-amber-400 font-fill">warning</span>
            <h4 className="font-black text-[10px] uppercase tracking-widest opacity-60 text-white">Observaciones Limitantes</h4>
          </div>
          {isEditing ? (
            <textarea
              value={editData.observaciones || ''}
              onChange={e => setEditData({ ...editData, observaciones: e.target.value })}
              className="w-full bg-white/10 border-none rounded-xl text-sm focus:ring-white h-24 p-3 font-medium text-white"
            />
          ) : (
            <p className="text-sm font-medium leading-relaxed italic opacity-90">
              {profile.observaciones || "El paciente no presenta limitantes reportadas."}
            </p>
          )}
        </section>

        {/* Emergency Card */}
        <section className="bg-red-50 p-6 rounded-[32px] border border-red-100 flex items-center justify-between group">
          <div className="flex items-center gap-4">
            <div className="size-12 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-sm border border-red-100 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined font-fill">sos</span>
            </div>
            <div>
              <p className="text-[10px] text-red-400 font-black uppercase mb-0.5 tracking-wider">Contacto de Emergencia</p>
              {isEditing ? (
                <input
                  value={editData.emergencia || ''}
                  onChange={e => setEditData({ ...editData, emergencia: e.target.value })}
                  className="text-lg font-black text-slate-900 bg-transparent border-none p-0 focus:ring-0 w-32"
                />
              ) : <p className="text-lg font-black text-slate-900">{profile.emergencia || "No asignado"}</p>}
            </div>
          </div>
          {(profile.emergencia && !isEditing) && (
            <a href={`tel:${profile.emergencia}`} className="size-12 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-500/30 active:scale-90 transition-all">
              <span className="material-symbols-outlined font-fill text-xl">call</span>
            </a>
          )}
        </section>
      </main>
    </div>
  );
};

export default ProfileView;
