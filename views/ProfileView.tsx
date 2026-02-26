import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { processPdfWithGemini } from '@/src/utils/ai';
import { MealItem, InventoryItem, initialStore, Profile, DocumentRecord, Store } from '@/src/types/store';
import { firebaseConfig } from '@/src/firebase';
import { useLongPress } from '@/src/hooks/useLongPress';

const ProfileView: React.FC<{ setView?: (v: any) => void }> = ({ setView }) => {
  const { store, user, saveStore, logout } = useStore();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Profile>({ ...store.profile });
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'reading' | 'analyzing' | 'syncing' | 'success' | 'error'>('idle');
  const [uploadContext, setUploadContext] = useState<'FICHA_MEDICA' | 'PLAN_NUTRICIONAL' | 'INBODY'>('PLAN_NUTRICIONAL');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastUploadData, setLastUploadData] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ id: string; file: File; context: 'FICHA_MEDICA' | 'PLAN_NUTRICIONAL' | 'INBODY' }[]>([]);
  const [selectedDocReview, setSelectedDocReview] = useState<DocumentRecord | null>(null);
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

  const patchValue = (existing: any, incoming: any) => {
    if (incoming === null || incoming === undefined || incoming === '') return existing;
    return incoming;
  };

  const mergeLists = (old: any[] = [], next: any[] = []) => {
    if (!next || next.length === 0) return old || [];
    const combined = [...(Array.isArray(old) ? old : []), ...(Array.isArray(next) ? next : [])]
      .map(s => String(s || '').trim().toLowerCase())
      .filter(Boolean);
    const unique = Array.from(new Set(combined));
    return unique.map(s => s.charAt(0).toUpperCase() + s.slice(1));
  };

  const mergeComorbidities = (old: any[] = [], next: any[] = []) => {
    if (!next || next.length === 0) return old || [];
    const normalizedOld = Array.isArray(old) ? old : [];
    const normalizedNext = Array.isArray(next) ? next : [];

    // Filter out old conditions that are being updated in the next array (e.g. 'Pre-diabetes' replaced by 'Pre-diabetes (CORREGIDA)')
    const oldFiltered = normalizedOld.filter(o => {
      const baseO = String(o).split('(')[0].trim().toLowerCase();
      return !normalizedNext.some(n => String(n).toLowerCase().includes(baseO) || baseO.includes(String(n).split('(')[0].trim().toLowerCase()));
    });

    const combined = [...oldFiltered, ...normalizedNext].map(s => String(s || '').trim()).filter(Boolean);
    return Array.from(new Set(combined));
  };

  const mergeHistorico = (old: any[] = [], next: any[] = []) => {
    if (!next || next.length === 0) return old;
    const combined = [...old, ...next];
    const unique = new Map();
    for (const item of combined) {
      if (item.fecha) unique.set(item.fecha, item);
    }
    return Array.from(unique.values()).sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
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

    setUploadContext(context);
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
      if (files.length === 0) {
        alert('Por favor selecciona archivos PDF.');
        return;
      }
      const newItems = files.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        file: f,
        context
      }));

      setSelectedFiles(prev => {
        const nextState = [...prev, ...newItems];
        if (nextState.length > 3) {
          alert('Solo puedes subir hasta 3 archivos a la vez. Se conservarán los últimos 3 seleccionados.');
        }
        return nextState.slice(-3);
      });
    }
    // Permite volver a seleccionar el mismo archivo si es necesario
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const mergeDocumentToStore = (currentStore: Store, data: any): Store => {
    const currentProfile = currentStore.profile;
    const hasNewPlan = data.semana && Object.keys(data.semana).length > 0;

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
        comorbilidades: mergeComorbidities(currentProfile.diagnostico_clinico?.comorbilidades || [], data.perfilAuto?.diagnostico_clinico?.comorbilidades || []),
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
      },
      historico_antropometrico: mergeHistorico(currentProfile.historico_antropometrico || [], data.perfilAuto?.historico_antropometrico || [])
    };

    const newInventory: any[] = hasNewPlan ? (data.compras || []).map((c: any, idx: number) => {
      const isArr = Array.isArray(c);
      return {
        id: Date.now() + '-' + idx,
        name: isArr ? c[0] : c.item,
        qty: isArr ? c[1] : c.cantidad,
        level: isArr ? (c[2] || 1) : (c.nivel || 1),
        category: (isArr ? c[3] : c.categoria) || 'Gral',
        aisle: (isArr ? c[4] : c.pasillo) || 'Gral',
        isCustom: false
      };
    }) : [];

    const finalInventory = hasNewPlan ? newInventory : currentStore.inventory;
    const finalMenu = hasNewPlan ? data.semana : currentStore.menu;
    const finalIngredients = hasNewPlan ? (data.compras || []).map((c: any) => ({
      n: Array.isArray(c) ? c[0] : c.item,
      q: Array.isArray(c) ? c[1] : c.cantidad
    })) : currentStore.planIngredients;

    return {
      ...currentStore,
      profile: mergedProfile as Profile,
      inventory: finalInventory,
      menu: finalMenu,
      planIngredients: finalIngredients,
      selectedDay: hasNewPlan ? 'LUNES' : currentStore.selectedDay,
      doneMeals: hasNewPlan ? {} : currentStore.doneMeals,
      caloriesTarget: data.perfilAuto?.metas_y_objetivos?.vet_kcal_diarias || currentStore.caloriesTarget,
      waterGoal: data.perfilAuto?.metas_y_objetivos?.agua_objetivo_ml || currentStore.waterGoal,
      lastUpdateDate: new Date().toISOString().split('T')[0]
    };
  };

  const applyDocumentData = (data: any, activateNow: boolean = true) => {
    if (!activateNow) return mergeDocumentToStore(store, data).profile;
    saveStore(mergeDocumentToStore(store, data));
  };

  const processBatch = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    setUploadStatus('reading');
    try {
      const newDocs: DocumentRecord[] = [];
      let lastResult: any = null;

      for (const item of selectedFiles) {
        setUploadStatus('analyzing');
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(item.file);
        });

        const data = await processPdfWithGemini(store.profile, base64, undefined, item.context);

        if (data) {
          const doc: DocumentRecord = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            name: item.file.name,
            type: (data.tipo_documento || item.context || 'AUTO') as any,
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

        let updatedStore = {
          ...store,
          processedDocs: [...(store.processedDocs || []), ...newDocs]
        };

        if (shouldActivate) {
          for (const doc of newDocs) {
            updatedStore = mergeDocumentToStore(updatedStore, doc.data);
          }
        }

        saveStore(updatedStore);

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
        <button onClick={() => setShowSettingsModal(true)} className="absolute top-12 right-5 size-9 rounded-full bg-white/10 flex items-center justify-center text-white/50">
          <span className="material-symbols-outlined text-lg">settings</span>
        </button>
        <div className="flex flex-col items-center text-center mt-2">
          <div className="mb-4">
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
              <p className="text-[10px] text-gray-400 mb-2 font-bold uppercase tracking-tighter">Registro de Comorbilidades</p>
              <div className="flex flex-wrap gap-1.5">
                {(isEditing ? (editData.diagnostico_clinico?.comorbilidades || []) : (profile.diagnostico_clinico?.comorbilidades || [])).map((c, i) => {
                  const isCorregida = c.toLowerCase().includes('corregid') || c.toLowerCase().includes('controlad');
                  return (
                    <span key={i} className={`${isCorregida ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50' : 'bg-red-50 text-red-500 border-red-100/50'} text-[10px] font-black px-3 py-1.5 rounded-xl border uppercase tracking-tighter shadow-sm`}>
                      {c}
                    </span>
                  );
                })}
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
                  <div className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-600 rounded-full transition-all duration-700" ref={el => { if (el) el.style.width = `${Math.min((parseInt(profile.analisis_inbody_actual?.grasa_visceral_nivel || '0') / 20) * 100, 100)}%`; }} />
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
                    <span className="text-[10px] font-bold text-gray-400 w-[60px]">{entry.fecha?.split('-').reverse().join('/')}</span>
                    <span className="text-sm font-bold text-gray-800">{entry.peso_lbs} lbs</span>
                  </div>
                  <span className="text-xs text-gray-400">Cintura: {entry.cintura_cm || '—'} cm</span>
                </div>
              ))}
            </div>
          </div>
        )}



        {/* ═══ MODAL DE REVISIÓN DE DOCUMENTO ═══ */}
        {selectedDocReview && (
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-md" onClick={() => setSelectedDocReview(null)} />
            <div className="relative w-full max-w-lg bg-white rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-10 duration-500">
              {/* Header Modal */}
              <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                <div className="flex gap-4 items-center">
                  <div className={`size-14 rounded-2xl flex items-center justify-center shadow-lg ${selectedDocReview.type === 'PLAN_NUTRICIONAL' ? 'bg-blue-600' : selectedDocReview.type === 'INBODY' ? 'bg-gray-900' : 'bg-amber-500'} text-white`}>
                    <span className="material-symbols-outlined text-3xl font-fill">
                      {selectedDocReview.type === 'PLAN_NUTRICIONAL' ? 'restaurant_menu' : selectedDocReview.type === 'INBODY' ? 'leaderboard' : 'medical_services'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-900 leading-none">{selectedDocReview.type.replace('_', ' ')}</h3>
                    <p className="text-xs text-gray-400 font-bold mt-1.5 uppercase tracking-wide">Vista Previa de Extracción IA</p>
                  </div>
                </div>
                <button onClick={() => setSelectedDocReview(null)} className="size-12 rounded-2xl bg-white shadow-sm border border-gray-100 text-gray-400 flex items-center justify-center active:scale-90 transition-all">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Scroll Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {/* Summary Section */}
                <div className="space-y-4">
                  <p className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em]">Resumen del Documento</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Paciente Detectado</p>
                      <p className="text-sm font-black text-gray-800">{selectedDocReview.data.perfilAuto?.perfil_biometrico?.nombre_completo || 'No especificado'}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Fecha de Emisión</p>
                      <p className="text-sm font-black text-gray-800">{selectedDocReview.data.perfilAuto?.analisis_inbody_actual?.fecha_test || new Date(selectedDocReview.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                {/* Specific Data based on type */}
                {selectedDocReview.type === 'INBODY' && (
                  <div className="bg-red-50 p-6 rounded-[2.5rem] border border-red-100 divide-y divide-red-100/50">
                    <div className="pb-4 flex justify-between items-center">
                      <p className="text-xs font-black text-red-700 uppercase">Biometría Clave</p>
                      <span className="text-2xl font-black text-red-800">{selectedDocReview.data.perfilAuto?.analisis_inbody_actual?.inbody_score || '--'} <span className="text-[10px] uppercase font-bold text-red-400">Score</span></span>
                    </div>
                    <div className="pt-4 grid grid-cols-2 gap-y-4 gap-x-8">
                      <div>
                        <p className="text-[10px] text-red-400 font-bold uppercase">Peso</p>
                        <p className="text-lg font-black text-red-900">{selectedDocReview.data.perfilAuto?.analisis_inbody_actual?.peso_actual_kg || '--'} kg</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-red-400 font-bold uppercase">Grasa %</p>
                        <p className="text-lg font-black text-red-900">{selectedDocReview.data.perfilAuto?.analisis_inbody_actual?.pbf_porcentaje_grasa_corporal || '--'} %</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-red-400 font-bold uppercase">Músculo</p>
                        <p className="text-lg font-black text-red-900">{selectedDocReview.data.perfilAuto?.analisis_inbody_actual?.smm_masa_musculo_esqueletica_kg || '--'} kg</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-red-400 font-bold uppercase">Basal</p>
                        <p className="text-lg font-black text-red-900">{selectedDocReview.data.perfilAuto?.analisis_inbody_actual?.tasa_metabolica_basal_kcal || '--'} kcal</p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedDocReview.type === 'PLAN_NUTRICIONAL' && (
                  <div className="space-y-5">
                    <div className="bg-blue-600 p-6 rounded-[2.5rem] text-white shadow-xl shadow-blue-200">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Prescripción Calórica</p>
                      <h4 className="text-3xl font-black">{selectedDocReview.data.perfilAuto?.metas_y_objetivos?.vet_kcal_diarias || '--'} <span className="text-sm font-bold opacity-50">kcal / día</span></h4>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-[2.5rem] border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Comidas Principales (Lunes)</p>
                      <div className="space-y-3">
                        {['DESAYUNO', 'ALMUERZO', 'CENA'].map(meal => (
                          <div key={meal} className="flex gap-3">
                            <span className="material-symbols-outlined text-blue-600 text-sm mt-1">check_circle</span>
                            <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase">{meal}</p>
                              <p className="text-xs text-gray-700 font-medium line-clamp-2 italic">
                                {selectedDocReview.data.semana?.['LUNES']?.[meal] || 'No definido'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {selectedDocReview.type === 'FICHA_MEDICA' && (
                  <div className="space-y-6">
                    <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100">
                      <p className="text-xs font-black text-amber-700 uppercase mb-3">Diagnóstico Clínico</p>
                      <p className="text-sm text-amber-900 font-medium italic leading-relaxed">
                        {selectedDocReview.data.perfilAuto?.diagnostico_clinico?.diagnostico_nutricional || 'No se detectó un diagnóstico textual claro.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { l: 'Comorbilidades', items: selectedDocReview.data.perfilAuto?.diagnostico_clinico?.comorbilidades, color: 'red' },
                        { l: 'Alergias', items: selectedDocReview.data.perfilAuto?.diagnostico_clinico?.alergias, color: 'orange' },
                        { l: 'Medicamentos', items: selectedDocReview.data.perfilAuto?.diagnostico_clinico?.medicamentos_actuales, color: 'blue' }
                      ].map(sec => (
                        <div key={sec.l} className="space-y-2">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{sec.l}</p>
                          <div className="flex flex-wrap gap-2">
                            {(sec.items || []).length > 0 ? sec.items.map((it: string, i: number) => (
                              <span key={i} className={`bg-white border-2 border-gray-50 text-gray-600 text-[10px] font-black px-3 py-1.5 rounded-xl uppercase`}>
                                {it}
                              </span>
                            )) : <span className="text-[10px] text-gray-300 font-bold italic">Nada registrado</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Disclaimer */}
                <div className="p-5 bg-gray-50 rounded-2xl flex gap-3 items-start border border-gray-100">
                  <span className="material-symbols-outlined text-blue-600 text-lg">info</span>
                  <p className="text-[9px] text-gray-400 font-medium leading-normal">
                    Este resumen fue generado por IA. Revisa los datos cuidadosamente antes de activarlos. La activación sobreescribirá tu plan nutricional actual si el documento es un Plan Nutri.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-8 pt-4 border-t border-gray-50 bg-gray-50/10 flex gap-3">
                <button
                  onClick={() => setSelectedDocReview(null)}
                  className="flex-1 py-4 rounded-2xl bg-white border-2 border-gray-100 text-gray-600 font-black text-[11px] uppercase active:scale-95 transition-all"
                >
                  CERRAR
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`⚠️ ACTIVACIÓN DE DATOS\n\n¿Deseas aplicar estos datos a tu perfil ahora?`)) {
                      applyDocumentData(selectedDocReview.data, true);
                      setSelectedDocReview(null);
                    }
                  }}
                  className="flex-[1.5] py-4 rounded-2xl bg-emerald-600 text-white font-black text-[11px] uppercase shadow-emerald-200 shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  ACTIVAR AHORA
                </button>
              </div>
            </div>
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

      </main>

      {/* ═══ MODAL DE CONFIGURACIÓN ═══ */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-md" onClick={() => setShowSettingsModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-t-[3rem] sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-500">
            {/* Header Modal */}
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
              <div className="flex gap-4 items-center">
                <div className="size-12 rounded-2xl flex items-center justify-center shadow-lg bg-gray-900 text-white">
                  <span className="material-symbols-outlined text-2xl font-fill">settings</span>
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 leading-none">Configuración</h3>
                  <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-wide">Panel de Administración</p>
                </div>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="size-10 rounded-xl bg-white shadow-sm border border-gray-100 text-gray-400 flex items-center justify-center active:scale-90 transition-all">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Scroll Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Acciones de Perfil */}
              <div className="flex gap-2">
                <button
                  onClick={() => { isEditing ? handleSaveManual() : setIsEditing(true); setShowSettingsModal(false); }}
                  className={`flex-1 py-4 rounded-2xl font-black text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg ${isEditing ? 'bg-emerald-500 text-white shadow-emerald-200/50' : 'bg-white text-gray-800 border-2 border-gray-100'}`}
                >
                  <span className="material-symbols-outlined text-lg font-fill">{isEditing ? 'save' : 'edit_square'}</span>
                  {isEditing ? 'GUARDAR CAMBIOS' : 'EDITAR PERFIL MANUAL'}
                </button>
                <button
                  onClick={() => { resetActiveProfile(); setShowSettingsModal(false); }}
                  className="px-5 py-4 rounded-2xl font-black text-xs flex items-center justify-center active:scale-95 transition-all shadow-lg bg-red-50 text-red-600 border-2 border-red-100"
                  title="Reiniciar Perfil Activo"
                >
                  <span className="material-symbols-outlined text-xl font-fill">restart_alt</span>
                </button>
              </div>

              {/* Carga Modular */}
              <div className="bg-gray-50 rounded-3xl p-5 border border-gray-100">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 text-center">Carga Modular de Expedientes (PDF)</p>
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
                  <div className="mt-5 pt-5 border-t border-gray-200/50 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between mb-3 relative z-10">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{selectedFiles.length} Archivos en Cola</p>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedFiles([]); }} className="text-[10px] text-red-500 font-bold hover:underline p-2 -mr-2">Limpiar todo</button>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 mb-4">
                      {selectedFiles.map((item) => (
                        <div key={item.id} className="bg-white text-gray-600 px-3 py-2 rounded-xl flex items-center justify-between border border-gray-100 shadow-sm">
                          <div className="flex items-center gap-3">
                            <span className={`material-symbols-outlined text-lg ${item.context === 'PLAN_NUTRICIONAL' ? 'text-blue-500' : item.context === 'INBODY' ? 'text-gray-900' : 'text-amber-500'}`}>
                              {item.context === 'PLAN_NUTRICIONAL' ? 'restaurant_menu' : item.context === 'INBODY' ? 'leaderboard' : 'medical_services'}
                            </span>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold truncate max-w-[200px]">{item.file.name}</span>
                              <span className="text-[8px] font-black uppercase text-gray-400">{item.context}</span>
                            </div>
                          </div>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedFiles(prev => prev.filter(q => q.id !== item.id)); }} className="text-gray-400 hover:text-red-500 p-2 -mr-2 z-10 relative">
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={processBatch}
                      disabled={isProcessing}
                      className="w-full bg-emerald-600 text-white py-4 rounded-2xl text-[11px] font-black uppercase active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-emerald-200 shadow-xl"
                    >
                      <span className="material-symbols-outlined text-lg">bolt</span>
                      {uploadStatus === 'analyzing' ? 'ANALIZANDO GENIUS IA...' : 'INICIAR PROCESAMIENTO'}
                    </button>
                  </div>
                )}
              </div>

              {/* Biblioteca de Expedientes */}
              <div className="mt-6 pt-6 border-t border-gray-100 relative">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-gray-400">inventory_2</span>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Biblioteca de Expedientes</p>
                  </div>
                  {(store.processedDocs || []).length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveStore({ ...store, processedDocs: [] }); }}
                      className="text-[10px] font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg active:scale-95 transition-all z-10 relative"
                    >
                      Vaciar Todo
                    </button>
                  )}
                </div>

                {(store.processedDocs || []).length > 0 ? (
                  <div className="space-y-3">
                    {store.processedDocs.slice().reverse().map((doc) => (
                      <div key={doc.id} className="bg-white p-3 rounded-2xl border-2 border-gray-50 group hover:border-blue-100 transition-all flex items-center justify-between">
                        <div className="flex gap-3">
                          <div className={`size-10 min-w-[2.5rem] rounded-xl flex items-center justify-center shadow-sm ${doc.type === 'PLAN_NUTRICIONAL' ? 'bg-blue-600 text-white' : doc.type === 'INBODY' ? 'bg-gray-900 text-white' : 'bg-amber-500 text-white'}`}>
                            <span className="material-symbols-outlined text-xl font-fill">
                              {doc.type === 'PLAN_NUTRICIONAL' ? 'restaurant_menu' : doc.type === 'INBODY' ? 'leaderboard' : 'medical_services'}
                            </span>
                          </div>
                          <div className="flex flex-col justify-center">
                            <p className="text-[11px] font-black text-gray-800 line-clamp-1 pr-1">{doc.name}</p>
                            <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[10px]">calendar_today</span>
                              {new Date(doc.date).toLocaleDateString()}
                              <span className="size-1 bg-gray-200 rounded-full mx-1" />
                              {doc.type.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedDocReview(doc); }} className="size-8 min-w-[2rem] rounded-xl bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all z-10 relative" title="Revisar">
                            <span className="material-symbols-outlined text-lg">visibility</span>
                          </button>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); applyDocumentData(doc.data, true); setShowSettingsModal(false); }} title="Activar" className="size-8 min-w-[2rem] rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm z-10 relative">
                            <span className="material-symbols-outlined text-lg font-fill">play_circle</span>
                          </button>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveStore({ ...store, processedDocs: store.processedDocs.filter(d => d.id !== doc.id) }); }} title="Eliminar" className="size-8 min-w-[2rem] rounded-xl bg-gray-50 text-gray-300 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all z-10 relative">
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center gap-3 text-center">
                    <div className="size-14 rounded-full bg-gray-50 flex items-center justify-center">
                      <span className="material-symbols-outlined text-3xl text-gray-300 font-fill">inventory_2</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Biblioteca Vacía</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight">Carga documentos arriba para guardarlos aquí</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Cerrar Sesión */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-50/50 text-red-500 text-[11px] font-black uppercase tracking-widest hover:bg-red-50 transition-all border border-red-100 border-dashed"
                >
                  <span className="material-symbols-outlined text-lg">logout</span>
                  Cerrar Sesión
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-center text-[10px] text-gray-300 pb-4 pt-2">MN-NutriApp v35.2</div>

    </div>
  );
};

export default ProfileView;
