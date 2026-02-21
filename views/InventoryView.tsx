import React, { useState, useMemo } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { InventoryItem } from '@/src/types/store';
import { syncPlanToPantry } from '@/src/utils/helpers';

const InventoryView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
    const { store, saveStore } = useStore();
    const [activeTab, setActiveTab] = useState<'shopping' | 'inventory'>('shopping');
    const [showAllInventory, setShowAllInventory] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [selectedItemForStatus, setSelectedItemForStatus] = useState<InventoryItem | null>(null);

    const inventory = store.inventory || [];

    // 2. FUNCIÓN DE RENDERIZADO MAESTRO (Adapted for React)
    const shoppingList = useMemo(() => {
        const filter = showAllInventory ? () => true : (item: InventoryItem) => item.level <= 2;
        return inventory.filter(filter);
    }, [inventory, showAllInventory]);

    const fullInventory = useMemo(() => {
        return inventory;
    }, [inventory]);

    // 3. LOGIC HANDLERS
    const updateItemLevel = (id: string, newLevel: number) => {
        const newInventory = inventory.map(item =>
            item.id === id ? { ...item, level: Math.max(1, Math.min(4, newLevel)) } : item
        );
        saveStore({ ...store, inventory: newInventory });
    };

    const addCustomItem = (name: string) => {
        const newItem: InventoryItem = {
            id: Date.now().toString(),
            name,
            qty: '1 unidad',
            level: 4,
            category: 'Gral',
            aisle: 'Pasillo Gral',
            isCustom: true
        };
        saveStore({ ...store, inventory: [...inventory, newItem] });
    };

    const removeCustomItem = (id: string) => {
        const newInventory = inventory.filter(item => item.id !== id);
        saveStore({ ...store, inventory: newInventory });
    };

    const resetList = () => {
        if (window.confirm('¿Reiniciar todo el stock a Nivel 1 (Agotado)?')) {
            const newInventory = inventory.map(item => ({ ...item, level: 1 }));
            saveStore({ ...store, inventory: newInventory });
        }
    };

    const handleSync = () => {
        if (window.confirm("¿Sincronizar con el plan nutricional? Se añadirán los productos faltantes a la lista de compras.")) {
            const newInventory = syncPlanToPantry(store.menu || {}, inventory);
            saveStore({ ...store, inventory: newInventory });
        }
    };

    // UI Helpers
    const getStockMeterHtml = (level: number) => {
        const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-400', 'bg-blue-500'];
        const idx = Math.max(0, Math.min(level - 1, 3));
        return (
            <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4].map(v => (
                    <div
                        key={v}
                        className={`h-1.5 w-4 rounded-full transition-all duration-500 ${v <= level ? colors[idx] : 'bg-slate-100'}`}
                    />
                ))}
            </div>
        );
    };

    const groupItems = (items: InventoryItem[], key: 'aisle' | 'category') => {
        return items.reduce((acc, item) => {
            const group = item[key] || 'Otros';
            if (!acc[group]) acc[group] = [];
            acc[group].push(item);
            return acc;
        }, {} as Record<string, InventoryItem[]>);
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/30 pb-32 animate-in fade-in duration-500">
            {/* Header / Tabs */}
            <header className="p-6 bg-white border-b border-slate-100 sticky top-0 z-30">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Plan de Insumos</h1>
                    <div className="size-11 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined font-fill">inventory_2</span>
                    </div>
                </div>
                <div className="flex bg-slate-50 p-1.5 rounded-[22px] border border-slate-100">
                    <button
                        onClick={() => setActiveTab('shopping')}
                        className={`flex-1 py-3.5 rounded-[18px] text-[11px] font-black tracking-[0.1em] uppercase transition-all ${activeTab === 'shopping' ? 'bg-white text-primary shadow-lg shadow-primary/5 border border-slate-100' : 'text-slate-400'}`}
                    >
                        LISTA COMPRAS
                    </button>
                    <button
                        onClick={() => setActiveTab('inventory')}
                        className={`flex-1 py-4 rounded-[18px] text-[11px] font-black tracking-[0.1em] uppercase transition-all ${activeTab === 'inventory' ? 'bg-white text-primary shadow-lg shadow-primary/5 border border-slate-100' : 'text-slate-400'}`}
                    >
                        DESPENSA
                    </button>
                </div>
            </header>

            <main className="px-6 py-8 space-y-10">
                {activeTab === 'shopping' ? (
                    <div className="animate-in slide-in-from-bottom-4 duration-700">
                        <div className="flex border-b border-slate-50 pb-6 mb-8 items-center justify-between gap-3">
                            <div className="flex gap-2">
                                <button
                                    onClick={resetList}
                                    className="bg-red-50 text-red-500 px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all border border-red-100 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">restart_alt</span>
                                    REINICIAR
                                </button>
                                <button
                                    onClick={handleSync}
                                    className="bg-primary/5 text-primary px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all border border-primary/10 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">sync</span>
                                    SINCRONIZAR
                                </button>
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={showAllInventory}
                                        onChange={(e) => setShowAllInventory(e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="size-6 rounded-lg border-2 border-slate-200 transition-all peer-checked:bg-primary peer-checked:border-primary"></div>
                                    <span className="absolute inset-0 flex items-center justify-center text-white scale-0 transition-transform peer-checked:scale-100 material-symbols-outlined text-[18px]">check</span>
                                </div>
                                <span className="text-[11px] text-slate-400 font-black uppercase tracking-tight group-hover:text-slate-600 transition-colors">MOSTRAR TODO</span>
                            </label>
                        </div>

                        <div className="space-y-12">
                            {Object.entries(groupItems(shoppingList, 'aisle')).sort().map(([group, items]) => (
                                <section key={group} className="space-y-5">
                                    <div className="flex items-center gap-4">
                                        <h3 className="text-[12px] font-black text-slate-900 tracking-[0.15em] uppercase">{group}</h3>
                                        <div className="flex-1 h-px bg-slate-100"></div>
                                    </div>
                                    <div className="space-y-4">
                                        {items.map(item => (
                                            <div key={item.id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between gap-4 active:scale-[0.98] transition-all hover:border-primary/20 group">
                                                <div className="flex-1 min-w-0" onClick={() => setSelectedItemForStatus(item)}>
                                                    {getStockMeterHtml(item.level)}
                                                    <h4 className="font-extrabold text-slate-800 text-[16px] truncate leading-tight group-hover:text-primary transition-colors">{item.name}</h4>
                                                    <p className="text-[11px] text-slate-400 font-bold mt-1 tracking-wide">{item.qty}</p>
                                                </div>
                                                <button
                                                    onClick={() => updateItemLevel(item.id, 4)}
                                                    className="bg-primary text-white size-14 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 active:scale-90 transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-2xl font-fill">shopping_cart</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                            {shoppingList.length === 0 && (
                                <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[40px] bg-white/50">
                                    <div className="size-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <span className="material-symbols-outlined text-4xl">inventory</span>
                                    </div>
                                    <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em]">Todo bajo control</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="animate-in slide-in-from-bottom-4 duration-700">
                        <div className="bg-slate-900 p-8 rounded-[40px] shadow-2xl shadow-slate-900/20 mb-10 border border-white/5">
                            <h3 className="text-white font-black text-xs tracking-[0.2em] uppercase mb-4 opacity-60">Nuevo en Despensa</h3>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    placeholder="Nombre del producto..."
                                    value={newItemName}
                                    onChange={(e) => setNewItemName(e.target.value)}
                                    className="flex-1 bg-white/10 rounded-2xl px-6 py-4 focus:outline-none text-sm font-bold text-white placeholder:text-white/20 border border-white/5"
                                />
                                <button
                                    onClick={() => { if (newItemName) { addCustomItem(newItemName); setNewItemName(''); } }}
                                    className="bg-primary text-white px-8 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/30 active:scale-95 transition-all"
                                >
                                    AÑADIR
                                </button>
                            </div>
                        </div>

                        <div className="space-y-12">
                            {Object.entries(groupItems(fullInventory, 'category')).sort().map(([group, items]) => (
                                <section key={group} className="space-y-5">
                                    <div className="flex items-center gap-4">
                                        <h3 className="text-[12px] font-black text-slate-400 tracking-[0.15em] uppercase">{group}</h3>
                                        <div className="flex-1 h-px bg-slate-100"></div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        {items.map(item => (
                                            <div key={item.id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between gap-4 group hover:shadow-md transition-all">
                                                <div className="flex-1 min-w-0" onClick={() => setSelectedItemForStatus(item)}>
                                                    {getStockMeterHtml(item.level)}
                                                    <h4 className="font-extrabold text-slate-800 text-[16px] truncate leading-tight group-hover:text-primary transition-colors">{item.name}</h4>
                                                    <p className="text-[11px] text-slate-400 font-bold mt-1 tracking-wide">{item.qty}</p>
                                                </div>
                                                {item.isCustom && (
                                                    <button
                                                        onClick={() => { if (window.confirm('¿Eliminar?')) removeCustomItem(item.id); }}
                                                        className="size-12 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-90"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* Level Selector Modal */}
            {selectedItemForStatus && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedItemForStatus(null)}></div>
                    <div className="relative w-full max-w-lg bg-white rounded-[48px] p-10 space-y-8 animate-in slide-in-from-bottom duration-500 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">{selectedItemForStatus.name}</h3>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-3">Estado de Abastecimiento</p>
                            </div>
                            <button onClick={() => setSelectedItemForStatus(null)} className="size-14 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center active:scale-90 transition-all border border-slate-100">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { lv: 1, label: 'AGOTADO', color: 'bg-red-50 text-red-500 border-red-100 ring-red-500/10' },
                                { lv: 2, label: 'STOCK BAJO', color: 'bg-orange-50 text-orange-500 border-orange-100 ring-orange-500/10' },
                                { lv: 3, label: 'DISPONIBLE', color: 'bg-yellow-50 text-yellow-600 border-yellow-100 ring-yellow-500/10' },
                                { lv: 4, label: 'LLENO', color: 'bg-blue-50 text-primary border-blue-100 ring-primary/10' }
                            ].map(opt => (
                                <button
                                    key={opt.lv}
                                    onClick={() => { updateItemLevel(selectedItemForStatus.id, opt.lv); setSelectedItemForStatus(null); }}
                                    className={`p-7 rounded-[32px] border-2 flex flex-col items-center gap-4 active:scale-[0.97] transition-all ${opt.lv === selectedItemForStatus.level ? `${opt.color} ring-4 border-transparent` : 'bg-white border-slate-100 text-slate-400'}`}
                                >
                                    <div className={`size-3 rounded-full ${opt.lv === 1 ? 'bg-red-500' : opt.lv === 2 ? 'bg-orange-500' : opt.lv === 3 ? 'bg-yellow-400' : 'bg-primary'}`}></div>
                                    <span className="text-[11px] font-black tracking-widest leading-none">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
