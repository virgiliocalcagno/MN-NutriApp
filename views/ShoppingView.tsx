import React, { useState } from 'react';
import { useStore } from '../src/context/StoreContext';
import { MealItem } from '../src/types/store';
import { getProductImage, syncPlanToPantry } from '../src/utils/helpers';

const CATEGORIES = ['Panadería', 'Proteínas', 'Frutas y Verduras', 'Lácteos', 'Grasas', 'Bebidas', 'Gral', 'Otros', 'Cereales'];

const ShoppingView: React.FC<{ setView: (v: any) => void }> = ({ setView }) => {
    const { store, saveStore } = useStore();
    const [activeTab, setActiveTab] = useState<'shopping' | 'pantry'>('pantry');
    const [searchTerm, setSearchTerm] = useState('');

    // Add Item State
    const [isAdding, setIsAdding] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemDesc, setNewItemDesc] = useState('1 Unidad');
    const [newItemCat, setNewItemCat] = useState('Gral');

    // UI Level Mapping: 0=Agotado, 1=Bajo, 2=Bien, 3=Lleno
    // Store Level Mapping: 1=Agotado, 2=Bajo, 3=Bien, 4=Lleno (Legacy + 1)

    const getUiLevel = (itemLv: number) => {
        if (itemLv <= 1) return 0;
        if (itemLv >= 4) return 3;
        return itemLv - 1;
    };

    const getStoreLevelFromUi = (uiLv: number) => {
        return uiLv + 1;
    };

    const updateItemLevel = (index: number, newUiLevel: number) => {
        const newItems = [...store.items];
        let storeLv = getStoreLevelFromUi(newUiLevel);
        if (storeLv < 1) storeLv = 1;
        if (storeLv > 4) storeLv = 4;
        newItems[index].lv = storeLv;
        saveStore({ ...store, items: newItems });
    };

    const handleAddItem = () => {
        if (!newItemName.trim()) return;
        const newItem: MealItem = {
            id: Date.now().toString(),
            n: newItemName,
            q: newItemDesc,
            cat: newItemCat,
            lv: 4,
            icon: 'inventory_2',
            percentage: 0,
            status: 'DISPONIBLE',
            color: 'bg-green-500',
            b: false,
            p: 'Gral'
        };

        if (activeTab === 'shopping') {
            newItem.lv = 1;
        } else {
            newItem.lv = 4;
        }

        saveStore({ ...store, items: [...store.items, newItem] });
        setNewItemName('');
        setNewItemDesc('');
        setIsAdding(false);
    };

    const deleteItem = (index: number) => {
        if (window.confirm("¿Eliminar este ítem?")) {
            const newItems = store.items.filter((_, i) => i !== index);
            saveStore({ ...store, items: newItems });
        }
    }

    const handleSync = () => {
        if (window.confirm("¿Sincronizar despensa con el plan nutricional? Esto agregará productos faltantes.")) {
            const newItems = syncPlanToPantry(store.menu || {}, store.items);
            saveStore({ ...store, items: newItems });
            alert(`Se agregaron ${newItems.length - store.items.length} productos nuevos del plan.`);
        }
    };

    // Status Helper
    const getStatusConfig = (uiLevel: number) => {
        switch (uiLevel) {
            case 0: return { label: 'AGOTADO', color: 'bg-red-100 text-red-600', dot: 'bg-red-500' };
            case 1: return { label: 'POCO', color: 'bg-orange-100 text-orange-600', dot: 'bg-orange-500' };
            case 2: return { label: 'BIEN', color: 'bg-blue-100 text-blue-600', dot: 'bg-blue-500' };
            case 3: return { label: 'LLENO', color: 'bg-green-100 text-green-600', dot: 'bg-green-500' };
            default: return { label: 'AGOTADO', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-500' };
        }
    };

    // Filter & Group
    const filteredItems = store.items
        .map((item, idx) => ({ ...item, originalIdx: idx, uiLevel: getUiLevel(item.lv) }))
        .filter(item => {
            if (activeTab === 'shopping') return item.uiLevel <= 1; // Agotado or Poco
            return true; // Pantry shows ALL
        })
        .filter(item => item.n.toLowerCase().includes(searchTerm.toLowerCase()));

    const groupedItems = filteredItems.reduce((acc, item) => {
        const cat = item.cat || 'Otros';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {} as Record<string, typeof filteredItems>);

    return (
        <div className="flex flex-col min-h-screen bg-[#f5f7fa] font-sans text-slate-800">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-white px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => setView('home')} className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-700">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="text-xl font-bold text-slate-900">MN-NutriApp Pro</h1>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleSync} className="p-2 rounded-full hover:bg-slate-100 text-slate-700" title="Sincronizar con Plan">
                        <span className="material-symbols-outlined">sync</span>
                    </button>
                    {/* Search implementation requires input mode, keeping simple button for now or enabling search state */}
                    <button className="p-2 rounded-full hover:bg-slate-100 text-slate-700 relative">
                        <span className="material-symbols-outlined">notifications</span>
                        <span className="absolute top-2 right-2 size-2 bg-slate-900 rounded-full"></span>
                    </button>
                    <button onClick={() => setIsAdding(!isAdding)} className="p-2 rounded-full hover:bg-slate-100 text-slate-700">
                        <span className="material-symbols-outlined">add</span>
                    </button>
                </div>
            </header>

            {/* Tabs (Segmented Control) */}
            <div className="px-4 py-4 bg-white border-b border-slate-100 sticky top-[60px] z-10">
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button
                        onClick={() => setActiveTab('pantry')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'pantry'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Despensa
                    </button>
                    <button
                        onClick={() => setActiveTab('shopping')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'shopping'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Lista de Compras
                    </button>
                </div>
            </div>

            {/* Add Item Form */}
            {isAdding && (
                <div className="p-4 m-4 bg-white rounded-2xl shadow-sm border border-slate-100 animate-in slide-in-from-top-2">
                    <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase">Nuevo Producto</h3>
                    <div className="flex flex-col gap-3">
                        <input
                            type="text"
                            placeholder="Nombre (ej: Pechuga de Pollo)"
                            className="p-3 bg-slate-50 rounded-xl w-full focus:outline-none focus:ring-2 ring-blue-500/20 font-medium"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                        />
                        <div className="flex gap-3">
                            <input
                                type="text"
                                placeholder="Detalle (ej: 500g • Congelado)"
                                className="p-3 bg-slate-50 rounded-xl w-full focus:outline-none focus:ring-2 ring-blue-500/20 text-sm"
                                value={newItemDesc}
                                onChange={(e) => setNewItemDesc(e.target.value)}
                            />
                            <select
                                className="p-3 bg-slate-50 rounded-xl w-2/3 focus:outline-none focus:ring-2 ring-blue-500/20 text-sm"
                                value={newItemCat}
                                onChange={(e) => setNewItemCat(e.target.value)}
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <button onClick={handleAddItem} className="bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-600/30 active:scale-95 transition-all">
                            Guardar Producto
                        </button>
                    </div>
                </div>
            )}

            {/* List Content */}
            <main className="flex-1 p-4 pt-2 space-y-6 pb-24">
                {Object.keys(groupedItems).length > 0 ? (
                    CATEGORIES.filter(cat => groupedItems[cat]).map(cat => (
                        <div key={cat}>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1">
                                {cat}
                            </h3>
                            <div className="space-y-3">
                                {groupedItems[cat].map((item) => {
                                    const status = getStatusConfig(item.uiLevel);

                                    return (
                                        <div key={item.originalIdx} className="bg-white p-3 rounded-3xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] border border-slate-50 flex items-center justify-between gap-3 relative overflow-hidden group">
                                            {/* Left: Image (Large Square) */}
                                            <div className="size-20 bg-slate-100 rounded-2xl overflow-hidden shrink-0 relative">
                                                <img
                                                    src={getProductImage(item.n, item.cat)}
                                                    alt={item.n}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=IMG' }}
                                                />
                                            </div>

                                            {/* Center: Info */}
                                            <div className="flex-1 min-w-0 pr-1">
                                                <h4 className="font-bold text-slate-900 text-lg truncate leading-tight mb-1 capitalize">{item.n.toLowerCase()}</h4>
                                                <p className="text-xs text-slate-400 font-medium mb-2 truncate">{item.q || 'Sin detalle'}</p>

                                                {/* Status Badge (Pill) */}
                                                <div className={`inline-flex items-center px-2 py-1 rounded-md ${status.color}`}>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide">{status.label}</span>
                                                </div>
                                            </div>

                                            {/* Right: Stepper (Blue plus) */}
                                            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl">
                                                <button
                                                    onClick={() => updateItemLevel(item.originalIdx, item.uiLevel - 1)}
                                                    className="size-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 active:scale-90 transition-all hover:text-red-500"
                                                >
                                                    <span className="material-symbols-outlined text-base">remove</span>
                                                </button>

                                                <span className="w-6 text-center font-bold text-lg text-slate-800">{item.uiLevel}</span>

                                                <button
                                                    onClick={() => updateItemLevel(item.originalIdx, item.uiLevel + 1)}
                                                    className="size-8 flex items-center justify-center bg-blue-600 rounded-lg shadow-sm text-white active:scale-90 transition-all hover:bg-blue-700"
                                                >
                                                    <span className="material-symbols-outlined text-base">add</span>
                                                </button>
                                            </div>

                                            {/* Optional Delete (Hover or Long Press in real app, here hidden until needed) */}
                                            <button
                                                onClick={() => deleteItem(item.originalIdx)}
                                                className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-full p-1"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">inventory_2</span>
                        <p className="font-medium text-slate-600">No hay productos aquí.</p>
                        <button onClick={handleSync} className="mt-4 text-blue-600 font-bold text-sm bg-blue-50 px-4 py-2 rounded-xl">Sincronizar Plan</button>
                    </div>
                )}
            </main>

            {/* Floating Action Button (Blue Plus) - Bottom Right as per image 1? 
                Image 1 has a large blue + button at bottom right. */}
            <button
                onClick={() => setIsAdding(true)}
                className="fixed bottom-6 right-6 size-16 bg-blue-600 rounded-full shadow-2xl shadow-blue-600/40 flex items-center justify-center text-white active:scale-90 transition-transform z-30"
            >
                <span className="material-symbols-outlined text-3xl">add</span>
            </button>
        </div>
    );
};

export default ShoppingView;
