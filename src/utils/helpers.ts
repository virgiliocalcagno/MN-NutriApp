import { MealItem, InventoryItem } from '../types/store';

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

export const calculatePantryStats = (items: InventoryItem[]) => {
    const homeItems = items.filter(i => i.level >= 3);
    const stats = {
        total: homeItems.length,
        lowStock: homeItems.filter(i => i.level === 3).length,
    };
    return stats;
};

export const getPantryItemsForDisplay = (items: InventoryItem[]) => {
    const categories = ['Proteínas', 'Carbohidratos', 'Frutas y Verduras', 'Lácteos', 'Grasas', 'Cereales', 'Panadería', 'Bebidas', 'Gral'];
    const homeItems = items.filter(i => i.level >= 3);

    return categories.map((cat, idx) => {
        const catItems = homeItems.filter(i => i.category === cat || (cat === 'Gral' && !['Proteínas', 'Carbohidratos', 'Frutas y Verduras', 'Lácteos', 'Grasas'].includes(i.category)));
        const total = catItems.length;
        const filled = catItems.filter(i => i.level === 4).length;
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
    'pollo': { en: 'Chicken', cat: 'Carnes y Pescados' }, 'pechuga': { en: 'Chicken', cat: 'Carnes y Pescados' }, 'muslo': { en: 'Chicken', cat: 'Carnes y Pescados' },
    'alitas': { en: 'Chicken', cat: 'Carnes y Pescados' },
    'arroz': { en: 'Rice', cat: 'Cereales y Granos' },
    'huevo': { en: 'Egg', cat: 'Lácteos y Huevos' }, 'huevos': { en: 'Egg', cat: 'Lácteos y Huevos' }, 'claras': { en: 'Egg', cat: 'Lácteos y Huevos' },
    'leche': { en: 'Milk', cat: 'Lácteos y Huevos' }, 'leche descremada': { en: 'Milk', cat: 'Lácteos y Huevos' },
    'manzana': { en: 'Apple', cat: 'Frutas' },
    'banana': { en: 'Banana', cat: 'Frutas' }, 'guineo': { en: 'Banana', cat: 'Frutas' },
    'platano': { en: 'Banana', cat: 'Tubérculos' }, 'platano verde': { en: 'Banana', cat: 'Tubérculos' }, 'platano maduro': { en: 'Banana', cat: 'Tubérculos' },
    'pan': { en: 'Bread', cat: 'Panadería y Tortillas' }, 'tostada': { en: 'Bread', cat: 'Panadería y Tortillas' },
    'pan pita': { en: 'Bread', cat: 'Panadería y Tortillas' }, 'pan pita integral': { en: 'Bread', cat: 'Panadería y Tortillas' },
    'tortilla': { en: 'Bread', cat: 'Panadería y Tortillas' }, 'tortilla integral': { en: 'Bread', cat: 'Panadería y Tortillas' },
    'casabe': { en: 'Bread', cat: 'Panadería y Tortillas' },
    'atun': { en: 'Tuna', cat: 'Carnes y Pescados' },
    'carne': { en: 'Beef', cat: 'Carnes y Pescados' }, 'res': { en: 'Beef', cat: 'Carnes y Pescados' }, 'bistec': { en: 'Beef', cat: 'Carnes y Pescados' },
    'pescado': { en: 'Fish', cat: 'Carnes y Pescados' }, 'tilapia': { en: 'Fish', cat: 'Carnes y Pescados' }, 'salmon': { en: 'Salmon', cat: 'Carnes y Pescados' },
    'bacalao': { en: 'Fish', cat: 'Carnes y Pescados' }, 'dorado': { en: 'Fish', cat: 'Carnes y Pescados' },
    'limon': { en: 'Lime', cat: 'Frutas' },
    'tomate': { en: 'Tomato', cat: 'Verduras y Hortalizas' },
    'papa': { en: 'Potato', cat: 'Tubérculos' }, 'patata': { en: 'Potato', cat: 'Tubérculos' },
    'batata': { en: 'Sweet Potato', cat: 'Tubérculos' },
    'auyama': { en: 'Pumpkin', cat: 'Verduras y Hortalizas' },
    'cebolla': { en: 'Onion', cat: 'Verduras y Hortalizas' },
    'ajo': { en: 'Garlic', cat: 'Aceites y Condimentos' },
    'zanahoria': { en: 'Carrot', cat: 'Verduras y Hortalizas' },
    'lechuga': { en: 'Lettuce', cat: 'Verduras y Hortalizas' },
    'queso': { en: 'Cheese', cat: 'Lácteos y Huevos' }, 'queso mozzarella': { en: 'Cheese', cat: 'Lácteos y Huevos' },
    'yogur': { en: 'Yogurt', cat: 'Lácteos y Huevos' }, 'yogurt': { en: 'Yogurt', cat: 'Lácteos y Huevos' },
    'avena': { en: 'Oats', cat: 'Cereales y Granos' },
    'quinoa': { en: 'Rice', cat: 'Cereales y Granos' },
    'brocoli': { en: 'Broccoli', cat: 'Verduras y Hortalizas' }, 'brócoli': { en: 'Broccoli', cat: 'Verduras y Hortalizas' },
    'aguacate': { en: 'Avocado', cat: 'Frutos Secos' }, 'palta': { en: 'Avocado', cat: 'Frutos Secos' },
    'fresa': { en: 'Strawberry', cat: 'Frutas' }, 'fresas': { en: 'Strawberry', cat: 'Frutas' },
    'blueberries': { en: 'Blueberries', cat: 'Frutas' },
    'melon': { en: 'Melon', cat: 'Frutas' }, 'melón': { en: 'Melon', cat: 'Frutas' },
    'sandia': { en: 'Watermelon', cat: 'Frutas' }, 'sandía': { en: 'Watermelon', cat: 'Frutas' },
    'naranja': { en: 'Orange', cat: 'Frutas' },
    'lechosa': { en: 'Papaya', cat: 'Frutas' },
    'cafe': { en: 'Coffee', cat: 'Bebidas y Suplementos' },
    'te': { en: 'Tea', cat: 'Bebidas y Suplementos' }, 'té': { en: 'Tea', cat: 'Bebidas y Suplementos' },
    'proteina': { en: 'Protein', cat: 'Bebidas y Suplementos' }, 'proteína en polvo': { en: 'Protein', cat: 'Bebidas y Suplementos' },
    'aceite': { en: 'Oil', cat: 'Aceites y Condimentos' }, 'aceite de oliva': { en: 'Oil', cat: 'Aceites y Condimentos' },
    'aceite de coco': { en: 'Coconut Oil', cat: 'Aceites y Condimentos' },
    'mantequilla': { en: 'Butter', cat: 'Lácteos y Huevos' },
    'harina': { en: 'Flour', cat: 'Cereales y Granos' },
    'azucar': { en: 'Sugar', cat: 'Aceites y Condimentos' },
    'sal': { en: 'Salt', cat: 'Aceites y Condimentos' },
    'pimienta': { en: 'Pepper', cat: 'Aceites y Condimentos' },
    'curry': { en: 'Curry', cat: 'Aceites y Condimentos' }, 'curcuma': { en: 'Turmeric', cat: 'Aceites y Condimentos' }, 'cúrcuma': { en: 'Turmeric', cat: 'Aceites y Condimentos' },
    'paprika': { en: 'Paprika', cat: 'Aceites y Condimentos' },
    'pasta': { en: 'Macaroni', cat: 'Cereales y Granos' }, 'espagueti': { en: 'Spaghetti', cat: 'Cereales y Granos' },
    'agua': { en: 'Water', cat: 'Bebidas y Suplementos' },
    'cerdo': { en: 'Pork', cat: 'Carnes y Pescados' },
    'jamon': { en: 'Ham', cat: 'Embutidos' }, 'jamón': { en: 'Ham', cat: 'Embutidos' },
    'pastrami': { en: 'Ham', cat: 'Embutidos' }, 'pastrami de pavo': { en: 'Turkey', cat: 'Embutidos' },
    'piña': { en: 'Pineapple', cat: 'Frutas' },
    'uva': { en: 'Grapes', cat: 'Frutas' },
    'frijol': { en: 'Beans', cat: 'Cereales y Granos' }, 'poroto': { en: 'Beans', cat: 'Cereales y Granos' },
    'lenteja': { en: 'Lentils', cat: 'Cereales y Granos' },
    'garbanzo': { en: 'Chickpeas', cat: 'Cereales y Granos' },
    'almendra': { en: 'Almonds', cat: 'Frutos Secos' }, 'almendras': { en: 'Almonds', cat: 'Frutos Secos' },
    'nuez': { en: 'Walnuts', cat: 'Frutos Secos' }, 'nueces': { en: 'Walnuts', cat: 'Frutos Secos' },
    'macadamia': { en: 'Macadamia', cat: 'Frutos Secos' }, 'macadamias': { en: 'Macadamia', cat: 'Frutos Secos' },
    'aceitunas': { en: 'Olives', cat: 'Frutos Secos' },
    'chocolate': { en: 'Chocolate', cat: 'Gral' },
    'miel': { en: 'Honey', cat: 'Aceites y Condimentos' },
    'edulcorante': { en: 'Sugar', cat: 'Aceites y Condimentos' },
    'pavo': { en: 'Turkey', cat: 'Carnes y Pescados' },
    'espinaca': { en: 'Spinach', cat: 'Verduras y Hortalizas' },
    'pepino': { en: 'Cucumber', cat: 'Verduras y Hortalizas' },
    'zucchini': { en: 'Zucchini', cat: 'Verduras y Hortalizas' },
    'berro': { en: 'Watercress', cat: 'Verduras y Hortalizas' },
    'repollo': { en: 'Cabbage', cat: 'Verduras y Hortalizas' },
    'col rizada': { en: 'Kale', cat: 'Verduras y Hortalizas' },
    'remolacha': { en: 'Beet', cat: 'Verduras y Hortalizas' },
    'champis': { en: 'Mushrooms', cat: 'Verduras y Hortalizas' }, 'champiñones': { en: 'Mushrooms', cat: 'Verduras y Hortalizas' },
    'galletas': { en: 'Cookies', cat: 'Panadería y Tortillas' },
    'galletas de arroz': { en: 'Rice Cakes', cat: 'Cereales y Granos' },
    'gelatina': { en: 'Jelly', cat: 'Gral' },
    'salsa bbq': { en: 'BBQ Sauce', cat: 'Aceites y Condimentos' }
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

// ... (keep previous functions)

export const syncPlanToPantry = (
    menu: Record<string, any>,
    currentInventory: InventoryItem[],
    planIngredients: string[] = []
): InventoryItem[] => {
    const existingNames = new Set(currentInventory.map(i => i.name.toLowerCase()));
    const newItems: InventoryItem[] = [];

    // Prioritize Literal Plan Ingredients (Pure from PDF)
    if (planIngredients && planIngredients.length > 0) {
        planIngredients.forEach(name => {
            const lowerName = name.toLowerCase();
            if (!existingNames.has(lowerName)) {
                // Find category in FOOD_DATA or default to Gral
                const data = Object.entries(FOOD_DATA).find(([k]) => lowerName.includes(k))?.[1];
                newItems.push({
                    id: Date.now().toString() + '-' + name.replace(/\s+/g, '_'),
                    name: name.charAt(0).toUpperCase() + name.slice(1),
                    qty: '1 Unidad',
                    level: 1,
                    category: data?.cat || 'Gral',
                    aisle: 'Pasillo Gral',
                    isCustom: false
                });
                existingNames.add(lowerName);
            }
        });
        return [...currentInventory, ...newItems];
    }

    // Fallback: Legacy description parsing (only if planIngredients is empty)
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

        // Find all matches
        const matches: string[] = [];
        Object.keys(FOOD_DATA).forEach(key => {
            if (lowerDesc.includes(key) &&
                (lowerDesc.includes(` ${key} `) || lowerDesc.startsWith(`${key} `) || lowerDesc.endsWith(` ${key}`) || lowerDesc === key)) {
                matches.push(key);
            }
        });

        // Filter out redundant sub-matches (e.g., "aceite" if "aceite de coco" is present)
        const refinedMatches = matches.filter(m => !matches.some(other => other !== m && other.includes(m)));

        refinedMatches.forEach(key => {
            if (!existingNames.has(key)) {
                const data = FOOD_DATA[key];
                newItems.push({
                    id: Date.now().toString() + '-' + key,
                    name: key.charAt(0).toUpperCase() + key.slice(1),
                    qty: '1 Unidad',
                    level: 1, // Start as Out/Agotado so they appear in Shopping List
                    category: data.cat,
                    aisle: 'Pasillo Gral',
                    isCustom: false
                });
                existingNames.add(key);
            }
        });
    });

    return [...currentInventory, ...newItems];
};
