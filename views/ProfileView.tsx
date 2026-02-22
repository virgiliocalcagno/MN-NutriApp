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
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'reading' | 'analyzing' | 'syncing' | 'success' | 'error'>('idle');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastUploadData, setLastUploadData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayBarRef = useRef<HTMLDivElement>(null);

  const { profile } = store;
  const [showClinical, setShowClinical] = useState(false);

  // Sync local state when store changes
  useEffect(() => {
    setEditData({ ...store.profile });
  }, [store.profile]);

  useEffect(() => {
    if (overlayBarRef.current) {
      const w = uploadStatus === 'reading' ? '30%' : uploadStatus === 'analyzing' ? '70%' : '100%';
      overlayBarRef.current.style.setProperty('--progress-width', w);
    }
  }, [uploadStatus]);

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
      setUploadStatus('reading');
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          setUploadStatus('analyzing');
          const base64 = reader.result as string;
          const activeKey = (firebaseConfig as any).geminiApiKey;
          const data = await processPdfWithGemini(profile, base64, undefined, activeKey);

          if (data) {
            setUploadStatus('syncing');
            const newPatientName = (data.perfilAuto?.paciente || 'Usuario').trim();
            const currentPatientName = (store.profile?.paciente || '').trim();

            let updatedProfiles = { ...store.profiles };
            const isMismatch = currentPatientName && currentPatientName !== newPatientName;

            // 1. Identity Verification
            if (isMismatch) {
              const choice = window.confirm(
                `⚠️ DIFERENCIA DE IDENTIDAD DETECTADA\n\n` +
                `Documento: ${newPatientName}\n` +
                `Perfil Actual: ${currentPatientName}\n\n` +
                `¿Deseas cambiar al perfil de ${newPatientName}?`
              );
              if (choice) {
                const { profiles: _, ...rest } = store;
                updatedProfiles[currentPatientName] = rest;
              }
            }

            const currentProfile = store.profile;
            const evolution = [...(currentProfile.evolution || [])];
            const hasClinicalData = currentProfile.peso || currentProfile.grasa;
            if (hasClinicalData && (currentProfile.paciente === newPatientName || !isMismatch)) {
              evolution.push({
                date: new Date().toISOString().split('T')[0],
                weight: currentProfile.peso,
                fat: currentProfile.grasa,
                waist: currentProfile.cintura,
                cuello: currentProfile.cuello,
                brazos: currentProfile.brazos
              });
            }

            const newInventory: InventoryItem[] = (data.compras || []).map((c: any, idx: number) => ({
              id: Date.now() + '-' + idx,
              name: c[0],
              qty: c[1],
              level: 1,
              category: c[3] || 'Gral',
              aisle: c[4] || 'Gral',
              isCustom: false
            }));

            const caloriesTarget = data.metas?.calorias || 2000;
            const waterGoal = data.metas?.agua || 2800;
            const userBasis = updatedProfiles[newPatientName] || initialStore;
            const hasNewPlan = data.semana && Object.keys(data.semana).length > 0;

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
              inventory: hasNewPlan ? newInventory : [...(userBasis.inventory || []), ...newInventory],
              planIngredients: (data.compras || []).map(c => c[0]),
              doneMeals: hasNewPlan ? {} : (userBasis.doneMeals || {}),
              doneEx: hasNewPlan ? {} : (userBasis.doneEx || {}),
              schedule: data.horarios || (hasNewPlan ? null : userBasis.schedule),
              caloriesTarget,
              waterGoal,
              profiles: updatedProfiles,
              lastUpdateDate: new Date().toISOString().split('T')[0]
            });

            setLastUploadData({
              name: newPatientName,
              items: newInventory.length,
              cita: data.perfilAuto?.proximaCita
            });
            setUploadStatus('success');
            setTimeout(() => {
              setShowSuccessModal(true);
              setUploadStatus('idle');
            }, 800);
          }
        };
        reader.readAsDataURL(file);
      } catch (error: any) {
        console.error(error);
        setUploadStatus('error');
        alert(`⚠️ Error al procesar el PDF: ${error.message || error}`);
        setTimeout(() => setUploadStatus('idle'), 2000);
      } finally {
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
      {/* Custom Premium Processing Overlay */}
      {uploadStatus !== 'idle' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl" />
          <div className="relative w-full max-w-sm bg-white rounded-[48px] p-10 flex flex-col items-center text-center shadow-2xl space-y-8 animate-in zoom-in duration-500">

            <div className="relative size-32">
              <div className="absolute inset-0 border-[3px] border-slate-100 rounded-full" />
              <div
                className={`absolute inset-0 border-[3px] border-blue-600 rounded-full transition-all duration-700 ease-in-out border-b-transparent border-r-transparent ${uploadStatus === 'reading' ? 'rotate-[120deg]' : uploadStatus === 'analyzing' ? 'rotate-[240deg] animate-spin' : 'rotate-[360deg]'
                  }`}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-blue-600 animate-pulse">
                  {uploadStatus === 'reading' ? 'content_paste_search' : uploadStatus === 'analyzing' ? 'biotech' : 'sync_saved_locally'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {uploadStatus === 'reading' ? 'Leyendo PDF' : uploadStatus === 'analyzing' ? 'IA Analizando' : uploadStatus === 'syncing' ? 'Sincronizando' : 'Completado'}
              </h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.2em]">Cerebro Metabólico v3.4</p>
            </div>

            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                ref={overlayBarRef}
                className="h-full bg-blue-600 transition-all duration-1000 ease-out progress-bar-fill"
              />
            </div>

            <p className="text-sm font-medium text-slate-500 leading-relaxed px-2">
              {uploadStatus === 'reading' ? 'Extrayendo capas de información del documento clínico...' :
                uploadStatus === 'analyzing' ? 'Nuestra IA está interpretando tus nuevas metas y nutrición...' :
                  'Cargando nuevos suministros y configurando tu semana...'}
            </p>
          </div>
        </div>
      )}

      {/* Premium Success Modal */}
      {showSuccessModal && lastUploadData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowSuccessModal(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-[48px] overflow-hidden shadow-2xl animate-in zoom-in duration-500">
            <div className="bg-blue-600 p-10 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 size-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
              <div className="size-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl animate-bounce">
                <span className="material-symbols-outlined text-blue-600 text-4xl font-fill">check_circle</span>
              </div>
              <h3 className="text-white text-2xl font-black tracking-tight mb-1">¡Plan Sincronizado!</h3>
              <p className="text-blue-100 text-[10px] font-black uppercase tracking-[0.2em]">{lastUploadData.name}</p>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Suministros</p>
                  <p className="text-xl font-black text-slate-900">{lastUploadData.items}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Próxima Cita</p>
                  <p className="text-sm font-black text-slate-900 truncate">{lastUploadData.cita || 'TBD'}</p>
                </div>
              </div>

              <div className="bg-emerald-50 p-4 rounded-[24px] border border-emerald-100 flex items-center gap-4">
                <div className="size-10 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-xl">auto_renew</span>
                </div>
                <p className="text-[11px] font-bold text-emerald-800 leading-tight">
                  La despensa y el menú semanal han sido actualizados con éxito.
                </p>
              </div>

              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-[0.2em] active:scale-95 transition-all shadow-xl shadow-slate-200"
              >
                EMPEZAR AHORA
              </button>
            </div>
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
                  title="Nombre del paciente"
                  placeholder="Nombre del paciente"
                  className="bg-slate-50 border-none p-0 text-center focus:ring-0 rounded font-black max-w-[200px]"
                />
              ) : (profile.paciente || user?.displayName || 'Usuario')}
              {!isLocked && <span className="material-symbols-outlined text-primary text-lg">edit</span>}
            </h2>
            <p className="text-[10px] text-blue-500 font-black uppercase tracking-[0.3em] mb-2">Bio-hacker Experto</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-[10px] font-bold text-primary bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                {isEditing ? (
                  <span className="flex items-center gap-1 italic">Dr. <input value={editData.doctor || ''} onChange={e => setEditData({ ...editData, doctor: e.target.value })} title="Nombre del doctor" placeholder="Doctor" className="bg-transparent border-none p-0 w-24 text-primary font-bold focus:ring-0 text-[10px]" /></span>
                ) : `Dr. ${profile.doctor || 'Dr. Health'}`}
              </p>
              <div className="size-1 bg-slate-200 rounded-full"></div>
              <p className="text-[10px] font-black text-slate-400">
                {isEditing ? (
                  <select value={editData.sexo || ''} onChange={e => setEditData({ ...editData, sexo: e.target.value })} title="Sexo" className="bg-transparent border-none p-0 text-[10px] font-black focus:ring-0">
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
          <div className="relative">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              title="Subir archivo PDF"
              className="bg-slate-900 text-white px-6 py-4 rounded-[28px] shadow-xl border border-slate-100 font-black flex items-center justify-center active:scale-95 transition-all disabled:opacity-50 text-center"
            >
              <span className="material-symbols-outlined font-fill text-lg">upload_file</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="application/pdf" className="hidden" title="Archivo PDF" placeholder="Seleccionar PDF" />
          </div>
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
            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center group hover:border-blue-200 transition-all">
              <div className="size-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-xl">height</span>
              </div>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Estatura</p>
              <div className="flex items-baseline gap-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.estatura || ''}
                    onChange={e => setEditData({ ...editData, estatura: e.target.value })}
                    title="Estatura en cm"
                    placeholder="Estatura"
                    className="text-xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-16 text-center"
                  />
                ) : <span className="text-2xl font-black text-slate-800">{profile.estatura || '--'}</span>}
                <span className="text-[10px] font-bold text-slate-300 uppercase">cm</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center group hover:border-orange-200 transition-all">
              <div className="size-10 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-xl">track_changes</span>
              </div>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Peso Objetivo</p>
              <div className="flex items-baseline gap-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.pesoObjetivo || ''}
                    onChange={e => setEditData({ ...editData, pesoObjetivo: e.target.value })}
                    title="Peso objetivo en Lbs"
                    placeholder="Peso obj."
                    className="text-xl font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-16 text-center"
                  />
                ) : <span className="text-2xl font-black text-orange-600 font-fill">{profile.pesoObjetivo || '--'}</span>}
                <span className="text-[10px] font-bold text-slate-300 uppercase">Lbs</span>
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
              { l: 'Peso Actual', v: profile.peso, u: 'Lbs', i: 'monitor_weight', c: 'orange', key: 'peso', type: 'number' },
              { l: 'T. Sangre', v: profile.tipoSangre || profile.sangre, u: 'Gnd', i: 'bloodtype', c: 'red', key: 'tipoSangre' },
              { l: 'Cintura', v: profile.cintura, u: 'Cm', i: 'straighten', c: 'emerald', key: 'cintura' }
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
                      title={item.l}
                      placeholder={item.l}
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
                      title="Alergias Alimentarias"
                      placeholder="Ej. Nueces, Lactosa..."
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
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Condiciones Médicas</label>
                  <div className="flex flex-wrap gap-2">
                    {['Hipertensión', 'Diabetes', 'Tiroides', 'Colesterol'].map(cond => {
                      const isActive = (isEditing ? (editData.comorbilidades || []) : (profile.comorbilidades || [])).includes(cond);
                      return (
                        <button
                          key={cond}
                          onClick={() => {
                            if (!isEditing) return;
                            const currentList = editData.comorbilidades || [];
                            const newList = currentList.includes(cond) ? currentList.filter(c => c !== cond) : [...currentList, cond];
                            setEditData({ ...editData, comorbilidades: newList });
                          }}
                          className={`text-[9px] font-black px-4 py-2 rounded-xl transition-all border ${isActive ? 'bg-red-50 text-red-500 border-red-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}
                        >
                          {cond.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Objetivos Bio-Hack</label>
                  <div className="flex flex-wrap gap-2">
                    {['Bajar Peso', 'Masa Muscular', 'Grasa Corporal', 'Cardiovascular'].map(obj => {
                      const isActive = (isEditing ? (editData.objetivos || []) : (profile.objetivos || [])).includes(obj);
                      return (
                        <button
                          key={obj}
                          onClick={() => {
                            if (!isEditing) return;
                            const currentList = editData.objetivos || [];
                            const newList = currentList.includes(obj) ? currentList.filter(o => o !== obj) : [...currentList, obj];
                            setEditData({ ...editData, objetivos: newList });
                          }}
                          className={`text-[9px] font-black px-4 py-2 rounded-xl transition-all border ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-300 border-slate-100'}`}
                        >
                          {obj.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-col gap-4">
                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-3xl border border-slate-100/50">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-amber-500 font-fill text-lg">event</span>
                      <div>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Próxima Cita</p>
                        {isEditing ? (
                          <input
                            value={editData.proximaCita || ''}
                            onChange={e => setEditData({ ...editData, proximaCita: e.target.value })}
                            className="bg-transparent border-none p-0 text-xs font-bold text-slate-700 focus:ring-0"
                            placeholder="DD/MM/YYYY"
                          />
                        ) : (
                          <p className="text-xs font-bold text-slate-700">{profile.proximaCita || "Por programar"}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Suplementación Activa</label>
                    {isEditing ? (
                      <textarea
                        value={(editData.suplementos || []).join(', ')}
                        onChange={e => setEditData({ ...editData, suplementos: e.target.value.split(',').map(s => s.trim()) })}
                        className="w-full bg-slate-50 border-none rounded-2xl text-xs p-4 font-bold text-slate-700 h-20"
                        placeholder="Omega 3, Creatina..."
                      />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {profile.suplementos && profile.suplementos.length > 0 ? (
                          profile.suplementos.map((s, i) => (
                            <span key={i} className="text-[10px] font-bold bg-amber-50 px-4 py-2 rounded-xl text-amber-700 border border-amber-100">{s}</span>
                          ))
                        ) : <p className="text-xs text-slate-400 italic px-1">Sin suplementos registrados.</p>}
                      </div>
                    )}
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
                  title="Observaciones Médicas"
                  placeholder="Detalles clínicos relevantes..."
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
                  title="Contacto de emergencia"
                  placeholder="Teléfono"
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
