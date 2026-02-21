
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Profile } from "../types/store";

export interface AIResponse {
  perfilAuto: Partial<Profile>;
  semana: Record<string, Record<string, string>>;
  ejercicios: Record<string, any[]>;
  compras: [string, string, number, string, string][];
  metas: {
    calorias: number;
    agua: number;
  };
  horarios?: Record<string, string>; // e.g., {"DESAYUNO": "08:00 AM", ...}
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

// Maps recipe ingredient names to actual supermarket product names
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

// Post-process AI compras to normalize ingredient names to real products
const normalizeCompras = (data: AIResponse): AIResponse => {
  if (!data.compras || !Array.isArray(data.compras)) return data;

  const normalized = data.compras.map(item => {
    if (!Array.isArray(item) || item.length < 1) return item;
    const name = item[0];
    const nameLower = name.toLowerCase().trim();
    const mapped = INGREDIENT_TO_PRODUCT[nameLower];
    if (mapped) {
      return [mapped, ...item.slice(1)] as typeof item;
    }
    return item;
  });

  // Deduplicate after normalization (e.g. if 'Claras de huevo' and 'Huevo' both became 'Huevos')
  const seen = new Map<string, number>();
  const deduped: typeof normalized = [];
  for (const item of normalized) {
    const key = item[0].toLowerCase();
    if (seen.has(key)) {
      // Already exists, skip duplicate (keep first occurrence)
      continue;
    }
    seen.set(key, deduped.length);
    deduped.push(item);
  }

  return { ...data, compras: deduped };
};

const CLOUD_FUNCTION_URL = 'https://us-central1-mn-nutriapp.cloudfunctions.net/procesarNutricion';

export const processPdfWithGemini = async (
  perfil: Partial<Profile>,
  pdfPlanBase64?: string,
  pdfEvalBase64?: string,
  apiKey?: string
): Promise<AIResponse> => {
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0 } });

      const promptText = `Actua como procesador medico experto para MN-NutriApp. Extrae la informacion directamente de los documentos PDF adjuntos.

REGLAS CRITICAS:
1. Identifica obligatoriamente el nombre del Paciente y del Medico.
2. Extrae medidas actuales: peso, grasa %, cintura, cuello, brazos si estan disponibles.
3. Extrae el menu semanal completo y rutinas de ejercicio.
4. Clinica: Identifica suplementacion activa y fecha de proxima cita. Actualiza comorbilidades.

--- REGLA MAS IMPORTANTE: LISTA DE COMPRAS ---
Genera el array "compras" siguiendo ESTOS PASOS EXACTOS:

PASO 1 - ESCANEO EXHAUSTIVO:
Lee CADA comida de CADA dia que aparezca en el PDF, sin importar cuantos dias o tiempos de comida tenga el plan. Recorre TODOS los dias y TODOS los tiempos de comida presentes (DESAYUNO, MERIENDA, ALMUERZO, CENA, etc.). NO te saltes NINGUN dia ni NINGUN tiempo de comida que exista en el documento.

PASO 2 - EXTRACCION Y CONVERSION A PRODUCTOS DE SUPERMERCADO:
Para cada comida, extrae TODOS los ingredientes. PERO convierte cada ingrediente de receta a un PRODUCTO REAL que se compra en un supermercado de Republica Dominicana.
CONVERSIONES OBLIGATORIAS:
- "Claras de huevo" o "Clara de huevo" -> "Huevos" (se compran enteros, el usuario usa la clara)
- "Pechuga de pollo" o "Pollo desmechado" -> "Pechuga de pollo"
- "Carne molida de res" -> "Carne molida"
- "Filete de salmon" -> "Salmon"
- "Jugo de limon" -> "Limones"
- "Dientes de ajo" -> "Ajo"
MANTENER como producto propio: "Aceite de oliva", "Galletas de arroz", "Pan pita integral", "Proteina en polvo", "Queso mozzarella", "Col rizada", "Pastrami de pavo"

PASO 2.5 - SEPARACION DE INGREDIENTES COMBINADOS:
Si el PDF describe una comida con multiples ingredientes unidos por "y", "con", "+" o comas, SEPARALOS en productos individuales.
Ejemplo: "Pastrami de pavo y queso" -> DOS items: "Pastrami de pavo" y "Queso"
Ejemplo: "Tortilla con pollo y aguacate" -> TRES items: "Tortilla", "Pollo", "Aguacate"
EXCEPCION: NO separes nombres propios de productos como "Aceite de oliva", "Pan pita integral", "Galletas de arroz", "Col rizada", "Proteina en polvo".

PASO 3 - CONSOLIDACION Y CALCULO SEMANAL EN UNIDADES DOMINICANAS:
Agrupa ingredientes identicos. Calcula la cantidad TOTAL SEMANAL y expresala en las unidades que se VENDEN en los supermercados de Republica Dominicana:
- Carnes: en LIBRAS (lb). Ejemplo: "2 lb semanal"
- Huevos: en UNIDADES o CARTON. Si necesita 15 huevos -> "1 carton (30 uds)" porque se vende en carton de 15 o 30
- Frutas y verduras: en UNIDADES o LIBRAS. Ejemplo: "7 unidades", "2 lb semanal"
- Lacteos y quesos: en ONZAS (oz) o UNIDADES. Ejemplo: "16 oz", "1 paquete"
- Arroz, avena, granos: en LIBRAS. Ejemplo: "2 lb"
- Aceites: en ONZAS (oz) o BOTELLA. Ejemplo: "1 botella"
- Pan, tortillas, casabe, galletas: en PAQUETES o UNIDADES. Ejemplo: "2 paquetes"
- Tuberculos (platano, batata): en UNIDADES. Ejemplo: "14 unidades"
- Embutidos: en LIBRAS o PAQUETE. Ejemplo: "1 lb", "1 paquete"
NO uses kilos, gramos, mililitros ni cucharaditas. Solo unidades dominicanas: libras, onzas, unidades, paquetes, carton, docena, botella.

PASO 4 - CATEGORIZACION POR PASILLO DE SUPERMERCADO:
Usa EXACTAMENTE estos pasillos (columna 4 = Categoria, columna 5 = Pasillo):
- Carnes y Pescados: pollo, cerdo, res, salmon, bacalao, atun, pescado, alitas, pastrami. Pasillo: "Carnes"
- Frutas: banana, melon, fresas, naranja, lechosa, sandia, blueberries, limon. Pasillo: "Frutas"
- Verduras y Hortalizas: lechuga, tomate, zucchini, zanahoria, espinaca, pepino, brocoli, auyama, remolacha, col rizada, repollo, champinones, cebolla, berro. Pasillo: "Verduras"
- Lacteos y Huevos: huevos, queso mozzarella, leche descremada. Pasillo: "Lacteos"
- Panaderia y Tortillas: tortilla integral, pan pita integral, casabe. Pasillo: "Panaderia"
- Cereales y Granos: arroz, pasta, quinoa, avena, galletas de arroz. Pasillo: "Cereales"
- Tuberculos: platano verde, platano maduro, batata. Pasillo: "Tuberculos"
- Aceites y Condimentos: aceite de oliva, aceite de coco, curry, curcuma, paprika, sal, ajo, salsa BBQ. Pasillo: "Aceites y Condimentos"
- Frutos Secos: macadamias, almendras, aceitunas, aguacate. Pasillo: "Frutos Secos"
- Bebidas y Suplementos: proteina en polvo, te, cafe, edulcorante. Pasillo: "Bebidas"
- Embutidos: jamon, pastrami de pavo. Pasillo: "Embutidos"

PASO 5 - VERIFICACION FINAL:
Revisa tu lista contra el PDF. Cada ingrediente DEBE estar presente como producto de supermercado. Verifica que NO haya ingredientes de receta (claras, dientes de ajo, etc.) sino productos comprables. Verifica que las cantidades esten en unidades dominicanas.

RESPONDE UNICAMENTE CON ESTE FORMATO JSON:
{
  "perfilAuto": { 
    "paciente": "...", "doctor": "...", "edad": "...", "peso": "...", "pesoObjetivo": "...",
    "estatura": "...", "cintura": "...", "cuello": "...", "brazos": "...", "grasa": "...",
    "sangre": "...", "tipoSangre": "...", "alergias": "...", 
    "objetivos": [], "comorbilidades": [], "suplementos": [], "proximaCita": "..."
  },
  "semana": { "LUNES": {"DESAYUNO": "...", "MERIENDA_AM": "...", "ALMUERZO": "...", "MERIENDA_PM": "...", "CENA": "..." } },
  "ejercicios": { "LUNES": [ {"n": "Ejercicio", "i": "3x12", "link": ""} ] },
  "compras": [ ["Nombre Completo Literal", "Cantidad Total Semanal", 1, "Categoria", "Pasillo"] ],
  "metas": { "calorias": 2000, "agua": 2800 },
  "horarios": { "DESAYUNO": "08:30 AM", "ALMUERZO": "01:30 PM", "CENA": "07:30 PM" }
}`;


      const parts: any[] = [{ text: promptText }];
      if (pdfPlanBase64) parts.push({ inlineData: { mimeType: "application/pdf", data: pdfPlanBase64.replace(/^data:application\/pdf;base64,/, "") } });
      if (pdfEvalBase64) parts.push({ inlineData: { mimeType: "application/pdf", data: pdfEvalBase64.replace(/^data:application\/pdf;base64,/, "") } });

      const result = await model.generateContent(parts);
      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) return normalizeCompras(JSON.parse(jsonMatch[0]) as AIResponse);
      throw new Error("Formato inválido");
    } catch (e: any) {
      console.warn("Gemini 2.5 falló, intentando Fallback...", e?.message || e?.status || e);
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
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Actúa como una Eminencia en Nutrición Clínica y Bio-hacking Metabólico. 
Analiza esta imagen de comida para el paciente: ${perfil?.paciente || 'Usuario'}.
Contexto del Paciente:
- Objetivos: ${perfil?.objetivo || 'General'}
- Condiciones/Alergias: ${perfil?.condiciones || 'Ninguna'}

Tu tarea es:
1. Identificar con precisión el/los plato(s).
2. Determinar el impacto metabólico (VERDE, AMARILLO, ROJO) considerando el perfil del paciente.
3. Proporcionar un análisis bioquímico profundo sobre cómo afecta este plato a sus objetivos.
4. Entregar un Bio-Hack técnico (ej. orden de consumo para aplanar curva de glucosa, suplemento recomendado, o ajuste de porciones).
5. Calcular macros (p, c, f en gramos) y calorías totales de forma realista.

RESPONDE ÚNICAMENTE EN ESTE FORMATO JSON PURO:
{
  "platos": ["Nombre detallado"],
  "semaforo": "VERDE | AMARILLO | ROJO",
  "analisis": "Texto breve pero técnico...",
  "bioHack": "Consejo experto...",
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
  console.log("Iniciando motor v32.0 (NutriScan Pro) para:", mealDesc);

  const effectiveApiKey = apiKey || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
  console.log("Motor AI: API Key presente:", effectiveApiKey ? "SI (Largo: " + effectiveApiKey.length + ")" : "NO");

  if (effectiveApiKey && effectiveApiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(effectiveApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Eres un Chef de Alta Cocina y Experto en Bio-hacking Nutricional.
Transforma estos ingredientes en una receta profesional con datos nutricionales reales.

INGREDIENTES: "${mealDesc}"

RESPONDE ÚNICAMENTE con un JSON puro (sin markdown, sin backticks) con esta estructura EXACTA:
{
  "titulo": "Nombre gourmet del plato",
  "foto_prompt": "English query for high-end food photography, clean background, 4k",
  "tiempo": "25 min",
  "dificultad": "Media",
  "kcal": 620,
  "nutrientes": { "proteina": "45g", "grasas": "18g", "carbos": "30g" },
  "ingredientes_lista": ["150g Salmón fresco", "1/2 taza Quinoa cocida", "6 espárragos trigueros"],
  "pasos_preparacion": [
    { "titulo": "Sellado Técnico", "descripcion": "Aplica calor directo para caramelizar la superficie y sellar jugos." }
  ],
  "bio_hack": {
    "titulo": "SECUENCIACIÓN METABÓLICA",
    "explicacion": "Consume en este orden para optimizar glucosa:",
    "pasos": ["1. Fibra", "2. Proteína", "3. Carbohidrato"]
  }
}

REGLAS:
- tiempo: Estimado realista.
- dificultad: Baja, Media o Alta.
- foto_prompt: Keywords en inglés para Unsplash.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const keyword = encodeURIComponent(parsed.foto_prompt || parsed.titulo || mealDesc);
        const imageUrl = `https://loremflickr.com/800/600/food,gourmet,${keyword}`;

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
            titulo: parsed.bio_hack?.titulo || "BIO-HACK",
            pasos: parsed.bio_hack?.pasos || [],
            explicacion: parsed.bio_hack?.explicacion || ""
          },
          nutrientes: {
            proteina: parsed.nutrientes?.proteina || "",
            grasas: parsed.nutrientes?.grasas || "",
            carbos: parsed.nutrientes?.carbos || ""
          }
        };
      }
      return {
        titulo: "Error",
        kcal: 0,
        ingredientes: [],
        preparacion: [],
        bioHack: { titulo: "Error", explicacion: "No se pudo generar la receta.", pasos: [] },
        nutrientes: { proteina: "", grasas: "", carbos: "" }
      };
    } catch (e) {
      console.error("Gemini v31.1 Error Crítico:", e);
      return {
        titulo: "Error de Conexión",
        kcal: 0,
        ingredientes: [],
        preparacion: [],
        bioHack: { titulo: "Error", explicacion: "Error de conexión con la IA.", pasos: [] },
        nutrientes: { proteina: "", grasas: "", carbos: "" }
      };
    }
  }

  // FALLBACK v31.1
  return {
    titulo: mealDesc,
    kcal: 0,
    ingredientes: ["Ingredientes del plato"],
    preparacion: [
      { titulo: "Preparación base", descripcion: "Acondiciona el ingrediente principal retirando humedad." },
      { titulo: "Cocción", descripcion: "Aplica la técnica de calor principal respetando los tiempos." },
      { titulo: "Ensamble", descripcion: "Integra los acompañamientos en una base armónica." },
      { titulo: "Finalización", descripcion: "Toque de aceite de oliva en crudo para realzar sabores." }
    ],
    bioHack: {
      titulo: "SECUENCIACIÓN METABÓLICA",
      pasos: ["1. Vegetales (Fibra)", "2. Proteína", "3. Carbohidratos"],
      explicacion: "Consume en este orden para optimizar tu curva de glucosa."
    },
    nutrientes: { proteina: "", grasas: "", carbos: "" },
    imageUrl: `https://via.placeholder.com/600x400.png?text=${encodeURIComponent(mealDesc)}`
  };
};

export async function getFitnessAdvice(profile: Profile, apiKey: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Actúa como un médico experto en medicina deportiva y bio-hacking. 
  Genera 3 recomendaciones de élite BREVES y ACCIÓNABLES para el entrenamiento de este usuario basándose en su perfil clínico.
  
  PERFIL:
  - Objetivos: ${profile.objetivos.join(', ')}
  - Comorbilidades: ${profile.comorbilidades.join(', ')}
  - Edad: ${profile.edad}, Peso: ${profile.peso}, Grasa%: ${profile.grasa}
  - Peso Objetivo: ${profile.pesoObjetivo || 'No definido'}
  
  REGLAS:
  1. Si tiene HIPERTENSIÓN: Recomienda evitar maniobras de Valsalva y priorizar cardio de estado estable.
  2. Si busca MASA MUSCULAR: Recomienda protocolos de hipertrofia y tiempos de descanso específicos.
  3. Si busca BAJAR PESO: Recomienda entrenamiento de fuerza combinado con cardio HIIT si su salud lo permite.
  4. Sé extremadamente profesional y usa terminología de bio-hacking (ej: flexibilidad metabólica, síntesis proteica).
  
  FORMATO: Devuelve solo los 3 puntos con un emoji cada uno, sin introducciones.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return text;
  } catch (error) {
    console.error("Fitness Advice AI Error:", error);
    return "• Prioriza el descanso activo.\n• Mantén una hidratación constante.\n• Escucha a tu cuerpo durante el esfuerzo.";
  }
}
