import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { processPdfWithGemini } from '@/src/utils/ai';
import { MealItem, InventoryItem, initialStore, Profile, DocumentRecord } from '@/src/types/store';
import { firebaseConfig } from '@/src/firebase';
import { useLongPress } from '@/src/hooks/useLongPress';

const ProfileView: React.FC<{ setView?: (v: any) => void }> = ({ setView }) => {
  const { store, user, saveStore, logout } = useStore();
  const [showLogout, setShowLogout] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Profile>({ ...store.profile });
  const [isLocked, setIsLocked] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'reading' | 'analyzing' | 'syncing' | 'success' | 'error'>('idle');
  const [uploadContext, setUploadContext] = useState<'FICHA_MEDICA' | 'PLAN_NUTRICIONAL' | 'INBODY'>('PLAN_NUTRICIONAL');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastUploadData, setLastUploadData] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { profile } = store;
  const [showClinical, setShowClinical] = useState(false);

  // Sync local state when store changes
  useEffect(() => {
    setEditData({ ...store.profile });
  }, [store.profile]);

  // Metabolic Age Calculation (Safe version)
  const calculateMetabolicAge = () => {
    const ageVal = profile.perfil_biometrico?.edad;
    const weightVal = profile.analisis_inbody_actual?.peso_actual_kg;

    if (!ageVal || !weightVal) return '--';

    const age = parseInt(ageVal);
    const weight = parseFloat(weightVal);

    if (isNaN(age) || isNaN(weight)) return '--';

    // Demo logic: age +/- based on weight relative to average
    if (weight > 90) return age + 5;
    if (weight < 65) return age - 2;
    return age;
  };

  const bmi = useMemo(() => {
    const w = parseInt(profile.analisis_inbody_actual?.peso_actual_kg || '0');
    const h = parseInt(profile.perfil_biometrico?.estatura_cm || '0') / 100; // cm to m
    if (w > 0 && h > 0) return (w / (h * h)).toFixed(1);
    return '--';
  }, [profile.analisis_inbody_actual?.peso_actual_kg, profile.perfil_biometrico?.estatura_cm]);

  const onLongPress = () => {
    setIsLocked(!isLocked);
    if (window.navigator?.vibrate) window.navigator.vibrate(50);
  };

  const longPressProps = useLongPress(onLongPress, undefined, { delay: 800 });

  const patchValue = (existing: any, incoming: any) => {
    if (incoming === null || incoming === undefined || incoming === '') return existing;
    return incoming;
  };

  const mergeLists = (old: any[] = [], next: any[] = []) => {
    const combined = [...(Array.isArray(old) ? old : []), ...(Array.isArray(next) ? next : [])]
      .map(s => String(s || '').trim().toLowerCase())
      .filter(Boolean);
    const unique = Array.from(new Set(combined));
    return unique.map(s => s.charAt(0).toUpperCase() + s.slice(1));
  };

  const resetActiveProfile = () => {
    if (!window.confirm("⚠️ ¿ESTÁS SEGURO?\n\nEsto borrará el Plan Nutricional, Inventario y Datos Biométricos del perfil ACTIVO.\n\nTu Biblioteca de Documentos se mantendrá intacta.")) return;

    saveStore({
      ...store,
      profile: {
        ...initialStore.profile,
        perfil_biometrico: { nombre_completo: profile.perfil_biometrico?.nombre_completo } // Keep name
      },
      menu: {},
      inventory: [],
      planIngredients: [],
      doneEx: {},
      doneMeals: {},
      caloriesTarget: 2000,
      water: 0
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, context: 'FICHA_MEDICA' | 'PLAN_NUTRICIONAL' | 'INBODY') => {
    if (isLocked) {
      alert("El perfil está bloqueado. Mantén presionado el nombre para desbloquear.");
      return;
    }
    setUploadContext(context);
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
      if (files.length === 0) {
        alert('Por favor selecciona archivos PDF.');
        return;
      }
      setSelectedFiles(prev => [...prev, ...files].slice(0, 3));
    }
  };

  const applyDocumentData = (data: any, activateNow: boolean = true) => {
    const currentProfile = store.profile;
    const hasNewPlan = data.semana && Object.keys(data.semana).length > 0;

    // 1. Prepare Merged Profile
    const mergedProfile = {
      ...currentProfile,
      perfil_biometrico: {
        nombre_completo: patchValue(currentProfile.perfil_biometrico?.nombre_completo, data.perfilAuto?.perfil_biometrico?.nombre_completo),
        edad: patchValue(currentProfile.perfil_biometrico?.edad, data.perfilAuto?.perfil_biometrico?.edad),
        estatura_cm: patchValue(currentProfile.perfil_biometrico?.estatura_cm, data.perfilAuto?.perfil_biometrico?.estatura_cm),
        genero: patchValue(currentProfile.perfil_biometrico?.genero, data.perfilAuto?.perfil_biometrico?.genero),
        doctor: patchValue(currentProfile.perfil_biometrico?.doctor, data.perfilAuto?.perfil_biometrico?.doctor)
      },
      diagnostico_clinico: {
        diagnostico_nutricional: patchValue(currentProfile.diagnostico_clinico?.diagnostico_nutricional, data.perfilAuto?.diagnostico_clinico?.diagnostico_nutricional),
        alergias: mergeLists(currentProfile.diagnostico_clinico?.alergias || [], data.perfilAuto?.diagnostico_clinico?.alergias || []),
        sangre: patchValue(currentProfile.diagnostico_clinico?.sangre, data.perfilAuto?.diagnostico_clinico?.sangre),
        comorbilidades: mergeLists(currentProfile.diagnostico_clinico?.comorbilidades || [], data.perfilAuto?.diagnostico_clinico?.comorbilidades || []),
        medicamentos_actuales: mergeLists(currentProfile.diagnostico_clinico?.medicamentos_actuales || [], data.perfilAuto?.diagnostico_clinico?.medicamentos_actuales || []),
        suplementacion: mergeLists(Array.isArray(currentProfile.diagnostico_clinico?.suplementacion) ? currentProfile.diagnostico_clinico.suplementacion : [], Array.isArray(data.perfilAuto?.diagnostico_clinico?.suplementacion) ? data.perfilAuto.diagnostico_clinico.suplementacion : []),
        observaciones_medicas: mergeLists(currentProfile.diagnostico_clinico?.observaciones_medicas || [], data.perfilAuto?.diagnostico_clinico?.observaciones_medicas || [])
      },
      metas_y_objetivos: {
        peso_ideal_meta: patchValue(currentProfile.metas_y_objetivos?.peso_ideal_meta, data.perfilAuto?.metas_y_objetivos?.peso_ideal_meta),
        control_peso_inmediato: patchValue(currentProfile.metas_y_objetivos?.control_peso_inmediato, data.perfilAuto?.metas_y_objetivos?.control_peso_inmediato),
        control_grasa_kg: patchValue(currentProfile.metas_y_objetivos?.control_grasa_kg, data.perfilAuto?.metas_y_objetivos?.control_grasa_kg),
        control_musculo_kg: patchValue(currentProfile.metas_y_objetivos?.control_musculo_kg, data.perfilAuto?.metas_y_objetivos?.control_musculo_kg),
        pbf_objetivo_porcentaje: patchValue(currentProfile.metas_y_objetivos?.pbf_objetivo_porcentaje, data.perfilAuto?.metas_y_objetivos?.pbf_objetivo_porcentaje),
        vet_kcal_diarias: patchValue(currentProfile.metas_y_objetivos?.vet_kcal_diarias, data.perfilAuto?.metas_y_objetivos?.vet_kcal_diarias),
        agua_objetivo_ml: patchValue(currentProfile.metas_y_objetivos?.agua_objetivo_ml, data.perfilAuto?.metas_y_objetivos?.agua_objetivo_ml),
        objetivos_generales: mergeLists(currentProfile.metas_y_objetivos?.objetivos_generales || [], data.perfilAuto?.metas_y_objetivos?.objetivos_generales || [])
      },
      analisis_inbody_actual: {
        fecha_test: patchValue(currentProfile.analisis_inbody_actual?.fecha_test, data.perfilAuto?.analisis_inbody_actual?.fecha_test),
        peso_actual_kg: patchValue(currentProfile.analisis_inbody_actual?.peso_actual_kg, data.perfilAuto?.analisis_inbody_actual?.peso_actual_kg),
        smm_masa_musculo_esqueletica_kg: patchValue(currentProfile.analisis_inbody_actual?.smm_masa_musculo_esqueletica_kg, data.perfilAuto?.analisis_inbody_actual?.smm_masa_musculo_esqueletica_kg),
        pbf_porcentaje_grasa_corporal: patchValue(currentProfile.analisis_inbody_actual?.pbf_porcentaje_grasa_corporal, data.perfilAuto?.analisis_inbody_actual?.pbf_porcentaje_grasa_corporal),
        grasa_visceral_nivel: patchValue(currentProfile.analisis_inbody_actual?.grasa_visceral_nivel, data.perfilAuto?.analisis_inbody_actual?.grasa_visceral_nivel),
        inbody_score: patchValue(currentProfile.analisis_inbody_actual?.inbody_score, data.perfilAuto?.analisis_inbody_actual?.inbody_score),
        tasa_metabolica_basal_kcal: patchValue(currentProfile.analisis_inbody_actual?.tasa_metabolica_basal_kcal, data.perfilAuto?.analisis_inbody_actual?.tasa_metabolica_basal_kcal)
      },
      prescripcion_ejercicio: {
        fcm_latidos_min: patchValue(currentProfile.prescripcion_ejercicio?.fcm_latidos_min, data.perfilAuto?.prescripcion_ejercicio?.fcm_latidos_min),
        fc_promedio_entrenamiento: patchValue(currentProfile.prescripcion_ejercicio?.fc_promedio_entrenamiento, data.perfilAuto?.prescripcion_ejercicio?.fc_promedio_entrenamiento),
        fuerza_dias_semana: patchValue(currentProfile.prescripcion_ejercicio?.fuerza_dias_semana, data.perfilAuto?.prescripcion_ejercicio?.fuerza_dias_semana),
        fuerza_minutos_sesion: patchValue(currentProfile.prescripcion_ejercicio?.fuerza_minutos_sesion, data.perfilAuto?.prescripcion_ejercicio?.fuerza_minutos_sesion),
        aerobico_dias_semana: patchValue(currentProfile.prescripcion_ejercicio?.aerobico_dias_semana, data.perfilAuto?.prescripcion_ejercicio?.aerobico_dias_semana),
        aerobico_minutos_sesion: patchValue(currentProfile.prescripcion_ejercicio?.aerobico_minutos_sesion, data.perfilAuto?.prescripcion_ejercicio?.aerobico_minutos_sesion)
      }
    };

    if (!activateNow) return mergedProfile;

    // 2. Prepare Inventory & Menu
    const newInventory: any[] = hasNewPlan ? (data.compras || []).map((c: any, idx: number) => ({
      id: Date.now() + '-' + idx,
      name: c[0],
      qty: c[1],
      level: 1,
      category: c[3] || 'Gral',
      aisle: c[4] || 'Gral',
      isCustom: false
    })) : [];

    // Reset if it's a new main plan
    const finalInventory = hasNewPlan ? newInventory : store.inventory;
    const finalMenu = hasNewPlan ? data.semana : store.menu;
    const finalIngredients = hasNewPlan ? (data.compras || []).map((c: any) => ({ n: c[0], q: c[1] })) : store.planIngredients;

    saveStore({
      ...store,
      profile: mergedProfile as Profile,
      inventory: finalInventory,
      menu: finalMenu,
      planIngredients: finalIngredients,
      doneMeals: hasNewPlan ? {} : store.doneMeals,
      caloriesTarget: data.perfilAuto?.metas_y_objetivos?.vet_kcal_diarias || store.caloriesTarget,
      waterGoal: data.perfilAuto?.metas_y_objetivos?.agua_objetivo_ml || store.waterGoal,
      lastUpdateDate: new Date().toISOString().split('T')[0]
    });
  };

  const processBatch = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    setUploadStatus('reading');
    try {
      const newDocs: DocumentRecord[] = [];
      let lastResult: any = null;

      for (const file of selectedFiles) {
        setUploadStatus('analyzing');
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const activeKey = (firebaseConfig as any).geminiApiKey;
        const data = await processPdfWithGemini(store.profile, base64, undefined, activeKey, uploadContext);

        if (data) {
          const doc: DocumentRecord = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            name: file.name,
            type: (data.tipo_documento || uploadContext || 'AUTO') as any,
            date: new Date().toISOString(),
            data: data
          };
          newDocs.push(doc);
          lastResult = data;
        }
      }

      if (newDocs.length > 0) {
        setUploadStatus('syncing');

        // Ask for Activation
        const shouldActivate = window.confirm(`✅ ${newDocs.length} documentos procesados.\n\n¿Deseas ACTIVAR el contenido ahora? (Esto actualizará tu plan/expediente actual)`);

        if (shouldActivate) {
          // Merge logic: if multiple files, we apply them one by one (accumulative for this batch)
          // or just use the helper for the last one if it's a single one. 
          // For simplicity and correctness with the requirement:
          for (const doc of newDocs) {
            applyDocumentData(doc.data, true);
          }
        }

        saveStore({
          ...store,
          processedDocs: [...(store.processedDocs || []), ...newDocs]
        });

        setLastUploadData({
          name: newDocs[0].name,
          items: 0,
          cita: new Date().toLocaleDateString()
        });

        setUploadStatus('success');
        setTimeout(() => {
          setShowSuccessModal(true);
          setUploadStatus('idle');
          setSelectedFiles([]);
        }, 800);
      }
    } catch (error: any) {
      console.error(error);
      setUploadStatus('error');
      alert(`⚠️ Error al procesar: ${error.message || error}`);
      setTimeout(() => setUploadStatus('idle'), 2000);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveManual = () => {
    saveStore({ ...store, profile: editData });
    setIsEditing(false);
  };


  return (
    <div className="flex flex-col bg-[#f4f5f7] min-h-screen pb-24">
      {uploadStatus !== 'idle' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-lg" />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl space-y-5">
            <div className="size-16 rounded-full bg-blue-50 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-blue-600 animate-pulse">{uploadStatus === 'reading' ? 'document_scanner' : uploadStatus === 'analyzing' ? 'psychology' : 'cloud_done'}</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">{uploadStatus === 'reading' ? 'Leyendo PDF...' : uploadStatus === 'analyzing' ? 'IA Analizando...' : uploadStatus === 'syncing' ? 'Guardando...' : 'Listo'}</h3>
            <p className="text-sm text-gray-400">{uploadStatus === 'reading' ? 'Extrayendo información' : uploadStatus === 'analyzing' ? 'Procesando datos clínicos' : 'Sincronizando expediente'}</p>
          </div>
        </div>
      )}

      {showSuccessModal && lastUploadData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => setShowSuccessModal(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-center">
              <span className="material-symbols-outlined text-white text-4xl font-fill mb-3 block">check_circle</span>
              <h3 className="text-white text-xl font-bold">Análisis Completado</h3>
              <p className="text-blue-200 text-xs mt-1">{lastUploadData.name}</p>
            </div>
            <div className="p-5 space-y-2.5">
              <button onClick={() => { setShowSuccessModal(false); fileInputRef.current?.click(); }} className="w-full bg-gray-900 text-white py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-all">Escanear otro PDF</button>
              <button onClick={() => { if (window.confirm("¿Reiniciar datos?")) saveStore(JSON.parse(JSON.stringify(initialStore))); setShowSuccessModal(false); }} className="w-full border border-gray-200 text-gray-500 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-all">Nuevo usuario</button>
              <button onClick={() => setShowSuccessModal(false)} className="w-full py-2 text-xs text-gray-400">Ver expediente</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HEADER ═══ */}
      <div className="bg-gradient-to-br from-gray-800 via-gray-900 to-black px-6 pt-14 pb-16 relative">
        <button onClick={() => setShowLogout(!showLogout)} className="absolute top-12 right-5 size-9 rounded-full bg-white/10 flex items-center justify-center text-white/50">
          <span className="material-symbols-outlined text-lg">settings</span>
        </button>
        {showLogout && (
          <div className="absolute right-5 top-[4.5rem] bg-white shadow-2xl rounded-xl p-1 w-44 z-[110]">
            <button onClick={logout} className="w-full text-left px-3 py-2.5 text-red-500 text-sm font-medium hover:bg-red-50 rounded-lg flex items-center gap-2"><span className="material-symbols-outlined text-lg">logout</span>Cerrar Sesión</button>
          </div>
        )}
        <div className="flex flex-col items-center text-center mt-2">
          <div {...longPressProps} className="mb-4">
            <div className="size-20 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20 overflow-hidden">
              {user?.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : <span className="material-symbols-outlined text-3xl text-white/40">person</span>}
            </div>
          </div>
          {isEditing ? (
            <input type="text" value={editData.perfil_biometrico?.nombre_completo || ''} onChange={e => setEditData({ ...editData, perfil_biometrico: { ...editData.perfil_biometrico, nombre_completo: e.target.value } })} title="Nombre" className="bg-white/10 border-none text-center text-white rounded-lg px-3 py-1 text-xl font-bold focus:ring-0" />
          ) : <h2 className="text-xl font-bold text-white">{profile.perfil_biometrico?.nombre_completo || user?.displayName || 'Usuario'}</h2>}
          <p className="text-xs text-white/30 mt-1">
            {isEditing ? (
              <span className="flex items-center gap-1">Dr. <input value={editData.perfil_biometrico?.doctor || ''} onChange={e => setEditData({ ...editData, perfil_biometrico: { ...editData.perfil_biometrico, doctor: e.target.value } })} title="Doctor" className="bg-white/10 border-none text-white/60 rounded px-2 py-0.5 w-28 text-xs focus:ring-0" /></span>
            ) : `Dr. ${profile.perfil_biometrico?.doctor || '—'} · ${profile.perfil_biometrico?.genero || '—'}`}
          </p>
          <div className="flex justify-center gap-8 mt-6">
            {[
              { label: 'Edad', value: profile.perfil_biometrico?.edad || '--' },
              { label: 'Peso', value: `${profile.analisis_inbody_actual?.peso_actual_kg || '--'} kg` },
              { label: 'Estatura', value: `${profile.perfil_biometrico?.estatura_cm || '--'} cm` },
              { label: 'IMC', value: bmi },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-white/25 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ PANEL DE CONFIGURACIÓN (REVELADO POR LONG PRESS) ═══ */}
      {!isLocked && (
        <div className="px-5 -mt-5 space-y-3 relative z-10 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-white rounded-3xl p-5 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Panel de Configuración</p>
              <span className="text-[9px] bg-red-50 text-red-500 px-2.5 py-1 rounded-full font-black uppercase tracking-tighter shadow-sm border border-red-100">Modo Admin Desbloqueado</span>
            </div>

            <div className="flex gap-2 mb-5">
              <button
                onClick={() => isEditing ? handleSaveManual() : setIsEditing(true)}
                className={`flex-1 py-4 rounded-2xl font-black text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg ${isEditing ? 'bg-emerald-500 text-white shadow-emerald-200/50' : 'bg-white text-gray-800 border-2 border-gray-100'}`}
              >
                <span className="material-symbols-outlined text-lg font-fill">{isEditing ? 'save' : 'edit_square'}</span>
                {isEditing ? 'GUARDAR CAMBIOS' : 'EDITAR PERFIL MANUAL'}
              </button>
              <button
                onClick={resetActiveProfile}
                className="px-5 py-4 rounded-2xl font-black text-xs flex items-center justify-center active:scale-95 transition-all shadow-lg bg-red-50 text-red-600 border-2 border-red-100"
              >
                <span className="material-symbols-outlined text-xl font-fill">restart_alt</span>
              </button>
            </div>

            <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em] mb-3 text-center">Carga Modular de Documentos (PDF)</p>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: 'FICHA_MEDICA', label: 'MÉDICA', icon: 'medical_services', color: 'bg-amber-500' },
                { id: 'PLAN_NUTRICIONAL', label: 'PLAN NUTRI', icon: 'restaurant_menu', color: 'bg-blue-600' },
                { id: 'INBODY', label: 'INBODY', icon: 'leaderboard', color: 'bg-gray-900' }
              ].map(btn => (
                <button
                  key={btn.id}
                  onClick={() => {
                    setUploadContext(btn.id as any);
                    fileInputRef.current?.click();
                  }}
                  disabled={isProcessing}
                  className={`${btn.color} text-white p-3.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-xl active:scale-90 transition-all disabled:opacity-50 group border border-white/10`}
                >
                  <span className="material-symbols-outlined text-xl font-fill group-hover:scale-110 transition-transform">{btn.icon}</span>
                  <span className="text-[8px] font-black tracking-widest">{btn.label}</span>
                </button>
              ))}
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFileSelect(e, uploadContext)}
                accept="application/pdf"
                className="hidden"
                title="Upload PDF"
              />
            </div>

            {/* Cola de archivos integrada */}
            {selectedFiles.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-50 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{selectedFiles.length} Archivos en Cola</p>
                  <button onClick={() => setSelectedFiles([])} className="text-[10px] text-red-500 font-bold hover:underline">Limpiar todo</button>
                </div>
                <div className="grid grid-cols-1 gap-1.5 mb-4">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="bg-gray-50 text-gray-600 text-[10px] font-bold px-3 py-2 rounded-xl flex items-center justify-between border border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-blue-400">picture_as_pdf</span>
                        <span className="truncate max-w-[180px]">{file.name}</span>
                      </div>
                      <button onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={processBatch}
                  disabled={isProcessing}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl text-[11px] font-black uppercase active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-emerald-100 shadow-2xl"
                >
                  <span className="material-symbols-outlined text-lg">bolt</span>
                  {uploadStatus === 'analyzing' ? 'ANALIZANDO GENIUS IA...' : 'INICIAR PROCESAMIENTO'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CONTENT ═══ */}
      <main className="px-5 pt-6 pb-4 space-y-4">

        {/* Datos Generales */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 mb-4 uppercase tracking-wider">Datos Generales</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {[
              { l: 'Edad', v: profile.perfil_biometrico?.edad, u: 'años', k: 'edad', p: 'perfil_biometrico' },
              { l: 'Estatura', v: profile.perfil_biometrico?.estatura_cm, u: 'cm', k: 'estatura_cm', p: 'perfil_biometrico' },
              { l: 'Género', v: profile.perfil_biometrico?.genero, u: '', k: 'genero', p: 'perfil_biometrico' },
              { l: 'Doctor', v: profile.perfil_biometrico?.doctor, u: '', k: 'doctor', p: 'perfil_biometrico' },
            ].map(item => (
              <div key={item.k}>
                <p className="text-[10px] text-gray-400 mb-0.5">{item.l}</p>
                {isEditing ? (
                  <input type="text" value={(editData as any)[item.p]?.[item.k] || ''} onChange={e => setEditData({ ...editData, [item.p]: { ...(editData as any)[item.p], [item.k]: e.target.value } })} title={item.l} className="text-sm font-bold text-gray-800 bg-gray-50 rounded-lg border-none p-1 w-full focus:ring-1 focus:ring-blue-200" />
                ) : <p className="text-sm font-bold text-gray-800">{item.v || '—'} <span className="text-xs text-gray-300">{item.u}</span></p>}
              </div>
            ))}
          </div>
        </div>

        {/* Metas del Plan */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 mb-4 uppercase tracking-wider">Metas del Plan</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {[
              { l: 'Peso Ideal', v: profile.metas_y_objetivos?.peso_ideal_meta, u: 'kg', k: 'peso_ideal_meta', p: 'metas_y_objetivos' },
              { l: 'Control Grasa', v: profile.metas_y_objetivos?.control_grasa_kg, u: 'kg', k: 'control_grasa_kg', p: 'metas_y_objetivos' },
              { l: 'VET', v: profile.metas_y_objetivos?.vet_kcal_diarias, u: 'kcal', k: 'vet_kcal_diarias', p: 'metas_y_objetivos' },
              { l: 'Agua', v: profile.metas_y_objetivos?.agua_objetivo_ml, u: 'ml', k: 'agua_objetivo_ml', p: 'metas_y_objetivos' },
            ].map(item => (
              <div key={item.k}>
                <p className="text-[10px] text-gray-400 mb-0.5">{item.l}</p>
                {isEditing ? (
                  <input type="text" value={(editData as any)[item.p]?.[item.k] || ''} onChange={e => setEditData({ ...editData, [item.p]: { ...(editData as any)[item.p], [item.k]: e.target.value } })} title={item.l} className="text-sm font-bold text-gray-800 bg-gray-50 rounded-lg border-none p-1 w-full focus:ring-1 focus:ring-blue-200" />
                ) : <p className="text-sm font-bold text-gray-800">{item.v || '—'} <span className="text-xs text-gray-300">{item.u}</span></p>}
              </div>
            ))}
          </div>

          {/* Objetivos Generales Restaurados */}
          {(isEditing ? (editData.metas_y_objetivos?.objetivos_generales || []) : (profile.metas_y_objetivos?.objetivos_generales || [])).length > 0 && (
            <div className="mt-6 pt-5 border-t border-gray-50">
              <p className="text-[10px] text-gray-400 mb-3 uppercase tracking-wider font-bold">Objetivos Generales</p>
              <div className="flex flex-wrap gap-2">
                {(isEditing ? (editData.metas_y_objetivos?.objetivos_generales || []) : (profile.metas_y_objetivos?.objetivos_generales || [])).map((obj, i) => (
                  <span key={i} className="bg-blue-50 text-blue-600 text-[10px] font-black px-3 py-1.5 rounded-xl border border-blue-100/50 uppercase tracking-tight">
                    {obj}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Historial Clínico y Comorbilidades - Siempre visibles si existen */}
        {((profile.diagnostico_clinico?.comorbilidades || []).length > 0 || showClinical) && (
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4 border-l-4 border-amber-400">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Expediente Clínico Digital</p>
              <span className="material-symbols-outlined text-amber-500 text-lg font-fill">verified_user</span>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-1 font-bold">Diagnóstico Nutricional</p>
              <textarea value={isEditing ? (editData.diagnostico_clinico?.diagnostico_nutricional || '') : (profile.diagnostico_clinico?.diagnostico_nutricional || 'Sin diagnóstico registrado.')} onChange={e => isEditing && setEditData({ ...editData, diagnostico_clinico: { ...editData.diagnostico_clinico, diagnostico_nutricional: e.target.value } })} readOnly={!isEditing} title="Diagnóstico" className="w-full bg-gray-50 border-none rounded-xl text-sm p-3 text-gray-700 h-16 resize-none focus:ring-1 focus:ring-blue-200 font-medium italic" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-2 font-bold uppercase tracking-tighter">Comorbilidades Críticas</p>
              <div className="flex flex-wrap gap-1.5">
                {(isEditing ? (editData.diagnostico_clinico?.comorbilidades || []) : (profile.diagnostico_clinico?.comorbilidades || [])).map((c, i) => (
                  <span key={i} className="bg-red-50 text-red-500 text-[10px] font-black px-3 py-1.5 rounded-xl border border-red-100/50 uppercase tracking-tighter shadow-sm">{c}</span>
                ))}
                {(isEditing ? (editData.diagnostico_clinico?.comorbilidades || []) : (profile.diagnostico_clinico?.comorbilidades || [])).length === 0 && <span className="text-[11px] text-gray-300">Ninguna detectada</span>}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-1 font-bold">Alergias Alimentarias</p>
              <p className="text-sm text-gray-700 font-bold">{(profile.diagnostico_clinico?.alergias || []).join(', ') || 'Ninguna'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-100/50">
                <p className="text-[9px] font-black text-amber-600 mb-1 uppercase tracking-widest">Medicamentos</p>
                <p className="text-[11px] text-gray-600 font-bold">{profile.diagnostico_clinico?.medicamentos_actuales?.join(', ') || 'Sin medicación'}</p>
              </div>
              <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100/50">
                <p className="text-[9px] font-black text-emerald-600 mb-1 uppercase tracking-widest">Suplementos</p>
                <p className="text-[11px] text-gray-600 font-bold">{Array.isArray(profile.diagnostico_clinico?.suplementacion) ? profile.diagnostico_clinico.suplementacion.join(', ') : (profile.diagnostico_clinico?.suplementacion || 'Sin suplementación')}</p>
              </div>
            </div>
          </div>
        )}

        {/* InBody Section - High Contrast Professional Design */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header estilo InBody Real */}
          <div className="bg-red-700 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-white text-xl">analytics</span>
              <p className="text-sm font-black text-white uppercase tracking-widest">InBody Report</p>
            </div>
            <div className="bg-white/20 px-3 py-1 rounded-lg">
              <p className="text-[10px] text-white/80 font-bold uppercase tracking-tighter">Último Test: {profile.analisis_inbody_actual?.fecha_test || 'Pendiente'}</p>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-50">
              <div className="space-y-1">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.1em]">Composición General</p>
                <h3 className="text-2xl font-black text-gray-900">Análisis Corporal</h3>
              </div>
              <div className="size-16 rounded-2xl bg-red-50 border-2 border-red-100 flex flex-col items-center justify-center shadow-sm">
                <p className="text-[9px] text-red-600 font-black uppercase leading-none">Score</p>
                <p className="text-2xl font-black text-red-700 leading-none mt-1">{profile.analisis_inbody_actual?.inbody_score || '0'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-10 gap-y-8">
              {[
                { l: 'Peso Actual', v: profile.analisis_inbody_actual?.peso_actual_kg, u: 'kg', k: 'peso_actual_kg', color: 'text-gray-900', bg: 'bg-gray-50' },
                { l: 'Masa Músculo', v: profile.analisis_inbody_actual?.smm_masa_musculo_esqueletica_kg, u: 'kg', k: 'smm_masa_musculo_esqueletica_kg', color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { l: 'Grasa Corporal', v: profile.analisis_inbody_actual?.pbf_porcentaje_grasa_corporal, u: '%', k: 'pbf_porcentaje_grasa_corporal', color: 'text-amber-600', bg: 'bg-amber-50' },
                { l: 'Tasa Metabólica', v: profile.analisis_inbody_actual?.tasa_metabolica_basal_kcal, u: 'kcal', k: 'tasa_metabolica_basal_kcal', color: 'text-blue-600', bg: 'bg-blue-50' },
              ].map(f => (
                <div key={f.k} className="relative">
                  <p className="text-[10px] text-gray-400 mb-1 font-black uppercase tracking-wider">{f.l}</p>
                  {isEditing ? (
                    <input value={(editData.analisis_inbody_actual as any)?.[f.k] || ''} onChange={e => setEditData({ ...editData, analisis_inbody_actual: { ...editData.analisis_inbody_actual, [f.k]: e.target.value } })} title={f.l} className="bg-gray-50 border-2 border-transparent focus:border-red-500 rounded-xl text-lg font-black text-gray-900 w-full p-2 outline-none transition-all" />
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-black ${f.color}`}>{f.v || '--'}</span>
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-tighter">{f.u}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-10 pt-8 border-t border-gray-50 space-y-6">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Nivel de Grasa Visceral</p>
                  <span className="text-sm font-black text-red-600">Nivel {profile.analisis_inbody_actual?.grasa_visceral_nivel || '0'}</span>
                </div>
                <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex p-0.5 border border-gray-200 shadow-inner">
                  <div className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-600 rounded-full transition-all duration-700" style={{ width: `${Math.min((parseInt(profile.analisis_inbody_actual?.grasa_visceral_nivel || '0') / 20) * 100, 100)}%` }} />
                </div>
                <div className="flex justify-between mt-1 px-1">
                  <span className="text-[8px] text-gray-300 font-bold uppercase">Bajo</span>
                  <span className="text-[8px] text-gray-300 font-bold uppercase">Óptimo</span>
                  <span className="text-[8px] text-red-300 font-bold uppercase">Crítico</span>
                </div>
              </div>

              <div className="flex items-center gap-4 bg-gray-900 rounded-2xl p-4 shadow-lg border-l-4 border-red-500">
                <div className="size-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-xl">flag</span>
                </div>
                <div>
                  <p className="text-[9px] text-white/40 font-black uppercase mb-0.5">Control de Peso Sugerido</p>
                  <p className="text-lg font-black text-white">{profile.metas_y_objetivos?.control_peso_inmediato || '0.0 kg'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ejercicio */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 mb-4 uppercase tracking-wider">Prescripción de Ejercicio</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50/50 p-3 rounded-xl">
              <p className="text-[10px] font-bold text-blue-500 mb-1">Fuerza</p>
              <p className="text-sm font-bold text-gray-800">{profile.prescripcion_ejercicio?.fuerza_dias_semana || '—'} días/sem</p>
              <p className="text-xs text-gray-400">{profile.prescripcion_ejercicio?.fuerza_minutos_sesion || '—'} min</p>
            </div>
            <div className="bg-green-50/50 p-3 rounded-xl">
              <p className="text-[10px] font-bold text-green-500 mb-1">Aeróbico</p>
              <p className="text-sm font-bold text-gray-800">{profile.prescripcion_ejercicio?.aerobico_dias_semana || '—'} días/sem</p>
              <p className="text-xs text-gray-400">{profile.prescripcion_ejercicio?.aerobico_minutos_sesion || '—'} min</p>
            </div>
          </div>
          <div className="flex justify-between mt-3 pt-3 border-t border-gray-100">
            <div>
              <p className="text-[10px] text-gray-400">FCM</p>
              <p className="text-sm font-bold text-red-500">{profile.prescripcion_ejercicio?.fcm_latidos_min || '—'} LPM</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400">Quemagrasa</p>
              <p className="text-sm font-bold text-blue-500">{profile.prescripcion_ejercicio?.fc_promedio_entrenamiento || '—'} LPM</p>
            </div>
          </div>
        </div>

        {/* Evolución */}
        {profile.historico_antropometrico && profile.historico_antropometrico.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">Evolución</p>
            <div className="space-y-1">
              {profile.historico_antropometrico.slice().reverse().map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 px-1 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-gray-400 w-14">{entry.fecha?.split('-').slice(1).join('/')}</span>
                    <span className="text-sm font-bold text-gray-800">{entry.peso_lbs} lbs</span>
                  </div>
                  <span className="text-xs text-gray-400">Cintura: {entry.cintura_cm || '—'} cm</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Biblioteca de Expedientes - PROTEGIDO TRAS DESBLOQUEO */}
        {!isLocked && (
          <div className="bg-white rounded-2xl p-6 shadow-sm animate-in fade-in duration-700">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Biblioteca de Expedientes</p>
              {(store.processedDocs || []).length > 0 && (
                <button
                  onClick={() => { if (window.confirm("⚠️ ¿Estás seguro de reiniciar el historial de documentos?")) saveStore({ ...store, processedDocs: [] }); }}
                  className="text-[10px] font-bold text-red-400"
                >
                  Vaciar Biblioteca
                </button>
              )}
            </div>

            {(store.processedDocs || []).length > 0 ? (
              <div className="space-y-3">
                {store.processedDocs.slice().reverse().map((doc) => (
                  <div key={doc.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-100/50 group hover:border-blue-200 transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-3">
                        <div className={`size-10 rounded-xl flex items-center justify-center ${doc.type === 'PLAN_NUTRICIONAL' ? 'bg-blue-100 text-blue-600' :
                          doc.type === 'INBODY' ? 'bg-gray-800 text-white' : 'bg-amber-100 text-amber-600'
                          }`}>
                          <span className="material-symbols-outlined text-xl">
                            {doc.type === 'PLAN_NUTRICIONAL' ? 'restaurant_menu' : doc.type === 'INBODY' ? 'leaderboard' : 'medical_services'}
                          </span>
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-gray-800 truncate max-w-[150px]">{doc.name}</p>
                          <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{new Date(doc.date).toLocaleDateString()} · {doc.type}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { if (window.confirm(`¿Deseas ACUMULAR este ${doc.type} a tu perfil actual?`)) applyDocumentData(doc.data, true); }}
                          title="Activar"
                          className="size-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                        >
                          <span className="material-symbols-outlined text-lg">play_arrow</span>
                        </button>
                        <button
                          onClick={() => { if (window.confirm(`¿Eliminar ${doc.name} del historial?`)) saveStore({ ...store, processedDocs: store.processedDocs.filter(d => d.id !== doc.id) }); }}
                          title="Eliminar"
                          className="size-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                        >
                          <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div onClick={() => { setUploadContext('PLAN_NUTRICIONAL'); fileInputRef.current?.click(); }} className="p-10 border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center gap-2 cursor-pointer hover:bg-gray-50 transition-all group">
                <div className="size-14 rounded-full bg-gray-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl text-gray-200">cloud_upload</span>
                </div>
                <p className="text-[11px] text-gray-400 font-black uppercase tracking-[0.2em]">Biblioteca Vacía</p>
                <p className="text-[9px] text-gray-300 font-bold uppercase tracking-tighter">Sube un PDF para comenzar tu historial</p>
              </div>
            )}
          </div>
        )}

        {/* Emergencia */}
        <div className="bg-red-50 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-red-500">
              <span className="material-symbols-outlined text-lg font-fill">emergency</span>
            </div>
            <div>
              <p className="text-[10px] text-red-400 font-bold">Emergencia</p>
              {isEditing ? (
                <input value={editData.emergencia || ''} onChange={e => setEditData({ ...editData, emergencia: e.target.value })} title="Emergencia" placeholder="Teléfono" className="text-sm font-bold text-gray-900 bg-transparent border-none p-0 focus:ring-0 w-28" />
              ) : <p className="text-sm font-bold text-gray-900">{profile.emergencia || "Configurar"}</p>}
            </div>
          </div>
          {(profile.emergencia && !isEditing) && (
            <a href={`tel:${profile.emergencia}`} className="size-10 bg-red-500 rounded-full flex items-center justify-center text-white shadow-md active:scale-90 transition-all">
              <span className="material-symbols-outlined text-lg font-fill">call</span>
            </a>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-300 pt-2">MN-NutriApp v35</p>
      </main>
    </div>
  );
};

export default ProfileView;
