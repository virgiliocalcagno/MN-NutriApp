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
    p: string; // Purchase Category
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

export interface Store {
    water: number;
    menu: Record<string, any>; // Flexible menu structure
    items: MealItem[];
    exercises: Record<string, Exercise[]>;
    doneEx: Record<string, number[]>;
    selectedDay: string;
    schedule: Record<string, string> | null;
    profile: Profile;
    historial: string[];
    medals: { silver: number; gold: number };
    locks: { perfil: boolean; compras: boolean; existencia: boolean };
    calories: number;
    caloriesTarget: number;
    lastScan: any | null;
}

export const initialStore: Store = {
    water: 0,
    menu: {},
    items: [],
    exercises: {},
    doneEx: {},
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
    calories: 1200,
    caloriesTarget: 2000,
    lastScan: null
};
