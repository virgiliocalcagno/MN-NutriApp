export interface Profile {
    paciente: string;
    doctor: string;
    edad: string;
    peso: string;
    sexo: string;
    pesoIdeal: string;
    metaAgua: number;
    estatura: string;
    cintura: string;
    emergencia: string;
    observaciones: string;
    sangre: string;
    alergias: string;
    objetivos: string[];
    comorbilidades: string[];
}

export interface MealItem {
    id: string;
    n: string; // Name
    q: string; // Quantity
    lv: number; // Stock Level (1-4)
    cat: string; // Category
    aisle: string; // Purchase Category (Pasillo)
    b: boolean; // Bought?
    icon?: string;
    status?: string;
    color?: string;
    percentage?: number;
}

export interface Exercise {
    n: string;
    i: string;
    link?: string;
}

export interface WaterEntry {
    id: string;
    type: string;
    amount: number;
    time: string;
}

export interface InventoryItem {
    id: string;
    name: string;
    qty: string;
    level: number; // 1: Out, 2: Low, 3: OK, 4: Full
    category: string;
    aisle: string;
    isCustom?: boolean;
}

export interface Store {
    water: number;
    waterHistory: WaterEntry[];
    waterGoal: number;
    waterUnits: string;
    menu: Record<string, any>; // Flexible menu structure
    items: MealItem[];
    exercises: Record<string, Exercise[]>;
    doneEx: Record<string, number[]>;
    doneMeals: Record<string, string[]>;
    inventory: InventoryItem[];
    selectedDay: string;
    schedule: Record<string, string> | null;
    profile: Profile;
    historial: string[];
    medals: { silver: number; gold: number };
    locks: { perfil: boolean; compras: boolean; existencia: boolean };
    calories: number;
    caloriesTarget: number;
    lastScan: any | null;
    lastUpdateDate: string; // ISO date string YYYY-MM-DD
}

export const initialStore: Store = {
    water: 0,
    waterHistory: [],
    waterGoal: 2800,
    waterUnits: 'ml',
    menu: {},
    items: [],
    exercises: {},
    doneEx: {},
    doneMeals: {},
    inventory: [],
    selectedDay: '',
    schedule: null,
    profile: {
        paciente: '', doctor: '', edad: '', peso: '', sexo: 'Hombre', pesoIdeal: '',
        metaAgua: 2800, estatura: '', cintura: '', emergencia: '', observaciones: '',
        sangre: '', alergias: '', objetivos: [], comorbilidades: []
    },
    historial: [],
    medals: { silver: 0, gold: 0 },
    locks: { perfil: true, compras: true, existencia: true },
    calories: 0,
    caloriesTarget: 2000,
    lastScan: null,
    lastUpdateDate: new Date().toISOString().split('T')[0]
};
