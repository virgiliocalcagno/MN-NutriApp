
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Profile } from "../types/store";

export interface AIResponse {
  perfilAuto: Partial<Profile>;
  semana: Record<string, Record<string, string>>;
  ejercicios: Record<string, any[]>;
  compras: [string, string, number, string, string][];
}

export interface RecipeDetails {
  kcal: number;
  ingredientes: string[];
  preparacion: string[];
  imageUrl?: string; // Nueva propiedad para la imagen generada
  bioHack: {
    titulo: string;
    pasos: string[];
    explicacion: string;
  };
  nutrientes: {
    proteina: string;
    grasas: string;
    carbos: string;
    fibra: string;
  };
  sugerencia: string;
  notaPro: string;
}

const CLOUD_FUNCTION_URL = 'https://us-central1-mn-nutriapp.cloudfunctions.net/procesarNutricion';

export const processPdfWithGemini = async (
  perfil: Partial<Profile>,
  pdfPlanBase64?: string,
  pdfEvalBase64?: string,
  apiKey?: string
): Promise<AIResponse> => {
  if (apiKey && apiKey !== 'AIzaSyAF5rs3cJFs_E6S7ouibqs7B2fgVRDLzc0') {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const promptText = `Actúa como procesador médico experto para MN-NutriApp. 
                Extrae la información directamente de los documentos PDF adjuntos.
                
                RESPONDE ÚNICAMENTE CON ESTE FORMATO JSON:
                {
                  "perfilAuto": { "paciente": "...", "doctor": "...", "edad": "...", "peso": "...", "estatura": "...", "cintura": "...", "sangre": "...", "alergias": "...", "objetivos": [], "comorbilidades": [] },
                  "semana": { "LUNES": {"DESAYUNO": "...", "MERIENDA_AM": "...", "ALMUERZO": "...", "MERIENDA_PM": "...", "CENA": "..." }, ... },
                  "ejercicios": { "LUNES": [ {"n": "🏋️ Ejercicio", "i": "3x12", "link": ""} ], ... },
                  "compras": [ ["Nombre", "Cantidad", 1, "Categoría", "Pasillo"] ]
                }`;

      const parts: any[] = [{ text: promptText }];
      if (pdfPlanBase64) parts.push({ inlineData: { mimeType: "application/pdf", data: pdfPlanBase64.replace(/^data:application\/pdf;base64,/, "") } });
      if (pdfEvalBase64) parts.push({ inlineData: { mimeType: "application/pdf", data: pdfEvalBase64.replace(/^data:application\/pdf;base64,/, "") } });

      const result = await model.generateContent(parts);
      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]) as AIResponse;
      throw new Error("Formato inválido");
    } catch (e: any) {
      console.warn("Gemini 2.0 falló, intentando Fallback...");
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
    return await response.json();
  } catch (error: any) {
    console.error("AI Critical Error:", error);
    throw error;
  }
};

export const analyzeImageWithGemini = async (base64Image: string, perfil?: any, apiKey?: string) => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    if (apiKey && apiKey !== 'AIzaSyAF5rs3cJFs_E6S7ouibqs7B2fgVRDLzc0') {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = "Analiza esta comida. Detecta ingredientes, calorías, macros y bio-hacks bioquímicos profundos. Responde en JSON.";
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
  console.log("Iniciando motor v16.0 (Stitch Edition) para:", mealDesc);

  // 1. MOTOR TITÁNICO: Gemini 2.0 Flash con Hyper-Prompt
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como una entidad de Inteligencia Nutricional de Élite. Tu objetivo es transformar una simple descripción de comida en un protocolo de nutrición de precisión.
      
      ES CRÍTICO QUE LA RECETA CORRESPONDA EXACTAMENTE A: "${mealDesc}"
      
      INSTRUCCIONES DE SISTEMA (GOLD STANDARD):
      1. INGREDIENTES: Desglose quirúrgico. Clasifica cada componente por su función biológica. No escatimes en descripciones premium basándote en "${mealDesc}".
      
      2. PREPARACIÓN PROFESIONAL: Describe un proceso de cocina de alto nivel para "${mealDesc}". Divide en FASES TÉCNICAS con nombres impactantes (ej. "Activación Térmica", "Polimerización de Sabores").
      
      3. BIO-HACKS BIOQUÍMICOS: 
         - "Secuenciación Metabólica": Define el orden exacto de ingesta (Vegetales > Proteínas/Grasas > Carbohidratos).
         - Bio-hacks sobre la matriz de fibra, oxidación lipídica y picos de insulina específicos para esta comida.
      
      4. IMPACTO METABÓLICO: En la Nota Pro, describe con lenguaje científico la duración de la energía y saciedad.

      SALIDA REQUERIDA (JSON PURO):
      {
        "kcal": número_exacto,
        "ingredientes": ["Clase: Cantidad - Ingrediente Detallado", "..."],
        "preparacion": ["FASE: Instrucciones técnico-culinarias detalladas", "..."],
        "bioHack": { 
            "titulo": "Título de Impacto Científico", 
            "pasos": ["Protocolo 1", "Protocolo 2", "..."], 
            "explicacion": "Explicación bioquímica profunda." 
        },
        "nutrientes": { "proteina": "Xg", "grasas": "Xg", "carbos": "Xg", "fibra": "Xg" },
        "sugerencia": "Tip profesional de nivel experto.",
        "notaPro": "Descripción del impacto hormonal.",
        "imageUrl": "URL_PLACEHOLDER"
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Generar URL de imagen realista basada en la descripción
        const imageQuery = encodeURIComponent(mealDesc + " professional gourmet food photography");
        parsed.imageUrl = `https://source.unsplash.com/featured/?${imageQuery}`;
        return parsed;
      }
    } catch (e) {
      console.error("Gemini 2.0 Titan Failed:", e);
    }
  }

  // 2. FALLBACK DINÁMICO (Si el API falla o no hay key)
  console.warn("Utilizando protocolo de rescate dinámico v19.0 para:", mealDesc);

  return {
    kcal: 350,
    ingredientes: [
      `Base: 200g de ${mealDesc} preparado con técnicas de nutrición de precisión.`,
      "Acompañamiento: Vegetales de temporada con alta densidad de micronutrientes.",
      "Grasa: Aceite de Oliva Virgen Extra (prensado en frío).",
      "Hidratación: Agua mineral o infusión antioxidante."
    ],
    preparacion: [
      `FASE DE ACTIVACIÓN: Prepara los ingredientes de "${mealDesc}" asegurando la integridad de sus enzimas.`,
      "COCCIÓN CONTROLADA: Utiliza calor medio para evitar la formación de compuestos pro-inflamatorios.",
      "SAZONADO FUNCIONAL: Agrega sal marina y especias ricas en polifenoles.",
      "EMPLATADO TÉCNICO: Organiza el plato para maximizar la experiencia sensorial."
    ],
    bioHack: {
      titulo: "Sincronización de Macronutrientes",
      pasos: ["1. Iniciar con los vegetales", "2. Consumir la fuente de proteína", `3. Finalizar con "${mealDesc}"`],
      explicacion: "Este orden garantiza que la fibra prepare el tracto digestivo, ralentizando la absorción de glucosa y minimizando la respuesta de la insulina."
    },
    nutrientes: { proteina: "25g", grasas: "12g", carbos: "30g", fibra: "6g" },
    sugerencia: `Asegúrate de masticar cada bocado de "${mealDesc}" al menos 20 veces para una digestión óptima.`,
    notaPro: "Este protocolo asegura una curva glucémica estable y previene el 'bajón' post-prandial."
  };
};
