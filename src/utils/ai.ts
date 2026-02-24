
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
    if (!Array.isArray(item) || item.length < 1) return item;
    const name = item[0];
    const nameLower = name.toLowerCase().trim();
    const mapped = INGREDIENT_TO_PRODUCT[nameLower];
    if (mapped) {
      return [mapped, ...item.slice(1)] as typeof item;
    }
    return item;
  });

  const seen = new Map<string, number>();
  const deduped: typeof normalized = [];
  for (const item of normalized) {
    const key = item[0].toLowerCase();
    if (seen.has(key)) continue;
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
      console.log("AI Process: Usando motor estable para PDF");
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { temperature: 0 } });

      const currentProfileContext = perfil ? `
LO QUE YA SABEMOS DEL PACIENTE:
- Metas: ${perfil.objetivos?.join(', ') || 'Ninguna'}
- Alergias: ${perfil.alergias || 'Ninguna'}
- Problemas de salud: ${perfil.comorbilidades?.join(', ') || 'Ninguna'}
- Pastillas/Suplementos: ${perfil.suplementos?.join(', ') || 'Ninguno'}
- Notas: ${perfil.observaciones || 'Ninguna'}
` : '';

      const promptText = `Eres un asesor de nutrición muy práctico y amable para la app MN-NutriApp. Tu trabajo es leer el PDF y organizar la información para el paciente de forma clara.

REGLAS SENCILLAS:
1. NO BORRES nada de lo que ya sabemos (alergias o metas) a menos que el PDF diga algo muy distinto. Queremos sumar información, no perderla.
2. Identifica el nombre del Paciente y el Doctor.
3. Busca el peso, grasa, y medidas si están ahí.
4. Saca el menú de la semana y los ejercicios.
   *EJERCICIOS*: Si no hay ejercicios en el PDF, inventa una rutina sencilla de una semana que ayude al paciente con sus metas.
5. Lista de suplementos y cuándo es la próxima cita.

${currentProfileContext}

--- LISTA DE COMPRAS ---
Mira el menú completo y haz una lista de qué hay que comprar en el supermercado:
- Agrupa las cosas: si hay pollo en varios días, pon "Pollo" una sola vez con el total para la semana.
- Usa medidas de República Dominicana: libras (lb), onzas (oz), cartón de huevos, paquetes, botellas, o unidades.
- Ordena por pasillos: Carnes, Frutas, Verduras, Lácteos, Panadería, etc.

RESPONDE SOLO CON ESTE JSON:
{
  "perfilAuto": { 
    "paciente": "...", "doctor": "...", "edad": "...", "peso": "...", "pesoObjetivo": "...",
    "estatura": "...", "cintura": "...", "cuello": "...", "brazos": "...", "grasa": "...",
    "sangre": "...", "tipoSangre": "...", "alergias": "...", 
    "objetivos": [], "comorbilidades": [], "suplementos": [], "proximaCita": "..."
  },
  "semana": { "LUNES": {"DESAYUNO": "...", "MERIENDA_AM": "...", "ALMUERZO": "...", "MERIENDA_PM": "...", "CENA": "..." } },
  "ejercicios": { "LUNES": [ {"n": "Nombre Ejercicio", "i": "3 series de 12", "link": ""} ] },
  "compras": [ ["Producto", "Cantidad", 1, "Categoria", "Pasillo"] ],
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
      console.log("AI Scan: Usando 1.5 Flash para imagen");
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Dime qué hay en esta foto de comida de forma muy clara y sencilla.
Para el paciente: ${perfil?.paciente || 'Usuario'}.

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
      console.log("AI Recipe: Usando motor estable para receta");
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Convierte estos ingredientes en una receta casera y súper fácil de hacer.
Usa palabras que cualquiera entienda, nada de términos gourmet.

COMIDA: "${mealDesc}"

RESPONDE SOLO CON ESTE JSON:
{
  "titulo": "Nombre fácil del plato",
  "foto_prompt": "English query for high-quality food photo, clean background",
  "tiempo": "20 min",
  "dificultad": "Fácil",
  "kcal": 500,
  "nutrientes": { "proteina": "20g", "grasas": "10g", "carbos": "40g" },
  "ingredientes_lista": ["Ingrediente 1", "Ingrediente 2"],
  "pasos_preparacion": [
    { "titulo": "Paso 1", "descripcion": "Explicación simple." }
  ],
  "bio_hack": {
    "titulo": "CONSEJO DEL ASESOR",
    "explicacion": "Un consejo práctico para comer mejor este plato.",
    "pasos": ["Tip 1", "Tip 2"]
  }
}`;

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
    imageUrl: `https://via.placeholder.com/600x400.png?text=${encodeURIComponent(mealDesc)}`
  };
};

export async function getFitnessAdvice(profile: Profile, apiKey: string): Promise<string> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log("AI Fitness: Usando motor estable para consejo fit");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Dime 3 consejos cortos y fáciles para que esta persona entrene mejor.
Usa un lenguaje motivador y súper sencillo.

PERFIL:
- Metas: ${profile.objetivos.join(', ')}
- Salud: ${profile.comorbilidades.join(', ')}
- Edad: ${profile.edad}, Peso: ${profile.peso}
- Peso meta: ${profile.pesoObjetivo || 'No definido'}

REGLAS:
1. Si tiene presión alta: Dile que no aguante la respiración y que vaya suave.
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
