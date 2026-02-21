import React, { useState, useMemo } from 'react';
import { useStore } from '@/src/context/StoreContext';
import { InventoryItem } from '@/src/types/store';

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
            category: 'Otros',
            aisle: 'Varios',
            isCustom: true
        };
        saveStore({ ...store, inventory: [...inventory, newItem] });
    };

    const removeCustomItem = (id: string) => {
        const newInventory = inventory.filter(item => item.id !== id);
        saveStore({ ...store, inventory: newInventory });
    };

    const resetList = () => {
        if (confirm('¿Reiniciar todo el stock a Nivel 1 (Rojo)?')) {
            const newInventory = inventory.map(item => ({ ...item, level: 1 }));
            saveStore({ ...store, inventory: newInventory });
        }
    };

    // UI Helpers
    const getStockMeterHtml = (level: number) => {
        const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-400', 'bg-blue-500'];
        const idx = Math.max(0, Math.min(level - 1, 3));
        return (
            <div className="flex gap-1 mb-1">
                {[1, 2, 3, 4].map(v => (
                    <div
                        key={v}
                        className={`h-1.5 w-4 rounded-full transition-all ${v <= level ? colors[idx] : 'bg-slate-100'}`}
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
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            {/* Tabs Control */}
            <div className="p-4 bg-white border-b border-slate-100 sticky top-0 z-20">
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button
                        onClick={() => setActiveTab('shopping')}
                        className={`flex-1 py-3 rounded-xl text-xs font-black tracking-widest uppercase transition-all ${activeTab === 'shopping' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}
                    >
                        Lista de Compras
                    </button>
                    <button
                        onClick={() => setActiveTab('inventory')}
                        className={`flex-1 py-3 rounded-xl text-xs font-black tracking-widest uppercase transition-all ${activeTab === 'inventory' ? 'bg-white text-primary shadow-sm' : 'text-slate-400'}`}
                    >
                        Mi Inventario
                    </button>
                </div>
            </div>

            <main className="p-4 space-y-6 animate-in fade-in duration-500">
                {activeTab === 'shopping' ? (
                    <div className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">🛒 Lista de Compras</h3>
                            <div className="size-10 bg-blue-50 rounded-2xl flex items-center justify-center text-primary">
                                <span className="material-symbols-outlined text-xl">shopping_cart</span>
                            </div>
                        </div>

                        <div className="flex justify-between items-center mb-8 bg-slate-50 p-4 rounded-3xl border border-slate-100/50">
                            <button
                                onClick={resetList}
                                className="bg-red-50 text-red-500 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                            >
                                Reiniciar Ciclo
                            </button>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={showAllInventory}
                                    onChange={(e) => setShowAllInventory(e.target.checked)}
                                    className="size-5 rounded-lg border-2 border-slate-200 text-primary focus:ring-primary/20"
                                />
                                <span className="text-[10px] text-slate-400 font-black uppercase tracking-tight">Mostrar todo</span>
                            </label>
                        </div>

                        <div className="space-y-8">
                            {Object.entries(groupItems(shoppingList, 'aisle')).sort().map(([group, items]) => (
                                <div key={group} className="space-y-4">
                                    <h3 className="text-[10px] font-black text-primary tracking-[0.2em] uppercase pl-2 flex items-center gap-2">
                                        <span className="size-1.5 bg-primary rounded-full"></span>
                                        {group}
                                    </h3>
                                    <div className="space-y-3">
                                        {items.map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-3xl border border-slate-100/50 group hover:border-primary/20 transition-all">
                                                <div className="flex-1" onClick={() => setSelectedItemForStatus(item)}>
                                                    {getStockMeterHtml(item.level)}
                                                    <p className="font-bold text-slate-800 leading-none">{item.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold mt-1">{item.qty}</p>
                                                </div>
                                                <button
                                                    onClick={() => updateItemLevel(item.id, 4)}
                                                    className="bg-primary text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
                                                >
                                                    Comprar 🛒
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {shoppingList.length === 0 && (
                                <div className="py-20 text-center">
                                    <span className="material-symbols-outlined text-4xl text-slate-200 mb-4">task_alt</span>
                                    <p className="text-slate-400 font-bold">¡Todo en orden! No hay compras pendientes.</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-100">
                        <h3 className="text-xl font-black text-slate-800 tracking-tight mb-6">🏠 Mi Inventario</h3>

                        <div className="flex gap-2 mb-8 bg-slate-50 p-3 rounded-3xl border border-slate-100">
                            <input
                                type="text"
                                placeholder="Ej: Aceite de Coco..."
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                className="flex-1 bg-transparent px-4 py-3 focus:outline-none text-sm font-bold text-slate-700 placeholder:text-slate-300"
                            />
                            <button
                                onClick={() => { if (newItemName) { addCustomItem(newItemName); setNewItemName(''); } }}
                                className="bg-primary text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
                            >
                                Añadir
                            </button>
                        </div>

                        <div className="space-y-8">
                            {Object.entries(groupItems(fullInventory, 'category')).sort().map(([group, items]) => (
                                <div key={group} className="space-y-4">
                                    <h3 className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase pl-2">
                                        {group}
                                    </h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {items.map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-3xl border border-slate-100/50 group">
                                                <div className="flex-1" onClick={() => setSelectedItemForStatus(item)}>
                                                    {getStockMeterHtml(item.level)}
                                                    <p className="font-bold text-slate-800 leading-none">{item.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold mt-1">{item.qty}</p>
                                                </div>
                                                {item.isCustom && (
                                                    <button
                                                        onClick={() => { if (confirm('¿Eliminar?')) removeCustomItem(item.id); }}
                                                        className="size-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all active:scale-90"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* Level Selector Modal (openStatusSelector) */}
            {selectedItemForStatus && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedItemForStatus(null)}></div>
                    <div className="relative w-full max-w-lg bg-white rounded-[40px] p-8 space-y-6 animate-in slide-in-from-bottom duration-500 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">{selectedItemForStatus.name}</h3>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">NIVEL DE EXISTENCIA</p>
                            </div>
                            <button onClick={() => setSelectedItemForStatus(null)} className="size-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-all">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { lv: 1, label: 'Agotado', color: 'bg-red-50 text-red-500 border-red-100' },
                                { lv: 2, label: 'Bajo', color: 'bg-orange-50 text-orange-500 border-orange-100' },
                                { lv: 3, label: 'Suficiente', color: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
                                { lv: 4, label: 'Lleno', color: 'bg-blue-50 text-primary border-blue-100' }
                            ].map(opt => (
                                <button
                                    key={opt.lv}
                                    onClick={() => { updateItemLevel(selectedItemForStatus.id, opt.lv); setSelectedItemForStatus(null); }}
                                    className={`p-6 rounded-3xl border-2 flex flex-col items-center gap-3 active:scale-95 transition-all ${opt.lv === selectedItemForStatus.level ? `${opt.color} ring-4 ring-primary/10` : 'bg-white border-slate-50 text-slate-400'}`}
                                >
                                    <span className={`size-4 rounded-full ${opt.lv === 1 ? 'bg-red-500' : opt.lv === 2 ? 'bg-orange-500' : opt.lv === 3 ? 'bg-yellow-400' : 'bg-primary'}`}></span>
                                    <span className="text-[11px] font-black uppercase tracking-wider">{opt.label}</span>
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
