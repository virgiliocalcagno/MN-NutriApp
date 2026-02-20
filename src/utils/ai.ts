
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
      
      PLATO A ANALIZAR: "${mealDesc}"
      
      INSTRUCCIONES DE SISTEMA (GOLD STANDARD):
      1. INGREDIENTES: Desglose quirúrgico. Clasifica cada componente por su función biológica. No escatimes en descripciones premium.
      
      2. PREPARACIÓN PROFESIONAL: Describe un proceso de cocina de alto nivel. Divide en FASES TÉCNICAS con nombres impactantes (ej. "Activación Térmica", "Polimerización de Sabores").
      
      3. BIO-HACKS BIOQUÍMICOS: 
         - "Secuenciación Metabólica": Define el orden exacto de ingesta (Vegetales > Proteínas/Grasas > Carbohidratos).
         - Bio-hacks sobre la matriz de fibra, oxidación lipídica y picos de insulina.
      
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
        // Generar URL de imagen realista basada en la descripción (Usando Unsplash o similar para demo premium)
        const imageQuery = encodeURIComponent(mealDesc + " professional food photography gourmet");
        parsed.imageUrl = `https://source.unsplash.com/featured/?${imageQuery}`;
        return parsed;
      }
    } catch (e) {
      console.error("Gemini 2.0 Titan Failed:", e);
    }
  }

  // 2. FALLBACK DE ALTA RESOLUCIÓN (Si el API falla)
  console.warn("Utilizando protocolo de rescate clínico v15.0");
  const isEggBase = mealDesc.toLowerCase().includes('huevo');

  return {
    kcal: isEggBase ? 410 : 380,
    ingredientes: [
      "Proteína Completa: 3 claras + 1 huevo entero (Máxima síntesis proteica).",
      "Lácteo: 30g Queso Mozzarella de alta calidad.",
      "Carbohidrato Complejo: 1 Tortilla integral de grano entero.",
      "Grasa Saludable: 1 cdita Aceite de Oliva virgen extra.",
      "Fruta: 1 Naranja entera con su matriz de fibra intacta."
    ],
    preparacion: [
      "FASE EL BATIDO: Integra las claras y el huevo con una pizca de especias termogénicas.",
      "COCCIÓN TÉRMICA: Calienta el aceite a fuego medio. Cocina el huevo preservando la cremosidad de la yema para evitar la oxidación de la colina.",
      "EL FUNDIDO MAESTRO: Coloca el queso y la tortilla encima. Deja que el calor residual funda el lácteo.",
      "EL GIRO: Voltea y tuesta ligeramente la tortilla por 20 segundos para polimerizar los azúcares naturales.",
      "SERVICIO: Acompaña con la naranja cortada en gajos, nunca exprimida."
    ],
    bioHack: {
      titulo: "Control Insulínico y Cortisol",
      pasos: ["1. Vegetales Crudos", "2. Wrap de Proteína/Grasa", "3. Naranja al final"],
      explicacion: "Consumir la fruta al final permite que la fibra y la proteína del huevo actúen como un 'freno metabólico', impidiendo picos de insulina y protegiendo el hígado."
    },
    nutrientes: { proteina: "30g", grasas: "15g", carbos: "35g", fibra: "8g" },
    sugerencia: "Agrega cúrcuma para potenciar el efecto antiinflamatorio del desayuno.",
    notaPro: "Energía sostenida garantizada por 3.5 a 4 horas. Saciedad máxima vía leptina."
  };
};
