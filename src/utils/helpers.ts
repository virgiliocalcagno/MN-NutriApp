import { MealItem } from '../types/store';

export const ORDEN_COMIDAS = ["DESAYUNO", "MERIENDA_AM", "ALMUERZO", "MERIENDA_PM", "CENA"];

export const normalizeMealName = (name: string) => name.replace(/_/g, ' ');

const getIconForMeal = (name: string) => {
    const n = name.toUpperCase();
    if (n.includes('DESAYUNO')) return 'coffee';
    if (n.includes('ALMUERZO')) return 'restaurant';
    if (n.includes('CENA')) return 'spa';
    if (n.includes('MERIENDA')) return 'bakery_dining';
    return 'restaurant_menu';
};

export const sortMeals = (menu: Record<string, string>) => {
    if (!menu) return [];
    return Object.entries(menu).sort((a, b) => {
        const idxA = ORDEN_COMIDAS.indexOf(a[0].toUpperCase().replace(/\s+/g, '_'));
        const idxB = ORDEN_COMIDAS.indexOf(b[0].toUpperCase().replace(/\s+/g, '_'));
        const valA = idxA === -1 ? 99 : idxA;
        const valB = idxB === -1 ? 99 : idxB;
        return valA - valB;
    }).map(([name, description]) => ({
        id: name,
        name: normalizeMealName(name),
        time: '',
        description,
        kcal: 0,
        completed: false,
        icon: getIconForMeal(name)
    }));
};

const getIconForCategory = (cat: string) => {
    switch (cat) {
        case 'Proteínas': return 'set_meal';
        case 'Carbohidratos': return 'grain';
        case 'Vegetales': return 'eco';
        case 'Frutas y Verduras': return 'eco'; // Mapped
        case 'Grasas': return 'oil_barrel';
        case 'Lácteos': return 'water_drop';
        case 'Frutas': return 'nutrition';
        case 'Bebidas': return 'local_bar';
        case 'Cereales': return 'breakfast_dining';
        case 'Panadería': return 'bakery_dining';
        default: return 'kitchen';
    }
};

export const calculatePantryStats = (items: MealItem[]) => {
    const homeItems = items.filter(i => i.lv >= 3);
    const stats = {
        total: homeItems.length,
        lowStock: homeItems.filter(i => i.lv === 3).length,
    };
    return stats;
};

export const getPantryItemsForDisplay = (items: MealItem[]) => {
    const categories = ['Proteínas', 'Carbohidratos', 'Frutas y Verduras', 'Lácteos', 'Grasas', 'Cereales', 'Panadería', 'Bebidas', 'Gral'];
    // Show ALL items if they exist in store, or filter by logic? 
    // User wants to see everything in Pantry list, even if empty (level 1/0 UI).
    // But usually HomeView summary only shows what is available. 
    // Let's keep HomeView strict (lv >= 3) but ShoppingView lenient.

    // For Home View Summary:
    const homeItems = items.filter(i => i.lv >= 3);

    return categories.map((cat, idx) => {
        const catItems = homeItems.filter(i => i.cat === cat || (cat === 'Gral' && !['Proteínas', 'Carbohidratos', 'Frutas y Verduras', 'Lácteos', 'Grasas'].includes(i.cat)));
        const total = catItems.length;
        const filled = catItems.filter(i => i.lv === 4).length;
        let percentage = total > 0 ? Math.round((filled / total) * 100) : 0;

        let status = 'DISPONIBLE';
        let color = 'bg-green-500';

        if (total === 0) { status = 'VACÍO'; percentage = 0; color = 'bg-slate-300'; }
        else if (percentage < 30) { status = 'STOCK BAJO'; color = 'bg-orange-500'; }
        else if (percentage < 70) { status = 'DISPONIBLE'; color = 'bg-blue-500'; }
        else { status = 'LLENO'; color = 'bg-green-600'; }

        return {
            id: String(idx),
            name: cat,
            status,
            percentage,
            color,
            icon: getIconForCategory(cat)
        };
    }).filter(c => c.percentage > 0 || c.name === 'Gral');
};

// Expanded Dictionary with Category
export const FOOD_DATA: Record<string, { en: string, cat: string }> = {
    'pollo': { en: 'Chicken', cat: 'Proteínas' }, 'pechuga': { en: 'Chicken', cat: 'Proteínas' }, 'muslo': { en: 'Chicken', cat: 'Proteínas' },
    'arroz': { en: 'Rice', cat: 'Cereales' },
    'huevo': { en: 'Egg', cat: 'Proteínas' }, 'huevos': { en: 'Egg', cat: 'Proteínas' },
    'leche': { en: 'Milk', cat: 'Lácteos' },
    'manzana': { en: 'Apple', cat: 'Frutas y Verduras' },
    'banana': { en: 'Banana', cat: 'Frutas y Verduras' }, 'platano': { en: 'Banana', cat: 'Frutas y Verduras' },
    'pan': { en: 'Bread', cat: 'Panadería' }, 'tostada': { en: 'Bread', cat: 'Panadería' },
    'atun': { en: 'Tuna', cat: 'Proteínas' },
    'carne': { en: 'Beef', cat: 'Proteínas' }, 'res': { en: 'Beef', cat: 'Proteínas' }, 'bistec': { en: 'Beef', cat: 'Proteínas' },
    'pescado': { en: 'Fish', cat: 'Proteínas' }, 'tilapia': { en: 'Fish', cat: 'Proteínas' }, 'salmon': { en: 'Salmon', cat: 'Proteínas' },
    'limon': { en: 'Lime', cat: 'Frutas y Verduras' },
    'tomate': { en: 'Tomato', cat: 'Frutas y Verduras' },
    'papa': { en: 'Potato', cat: 'Frutas y Verduras' }, 'patata': { en: 'Potato', cat: 'Frutas y Verduras' },
    'cebolla': { en: 'Onion', cat: 'Frutas y Verduras' },
    'ajo': { en: 'Garlic', cat: 'Frutas y Verduras' },
    'zanahoria': { en: 'Carrot', cat: 'Frutas y Verduras' },
    'lechuga': { en: 'Lettuce', cat: 'Frutas y Verduras' },
    'queso': { en: 'Cheese', cat: 'Lácteos' },
    'yogur': { en: 'Yogurt', cat: 'Lácteos' },
    'avena': { en: 'Oats', cat: 'Cereales' },
    'brocoli': { en: 'Broccoli', cat: 'Frutas y Verduras' },
    'aguacate': { en: 'Avocado', cat: 'Grasas' }, 'palta': { en: 'Avocado', cat: 'Grasas' },
    'fresa': { en: 'Strawberry', cat: 'Frutas y Verduras' },
    'cafe': { en: 'Coffee', cat: 'Bebidas' },
    'te': { en: 'Tea', cat: 'Bebidas' },
    'aceite': { en: 'Oil', cat: 'Grasas' },
    'mantequilla': { en: 'Butter', cat: 'Grasas' },
    'harina': { en: 'Flour', cat: 'Gral' },
    'azucar': { en: 'Sugar', cat: 'Gral' },
    'sal': { en: 'Salt', cat: 'Gral' },
    'pimienta': { en: 'Pepper', cat: 'Gral' },
    'pasta': { en: 'Macaroni', cat: 'Cereales' }, 'espagueti': { en: 'Spaghetti', cat: 'Cereales' },
    'agua': { en: 'Water', cat: 'Bebidas' },
    'cerdo': { en: 'Pork', cat: 'Proteínas' },
    'jamon': { en: 'Ham', cat: 'Proteínas' },
    'piña': { en: 'Pineapple', cat: 'Frutas y Verduras' },
    'naranja': { en: 'Orange', cat: 'Frutas y Verduras' },
    'uva': { en: 'Grapes', cat: 'Frutas y Verduras' },
    'frijol': { en: 'Beans', cat: 'Proteínas' }, 'poroto': { en: 'Beans', cat: 'Proteínas' },
    'lenteja': { en: 'Lentils', cat: 'Proteínas' },
    'garbanzo': { en: 'Chickpeas', cat: 'Proteínas' },
    'almendra': { en: 'Almonds', cat: 'Grasas' },
    'nuez': { en: 'Walnuts', cat: 'Grasas' },
    'chocolate': { en: 'Chocolate', cat: 'Gral' },
    'miel': { en: 'Honey', cat: 'Gral' },
    'vino': { en: 'Red Wine', cat: 'Bebidas' },
    'cerveza': { en: 'Beer', cat: 'Bebidas' }
};

export const getProductImage = (name: string, category: string) => {
    const clean = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, "").split(' ')[0];

    const data = FOOD_DATA[clean];
    if (data && data.en) {
        return `https://www.themealdb.com/images/ingredients/${data.en}.png`;
    }

    switch (category) {
        case 'Proteínas': return 'https://images.unsplash.com/photo-1627483262268-9c96d8a3189e?auto=format&fit=crop&w=200&q=80';
        case 'Carbohidratos': return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=200&q=80';
        case 'Vegetales':
        case 'Frutas y Verduras': return 'https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=200&q=80';
        case 'Frutas': return 'https://images.unsplash.com/photo-1519999482648-25049ddd37b1?auto=format&fit=crop&w=200&q=80';
        case 'Lácteos': return 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=200&q=80';
        case 'Grasas': return 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=200&q=80';
        case 'Bebidas': return 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=200&q=80';
        case 'Panadería': return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=200&q=80';
        case 'Cereales': return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=200&q=80';
        default: return 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=200&q=80';
    }
};

export const syncPlanToPantry = (menu: Record<string, any>, currentItems: MealItem[]): MealItem[] => {
    const existingNames = new Set(currentItems.map(i => i.n.toLowerCase()));
    const newItems: MealItem[] = [];

    // Flatten menu descriptions (menu is Record<DAY, Record<MEAL, DESC>> or similar)
    // Check HomeView: store.menu is Record<string, any>.
    // Usually it's: { "LUNES": { "DESAYUNO": "..." } } or just flat?
    // Let's assume values are objects with descriptions.

    const allDescriptions: string[] = [];
    Object.values(menu).forEach((dayMenu: any) => {
        if (typeof dayMenu === 'object') {
            Object.values(dayMenu).forEach((mealDesc: any) => {
                if (typeof mealDesc === 'string') allDescriptions.push(mealDesc);
            });
        }
    });

    allDescriptions.forEach(desc => {
        const lowerDesc = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        Object.keys(FOOD_DATA).forEach(key => {
            // Match whole word to avoid false positives (e.g. "te" in "tomate")
            // Simple regex: boundary or space
            if ((lowerDesc.includes(` ${key} `) || lowerDesc.startsWith(`${key} `) || lowerDesc.endsWith(` ${key}`) || lowerDesc === key) && !existingNames.has(key)) {

                const data = FOOD_DATA[key];
                newItems.push({
                    id: Date.now().toString() + '-' + key,
                    n: key.charAt(0).toUpperCase() + key.slice(1),
                    q: '1 Unidad',
                    lv: 4, // Default to Full so they are visible
                    cat: data.cat,
                    p: 'Gral',
                    b: false
                });
                existingNames.add(key);
            }
        });
    });

    return [...currentItems, ...newItems];
};
