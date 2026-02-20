
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
  console.log("Iniciando motor v27.0 (Mapeo de Precisión) para:", mealDesc);

  // 1. MOTOR DE PRECISIÓN: Gemini 2.0 Flash con Mapeo Lógico de 4 Pasos
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como un Chef Ejecutivo de alto nivel. 
      Genera una receta de PRECISIÓN para: "${mealDesc}".
      
      ESTRUCTURA DE PREPARACIÓN OBLIGATORIA (4 PASOS):
      Paso 1: Preparación Base (ej: "Seca, limpia o acondiciona los ingredientes base").
      Paso 2: Técnica de Calor (ej: "Sella, tuesta o cocina la proteína a fuego exacto").
      Paso 3: Ensamble (ej: "Une los acompañamientos, vegetales y carbohidratos").
      Paso 4: Toque Final (ej: "Finaliza con el aceite de oliva, especias y emplatado").

      REGLAS:
      - TONO: Profesional y Motivador.
      - INGREDIENTES: Usa iconos técnicos (ej: "🥩 90g de Proteína").
      - PASOS: Cada paso debe ser una acción culinaria REAL y profesional. Sin rellenos genéricos.
      - BIO-HACK: Consejo metabólico científico para la energía post-comida.
      - LÍQUIDOS: No menciones beber nada (restricción: -30min/+60min).

      SALIDA REQUERIDA (JSON PURO):
      {
        "titulo": "Nombre Premium del Plato",
        "ingredientes": ["Icono Cantidad - Nombre", "..."],
        "preparacion": [
            "1. [Acción Base]: Descripción técnica",
            "2. [Acción Calor]: Descripción técnica",
            "3. [Acción Ensamble]: Descripción técnica",
            "4. [Acción Final]: Descripción técnica"
        ],
        "bioHack": { 
            "titulo": "Optimización Metabólica", 
            "pasos": ["Recomendación técnica"], 
            "explicacion": "Explicación científica de la mejora energética." 
        },
        "kcal": 0,
        "nutrientes": { "proteina": "", "grasas": "", "carbos": "", "fibra": "" },
        "sugerencia": "Secreto del Chef para el punto de cocción.",
        "notaPro": "Experiencia sensorial y energética esperada.",
        "imageUrl": "URL_PLACEHOLDER"
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Prompt fotográfico minimalista v26.0 (Mantenido por su alta calidad)
        const imageQuery = encodeURIComponent(`Fotografía gourmet de ${parsed.titulo}, primer plano, luz natural, estilo minimalista y saludable, 4k`);
        parsed.imageUrl = `https://source.unsplash.com/featured/?${imageQuery}`;
        return parsed;
      }
    } catch (e) {
      console.error("Gemini Precision Mapping Error:", e);
    }
  }

  // 2. FALLBACK DE PRECISIÓN v27.0
  return {
    kcal: 0,
    ingredientes: [
      `🥩 Proteína técnica para "${mealDesc}"`,
      "🌿 Vegetales frescos de temporada",
      "🫒 Aceite de Oliva Premium",
      "🧂 Sazón equilibrada"
    ],
    preparacion: [
      "1. Preparación: Limpia y retira el exceso de humedad del ingrediente principal para un sellado perfecto.",
      "2. Cocción: Sella a fuego alto para caramelizar la superficie y mantener el interior jugoso.",
      "3. Ensamble: Integra los vegetales frescos y los carbohidratos en una base armónica.",
      "4. Finalización: Corona con el aceite de oliva en crudo para aportar brillo y ácidos grasos esenciales."
    ],
    bioHack: {
      titulo: "Activación Metabólica",
      pasos: ["Movimiento post-prandial (10 min)"],
      explicacion: "Caminar suavemente después de este plato ayuda a que la glucosa se distribuya eficientemente en tus células."
    },
    nutrientes: { proteina: "", grasas: "", carbos: "", fibra: "" },
    sugerencia: "El reposo es clave para que los sabores se asienten.",
    notaPro: "Un plato limpio, técnico y cargado de vitalidad.",
    imageUrl: `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(mealDesc)}`
  };
};
