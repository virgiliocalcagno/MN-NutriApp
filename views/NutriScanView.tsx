import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { analyzeImageWithGemini } from '@/src/utils/ai';
import { firebaseConfig } from '@/src/firebase';

const NutriScanView: React.FC<{ setView?: (v: any) => void }> = ({ setView }) => {
    const { store, saveStore } = useStore();
    const [isScanning, setIsScanning] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const scanResult = store.lastScan;

    const setScanResult = (val: any) => saveStore({ ...store, lastScan: val });

    const compressImage = (base64: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        });
    };

    const progress = Math.min(((store.calories || 0) / (store.caloriesTarget || 2000)) * 100, 100);

    useEffect(() => {
        if (barRef.current) {
            barRef.current.style.setProperty('--progress-width', `${progress}%`);
        }
    }, [progress]);

    const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsScanning(true);
            try {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = async () => {
                    const rawBase64 = reader.result as string;
                    const compressedBase64 = await compressImage(rawBase64);

                    // Immediate preview
                    setScanResult({ image: compressedBase64, plato: 'Analizando...' });
                    setIsScanning(true);

                    const profileContext = {
                        paciente: store.profile.paciente,
                        objetivo: store.profile.objetivos.join(", "),
                        condiciones: store.profile.comorbilidades.join(", ") + (store.profile.alergias ? `, Alergias: ${store.profile.alergias}` : "")
                    };

                    const result = await analyzeImageWithGemini(compressedBase64, profileContext, (firebaseConfig as any).geminiApiKey);

                    setScanResult({
                        ...result,
                        image: compressedBase64,
                        plato: result.platos ? result.platos.join(", ") : (result.plato || "Alimento Detectado"),
                        impacto: result.semaforo || result.impacto || "VERDE",
                        hack: result.analisis || result.hack || "Análisis metabólico listo...",
                        tip: result.bioHack || result.tip || "Consejo experto para tu comida...",
                        kcal: result.totalCalorias || result.kcal || (result.macros?.kcal) || "---"
                    });

                    setIsScanning(false);
                    if (window.navigator?.vibrate) window.navigator.vibrate([100, 50, 100]);
                };
                reader.readAsDataURL(file);
            } catch (err) {
                console.error(err);
                setIsScanning(false);
                alert("Error al analizar la imagen.");
            }
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 space-y-6 animate-in fade-in duration-500 pb-24">
            {/* Header con Volver */}
            <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <button onClick={() => setView?.('home')} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                    <span className="text-xs font-black uppercase tracking-widest">Volver</span>
                </button>
                <span className="text-[10px] font-black text-[#1e60f1] uppercase tracking-[0.2em]">IA Metabólica</span>
            </div>

            <div className="px-4 space-y-6">
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 mt-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Calorías Diarias</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-slate-900">{store.calories || 0}</span>
                                <span className="text-sm font-bold text-slate-300">/ {store.caloriesTarget || 2000} Kcal</span>
                            </div>
                        </div>
                        <div className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight">
                            {Math.round(((store.calories || 0) / (store.caloriesTarget || 2000)) * 100)}% Completado
                        </div>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div ref={barRef} className="h-full bg-blue-500 rounded-full transition-all duration-1000 progress-bar-fill"></div>
                    </div>
                </div>

                <button
                    onClick={() => setShowCaptureMenu(true)}
                    className="w-full bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col items-center text-center hover:bg-slate-50 transition-colors active:scale-[0.98]"
                >
                    <div className="size-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                        <span className="material-symbols-outlined text-4xl font-fill">center_focus_weak</span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">NUTRISCAN IA</h2>
                    <p className="text-[10px] text-blue-500 font-bold uppercase tracking-[0.2em] mb-4">METABOLIC MASTER v32.1</p>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-[240px]">
                        Análisis bioquímico instantáneo de tus platos con consejos de bio-hacking personalizados.
                    </p>
                </button>

                {/* 3. Area de Escaneo / Imagen */}
                <div className="relative aspect-square rounded-[40px] bg-white overflow-hidden shadow-2xl border-4 border-white">
                    <input type="file" ref={fileInputRef} onChange={handleScan} accept="image/*" className="hidden" title="Seleccionar imagen" />
                    <input type="file" ref={cameraInputRef} onChange={handleScan} accept="image/*" capture="environment" className="hidden" title="Tomar foto" />

                    {isScanning ? (
                        <div className="absolute inset-0 bg-slate-900/40 z-20 flex flex-col items-center justify-center gap-6 backdrop-blur-xl border border-white/20">
                            <div className="relative size-24">
                                <div className="absolute inset-0 border-[6px] border-white/10 border-t-blue-400 rounded-full animate-spin"></div>
                                <div className="absolute inset-0 flex items-center justify-center opacity-40">
                                    <span className="material-symbols-outlined text-4xl text-white">biotech</span>
                                </div>
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-white font-black text-xs tracking-[0.3em] uppercase animate-pulse">Iniciando Análisis</p>
                                <p className="text-blue-200/60 text-[10px] font-bold uppercase tracking-widest italic">Motor Metabólico v32.1</p>
                            </div>
                        </div>
                    ) : null}

                    {scanResult?.image ? (
                        <div className="h-full w-full relative">
                            <img src={scanResult.image} alt="Plato" className="w-full h-full object-cover" />
                            <div className="absolute top-6 left-6 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-full flex items-center gap-2 animate-in slide-in-from-left duration-500">
                                <div className="size-2 bg-blue-400 rounded-full animate-pulse"></div>
                                <span className="text-[10px] font-black text-white uppercase tracking-wider">Detectando: {scanResult.plato || 'Alimento...'}</span>
                            </div>
                            <div className="absolute top-0 left-0 w-full h-[2px] bg-blue-400/50 shadow-[0_0_15px_blue] animate-scan z-10"></div>
                        </div>
                    ) : (
                        <button onClick={() => setShowCaptureMenu(true)} className="w-full h-full flex flex-col items-center justify-center gap-4 group transition-all">
                            <div className="size-24 bg-blue-50 rounded-full flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-500 text-blue-600">
                                <span className="material-symbols-outlined text-4xl font-fill">photo_camera</span>
                            </div>
                            <p className="text-slate-500 font-bold text-sm tracking-tight">Captura tu comida para analizar</p>
                        </button>
                    )}
                </div>

                {!scanResult && !isScanning && (
                    <button
                        onClick={() => setShowCaptureMenu(true)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-[24px] shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 active:scale-95 transition-all text-sm tracking-widest uppercase"
                    >
                        <span className="material-symbols-outlined font-fill">auto_awesome</span>
                        ANALIZAR AHORA
                    </button>
                )}

                {scanResult && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-700">
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight px-1">Análisis Nutricional</h3>

                        <div className={`p-6 rounded-[32px] border ${scanResult.impacto === 'ROJO' ? 'bg-red-50 border-red-100' : scanResult.impacto === 'AMARILLO' ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                            <div className="flex items-center gap-2 mb-3">
                                <div className={`size-2 rounded-full ${scanResult.impacto === 'ROJO' ? 'bg-red-500' : scanResult.impacto === 'AMARILLO' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                                <p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-900">
                                    {scanResult.impacto === 'ROJO' ? 'ALERTA' : scanResult.impacto === 'AMARILLO' ? 'PRECAUCIÓN' : 'METABÓLICAMENTE ÓPTIMO'}
                                </p>
                            </div>
                            <p className="text-[13px] leading-[1.6] text-slate-600 font-medium whitespace-pre-wrap">
                                {scanResult.hack || "Análisis metabólico listo..."}
                            </p>
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { l: 'KCAL', v: scanResult.kcal, i: 'local_fire_department', c: 'text-orange-500' },
                                { l: 'PROT', v: (scanResult.macros?.p || '---'), i: 'set_meal', c: 'text-blue-500' },
                                { l: 'CARB', v: (scanResult.macros?.c || '---'), i: 'grain', c: 'text-amber-500' },
                                { l: 'GRASA', v: (scanResult.macros?.f || '---'), i: 'oil_barrel', c: 'text-emerald-500' }
                            ].map((m, i) => (
                                <div key={i} className="bg-white p-4 rounded-[28px] border border-slate-100 shadow-sm flex flex-col items-center transition-all hover:scale-105">
                                    <span className={`material-symbols-outlined text-sm mb-2 ${m.c}`}>{m.i}</span>
                                    <p className="text-base font-black text-slate-900">{m.v}</p>
                                    <p className="text-[8px] text-slate-400 font-black uppercase tracking-tighter">{m.l}</p>
                                </div>
                            ))}
                        </div>

                        <div className="bg-[#eff3ff] p-6 rounded-[32px] border border-blue-100/50 relative overflow-hidden group">
                            <div className="absolute -bottom-6 -right-6 text-blue-100 opacity-20 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                                <span className="material-symbols-outlined text-[140px] font-fill">settings</span>
                            </div>
                            <div className="flex gap-4 relative z-10">
                                <div className="size-14 rounded-2xl overflow-hidden border-2 border-white shadow-lg shrink-0 bg-blue-100 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-blue-600 text-3xl font-fill">nutrition</span>
                                </div>
                                <div className="flex flex-col">
                                    <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest mb-1">BIO-HACK RECOMENDADO</p>
                                    <p className="text-[13px] leading-relaxed italic text-slate-700 font-medium mb-3">
                                        {scanResult.tip || "Consejo experto para tu comida..."}
                                    </p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                        — EXPERTISE METABÓLICO MN
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                const addedCals = parseInt(scanResult.kcal || '0');
                                saveStore({
                                    ...store,
                                    calories: (store.calories || 0) + addedCals,
                                    lastScan: null
                                });
                                alert(`✅ ${addedCals} Kcal registradas en tu diario metabólico.`);
                                if (setView) setView('home');
                            }}
                            className="w-full bg-slate-900 hover:bg-black text-white py-6 rounded-[28px] shadow-2xl shadow-slate-900/40 flex items-center justify-between px-8 active:scale-[0.98] transition-all group"
                        >
                            <span className="font-black text-xs tracking-[0.2em] uppercase">Registrar y Finalizar</span>
                            <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">check_circle</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Selection Menu (Action Sheet) */}
            {showCaptureMenu && (
                <div className="fixed inset-0 z-[100] flex flex-col justify-end animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowCaptureMenu(false)}></div>
                    <div className="relative bg-white rounded-t-[40px] p-8 space-y-4 animate-in slide-in-from-bottom duration-500 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                        <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-6"></div>
                        <h3 className="text-xl font-black text-slate-900 text-center mb-8 uppercase tracking-widest">Seleccionar Origen</h3>

                        <div className="grid grid-cols-2 gap-4 pb-8">
                            <button
                                onClick={() => {
                                    setShowCaptureMenu(false);
                                    cameraInputRef.current?.click();
                                }}
                                className="flex flex-col items-center gap-4 p-8 bg-blue-50 rounded-[32px] border border-blue-100 active:scale-95 transition-all"
                            >
                                <div className="size-16 bg-white rounded-2xl flex items-center justify-center shadow-sm text-blue-600">
                                    <span className="material-symbols-outlined text-4xl font-fill">photo_camera</span>
                                </div>
                                <span className="text-xs font-black text-blue-600 tracking-wider uppercase">Tomar Foto</span>
                            </button>

                            <button
                                onClick={() => {
                                    setShowCaptureMenu(false);
                                    fileInputRef.current?.click();
                                }}
                                className="flex flex-col items-center gap-4 p-8 bg-slate-50 rounded-[32px] border border-slate-100 active:scale-95 transition-all"
                            >
                                <div className="size-16 bg-white rounded-2xl flex items-center justify-center shadow-sm text-slate-400">
                                    <span className="material-symbols-outlined text-4xl font-fill">photo_library</span>
                                </div>
                                <span className="text-xs font-black text-slate-500 tracking-wider uppercase">Galería</span>
                            </button>
                        </div>

                        <button
                            onClick={() => setShowCaptureMenu(false)}
                            className="w-full py-5 text-slate-400 font-black text-[10px] tracking-[0.3em] uppercase"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NutriScanView;
