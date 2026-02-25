import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { processPdfWithGemini } from '@/src/utils/ai';
import { MealItem, InventoryItem, initialStore, Profile } from '@/src/types/store';
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) {
      alert("El perfil está bloqueado. Mantén presionado el nombre para desbloquear.");
      return;
    }
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
      if (files.length === 0) {
        alert('Por favor selecciona archivos PDF.');
        return;
      }
      setSelectedFiles(prev => [...prev, ...files].slice(0, 3));
    }
  };

  const processBatch = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    setUploadStatus('reading');
    try {
      // ── Accumulated data across all files ──
      let accumulatedProfile: any = null;
      let accumulatedMenu: any = {};
      let accumulatedCompras: any[] = [];
      let accumulatedEjercicios: any = {};
      let accumulatedHorarios: any = {};
      let processedNames: string[] = [];

      for (const file of selectedFiles) {
        setUploadStatus('analyzing');
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const activeKey = (firebaseConfig as any).geminiApiKey;
        const data = await processPdfWithGemini(accumulatedProfile?.perfilAuto ? { ...profile, ...accumulatedProfile.perfilAuto } : profile, base64, undefined, activeKey);

        if (data) {
          console.log(`📄 PDF "${file.name}":`, {
            tipo: data.tipo_documento || 'N/A',
            perfil_keys: Object.keys(data.perfilAuto || {}),
            semana_days: Object.keys(data.semana || {}),
            compras: (data.compras || []).length,
            ejercicios: Object.keys(data.ejercicios || {})
          });
          // Clinical profile ALWAYS accumulates from any document type
          if (data.perfilAuto) {
            accumulatedProfile = accumulatedProfile || {};
            accumulatedProfile.perfilAuto = accumulatedProfile.perfilAuto || {};
            // Deep merge perfilAuto sections
            for (const section of ['perfil_biometrico', 'diagnostico_clinico', 'metas_y_objetivos', 'analisis_inbody_actual', 'prescripcion_ejercicio'] as const) {
              if (data.perfilAuto[section]) {
                accumulatedProfile.perfilAuto[section] = {
                  ...(accumulatedProfile.perfilAuto[section] || {}),
                  ...data.perfilAuto[section]
                };
              }
            }
            // Merge array fields (don't overwrite, combine)
            const dc = accumulatedProfile.perfilAuto.diagnostico_clinico;
            const newDc = data.perfilAuto.diagnostico_clinico;
            if (dc && newDc) {
              for (const key of ['comorbilidades', 'alergias', 'medicamentos_actuales', 'suplementacion', 'observaciones_medicas']) {
                if (Array.isArray(newDc[key]) && newDc[key].length > 0) {
                  const combined = [...(dc[key] || []), ...newDc[key]];
                  dc[key] = [...new Set(combined.map((s: string) => String(s).trim().toLowerCase()).filter(Boolean))].map(s => s.charAt(0).toUpperCase() + s.slice(1));
                }
              }
            }
            const mo = accumulatedProfile.perfilAuto.metas_y_objetivos;
            const newMo = data.perfilAuto.metas_y_objetivos;
            if (mo && newMo && Array.isArray(newMo.objetivos_generales) && newMo.objetivos_generales.length > 0) {
              const combined = [...(mo.objetivos_generales || []), ...newMo.objetivos_generales];
              mo.objetivos_generales = [...new Set(combined.map((s: string) => String(s).trim().toLowerCase()).filter(Boolean))].map(s => s.charAt(0).toUpperCase() + s.slice(1));
            }
          }

          // Menu, compras, ejercicios ONLY from documents that have them
          const docType = data.tipo_documento || '';
          const isPlan = docType === 'PLAN_NUTRICIONAL' || (data.semana && Object.keys(data.semana).length > 0);

          if (isPlan) {
            // Merge menu
            for (const day in (data.semana || {})) {
              accumulatedMenu[day] = { ...(accumulatedMenu[day] || {}), ...data.semana[day] };
            }
            // Append compras (only from real meal plans)
            if (Array.isArray(data.compras) && data.compras.length > 0) {
              accumulatedCompras = [...accumulatedCompras, ...data.compras];
            }
            // Merge horarios
            accumulatedHorarios = { ...accumulatedHorarios, ...(data.horarios || {}) };
          }

          // Ejercicios: from any doc that has actual routines
          if (data.ejercicios && Object.keys(data.ejercicios).length > 0) {
            for (const day in data.ejercicios) {
              if (accumulatedEjercicios[day] && Array.isArray(accumulatedEjercicios[day])) {
                const combined = [...accumulatedEjercicios[day]];
                (data.ejercicios[day] || []).forEach((newEx: any) => {
                  if (!combined.some((e: any) => e.n?.toLowerCase() === newEx.n?.toLowerCase())) {
                    combined.push(newEx);
                  }
                });
                accumulatedEjercicios[day] = combined;
              } else {
                accumulatedEjercicios[day] = data.ejercicios[day];
              }
            }
          }

          processedNames.push(file.name);
        }
      }

      // Build the final merged data object
      const currentMergedData = accumulatedProfile ? {
        ...accumulatedProfile,
        semana: accumulatedMenu,
        compras: accumulatedCompras,
        ejercicios: accumulatedEjercicios,
        horarios: accumulatedHorarios
      } : null;

      if (currentMergedData) {
        setUploadStatus('syncing');
        const data = currentMergedData;

        const newPatientName = (data.perfilAuto?.perfil_biometrico?.nombre_completo || 'Usuario').trim();
        const currentPatientName = (store.profile?.perfil_biometrico?.nombre_completo || '').trim();

        let updatedProfiles = { ...store.profiles };
        const isMismatch = currentPatientName && currentPatientName !== newPatientName;

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
        const evolution = [...(currentProfile.historico_antropometrico || [])];

        evolution.push({
          fecha: new Date().toISOString().split('T')[0],
          peso_lbs: String(data.perfilAuto?.analisis_inbody_actual?.peso_actual_kg ? parseFloat(data.perfilAuto.analisis_inbody_actual.peso_actual_kg) * 2.20462 : ''),
          cintura_cm: '',
          cuello_cm: '',
          brazo_der_cm: '',
          brazo_izq_cm: ''
        });

        const hasNewPlan = data.semana && Object.keys(data.semana).length > 0;

        const newInventory: InventoryItem[] = hasNewPlan ? (data.compras || []).map((c: any, idx: number) => ({
          id: Date.now() + '-' + idx,
          name: c[0],
          qty: c[1],
          level: 1,
          category: c[3] || 'Gral',
          aisle: c[4] || 'Gral',
          isCustom: false
        })) : [];

        const combinedInventory = [...(store.inventory || []), ...newInventory];
        const inventoryMap = new Map<string, InventoryItem>();

        combinedInventory.forEach(item => {
          inventoryMap.set(item.name.toLowerCase(), item);
        });

        const finalInventory = Array.from(inventoryMap.values());

        const caloriesTarget = data.perfilAuto?.metas_y_objetivos?.vet_kcal_diarias || store.caloriesTarget || 0;
        const waterGoal = data.perfilAuto?.metas_y_objetivos?.agua_objetivo_ml || store.waterGoal || 0;

        const mergeLists = (old: any[] = [], next: any[] = []) => {
          const combined = [...(Array.isArray(old) ? old : []), ...(Array.isArray(next) ? next : [])]
            .map(s => String(s || '').trim().toLowerCase())
            .filter(Boolean);
          const unique = Array.from(new Set(combined));
          return unique.map(s => s.charAt(0).toUpperCase() + s.slice(1));
        };

        const patchValue = (existing: any, incoming: any) => {
          if (incoming === null || incoming === undefined || incoming === '') return existing;
          return incoming;
        };

        const mergedProfile = {
          ...currentProfile,
          expediente_control: {
            ...(currentProfile.expediente_control || {}),
            ...(data.perfilAuto?.expediente_control || {}),
            ultima_actualizacion: new Date().toISOString().split('T')[0]
          },
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
          },
          historico_antropometrico: evolution.length > 0 ? evolution : currentProfile.historico_antropometrico || []
        };

        const deepMergeMenu = (old: any, next: any) => {
          const result = { ...(old || {}) };
          for (const day in next) {
            if (result[day] && typeof result[day] === 'object') {
              result[day] = { ...result[day], ...next[day] };
            } else {
              result[day] = next[day];
            }
          }
          return result;
        };

        const deepMergeExercises = (old: any, next: any) => {
          const result = { ...(old || {}) };
          for (const day in next) {
            if (result[day] && Array.isArray(result[day]) && Array.isArray(next[day])) {
              const combined = [...result[day]];
              next[day].forEach((newEx: any) => {
                if (!combined.some((e: any) => e.n.toLowerCase() === newEx.n.toLowerCase())) {
                  combined.push(newEx);
                }
              });
              result[day] = combined;
            } else {
              result[day] = next[day];
            }
          }
          return result;
        };

        // ── Diagnostic logging ──
        console.log('📋 PDF Merge Debug:', {
          tipo_documento: data.tipo_documento || 'N/A',
          perfilAuto_keys: Object.keys(data.perfilAuto || {}),
          semana_days: Object.keys(data.semana || {}),
          compras_count: (data.compras || []).length,
          ejercicios_days: Object.keys(data.ejercicios || {}),
          hasNewPlan
        });

        // Guard: preserve existing menu/exercises if PDF batch had none
        const finalMenu = hasNewPlan ? deepMergeMenu(store.menu, data.semana) : store.menu;
        const finalExercises = (data.ejercicios && Object.keys(data.ejercicios).length > 0)
          ? deepMergeExercises(store.exercises, data.ejercicios) : store.exercises;

        saveStore({
          ...store,
          profile: mergedProfile as Profile,
          inventory: finalInventory,
          planIngredients: hasNewPlan ? [...(store.planIngredients || []), ...(data.compras || []).map((c: any) => ({ n: c[0], q: c[1] }))] : (store.planIngredients || []),
          menu: finalMenu,
          exercises: finalExercises,
          doneMeals: hasNewPlan ? {} : store.doneMeals,
          doneEx: (data.ejercicios && Object.keys(data.ejercicios).length > 0) ? {} : store.doneEx,
          caloriesTarget,
          waterGoal,
          profiles: updatedProfiles,
          processedDocs: [...(store.processedDocs || []), ...processedNames],
          lastUpdateDate: new Date().toISOString().split('T')[0]
        });

        setLastUploadData({
          name: newPatientName,
          items: newInventory.length,
          cita: data.perfilAuto?.expediente_control?.ultima_actualizacion
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

      {/* ═══ ACTION BAR ═══ */}
      <div className="px-5 -mt-5 flex gap-2 relative z-10">
        <button onClick={() => isEditing ? handleSaveManual() : setIsEditing(true)} className={`flex-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-lg ${isEditing ? 'bg-emerald-500 text-white' : 'bg-white text-gray-700'}`}>
          <span className="material-symbols-outlined text-base font-fill">{isEditing ? 'save' : 'edit'}</span>{isEditing ? 'Guardar' : 'Editar'}
        </button>
        <button onClick={() => setShowClinical(!showClinical)} className={`px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-center active:scale-95 transition-all shadow-lg ${showClinical ? 'bg-blue-600 text-white' : 'bg-white text-blue-600'}`}>
          <span className="material-symbols-outlined text-base font-fill">clinical_notes</span>
        </button>
        {!isLocked && (
          <>
            <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="px-4 py-3 rounded-xl bg-gray-900 text-white flex items-center justify-center active:scale-95 transition-all shadow-lg disabled:opacity-50">
              <span className="material-symbols-outlined text-base font-fill">upload_file</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="application/pdf" className="hidden" title="PDF" />
          </>
        )}
      </div>

      {/* PDF queue */}
      {selectedFiles.length > 0 && (
        <div className="px-5 mt-3">
          <div className="bg-white p-4 rounded-2xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700">{selectedFiles.length} archivo{selectedFiles.length > 1 ? 's' : ''} en cola</p>
              <button onClick={() => setSelectedFiles([])} className="text-xs text-red-400 font-bold">Limpiar</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((file, idx) => (
                <span key={idx} className="bg-blue-50 text-blue-700 text-[11px] font-medium px-3 py-1 rounded-lg flex items-center gap-1.5">
                  {file.name.slice(0, 20)}{file.name.length > 20 ? '...' : ''}
                  <button onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))} className="text-blue-400 hover:text-red-500 ml-0.5">×</button>
                </span>
              ))}
            </div>
            <button onClick={processBatch} disabled={isProcessing} className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined text-sm">play_arrow</span>{uploadStatus === 'analyzing' ? 'Analizando...' : 'Analizar documentos'}
            </button>
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
        </div>

        {/* Historial Clínico */}
        {showClinical && (
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Historial Clínico</p>
            <div>
              <p className="text-[10px] text-gray-400 mb-1">Diagnóstico Nutricional</p>
              <textarea value={isEditing ? (editData.diagnostico_clinico?.diagnostico_nutricional || '') : (profile.diagnostico_clinico?.diagnostico_nutricional || 'Sin diagnóstico.')} onChange={e => isEditing && setEditData({ ...editData, diagnostico_clinico: { ...editData.diagnostico_clinico, diagnostico_nutricional: e.target.value } })} readOnly={!isEditing} title="Diagnóstico" className="w-full bg-gray-50 border-none rounded-xl text-sm p-3 text-gray-700 h-16 resize-none focus:ring-1 focus:ring-blue-200" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-2">Comorbilidades</p>
              <div className="flex flex-wrap gap-1.5">
                {(isEditing ? (editData.diagnostico_clinico?.comorbilidades || []) : (profile.diagnostico_clinico?.comorbilidades || [])).map((c, i) => (
                  <span key={i} className="bg-red-50 text-red-500 text-[11px] font-medium px-2.5 py-1 rounded-lg">{c}</span>
                ))}
                {(isEditing ? (editData.diagnostico_clinico?.comorbilidades || []) : (profile.diagnostico_clinico?.comorbilidades || [])).length === 0 && <span className="text-[11px] text-gray-300">Ninguna</span>}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-1">Alergias</p>
              <p className="text-sm text-gray-600">{(profile.diagnostico_clinico?.alergias || []).join(', ') || 'Ninguna'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50/60 p-3 rounded-xl">
                <p className="text-[10px] font-bold text-amber-600 mb-1">💊 Medicamentos</p>
                <p className="text-[11px] text-gray-600">{profile.diagnostico_clinico?.medicamentos_actuales?.join(', ') || 'Ninguno'}</p>
              </div>
              <div className="bg-emerald-50/60 p-3 rounded-xl">
                <p className="text-[10px] font-bold text-emerald-600 mb-1">🥤 Suplementos</p>
                <p className="text-[11px] text-gray-600">{Array.isArray(profile.diagnostico_clinico?.suplementacion) ? profile.diagnostico_clinico.suplementacion.join(', ') : (profile.diagnostico_clinico?.suplementacion || 'Ninguno')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Composición Corporal */}
        <div className="bg-gray-900 rounded-2xl p-5 text-white shadow-lg">
          <p className="text-[11px] font-bold text-white/40 mb-4 uppercase tracking-wider">Composición Corporal</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {[
              { l: 'Peso Actual', v: profile.analisis_inbody_actual?.peso_actual_kg, u: 'kg', k: 'peso_actual_kg' },
              { l: 'Músculo', v: profile.analisis_inbody_actual?.smm_masa_musculo_esqueletica_kg, u: 'kg', k: 'smm_masa_musculo_esqueletica_kg' },
              { l: 'Grasa', v: profile.analisis_inbody_actual?.pbf_porcentaje_grasa_corporal, u: '%', k: 'pbf_porcentaje_grasa_corporal' },
              { l: 'Score', v: profile.analisis_inbody_actual?.inbody_score, u: 'pts', k: 'inbody_score' },
            ].map(f => (
              <div key={f.k}>
                <p className="text-[10px] text-white/30 mb-0.5">{f.l}</p>
                {isEditing ? (
                  <input value={(editData.analisis_inbody_actual as any)?.[f.k] || ''} onChange={e => setEditData({ ...editData, analisis_inbody_actual: { ...editData.analisis_inbody_actual, [f.k]: e.target.value } })} title={f.l} className="bg-white/10 border-none rounded-lg text-lg font-bold text-white w-full p-1 focus:ring-1 focus:ring-white/20" />
                ) : <p className="text-xl font-bold">{f.v || '—'} <span className="text-xs text-white/20">{f.u}</span></p>}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-5 pt-4 border-t border-white/10">
            <div>
              <p className="text-[10px] text-white/30">Grasa Visceral</p>
              <p className="text-base font-bold text-amber-400">Nivel {profile.analisis_inbody_actual?.grasa_visceral_nivel || '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/30">Metabolismo Basal</p>
              <p className="text-base font-bold text-emerald-400">{profile.analisis_inbody_actual?.tasa_metabolica_basal_kcal || '—'} kcal</p>
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

        {/* Documentos */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Documentos</p>
            {(store.processedDocs || []).length > 0 && (
              <button onClick={() => { if (window.confirm("⚠️ Esto borrará TODO. ¿Continuar?")) saveStore(JSON.parse(JSON.stringify(initialStore))); }} className="text-[10px] font-bold text-red-400">Reiniciar</button>
            )}
          </div>
          {(store.processedDocs || []).length > 0 ? (
            <div className="space-y-1.5">
              {store.processedDocs.map((doc, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-blue-400">description</span>
                    <span className="text-xs font-medium text-gray-600 truncate max-w-[200px]">{doc}</span>
                  </div>
                  <button onClick={() => { if (window.confirm(`¿Eliminar ${doc}?`)) saveStore({ ...store, processedDocs: store.processedDocs.filter((_, i) => i !== idx) }); }} className="text-gray-300 hover:text-red-500">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div onClick={() => fileInputRef.current?.click()} className="p-5 border border-dashed border-gray-200 rounded-xl flex flex-col items-center gap-1 cursor-pointer hover:bg-gray-50 transition-all">
              <span className="material-symbols-outlined text-xl text-gray-300">cloud_upload</span>
              <p className="text-xs text-gray-400">Subir PDFs (máx. 3)</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={handleFileSelect} className="hidden" />
        </div>

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
