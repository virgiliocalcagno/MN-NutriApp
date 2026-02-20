
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
  console.log("Iniciando motor v21.0 (Humanizado) para:", mealDesc);

  // 1. MOTOR TITÁNICO: Gemini 2.0 Flash con Tono Cercano
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como un nutricionista y amigo experto, con un lenguaje sencillo, cálido y práctico que cualquier persona pueda entender perfectamente.

      TU TAREA: Explicar cómo preparar este plato: "${mealDesc}"
      
      REGLAS DE ORO (LENGUAJE CERCANO):
      1. NO uses palabras científicas complejas (como polimerización, bioquímica, síntesis, etc.).
      2. Título de Bio-Hack: Cámbialo por "El Truco del Chef" o "Consejo Útil".
      3. Preparación: Usa instrucciones claras como "Calienta la sartén", "Corta en trozos", etc.
      4. Ingredientes: Nombres comunes y fáciles de reconocer.

      SALIDA REQUERIDA (JSON PURO):
      {
        "kcal": número_estimado,
        "ingredientes": ["Cantidad - Nombre del ingrediente", "..."],
        "preparacion": ["PASO: Explicación sencilla de qué hacer", "..."],
        "bioHack": { 
            "titulo": "Un nombre llamativo y simple", 
            "pasos": ["Consejo práctico 1", "Consejo práctico 2", "..."], 
            "explicacion": "Explica el beneficio para la salud de forma que un niño lo entienda." 
        },
        "nutrientes": { "proteina": "Xg", "grasas": "Xg", "carbos": "Xg", "fibra": "Xg" },
        "sugerencia": "Un tip extra master para que quede más rico.",
        "notaPro": "Cómo te sentirás después de comer esto (más energía, saciado, etc.).",
        "imageUrl": "URL_PLACEHOLDER"
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const imageQuery = encodeURIComponent(mealDesc + " delicious food photography");
        parsed.imageUrl = `https://source.unsplash.com/featured/?${imageQuery}`;
        return parsed;
      }
    } catch (e) {
      console.error("Gemini Humanization Error:", e);
    }
  }

  // 2. FALLBACK HUMANO v21.0
  const isDrink = /té|te|cafe|café|infusión|agua|jugo|batido/i.test(mealDesc);

  return {
    kcal: isDrink ? 15 : 320,
    ingredientes: [
      `Base: Una ración normal de ${mealDesc}.`,
      "Toque fresco: Un poco de verduras o ensalada rápida.",
      "Grasa rica: Una cucharadita de aceite de oliva virgen.",
      "Para acompañar: Un vaso de agua con limón."
    ],
    preparacion: [
      `PRIMERO: Ten listo todo para tu "${mealDesc}" a mano.`,
      "EN LA COCINA: Prepáralo con poco fuego para que no pierda sus nutrientes.",
      "AL SERVIR: Combina los ingredientes en el plato para que se vea apetitoso.",
      "DISFRUTA: Cómelo con calma disfrutando cada bocado."
    ],
    bioHack: {
      titulo: `El mejor truco para comer ${mealDesc}`,
      pasos: [
        `1. Come la ensalada antes que el "${mealDesc}"`,
        "2. Bebe agua durante el día",
        "3. Camina 5 minutos después de comer"
      ],
      explicacion: `Si comes primero la fibra (las verduras), tu cuerpo procesará el "${mealDesc}" mucho mejor, dándote energía estable sin que te sientas pesado después.`
    },
    nutrientes: { proteina: isDrink ? "0g" : "20g", grasas: isDrink ? "0g" : "10g", carbos: isDrink ? "2g" : "25g", fibra: "4g" },
    sugerencia: `Prueba a ponerle un toque de limón a tu "${mealDesc}" para realzar el sabor naturalmente.`,
    notaPro: `Este plato te dará energía constante por varias horas y no te sentirás inflamado.`
  };
};
