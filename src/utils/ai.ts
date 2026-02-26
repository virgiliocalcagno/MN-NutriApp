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

const getEffectiveApiKey = (apiKey?: string): string => {
  const key = apiKey ||
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (process as any).env?.GEMINI_API_KEY ||
    '';
  return key.trim();
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

const CLOUD_FUNCTION_URL = 'https://procesarnutricion-m2aywfcl2q-uc.a.run.app';

export const processPdfWithGemini = async (
  perfil: Partial<Profile>,
  pdfPlanBase64?: string,
  pdfEvalBase64?: string,
  docTypeHint?: 'FICHA_MEDICA' | 'PLAN_NUTRICIONAL' | 'INBODY'
): Promise<AIResponse> => {
  console.log(`[BUILD_V191] AI Process: Delegando a Cloud Function - Contexto: ${docTypeHint || 'AUTO'}`);

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

export const analyzeImageWithGemini = async (base64Image: string, perfil?: any) => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    console.log("[BUILD_V191] AI Scan: Delegando a Cloud Function");

    const response = await fetch('https://analizarcomida-m2aywfcl2q-uc.a.run.app', {
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

export const getRecipeDetails = async (mealDesc: string, perfil?: any, apiKey?: string, isVariant: boolean = false, originalRecipeTitle?: string): Promise<RecipeDetails> => {
  try {
    console.log("[BUILD_V191] AI Recipe: Solicitando al Cloud Function (Alta Cocina)...");
    const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/obtenerReceta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealDesc, perfil, isVariant, originalRecipeTitle })
    });
    const resultJson = await response.json();
    const text = resultJson.text;

    if (text) {
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
    }
  } catch (e) {
    console.error("Gemini Cloud Function Error:", e);
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

export async function getFitnessAdvice(profile: Profile): Promise<string> {
  try {
    console.log("[BUILD_V191] AI Fitness: Solicitando al Cloud Function (Consejo)...");
    const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/obtenerConsejoFitness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile })
    });
    const data = await response.json();
    return data.advice || "• Mantente activo.\n• Hidrátate.\n• Disfruta el proceso.";
  } catch (error) {
    console.error("Fitness Advice AI Error:", error);
    return "• Prioriza el descanso activo.\n• Mantén una hidratación constante.\n• Escucha a tu cuerpo durante el esfuerzo.";
  }
}

export async function generateFullRoutine(profile: Profile, selectedGoals?: string[], difficulty: string = "Media"): Promise<{ routine: any, consejo: string }> {
  try {
    console.log("[BUILD_V191] AI Routine: Solicitando al Cloud Function (Rutina)...");
    const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/generarRutinaFit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, selectedGoals, difficulty })
    });
    const data = await response.json();
    const text = data.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.zona_fit_response) {
        const payload = parsed.zona_fit_response;
        const weeklyRaw = payload.plan_semanal || {};

        // Mapear cada día de la semana
        const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
        const mappedWeekly: any = {};

        days.forEach(day => {
          const dayData = weeklyRaw[day] || { ejercicios: [] };
          mappedWeekly[day] = (dayData.ejercicios || []).map((ex: any) => ({
            n: ex.nombre,
            i: `${ex.series}x${ex.repeticiones} - ${ex.objetivo}`,
            link: ex.video_url,
            checklist_logic: ex.completado || false,
            cat: ex.categoria || "Acondicionamiento"
          }));
        });

        const consejoCompacto = `ALERTA CLÍNICA: ${payload.entrenamiento_semanal?.justificacion_clinica || ''}\n${payload.alertas_seguridad?.restriccion_impacto || ''}\nHidratación: ${payload.alertas_seguridad?.hidratacion_requerida_ml || 2800} ml. ${payload.alertas_seguridad?.nota_medicamento || ''}`;

        return {
          routine: mappedWeekly, // Ahora es un objeto indexado por días
          consejo: consejoCompacto
        };
      }
    }
    return { routine: [], consejo: "" };
  } catch (error) {
    console.error("Generate Routine Error:", error);
    return { routine: [], consejo: "" };
  }
}
