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
    <div className="flex flex-col bg-slate-50 min-h-screen pb-24">
      {/* Custom Premium Processing Overlay */}
      {uploadStatus !== 'idle' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl" />
          <div className="relative w-full max-w-sm bg-white rounded-[48px] p-10 flex flex-col items-center text-center shadow-2xl space-y-8 animate-in zoom-in duration-500">

            <div className="relative size-32">
              <div className="absolute inset-0 border-[3px] border-slate-100 rounded-full" />
              <div
                ref={(el) => {
                  if (el) {
                    const deg = uploadStatus === 'reading' ? 120 : uploadStatus === 'analyzing' ? 240 : 360;
                    el.style.transform = `rotate(${deg}deg)`;
                    el.style.animation = uploadStatus === 'analyzing' ? 'spin 1.5s linear infinite' : 'none';
                    el.style.borderTopColor = 'transparent';
                    el.style.borderLeftColor = 'transparent';
                  }
                }}
                className="absolute inset-0 border-[3px] border-blue-600 rounded-full transition-all duration-700 ease-in-out"
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
                ref={(el) => {
                  if (el) {
                    const width = uploadStatus === 'reading' ? '30%' : uploadStatus === 'analyzing' ? '70%' : '100%';
                    el.style.width = width;
                  }
                }}
                className="h-full bg-blue-600 transition-all duration-1000 ease-out"
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

      {/* Smart Continuity Modal */}
      {showSuccessModal && lastUploadData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowSuccessModal(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-[48px] overflow-hidden shadow-2xl animate-in zoom-in duration-500">
            <div className="bg-primary p-10 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 size-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
              <div className="size-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl animate-bounce">
                <span className="material-symbols-outlined text-primary text-4xl font-fill">verified_user</span>
              </div>
              <h3 className="text-white text-2xl font-black tracking-tight mb-1">Análisis Completado</h3>
              <p className="text-blue-100 text-[10px] font-black uppercase tracking-[0.2em]">{lastUploadData.name}</p>
            </div>

            <div className="p-8 space-y-6">
              <p className="text-xs font-bold text-slate-500 text-center leading-relaxed">
                Hemos extraído con éxito la información clínica. ¿Cómo deseas proceder?
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => { setShowSuccessModal(false); fileInputRef.current?.click(); }}
                  className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-[0.1em] active:scale-95 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3"
                >
                  <span className="material-symbols-outlined text-lg">library_add</span>
                  CONTINUAR ESCANEANDO
                </button>
                <button
                  onClick={() => {
                    const resetProfile = window.confirm("¿Seguro que deseas iniciar el perfil de un nuevo usuario? Se borrarán TODOS los datos actuales (despensa, menú, ejercicios) para empezar de cero.");
                    if (resetProfile) {
                      saveStore(JSON.parse(JSON.stringify(initialStore)));
                    }
                    setShowSuccessModal(false);
                  }}
                  className="w-full bg-white border-2 border-slate-200 text-slate-600 py-5 rounded-[24px] font-black text-xs uppercase tracking-[0.1em] active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  <span className="material-symbols-outlined text-lg">person_add</span>
                  NUEVO USUARIO
                </button>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"
                >
                  VER EXPEDIENTE
                </button>
              </div>
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
            <h2 onClick={onLongPress} {...longPressProps} className="text-[28px] font-black text-slate-900 tracking-tight leading-tight select-none cursor-pointer">
              {isEditing ? (
                <input
                  type="text"
                  value={editData.perfil_biometrico?.nombre_completo || ''}
                  onChange={e => setEditData({ ...editData, perfil_biometrico: { ...editData.perfil_biometrico, nombre_completo: e.target.value } })}
                  title="Nombre del paciente"
                  className="bg-slate-50 border-none p-0 text-center focus:ring-0 rounded font-black max-w-[200px]"
                />
              ) : (profile.perfil_biometrico?.nombre_completo || user?.displayName || 'Usuario')}
              {!isLocked && <span className="material-symbols-outlined text-primary text-lg">edit</span>}
            </h2>
            <p className="text-[10px] text-blue-500 font-black uppercase tracking-[0.3em] mb-2">Expediente Clínico Digital</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-[10px] font-bold text-primary bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                {isEditing ? (
                  <span className="flex items-center gap-1 italic">Dr. <input value={editData.perfil_biometrico?.doctor || ''} onChange={e => setEditData({ ...editData, perfil_biometrico: { ...editData.perfil_biometrico, doctor: e.target.value } })} title="Nombre del doctor" className="bg-transparent border-none p-0 w-24 text-primary font-bold focus:ring-0 text-[10px]" /></span>
                ) : `Dr. ${profile.perfil_biometrico?.doctor || 'Consultor Health'}`}
              </p>
              <div className="size-1 bg-slate-200 rounded-full"></div>
              <p className="text-[10px] font-black text-slate-400">
                {isEditing ? (
                  <select value={editData.perfil_biometrico?.genero || ''} onChange={e => setEditData({ ...editData, perfil_biometrico: { ...editData.perfil_biometrico, genero: e.target.value } })} title="Género" className="bg-transparent border-none p-0 text-[10px] font-black focus:ring-0">
                    <option value="Hombre">MALE</option>
                    <option value="Mujer">FEMALE</option>
                  </select>
                ) : (profile.perfil_biometrico?.genero || 'MALE').toUpperCase()}
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
                <span className="text-2xl font-black text-emerald-500">
                  {profile.analisis_inbody_actual?.peso_actual_kg ? 85 : 0}
                </span>
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
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="bg-slate-900 text-white px-6 py-4 rounded-[28px] shadow-xl border border-slate-100 font-black flex items-center justify-center active:scale-95 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined font-fill text-lg">upload_file</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="application/pdf" className="hidden" title="Subir PDF de plan nutricional" />
          </>
        )}
      </div>

      {/* Reforma Integral: Expediente Clínico Digital (7 Secciones) */}
      <main className="px-6 py-10 space-y-12 animate-in fade-in duration-700">

        {/* S1: IDENTIFICACIÓN (Datos Generales) */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-1">
            <div className="size-8 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <span className="material-symbols-outlined text-sm font-fill">contact_page</span>
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">S1: Identificación</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { l: 'Edad', v: profile.perfil_biometrico?.edad, u: 'Años', i: 'cake', c: 'blue', key: 'edad', parent: 'perfil_biometrico' },
              { l: 'Estatura', v: profile.perfil_biometrico?.estatura_cm, u: 'cm', i: 'height', c: 'blue', key: 'estatura_cm', parent: 'perfil_biometrico' },
              { l: 'Género', v: profile.perfil_biometrico?.genero, u: '', i: 'wc', c: 'blue', key: 'genero', parent: 'perfil_biometrico' },
              { l: 'Doctor', v: profile.perfil_biometrico?.doctor, u: '', i: 'stethoscope', c: 'blue', key: 'doctor', parent: 'perfil_biometrico' }
            ].map(item => (
              <div key={item.key} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`material-symbols-outlined text-xs text-${item.c}-500`}>{item.i}</span>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{item.l}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  {isEditing ? (
                    <input
                      type="text"
                      value={(editData as any)[item.parent]?.[item.key] || ''}
                      onChange={e => setEditData({
                        ...editData,
                        [item.parent]: { ...(editData as any)[item.parent], [item.key]: e.target.value }
                      })}
                      title={item.l}
                      placeholder={item.l}
                      className="text-lg font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-full"
                    />
                  ) : <span className="text-xl font-black text-slate-800">{item.v || '--'}</span>}
                  <span className="text-[10px] font-bold text-slate-300 uppercase">{item.u}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-xs text-blue-500">target</span>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Objetivo Principal</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Bajar Peso', 'Salud/Bienestar', 'Masa Muscular', 'Quemar Grasa', 'Cardiovascular'].map(obj => {
                const isSelected = (isEditing ? (editData.metas_y_objetivos?.objetivos_generales || []) : (profile.metas_y_objetivos?.objetivos_generales || [])).includes(obj);
                return (
                  <button
                    key={obj}
                    onClick={() => {
                      if (!isEditing) return;
                      const current = editData.metas_y_objetivos?.objetivos_generales || [];
                      const next = current.includes(obj) ? current.filter(o => o !== obj) : [...current, obj];
                      setEditData({ ...editData, metas_y_objetivos: { ...editData.metas_y_objetivos, objetivos_generales: next } });
                    }}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${isSelected ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400'}`}
                  >
                    {obj.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* S2: HISTORIAL CLÍNICO & COMORBILIDADES */}
        <section className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8 relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-red-500 rounded-xl flex items-center justify-center text-white shadow-lg">
              <span className="material-symbols-outlined text-sm font-fill">medical_services</span>
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">S2: Historial Clínico</h3>
          </div>

          <div className="space-y-6">
            <div>
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Diagnóstico Nutricional</label>
              <textarea
                value={isEditing ? (editData.diagnostico_clinico?.diagnostico_nutricional || '') : (profile.diagnostico_clinico?.diagnostico_nutricional || 'Sin diagnóstico reportado.')}
                onChange={e => isEditing && setEditData({ ...editData, diagnostico_clinico: { ...editData.diagnostico_clinico, diagnostico_nutricional: e.target.value } })}
                readOnly={!isEditing}
                title="Diagnóstico Nutricional"
                placeholder="Escriba el diagnóstico..."
                className="w-full bg-slate-50 border-none rounded-2xl text-[11px] p-4 font-bold text-slate-700 h-20 focus:ring-1 focus:ring-red-100"
              />
            </div>

            <div>
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Comorbilidades Activas</label>
              <div className="flex flex-wrap gap-2">
                {['Hipertensión', 'Diabetes', 'Tiroides', 'Colesterol', 'Anemia', 'SOP'].map(cond => {
                  const isActive = (isEditing ? (editData.diagnostico_clinico?.comorbilidades || []) : (profile.diagnostico_clinico?.comorbilidades || [])).includes(cond);
                  return (
                    <button
                      key={cond}
                      onClick={() => {
                        if (!isEditing) return;
                        const currentList = editData.diagnostico_clinico?.comorbilidades || [];
                        const newList = currentList.includes(cond) ? currentList.filter(c => c !== cond) : [...currentList, cond];
                        setEditData({ ...editData, diagnostico_clinico: { ...editData.diagnostico_clinico, comorbilidades: newList } });
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
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Alergias</label>
              {isEditing ? (
                <div className="flex flex-wrap gap-2">
                  {(editData.diagnostico_clinico?.alergias || []).map(alergia => (
                    <div key={alergia} className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-xl border border-red-100 group">
                      <span className="text-[9px] font-bold text-red-900">{alergia}</span>
                      <button
                        onClick={() => {
                          const newAlergias = (editData.diagnostico_clinico?.alergias || []).filter(a => a !== alergia);
                          setEditData({ ...editData, diagnostico_clinico: { ...editData.diagnostico_clinico, alergias: newAlergias } });
                        }}
                        className="size-4 bg-red-100 text-red-400 rounded-full flex items-center justify-center hover:text-red-500 hover:bg-red-200 transition-all"
                      >
                        <span className="material-symbols-outlined text-[10px]">close</span>
                      </button>
                    </div>
                  ))}
                  <input
                    type="text"
                    placeholder="Añadir alergia"
                    className="bg-slate-50 border-none rounded-xl text-[10px] p-2 font-bold text-slate-700"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value) {
                        e.preventDefault();
                        const newAlergias = [...(editData.diagnostico_clinico?.alergias || []), e.currentTarget.value];
                        setEditData({ ...editData, diagnostico_clinico: { ...editData.diagnostico_clinico, alergias: newAlergias } });
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
              ) : (
                <p className="text-[10px] font-bold text-slate-700">{(profile.diagnostico_clinico?.alergias || []).join(', ') || 'Ninguna'}</p>
              )}
            </div>

            <div>
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2">Suplementación y Medicamentos</label>
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-amber-50/50 p-4 rounded-3xl border border-amber-100/50">
                  <p className="text-[8px] font-black text-amber-500 uppercase mb-2">💊 Medicamentos</p>
                  {isEditing ? (
                    <textarea
                      value={editData.diagnostico_clinico?.medicamentos_actuales?.join(', ') || ''}
                      onChange={e => setEditData({ ...editData, diagnostico_clinico: { ...editData.diagnostico_clinico, medicamentos_actuales: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                      title="Medicamentos Actuales"
                      placeholder="Medicamento 1, Medicamento 2..."
                      className="w-full bg-white border-none rounded-xl text-[10px] p-2 font-bold text-slate-700"
                    />
                  ) : (
                    <p className="text-[10px] font-bold text-slate-700">{profile.diagnostico_clinico?.medicamentos_actuales?.join(', ') || 'Ninguno'}</p>
                  )}
                </div>
                <div className="bg-emerald-50/50 p-4 rounded-3xl border border-emerald-100/50">
                  <p className="text-[8px] font-black text-emerald-500 uppercase mb-2">🥤 Suplementación</p>
                  {isEditing ? (
                    <textarea
                      value={(Array.isArray(editData.diagnostico_clinico?.suplementacion) ? editData.diagnostico_clinico.suplementacion : [])?.join(', ')}
                      onChange={e => setEditData({ ...editData, diagnostico_clinico: { ...editData.diagnostico_clinico, suplementacion: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
                      title="Suplementación Activa"
                      placeholder="Suplemento 1, Suplemento 2..."
                      className="w-full bg-white border-none rounded-xl text-[10px] p-2 font-bold text-slate-700"
                    />
                  ) : (
                    <p className="text-[10px] font-bold text-slate-700">{Array.isArray(profile.diagnostico_clinico?.suplementacion) ? profile.diagnostico_clinico.suplementacion.join(', ') : (profile.diagnostico_clinico?.suplementacion || 'Ninguno')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* S3: OBJETIVOS Y METAS DEL PLAN */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-1">
            <div className="size-8 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-lg">
              <span className="material-symbols-outlined text-sm font-fill">ads_click</span>
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">S3: Objetivos y Metas</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { l: 'Peso Ideal', v: profile.metas_y_objetivos?.peso_ideal_meta, u: 'Lb/Kg', i: 'target', c: 'amber', key: 'peso_ideal_meta', parent: 'metas_y_objetivos' },
              { l: 'Ctrl Grasa', v: profile.metas_y_objetivos?.control_grasa_kg, u: 'Kg', i: 'fitness_center', c: 'orange', key: 'control_grasa_kg', parent: 'metas_y_objetivos' },
              { l: 'VET', v: profile.metas_y_objetivos?.vet_kcal_diarias, u: 'Kcal', i: 'local_fire_department', c: 'red', key: 'vet_kcal_diarias', parent: 'metas_y_objetivos' },
              { l: 'Agua RECO', v: profile.metas_y_objetivos?.agua_objetivo_ml, u: 'ml', i: 'water_drop', c: 'blue', key: 'agua_objetivo_ml', parent: 'metas_y_objetivos' }
            ].map(item => (
              <div key={item.key} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`material-symbols-outlined text-xs text-${item.c}-500 font-fill`}>{item.i}</span>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{item.l}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  {isEditing ? (
                    <input
                      type="text"
                      value={(editData as any)[item.parent]?.[item.key] || ''}
                      onChange={e => setEditData({
                        ...editData,
                        [item.parent]: { ...(editData as any)[item.parent], [item.key]: e.target.value }
                      })}
                      title={item.l}
                      className="text-lg font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-full"
                    />
                  ) : <span className="text-xl font-black text-slate-800">{item.v || '--'}</span>}
                  <span className="text-[10px] font-bold text-slate-300 uppercase">{item.u}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* S4: COMPOSICIÓN CORPORAL (InBody) */}
        <section className="bg-slate-900 p-8 rounded-[48px] text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <span className="material-symbols-outlined text-[120px] font-fill text-white">analytics</span>
          </div>

          <div className="relative z-10 space-y-8">
            <div className="flex items-center gap-3">
              <div className="size-8 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                <span className="material-symbols-outlined text-sm font-fill text-white">data_thresholding</span>
              </div>
              <h3 className="text-sm font-black text-white/90 uppercase tracking-[0.2em]">S4: InBody Actual</h3>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {[
                { l: 'Peso Actual', v: profile.analisis_inbody_actual?.peso_actual_kg, u: 'Kg', key: 'peso_actual_kg' },
                { l: 'SMM (Músculo)', v: profile.analisis_inbody_actual?.smm_masa_musculo_esqueletica_kg, u: 'Kg', key: 'smm_masa_musculo_esqueletica_kg' },
                { l: 'PBF (Grasa)', v: profile.analisis_inbody_actual?.pbf_porcentaje_grasa_corporal, u: '%', key: 'pbf_porcentaje_grasa_corporal' },
                { l: 'Score InBody', v: profile.analisis_inbody_actual?.inbody_score, u: 'Pts', key: 'inbody_score' }
              ].map(field => (
                <div key={field.key} className="space-y-1">
                  <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">{field.l}</p>
                  {isEditing ? (
                    <input
                      value={(editData.analisis_inbody_actual as any)[field.key] || ''}
                      onChange={e => setEditData({ ...editData, analisis_inbody_actual: { ...editData.analisis_inbody_actual, [field.key]: e.target.value } })}
                      title={field.l}
                      placeholder="0.0"
                      className="bg-white/10 border-none rounded-xl text-lg font-black text-white w-full p-1 h-8 focus:ring-1 focus:ring-white/30"
                    />
                  ) : (
                    <div className="flex flex-col">
                      <p className="text-2xl font-black">{field.v || '--'}<span className="text-[10px] text-white/30 ml-1">{field.u}</span></p>
                      {field.key === 'peso_actual_kg' && field.v && (
                        <p className="text-[10px] font-bold text-white/40">{(parseFloat(field.v) * 2.20462).toFixed(1)} Lbs</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-white/10 flex items-center justify-between">
              <div>
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Grasa Visceral</p>
                <p className="text-xl font-black text-amber-400">Nivel {profile.analisis_inbody_actual?.grasa_visceral_nivel || '--'}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Metabolismo Basal</p>
                <p className="text-xl font-black text-emerald-400">{profile.analisis_inbody_actual?.tasa_metabolica_basal_kcal || '--'} <span className="text-[10px]">kcal</span></p>
              </div>
            </div>
          </div>
        </section>

        {/* S5: PRESCRIPCIÓN DE EJERCICIO */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-1">
            <div className="size-8 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg">
              <span className="material-symbols-outlined text-sm font-fill">exercise</span>
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">S5: Ejercicio</h3>
          </div>

          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fuerza</p>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700">{profile.prescripcion_ejercicio?.fuerza_dias_semana || '--'} Días</span>
                  <span className="text-[10px] text-slate-400">{profile.prescripcion_ejercicio?.fuerza_minutos_sesion || '--'} Min/Sesión</span>
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aeróbico</p>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700">{profile.prescripcion_ejercicio?.aerobico_dias_semana || '--'} Días</span>
                  <span className="text-[10px] text-slate-400">{profile.prescripcion_ejercicio?.aerobico_minutos_sesion || '--'} Min/Sesión</span>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">FCM Objetivo</p>
                <p className="text-lg font-black text-red-500">{profile.prescripcion_ejercicio?.fcm_latidos_min || '--'} <span className="text-[10px]">LPM</span></p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Zona Quemagrasa</p>
                <p className="text-lg font-black text-primary">{profile.prescripcion_ejercicio?.fc_promedio_entrenamiento || '--'} <span className="text-[10px]">LPM</span></p>
              </div>
            </div>
          </div>
        </section>

        {/* S6: EVOLUCIÓN (Histórico) */}
        {profile.historico_antropometrico && profile.historico_antropometrico.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-3 px-1">
              <div className="size-8 bg-purple-500 rounded-xl flex items-center justify-center text-white shadow-lg">
                <span className="material-symbols-outlined text-sm font-fill">trending_up</span>
              </div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">S6: Evolución</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {profile.historico_antropometrico.slice().reverse().map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between p-6 bg-white rounded-[32px] border border-slate-100 shadow-sm group">
                  <div className="flex items-center gap-4">
                    <div className="size-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 font-black text-[10px]">
                      {entry.fecha.split('-').slice(1).join('/')}
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Peso Registrado</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-base font-black text-slate-900">{entry.peso_lbs} lbs</p>
                        <p className="text-[10px] font-bold text-slate-300">/ {(parseFloat(entry.peso_lbs) / 2.20462).toFixed(1)} kg</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cintura</p>
                      <p className="text-base font-black text-emerald-50">{entry.cintura_cm || '--'} cm</p>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm("¿Deseas eliminar esta entrada del historial?")) {
                          const originalIdx = profile.historico_antropometrico.length - 1 - idx;
                          const newHistory = profile.historico_antropometrico.filter((_, i) => i !== originalIdx);
                          saveStore({ ...store, profile: { ...profile, historico_antropometrico: newHistory } });
                        }
                      }}
                      className="size-8 bg-red-50 text-red-400 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* S7: CONTROL DE EXPEDIENTE */}
        <section className="bg-slate-50 p-8 rounded-[40px] border border-dashed border-slate-200 space-y-6">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-slate-400 rounded-xl flex items-center justify-center text-white shadow-lg">
              <span className="material-symbols-outlined text-sm font-fill">settings_ethernet</span>
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">S7: Control</h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
              <p>ID EXPEDIENTE</p>
              <p className="text-slate-900">{profile.expediente_control?.usuario_id || 'ID_NUEVO'}</p>
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
              <p>ÚLTIMA ACTUALIZACIÓN</p>
              <p className="text-slate-900">{profile.expediente_control?.ultima_actualizacion || 'Hoy'}</p>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Cola de Análisis ({selectedFiles.length}/3)</label>
                {selectedFiles.length > 0 && (
                  <button
                    onClick={() => setSelectedFiles([])}
                    className="text-[8px] font-black text-red-500 uppercase tracking-widest px-2 py-1 rounded-lg transition-colors"
                  >
                    LIMPIAR COLA
                  </button>
                )}
              </div>

              {selectedFiles.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-xl border border-blue-100 group">
                      <span className="material-symbols-outlined text-[10px] text-blue-600">file_present</span>
                      <span className="text-[9px] font-bold text-blue-900 truncate max-w-[120px]">{file.name}</span>
                      <button
                        onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="size-4 bg-blue-100 text-blue-400 rounded-full flex items-center justify-center hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <span className="material-symbols-outlined text-[10px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="mb-4 p-6 border-2 border-dashed border-slate-200 rounded-[32px] flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-all"
                >
                  <span className="material-symbols-outlined text-2xl text-slate-300">cloud_upload</span>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Seleccionar PDFs (Max 3)</p>
                </div>
              )}

              {selectedFiles.length > 0 && (
                <button
                  onClick={processBatch}
                  disabled={isProcessing}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-200 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center justify-center gap-2 mb-6"
                >
                  <span className="material-symbols-outlined text-sm font-fill">analytics</span>
                  {uploadStatus === 'analyzing' ? 'IA ANALIZANDO...' : 'INICIAR ANÁLISIS CONJUNTO'}
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className="flex items-center justify-between mb-3 pt-4 border-t border-slate-100">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Historial de Expedientes</label>
                {(store.processedDocs || []).length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm("⚠️ ATENCIÓN: Esta acción borrará TODO el expediente actual (perfil, despensa, recetas y ejercicios) para empezar de cero. ¿Deseas continuar?")) {
                        saveStore(JSON.parse(JSON.stringify(initialStore)));
                      }
                    }}
                    className="text-[8px] font-black text-red-500 uppercase tracking-widest hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    LIMPIAR TODO
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(store.processedDocs || []).length > 0 ? (
                  store.processedDocs.map((doc, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-100 group">
                      <span className="material-symbols-outlined text-[10px] text-blue-400">description</span>
                      <span className="text-[9px] font-bold text-slate-600 truncate max-w-[140px]">{doc}</span>
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Eliminar ${doc}?`)) {
                            const newDocs = store.processedDocs.filter((_, i) => i !== idx);
                            saveStore({ ...store, processedDocs: newDocs });
                          }
                        }}
                        className="size-4 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <span className="material-symbols-outlined text-[10px]">close</span>
                      </button>
                    </div>
                  ))
                ) : <p className="text-[9px] text-slate-400 italic">No hay documentos procesados.</p>}
              </div>
            </div>
          </div>
        </section>

        {/* SOS Card */}
        <section className="bg-red-50 p-8 rounded-[40px] border border-red-100 flex items-center justify-between group active:scale-[0.98] transition-all">
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
                  title="Contacto de Emergencia"
                  placeholder="Número de teléfono"
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
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">MN-NutriApp Pro v34.2</p>
        </div>
      </main>
    </div >
  );
};

export default ProfileView;
