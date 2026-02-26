// ─── S1: Identificación (Datos Generales) ───
export interface PerfilBiometrico {
    nombre_completo?: string;
    doctor?: string;
    edad?: string;
    estatura_cm?: string;
    genero?: string;
}

// ─── S2: Historial Clínico y Comorbilidades ───
export interface DiagnosticoClinico {
    diagnostico_nutricional?: string;
    comorbilidades?: string[];
    alergias?: string[];
    sangre?: string;
    medicamentos_actuales?: string[];
    suplementacion?: string[];
    observaciones_medicas?: string[];
}

// ─── S3: Objetivos y Metas del Plan ───
export interface MetasYObjetivos {
    peso_ideal_meta?: string;
    control_peso_inmediato?: string;
    control_grasa_kg?: string;
    control_musculo_kg?: string;
    pbf_objetivo_porcentaje?: string;
    vet_kcal_diarias?: number;
    agua_objetivo_ml?: number;
    objetivos_generales?: string[];
}

// ─── S4: Composición Corporal (InBody) ───
export interface AnalisisInBody {
    fecha_test?: string;
    peso_actual_kg?: string;
    smm_masa_musculo_esqueletica_kg?: string;
    pbf_porcentaje_grasa_corporal?: string;
    grasa_visceral_nivel?: string;
    inbody_score?: string;
    tasa_metabolica_basal_kcal?: string;
}

// ─── S5: Prescripción de Ejercicio ───
export interface PrescripcionEjercicio {
    fcm_latidos_min?: string;
    fc_promedio_entrenamiento?: string;
    fuerza_dias_semana?: string;
    fuerza_minutos_sesion?: string;
    aerobico_dias_semana?: string;
    aerobico_minutos_sesion?: string;
}

// ─── S6: Histórico Antropométrico (Evolución) ───
export interface HistoricoAntropometrico {
    fecha: string;
    peso_lbs: string;
    cintura_cm?: string;
    cuello_cm?: string;
    brazo_der_cm?: string;
    brazo_izq_cm?: string;
}

// ─── S7: Control de Expediente ───
export interface ExpedienteControl {
    usuario_id?: string;
    ultima_actualizacion?: string;
    campos_completados?: number;
    campos_pendientes?: number;
}

// ─── Profile Compuesto (7 Secciones) ───
export interface Profile {
    perfil_biometrico?: PerfilBiometrico;
    diagnostico_clinico?: DiagnosticoClinico;
    metas_y_objetivos?: MetasYObjetivos;
    analisis_inbody_actual?: AnalisisInBody;
    prescripcion_ejercicio?: PrescripcionEjercicio;
    historico_antropometrico?: HistoricoAntropometrico[];
    expediente_control?: ExpedienteControl;
    emergencia?: string;
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

export interface DocumentRecord {
    id: string;
    name: string;
    type: 'FICHA_MEDICA' | 'PLAN_NUTRICIONAL' | 'INBODY' | 'AUTO';
    date: string;
    data: any; // AIResponse result
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
    profiles: Record<string, Partial<Store>>; // Multi-user isolation
    firebaseConfig?: { geminiApiKey: string };
    planIngredients?: string[]; // Literal shopping list from AI
    notifications: {
        enabled: boolean;
        mode: 'sound' | 'vibrate' | 'both';
        categories: {
            meds: boolean;
            meals: boolean;
            appointments: boolean;
            hydration: boolean;
        }
    };
    processedDocs: DocumentRecord[]; // Library of historical AI results
    recipeCache?: Record<string, any>; // Cache for AI-generated recipes to save tokens
    fitnessAdvice?: string; // AI security advice for routines
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
        perfil_biometrico: {},
        diagnostico_clinico: { comorbilidades: [], alergias: [], medicamentos_actuales: [], suplementacion: [], observaciones_medicas: [] },
        metas_y_objetivos: { objetivos_generales: [] },
        analisis_inbody_actual: {},
        prescripcion_ejercicio: {},
        historico_antropometrico: [],
        expediente_control: {},
        emergencia: ''
    },
    historial: [],
    medals: { silver: 0, gold: 0 },
    locks: { perfil: true, compras: true, existencia: true },
    calories: 0,
    caloriesTarget: 2000,
    lastScan: null,
    lastUpdateDate: new Date().toISOString().split('T')[0],
    profiles: {},
    firebaseConfig: { geminiApiKey: '' },
    planIngredients: [],
    notifications: {
        enabled: true,
        mode: 'both',
        categories: {
            meds: true,
            meals: true,
            appointments: true,
            hydration: true
        }
    },
    processedDocs: [],
    recipeCache: {},
    fitnessAdvice: ''
};
