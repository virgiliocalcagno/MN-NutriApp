import { GoogleGenerativeAI } from "@google/generative-ai";
import { Profile } from "../types/store";

export interface AIResponse {
  tipo_documento?: 'PLAN_NUTRICIONAL' | 'INBODY' | 'FICHA_MEDICA' | string;
  perfilAuto: Partial<Profile>;
  semana: Record<string, Record<string, string>>;
  ejercicios: Record<string, any[]>;
  compras: [string, string, number, string, string][];
  metas?: {
    calorias: number;
    agua: number;
  };
  horarios?: Record<string, string>;
}

export interface RecipeDetails {
  titulo?: string;
  kcal: number;
  ingredientes: string[];
  preparacion: { titulo: string; descripcion: string }[];
  imageUrl?: string;
  tiempo?: string;
  dificultad?: string;
  bioHack: {
    titulo: string;
    pasos: string[];
    explicacion: string;
  };
  nutrientes: {
    proteina: string;
    grasas: string;
    carbos: string;
  };
}

const INGREDIENT_TO_PRODUCT: Record<string, string> = {
  'clara de huevo': 'Huevos',
  'claras de huevo': 'Huevos',
  'yema de huevo': 'Huevos',
  'yemas de huevo': 'Huevos',
  'huevo entero': 'Huevos',
  'dientes de ajo': 'Ajo',
  'diente de ajo': 'Ajo',
  'jugo de limon': 'Limones',
  'zumo de limon': 'Limones',
  'jugo de naranja': 'Naranjas',
  'filete de salmon': 'Salmon',
  'filetes de salmon': 'Salmon',
  'filete de pescado': 'Pescado',
  'carne molida de res': 'Carne molida',
  'pollo desmechado': 'Pechuga de pollo',
  'pollo desmenuzado': 'Pechuga de pollo',
  'pechuga de pollo desmechada': 'Pechuga de pollo',
  'hojas de espinaca': 'Espinaca',
  'hojas de lechuga': 'Lechuga',
  'rodajas de tomate': 'Tomate',
  'tiras de pimiento': 'Pimiento',
  'ralladura de limon': 'Limones',
};

const normalizeCompras = (data: AIResponse): AIResponse => {
  if (!data.compras || !Array.isArray(data.compras)) return data;

  const normalized = data.compras.map(item => {
    let name = '';
    let obj: any = {};
    if (Array.isArray(item)) {
      name = item[0] || '';
      obj = { item: item[0], cantidad: item[1] || '', nivel: item[2] || 1, categoria: item[3] || '', pasillo: item[4] || '' };
    } else {
      name = (item as any).item || '';
      obj = item;
    }

    if (!name || typeof name !== 'string') return obj;
    const nameLower = name.toLowerCase().trim();
    const mapped = INGREDIENT_TO_PRODUCT[nameLower];
    if (mapped) {
      return { ...obj, item: mapped };
    }
    return obj;
  });

  const seen = new Map<string, number>();
  const deduped: any[] = [];
  for (const item of normalized) {
    if (!item.item || typeof item.item !== 'string') continue;
    const key = item.item.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, deduped.length);
    deduped.push(item);
  }

  return { ...data, compras: deduped as any };
};

const CLOUD_FUNCTION_URL = 'https://us-central1-mn-nutriapp.cloudfunctions.net/procesarNutricion';

export const processPdfWithGemini = async (
  perfil: Partial<Profile>,
  pdfPlanBase64?: string,
  pdfEvalBase64?: string,
  apiKey?: string,
  docTypeHint?: 'FICHA_MEDICA' | 'PLAN_NUTRICIONAL' | 'INBODY'
): Promise<AIResponse> => {
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      console.log(`AI Process: Usando motor estable para PDF (2.5) - Contexto: ${docTypeHint || 'AUTO'}`);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0 } });

      const currentProfileContext = perfil ? `
LO QUE YA SABEMOS DEL PACIENTE:
- Nombre: ${perfil.perfil_biometrico?.nombre_completo || 'Desconocido'}
- Metas: ${perfil.metas_y_objetivos?.objetivos_generales?.join(', ') || 'Ninguna'}
- Alergias: ${perfil.diagnostico_clinico?.alergias?.join(', ') || 'Ninguna'}
- Problemas: ${perfil.diagnostico_clinico?.comorbilidades?.join(', ') || 'Ninguna'}
- Medicinas: ${perfil.diagnostico_clinico?.medicamentos_actuales?.join(', ') || 'Ninguna'}
- InBody Anterior (Peso): ${perfil.analisis_inbody_actual?.peso_actual_kg || 'N/A'} kg
` : '';

      const promptText = `Eres un asesor de nutrición muy práctico y amable para la app MN-NutriApp. Tu trabajo es leer el PDF y organizar la información para el paciente de forma clara.

CONTEXTO DE CARGA: ${docTypeHint || 'ANÁLISIS GENERAL'}

LO QUE YA SABEMOS DEL PACIENTE:
- Metas: ${perfil.metas_y_objetivos?.objetivos_generales?.join(', ') || 'Ninguna'}
- Alergias: ${perfil.diagnostico_clinico?.alergias?.join(', ') || 'Ninguna'}
- Problemas de salud: ${perfil.diagnostico_clinico?.comorbilidades?.join(', ') || 'Ninguna'}
- Pastillas/Suplementos: ${Array.isArray(perfil.diagnostico_clinico?.suplementacion) ? perfil.diagnostico_clinico.suplementacion.join(', ') : perfil.diagnostico_clinico?.suplementacion || 'Ninguno'}
- Notas: ${perfil.diagnostico_clinico?.observaciones_medicas?.join(', ') || 'Ninguna'}

Tu tarea es extraer la información relevante según el contexto:
1. Si el contexto es PLAN_NUTRICIONAL (O "ANÁLISIS GENERAL"): Extrae todas las comidas (semana), compras y horarios.
2. Si el contexto es INBODY: Extrae Score, Peso, SMM (Músculo), PBF (Grasa), Grasa Visceral, Tasa Metabólica y metas de control de peso/grasa/músculo.
3. Si el contexto es FICHA_MEDICA: Extrae datos clínicos, comorbilidades, medicamentos y notas médicas.

RESPONDE ÚNICAMENTE CON UN JSON PURO CON ESTE FORMATO:
{
  "perfilAuto": {
    "perfil_biometrico": {
      "nombre_completo": "Nombre real del paciente encontrado en el PDF",
      "doctor": "Nombre del Doctor (si aparece)",
      "edad": "...",
      "estatura_cm": "...",
      "genero": "..."
    },
    "diagnostico_clinico": {
      "diagnostico_nutricional": "...",
      "comorbilidades": [],
      "observaciones_medicas": [],
      "medicamentos_actuales": [],
      "suplementacion": [],
      "alergias": [],
      "sangre": "..."
    },
    "metas_y_objetivos": {
      "peso_ideal_meta": "...",
      "control_peso_inmediato": "...",
      "control_grasa_kg": "...",
      "control_musculo_kg": "...",
      "pbf_objetivo_porcentaje": "...",
      "vet_kcal_diarias": 0,
      "agua_objetivo_ml": 0,
      "objetivos_generales": []
    },
    "analisis_inbody_actual": {
      "fecha_test": "...",
      "peso_actual_kg": "...",
      "smm_masa_musculo_esqueletica_kg": "...",
      "pbf_porcentaje_grasa_corporal": "...",
      "grasa_visceral_nivel": "...",
      "inbody_score": "...",
      "tasa_metabolica_basal_kcal": "..."
    },
    "prescripcion_ejercicio": {
      "fcm_latidos_min": "...",
      "fc_promedio_entrenamiento": "...",
      "fuerza_dias_semana": "...",
      "fuerza_minutos_sesion": "...",
      "aerobico_dias_semana": "...",
      "aerobico_minutos_sesion": "..."
    },
    "historico_antropometrico": [
      {
        "fecha": "YYYY-MM-DD",
        "peso_lbs": "...",
        "cintura_cm": "...",
        "cuello_cm": "...",
        "brazo_der_cm": "...",
        "brazo_izq_cm": "..."
      }
    ]
  },
  "semana": { 
    "LUNES": { 
        "DESAYUNO": "Descripción REAL extraída del desayuno para el Lunes",
        "MERIENDA_AM": "Descripción REAL extraída de la merienda",
        "ALMUERZO": "Descripción REAL extraída del almuerzo",
        "MERIENDA_PM": "Descripción REAL extraída de la merienda",
        "CENA": "Descripción REAL extraída de la cena"
    }
    // IMPORTANTE: SI EL PDF TIENE MÁS DÍAS (MARTES, MIERCOLES), AGREGALOS AQUÍ. SI SOLO ES UN SOLO MENÚ GENERAL, USA SOLO "LUNES".
  },
  "ejercicios": { "LUNES": [ {"n": "Nombre", "i": "3x12"} ] },
  "compras": [ { "item": "Producto", "cantidad": "Cantidad Literal (ej: 12 unidades, 1 Cartón, 500g)", "nivel": 1, "categoria": "Categoria", "pasillo": "Pasillo" } ],
  "horarios": { 
      "DESAYUNO": "08:30 AM",
      "MERIENDA_AM": "11:00 AM",
      "ALMUERZO": "01:30 PM",
      "MERIENDA_PM": "04:30 PM",
      "CENA": "07:30 PM" 
  },
  "tipo_documento": "${docTypeHint || 'AUTO'}"
}

IMPORTANTE: 
0. REEMPLAZA LOS EJEMPLOS MUESTRA (como "..." o "Descripción REAL") CON LA INFORMACIÓN EXACTA DEL PDF. Si un dato no existe, pon un string vacío "". ¡NUNCA devuelvas "..."!
1. NOMBRE DEL PACIENTE: Haz un OCR profundo al encabezado del documento y busca textos grandes (ej: "Virgilio Augusto Calcagno Surun", "Dra. Marlin Núñez"). Coloca este nombre ESTRICTAMENTE en "perfil_biometrico.nombre_completo".
2. PLAN_NUTRICIONAL: Extrae todo el MENÚ EXACTO en "semana". Si el PDF no tiene una Lista de Compras explícita, DEDÚCELA a partir de las recetas (ej: 1 lata de atún, 1 tortilla integral) y ponla en el array "compras".
3. HISTORIAL CLÍNICO Y PESO: Revisa cuidadosamente TODAS las tablas de "Datos Generales", "Medidas Antropométricas", "Cronología", "Comorbilidades", "Medicamentos" o "Medidas de cuerpo" que aparezcan en CUALQUIER PDF (incluso en planes nutricionales) y mételas en sus secciones (ej: 'historico_antropometrico' para las filas de cronología de peso por fecha).
4. INBODY / FICHA MÉDICA: Prioriza extraer las métricas exactas y diagnósticos según su archivo respectivo.
5. METAS Y LÍQUIDOS: Busca explícitamente frases como "Cálculo de Líquidos" o "Agua" y extrae estrictamente el número en mililitros para 'agua_objetivo_ml' (ej: 2800). Captura TODAS las recomendaciones, "Notas" al final del PDF, y metas (ej: "Retomar ejercicio", "Bajo Indice Glucemico", "Aumentar masa") estrictamente dentro de 'objetivos_generales' separadas como un array de strings.
6. TABLAS DE MEDIDAS (HISTÓRICO): ¡EXTREMADAMENTE IMPORTANTE! Cuando proceses las tablas por fecha, extrae *todas* las columnas disponibles (Cintura, Cuello, Brazo Der, Brazo Izq) por fecha y ponlas juntas con el 'peso_lbs' en los objetos de 'historico_antropometrico'. No dejes los campos de centímetros vacíos si la tabla los provee.
7. FECHAS DE HISTORIAL: Las fechas de historial DEBEN ser en formato exacto "YYYY-MM-DD" (ejemplo: "2024-11-24"). Si el documento dice "Nov/24", infiere que es el año 2024. Si dice "Agosto/25", infiere 2025. ¡Nunca dejes meses sueltos sin el AÑO correcto!`;

      const parts: any[] = [{ text: promptText }];
      if (pdfPlanBase64) parts.push({ inlineData: { mimeType: "application/pdf", data: pdfPlanBase64.replace(/^data:application\/pdf;base64,/, "") } });
      if (pdfEvalBase64) parts.push({ inlineData: { mimeType: "application/pdf", data: pdfEvalBase64.replace(/^data:application\/pdf;base64,/, "") } });

      const result = await model.generateContent(parts);
      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) return normalizeCompras(JSON.parse(jsonMatch[0]) as AIResponse);
      throw new Error("Formato inválido");
    } catch (e: any) {
      console.warn("Gemini falló, intentando Fallback...", e?.message || e?.status || e);
    }
  }

  try {
    const cleanPlan = pdfPlanBase64?.replace(/^data:application\/pdf;base64,/, "");
    const cleanEval = pdfEvalBase64?.replace(/^data:application\/pdf;base64,/, "");
    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ perfil: JSON.stringify(perfil), pdfPlan: cleanPlan, pdfEval: cleanEval })
    });
    return normalizeCompras(await response.json());
  } catch (error: any) {
    console.error("AI Critical Error:", error);
    throw error;
  }
};

export const analyzeImageWithGemini = async (base64Image: string, perfil?: any, apiKey?: string) => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    if (apiKey && apiKey.length > 20) {
      const genAI = new GoogleGenerativeAI(apiKey);
      console.log("AI Scan: Usando 2.5 Flash para imagen");
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Dime qué hay en esta foto de comida de forma muy clara y sencilla.
Para el paciente: ${perfil?.perfil_biometrico?.nombre_completo || 'Usuario'}.

Tu tarea:
1. ¿Qué plato es? Sé descriptivo.
2. ¿Le conviene comer esto? Di VERDE (sí), AMARILLO (con cuidado) o ROJO (mejor evitar).
3. Explica por qué le conviene o no, pero en palabras normales, sin mucha ciencia.
4. Dame un consejo útil y rápido sobre este plato.
5. Calcula cuántas calorías y macros tiene (aprox).

RESPONDE SOLO CON ESTE JSON:
{
  "platos": ["Nombre de la comida"],
  "semaforo": "VERDE | AMARILLO | ROJO",
  "analisis": "Explicación sencilla...",
  "bioHack": "Consejo práctico...",
  "macros": { "p": "30g", "c": "20g", "f": "15g" },
  "totalCalorias": 350
}`;

      const result = await model.generateContent([{ inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }, { text: prompt }]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    }

    const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/analizarComida', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagenBase64: cleanBase64, perfilPaciente: perfil })
    });
    return await response.json();
  } catch (error) {
    console.error("Error NutriScan:", error);
    throw error;
  }
};

export const getRecipeDetails = async (mealDesc: string, perfil?: any, apiKey?: string): Promise<RecipeDetails> => {
  const effectiveApiKey = apiKey || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
  if (effectiveApiKey && effectiveApiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(effectiveApiKey);
      console.log("AI Recipe: Usando motor 2.5 Flash para Alta Cocina");
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Eres un asistente de cocina que prepara las recetas EXACTAS del plan nutricional del paciente.

PLATO DEL MENÚ: "${mealDesc}"
PACIENTE: ${perfil?.perfil_biometrico?.nombre_completo || 'Usuario'}

═══ REGLAS ESTRICTAS ═══

1. FIDELIDAD TOTAL: Usa ÚNICAMENTE los ingredientes que aparecen en la descripción del plato. NO inventes, NO agregues, NO sustituyas ingredientes.
2. NOMBRE REAL: El título debe ser el nombre original del plato tal como está escrito en el plan. NO lo renombres con nombres de alta cocina.
3. CANTIDADES EXACTAS: Respeta las cantidades indicadas (120g, 2 unidades, 1 cdita, etc.). Si dice "vegetales libres", puedes sugerir opciones pero aclarando que son a elección.
4. PREPARACIÓN PRÁCTICA: Pasos simples y reales de cocina casera. Nada de "sous-vide", "coulis", "emulsiones", ni técnicas de restaurante.
5. Si dice "vegetales libres" o similar, listados como "Vegetales a elección (lechuga, tomate, pepino, etc.)" — NO los pongas como ingredientes fijos con cantidades.

RESPONDE CON JSON PURO:
{
  "titulo": "Nombre original del plato tal cual",
  "foto_prompt": "simple home cooked [main ingredient] plate, clean background, natural light",
  "tiempo": "20 min",
  "dificultad": "Baja",
  "kcal": 350,
  "nutrientes": { "proteina": "30g", "grasas": "8g", "carbos": "40g" },
  "ingredientes_lista": ["Ingrediente exacto con cantidad del plan"],
  "pasos_preparacion": [
    { "titulo": "Paso simple", "descripcion": "Instrucción práctica de cocina casera..." }
  ],
  "bio_hack": {
    "titulo": "CONSEJO NUTRICIONAL",
    "explicacion": "Un consejo práctico sobre cómo aprovechar este plato.",
    "pasos": ["1. Come primero los vegetales", "2. Luego la proteína", "3. Al final los carbohidratos"]
  }
}

SEMILLA DE VARIACIÓN Y CREATIVIDAD (IGNORAR PARA INGREDIENTES): ${Date.now()}-${Math.random()}
Genera una variante única y creativa de la preparación de este plato, usando enfoques de cocción o presentación distintos a los que típicamente darías, pero MANTENIENDO LOS INGREDIENTES EXACTOS.
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Sanitización profunda del JSON
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}') + 1;
      const jsonCandidate = jsonStart !== -1 ? text.substring(jsonStart, jsonEnd) : text;

      const cleanJson = jsonCandidate.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const keyword = encodeURIComponent(parsed.foto_prompt || parsed.titulo || mealDesc);
          const imageUrl = `https://source.unsplash.com/featured/800x600?food,gourmet,${keyword.replace(/%20/g, ',')}`;

          return {
            titulo: parsed.titulo,
            kcal: parsed.kcal || 0,
            tiempo: parsed.tiempo || "20 min",
            dificultad: parsed.dificultad || "Baja",
            ingredientes: parsed.ingredientes_lista || [],
            preparacion: (parsed.pasos_preparacion || []).map((p: any) =>
              typeof p === 'string' ? { titulo: "Paso", descripcion: p } : { titulo: p.titulo, descripcion: p.descripcion }
            ),
            imageUrl: imageUrl,
            bioHack: {
              titulo: parsed.bio_hack?.titulo || "CONSEJO PRÁCTICO",
              pasos: parsed.bio_hack?.pasos || [],
              explicacion: parsed.bio_hack?.explicacion || ""
            },
            nutrientes: {
              proteina: parsed.nutrientes?.proteina || "",
              grasas: parsed.nutrientes?.grasas || "",
              carbos: parsed.nutrientes?.carbos || ""
            }
          };
        } catch (innerParseError) {
          console.error("JSON Parse Exception:", innerParseError, text);
        }
      }
    } catch (e) {
      console.error("Gemini Error Crítico:", e);
    }
  }

  return {
    titulo: mealDesc,
    kcal: 0,
    ingredientes: ["Ingredientes del plato"],
    preparacion: [{ titulo: "Paso 1", descripcion: "Preparación base del plato." }],
    bioHack: {
      titulo: "CONSEJO PRÁCTICO",
      pasos: ["Come despacio", "Disfruta tu comida"],
      explicacion: "Mantén una alimentación equilibrada para mejores resultados."
    },
    nutrientes: { proteina: "", grasas: "", carbos: "" },
    imageUrl: `https://placehold.co/600x400?text=${encodeURIComponent(mealDesc)}`
  };
};

export async function getFitnessAdvice(profile: Profile, apiKey: string): Promise<string> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log("AI Fitness: Usando motor estable 2.5");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Dime 3 consejos cortos y fáciles para que esta persona entrene mejor.
Usa un lenguaje motivador y súper sencillo.

PERFIL:
- Metas: ${profile.metas_y_objetivos?.objetivos_generales?.join(', ') || 'General'}
- Salud: ${profile.diagnostico_clinico?.comorbilidades?.join(', ') || 'Normal'}
- Edad: ${profile.perfil_biometrico?.edad}, Genero: ${profile.perfil_biometrico?.genero}
- Peso InBody: ${profile.analisis_inbody_actual?.peso_actual_kg || 'N/A'} kg
- Meta Peso: ${profile.metas_y_objetivos?.peso_ideal_meta || 'No definida'}

REGLAS:
1. Si tiene comorbilidades (presión alta, etc): Dile que vaya suave y respire.
2. Si quiere músculo: Dile que descanse bien entre series.
3. Si quiere bajar de peso: Dile que mueva peso y haga algo de cardio.
4. No uses palabras raras.

FORMATO: Pon solo 3 puntos cortos con un dibujo (emoji), nada más.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Fitness Advice AI Error:", error);
    return "• Prioriza el descanso activo.\n• Mantén una hidratación constante.\n• Escucha a tu cuerpo durante el esfuerzo.";
  }
}

export async function generateFullRoutine(profile: Profile, apiKey: string): Promise<Record<string, any[]>> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const pe = profile.prescripcion_ejercicio;
    const dc = profile.diagnostico_clinico;
    const mo = profile.metas_y_objetivos;
    const ib = profile.analisis_inbody_actual;
    const pb = profile.perfil_biometrico;

    const prompt = `Eres un Entrenador Personal Certificado y Terapeuta Físico.
Genera una RUTINA SEMANAL COMPLETA (LUNES a DOMINGO) personalizada para este paciente.

═══ PERFIL DEL PACIENTE ═══
- Nombre: ${pb?.nombre_completo || 'Paciente'}
- Edad: ${pb?.edad || 'N/A'}
- Género: ${pb?.genero || 'N/A'}
- Peso actual: ${ib?.peso_actual_kg || 'N/A'} kg
- % Grasa corporal: ${ib?.pbf_porcentaje_grasa_corporal || 'N/A'}%
- Masa muscular esquelética: ${ib?.smm_masa_musculo_esqueletica_kg || 'N/A'} kg
- Tasa metabólica basal: ${ib?.tasa_metabolica_basal_kcal || 'N/A'} kcal

═══ PRESCRIPCIÓN MÉDICA DE EJERCICIO ═══
- FCM: ${pe?.fcm_latidos_min || 'N/A'} lat/min
- FC promedio entrenamiento: ${pe?.fc_promedio_entrenamiento || 'N/A'} lat/min
- Fuerza: ${pe?.fuerza_dias_semana || '3'} días/semana, ${pe?.fuerza_minutos_sesion || '45'} min/sesión
- Aeróbico: ${pe?.aerobico_dias_semana || '2'} días/semana, ${pe?.aerobico_minutos_sesion || '30'} min/sesión

═══ CONDICIÓN CLÍNICA ═══
- Comorbilidades: ${dc?.comorbilidades?.join(', ') || 'Ninguna'}
- Medicamentos: ${dc?.medicamentos_actuales?.join(', ') || 'Ninguno'}
- Alergias: ${dc?.alergias?.join(', ') || 'Ninguna'}
- Observaciones: ${dc?.observaciones_medicas?.join(', ') || 'Ninguna'}

═══ OBJETIVOS ═══
- Peso ideal meta: ${mo?.peso_ideal_meta || 'N/A'} kg
- Objetivo grasa: ${mo?.control_grasa_kg || 'N/A'} kg
- Objetivo músculo: ${mo?.control_musculo_kg || 'N/A'} kg
- Objetivos generales: ${mo?.objetivos_generales?.join(', ') || 'Salud general'}

═══ REGLAS ═══
1. SEGURIDAD PRIMERO: Si hay hipertensión, evitar maniobra de Valsalva y cargas extremas. Si hay obesidad, evitar alto impacto en rodillas.
2. DISTRIBUCIÓN: Respetar los días de fuerza y aeróbico prescritos. Los días restantes son DESCANSO ACTIVO (stretching, caminata suave).
3. VARIEDAD: Alternar grupos musculares. No repetir la misma rutina dos días seguidos.
4. PROGRESIÓN: Usar series y repeticiones apropiadas para el nivel del paciente.
5. Cada día de entrenamiento debe tener 5-7 ejercicios.
6. Los días de descanso deben tener 3-4 ejercicios suaves (movilidad, stretching, respiración).

RESPONDE ÚNICAMENTE CON JSON PURO:
{
  "LUNES": [{"n": "Nombre Ejercicio", "i": "3x12", "link": "https://www.youtube.com/results?search_query=nombre+ejercicio+tutorial"}],
  "MARTES": [...],
  "MIERCOLES": [...],
  "JUEVES": [...],
  "VIERNES": [...],
  "SABADO": [...],
  "DOMINGO": [...]
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Validate structure
      const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
      const routine: Record<string, any[]> = {};
      for (const day of days) {
        const key = Object.keys(parsed).find(k => k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === day) || day;
        routine[day] = Array.isArray(parsed[key]) ? parsed[key] : [];
      }
      return routine;
    }
    return {};
  } catch (error) {
    console.error("Generate Routine Error:", error);
    return {};
  }
}
