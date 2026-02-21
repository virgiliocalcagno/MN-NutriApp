import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { processPdfWithGemini } from '@/src/utils/ai';
import { MealItem, InventoryItem, initialStore } from '@/src/types/store';
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
  const [showClinical, setShowClinical] = useState(false);

  // Sync local state when store changes
  useEffect(() => {
    setEditData({ ...store.profile });
  }, [store.profile]);

  // Metabolic Age Calculation (Demo logic for v34.1)
  const calculateMetabolicAge = () => {
    const age = parseInt(profile.edad || '30');
    const weight = parseInt(profile.peso || '150');
    if (weight > 200) return age + 5;
    if (weight < 140) return age - 2;
    return age;
  };

  const bmi = useMemo(() => {
    const w = parseInt(profile.peso || '0') * 0.453592; // lbs to kg
    const h = parseInt(profile.estatura || '0') / 100; // cm to m
    if (w > 0 && h > 0) return (w / (h * h)).toFixed(1);
    return '--';
  }, [profile.peso, profile.estatura]);

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
            const newPatientName = (data.perfilAuto?.paciente || 'Usuario').trim();
            const currentPatientName = (store.profile?.paciente || '').trim();

            let updatedProfiles = { ...store.profiles };

            // 1. Multi-User Isolation: Save current user if it exists and is different
            if (currentPatientName && currentPatientName !== newPatientName) {
              const { profiles: _, ...rest } = store;
              updatedProfiles[currentPatientName] = rest;
            }

            // 2. Biometric Evolution: Move current biometrics to history if they exist
            const currentProfile = store.profile;
            const evolution = [...(currentProfile.evolution || [])];

            const hasClinicalData = currentProfile.peso || currentProfile.grasa;
            if (hasClinicalData && currentProfile.paciente === newPatientName) {
              evolution.push({
                date: new Date().toISOString().split('T')[0],
                weight: currentProfile.peso,
                fat: currentProfile.grasa,
                waist: currentProfile.cintura,
                cuello: currentProfile.cuello,
                brazos: currentProfile.brazos
              });
            }

            // 3. Plan Purging & Inventory Injection (Level 1 - Rojo)
            const newInventory: InventoryItem[] = (data.compras || []).map((c: any, idx: number) => ({
              id: Date.now() + '-' + idx,
              name: c[0],
              qty: c[1],
              level: 1, // Rojo / Agotado
              category: c[3] || 'Gral',
              aisle: c[4] || 'Gral',
              isCustom: false
            }));

            const caloriesTarget = data.metas?.calorias || 2000;
            const waterGoal = data.metas?.agua || 2800;

            // Load existing user data if any, or start from initialStore to PURGE old plan
            const userBasis = updatedProfiles[newPatientName] || initialStore;

            saveStore({
              ...initialStore,
              ...userBasis,
              profile: {
                ...initialStore.profile,
                ...data.perfilAuto,
                metaAgua: waterGoal,
                evolution: evolution.length > 0 ? evolution : userBasis.profile?.evolution || []
              },
              menu: data.semana || {},
              exercises: data.ejercicios || {},
              inventory: [...(userBasis.inventory || []), ...newInventory],
              schedule: data.horarios || userBasis.schedule,
              caloriesTarget,
              waterGoal,
              profiles: updatedProfiles,
              lastUpdateDate: new Date().toISOString().split('T')[0]
            });

            alert(`✅ PLAN ACTUALIZADO PARA: ${newPatientName}\n\n♻️ Plan anterior purgado.\n📈 Historial biométrico guardado.\n🛒 ${newInventory.length} suministros en lista de compras.\n🔥 Meta: ${caloriesTarget} Kcal | 💧 Agua: ${waterGoal}ml`);
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

      {/* Header Premium Bio-hacker (v34.1) */}
      <div className="bg-white px-6 pt-12 pb-10 rounded-b-[48px] shadow-sm border-b border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/5 rounded-full -ml-12 -mb-12 blur-2xl"></div>

        <div className="flex flex-col items-center text-center relative z-10">
          <div className="relative mb-6">
            <div className="size-28 rounded-[32px] bg-slate-100 flex items-center justify-center border-4 border-white shadow-2xl overflow-hidden ring-1 ring-slate-100 rotate-3 transform transition-transform hover:rotate-0 duration-500">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-5xl text-slate-300">person</span>
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 bg-[#1e60f1] text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg border-2 border-white">
              Elite
            </div>
          </div>

          <div {...longPressProps} className="space-y-1">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-2">
              {isEditing ? (
                <input
                  type="text"
                  value={editData.paciente || ''}
                  onChange={e => setEditData({ ...editData, paciente: e.target.value })}
                  className="bg-slate-50 border-none p-0 text-center focus:ring-0 rounded font-black max-w-[200px]"
                />
              ) : (profile.paciente || user?.displayName || 'Usuario')}
              {!isLocked && <span className="material-symbols-outlined text-primary text-lg">edit</span>}
            </h2>
            <p className="text-[10px] text-blue-500 font-black uppercase tracking-[0.3em] mb-2">Bio-hacker Experto</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-[10px] font-bold text-primary bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                {isEditing ? (
                  <span className="flex items-center gap-1 italic">Dr. <input value={editData.doctor || ''} onChange={e => setEditData({ ...editData, doctor: e.target.value })} className="bg-transparent border-none p-0 w-24 text-primary font-bold focus:ring-0 text-[10px]" /></span>
                ) : `Dr. ${profile.doctor || 'Dr. Health'}`}
              </p>
              <div className="size-1 bg-slate-200 rounded-full"></div>
              <p className="text-[10px] font-black text-slate-400">
                {isEditing ? (
                  <select value={editData.sexo || ''} onChange={e => setEditData({ ...editData, sexo: e.target.value })} className="bg-transparent border-none p-0 text-[10px] font-black focus:ring-0">
                    <option value="Hombre">MALE</option>
                    <option value="Mujer">FEMALE</option>
                  </select>
                ) : (profile.sexo || 'MALE').toUpperCase()}
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 w-full">
            <div className="bg-slate-50/50 p-4 rounded-[32px] border border-slate-100 flex flex-col items-center">
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Edad Metabólica</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900">{calculateMetabolicAge()}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Años</span>
              </div>
            </div>
            <div className="bg-slate-50/50 p-4 rounded-[32px] border border-slate-100 flex flex-col items-center">
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Impacto Bio-Hack</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-500">85</span>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">%</span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowLogout(!showLogout)}
          className="absolute top-10 right-6 size-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 hover:text-slate-600 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">settings</span>
        </button>

        {showLogout && (
          <div className="absolute right-6 top-20 bg-white shadow-2xl rounded-2xl border border-slate-100 p-2 w-48 z-[110] animate-in slide-in-from-top-4">
            <button onClick={logout} className="w-full text-left px-4 py-3 text-red-500 text-sm font-black hover:bg-red-50 rounded-xl flex items-center gap-3 transition-colors">
              <span className="material-symbols-outlined text-xl">logout</span>
              Cerrar Sesión
            </button>
          </div>
        )}
      </div>

      {/* Profile Control Bar */}
      <div className="px-6 -mt-8 flex gap-3 z-10 relative">
        <button
          onClick={() => isEditing ? handleSaveManual() : setIsEditing(true)}
          className={`flex-1 ${isEditing ? 'bg-emerald-500 text-white' : 'bg-white text-slate-700'} py-4 rounded-[28px] shadow-xl border border-slate-100 font-black text-xs flex items-center justify-center gap-3 active:scale-95 transition-all outline-none`}
        >
          <span className="material-symbols-outlined font-fill text-lg">{isEditing ? 'save' : 'fingerprint'}</span>
          {isEditing ? 'GUARDAR' : 'DESBLOQUEAR'}
        </button>

        <button
          onClick={() => setShowClinical(!showClinical)}
          className={`px-6 py-4 rounded-[28px] shadow-xl border border-slate-100 font-black text-xs flex items-center justify-center gap-3 active:scale-95 transition-all outline-none ${showClinical ? 'bg-blue-600 text-white' : 'bg-white text-blue-600'}`}
        >
          <span className="material-symbols-outlined font-fill text-lg">clinical_notes</span>
        </button>

        {!isLocked && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="bg-slate-900 text-white px-6 py-4 rounded-[28px] shadow-xl border border-slate-100 font-black flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined font-fill text-lg">upload_file</span>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="application/pdf" className="hidden" />
          </button>
        )}
      </div>

      {/* Medical Content */}
      <main className="px-6 py-10 space-y-10 animate-in fade-in duration-700">

        {/* Metabolic KPIs */}
        <section className={`${showClinical ? 'block' : 'hidden'} animate-in slide-in-from-top-4`}>
          <div className="flex items-center justify-between mb-6 px-1">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Métricas Clínicas</h3>
            <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-3 py-1 rounded-full uppercase">Bio-Análisis</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center">
              <div className="size-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-xl">height</span>
              </div>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Estatura</p>
              <div className="flex items-baseline gap-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.estatura || ''}
                    onChange={e => setEditData({ ...editData, estatura: e.target.value })}
                    className="text-xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-16 text-center"
                  />
                ) : <span className="text-2xl font-black text-slate-800">{profile.estatura || '--'}</span>}
                <span className="text-[10px] font-bold text-slate-300 uppercase">cm</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center">
              <div className="size-10 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-xl">monitor_weight</span>
              </div>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">BMI Index</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-800">{bmi}</span>
                <span className="text-[10px] font-bold text-slate-300 uppercase">Score</span>
              </div>
            </div>
          </div>
        </section>

        {/* Essential Info Grid */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-1 mb-2">
            <div className="size-8 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg">
              <span className="material-symbols-outlined text-sm font-fill">clinical_notes</span>
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Ficha de Usuario</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { l: 'Edad', v: profile.edad, u: 'Años', i: 'cake', c: 'blue', key: 'edad', type: 'number' },
              { l: 'Peso', v: profile.peso, u: 'Lbs', i: 'fitness_center', c: 'orange', key: 'peso', type: 'number' },
              { l: 'Cintura', v: profile.cintura, u: 'Cm', i: 'straighten', c: 'emerald', key: 'cintura' },
              { l: 'Sangre', v: profile.sangre, u: 'Tipo', i: 'bloodtype', c: 'red', key: 'sangre' }
            ].map(item => (
              <div key={item.key} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`material-symbols-outlined text-sm text-${item.c}-500`}>{item.i}</span>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{item.l}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  {isEditing ? (
                    <input
                      type={item.type || 'text'}
                      value={(editData as any)[item.key] || ''}
                      onChange={e => setEditData({ ...editData, [item.key]: e.target.value })}
                      className="text-xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-full"
                    />
                  ) : <span className="text-2xl font-black text-slate-800 uppercase">{item.v || '--'}</span>}
                  <span className="text-[10px] font-bold text-slate-300 uppercase">{item.u}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Clinical History & Observations */}
        <div className={`space-y-6 ${showClinical ? 'block' : 'hidden'} animate-in slide-in-from-bottom-4`}>
          <section className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <span className="material-symbols-outlined text-[100px]">medical_services</span>
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-blue-500 font-fill">biotech</span>
                <h4 className="font-black text-slate-900 text-[10px] uppercase tracking-[0.2em]">Contexto Metabólico</h4>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Alergias Detectadas</label>
                  {isEditing ? (
                    <input
                      value={editData.alergias || ''}
                      onChange={e => setEditData({ ...editData, alergias: e.target.value })}
                      className="w-full bg-slate-50 border-none rounded-2xl text-xs p-4 font-bold text-slate-700"
                    />
                  ) : (
                    <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                      <p className="text-xs font-bold text-slate-700 leading-relaxed">
                        {profile.alergias || "Sin alergias críticas reportadas."}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Comorbilidades</label>
                  {isEditing ? (
                    <textarea
                      value={(editData.comorbilidades || []).join(', ')}
                      onChange={e => setEditData({ ...editData, comorbilidades: e.target.value.split(',').map(s => s.trim()) })}
                      className="w-full bg-slate-50 border-none rounded-2xl text-xs p-4 font-bold text-slate-700 h-20"
                      placeholder="Diabetes, Hipertensión..."
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {profile.comorbilidades && profile.comorbilidades.length > 0 ? (
                        profile.comorbilidades.map((c, i) => (
                          <span key={i} className="text-[10px] font-black bg-slate-100 px-4 py-2 rounded-xl text-slate-600 border border-slate-100">{c}</span>
                        ))
                      ) : <p className="text-xs text-slate-400 italic px-1">Sin historial registrado.</p>}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Objetivos Bio-Hack</label>
                  <div className="flex flex-wrap gap-2">
                    {['Grasa %', 'Masa Muscular', 'Resistencia', 'Longevidad'].map(tag => (
                      <span key={tag} className="text-[9px] font-black border border-slate-200 px-3 py-1.5 rounded-full text-slate-400 uppercase tracking-tight">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Evolución Metabólica */}
          {profile.evolution && profile.evolution.length > 0 && (
            <section className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-emerald-500 font-fill">history</span>
                <h4 className="font-black text-slate-900 text-[10px] uppercase tracking-[0.2em]">Evolución Metabólica</h4>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {profile.evolution.slice().reverse().map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-3xl border border-slate-100/50 group hover:bg-white hover:shadow-sm transition-all duration-300">
                    <div>
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">{entry.date}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">{entry.weight}</span>
                        {entry.fat && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">{entry.fat} grasa</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {entry.waist && <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase">Cintura: {entry.waist}</span>}
                      {entry.cuello && <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase">Cuello: {entry.cuello}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}


          {/* Observaciones Premium */}
          <section className="bg-slate-900 p-8 rounded-[40px] text-white shadow-2xl shadow-slate-900/40 relative overflow-hidden group">
            <div className="absolute -bottom-10 -right-10 size-40 bg-white/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-amber-400 font-fill text-xl">shield_with_heart</span>
                <h4 className="font-black text-[10px] uppercase tracking-[.2em] text-white/60">Notas Médicas Limitantes</h4>
              </div>
              {isEditing ? (
                <textarea
                  value={editData.observaciones || ''}
                  onChange={e => setEditData({ ...editData, observaciones: e.target.value })}
                  className="w-full bg-white/10 border-none rounded-2xl text-xs p-4 font-bold text-white focus:ring-0 h-24"
                />
              ) : (
                <p className="text-xs leading-[1.8] italic font-medium text-white/90">
                  {profile.observaciones || "Optimizado para protocolos de alta intensidad sin restricciones detectadas."}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* SOS Card Refactored */}
        <section className="bg-red-50 p-7 rounded-[40px] border border-red-100 flex items-center justify-between group active:scale-[0.98] transition-all">
          <div className="flex items-center gap-5">
            <div className="size-14 bg-white rounded-[24px] flex items-center justify-center text-red-500 shadow-sm border border-red-100 group-hover:rotate-12 transition-transform duration-500">
              <span className="material-symbols-outlined font-fill text-2xl">health_and_safety</span>
            </div>
            <div>
              <p className="text-[9px] text-red-400 font-black uppercase tracking-widest mb-1">Emergencia 24/7</p>
              {isEditing ? (
                <input
                  value={editData.emergencia || ''}
                  onChange={e => setEditData({ ...editData, emergencia: e.target.value })}
                  className="text-lg font-black text-slate-900 bg-transparent border-none p-0 focus:ring-0 w-32"
                />
              ) : <p className="text-lg font-black text-slate-900 tracking-tight">{profile.emergencia || "Configurar Contacto"}</p>}
            </div>
          </div>
          {(profile.emergencia && !isEditing) && (
            <a href={`tel:${profile.emergencia}`} className="size-14 bg-red-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-red-600/30 active:scale-90 transition-all">
              <span className="material-symbols-outlined font-fill text-2xl">call</span>
            </a>
          )}
        </section>

        <div className="pt-6 text-center">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">MN-NutriApp Pro v34.1</p>
        </div>
      </main>
    </div>
  );
};

export default ProfileView;
