
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
  console.log("Iniciando motor v24.0 (High-Fidelity) para:", mealDesc);

  // 1. MOTOR GOURMET: Gemini 2.0 Flash con Estructura Detallada
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como un Chef de Alta Cocina y Nutricionista. 
      
      TU TAREA: Generar una receta de ALTA FIDELIDAD para: "${mealDesc}"
      
      REGLAS DE ORO DE ESTRUCTURA:
      1. INGREDIENTES: Categorízalos por tipo usando negritas (ej: "**Proteína:** 90g de...", "**Vegetales:** 1 taza de...", "**Grasas:** 1 cdita de...").
      2. PREPARACIÓN: Divide el proceso en SECCIONES claras:
         - **1. Prepara la Fruta y Vegetales:** (Pasos iniciales)
         - **2. Cocina el [Ingrediente Principal]:** (Técnica de fuego)
         - **3. Monta el Plato:** (Instrucciones finales de emplatado)
      3. RESTRICCIÓN MÉDICA: NUNCA menciones ingerir líquidos. No hables de agua ni hidratación.
      4. TONO: Profesional, didáctico y centrado en la excelencia culinaria.

      SALIDA REQUERIDA (JSON PURO):
      {
        "ingredientes": ["**Categoría:** Cantidad - Nombre", "..."],
        "preparacion": ["**SECCIÓN:** Explicación detallada y clara del paso", "..."],
        "kcal": 0,
        "bioHack": { "titulo": "", "pasos": [], "explicacion": "" },
        "nutrientes": { "proteina": "", "grasas": "", "carbos": "", "fibra": "" },
        "sugerencia": "Un secreto de chef para este plato.",
        "notaPro": "Descripción de la textura y sabor final esperados.",
        "imageUrl": "URL_PLACEHOLDER"
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Query de imagen premium similar al ejemplo del cliente
        const imageQuery = encodeURIComponent(mealDesc + " gourmet plate professional food photography neutral background sunlight");
        parsed.imageUrl = `https://source.unsplash.com/featured/?${imageQuery}`;
        return parsed;
      }
    } catch (e) {
      console.error("Gemini High-Fidelity Error:", e);
    }
  }

  // 2. FALLBACK GOURMET v24.0
  return {
    kcal: 0,
    ingredientes: [
      `**Proteína:** Porción adecuada de ${mealDesc}.`,
      "**Vegetales:** Combinación de hojas verdes y vegetales frescos.",
      "**Grasas Saludables:** Aceite de oliva virgen extra o aguacate.",
      "**Sabor:** Especias naturales, limón y sal marina."
    ],
    preparacion: [
      `**1. Organización:** Ten a mano todos los ingredientes para tu "${mealDesc}".`,
      "**2. Cocinado:** Prepáralo respetando la técnica ideal (sellado, vapor o crudo según aplique).",
      "**3. Toque Final:** Combina los sabores y utiliza el aceite de oliva al final.",
      "**4. Servicio:** Emplata de forma limpia y disfruta tu creación (recuerda esperar 60 min para beber)."
    ],
    bioHack: { titulo: "", pasos: [], explicacion: "" },
    nutrientes: { proteina: "", grasas: "", carbos: "", fibra: "" },
    sugerencia: `La calidad del ingrediente principal es el 90% del éxito en este "${mealDesc}".`,
    notaPro: `El resultado será un plato equilibrado, lleno de texturas y colores vibrantes.`,
    imageUrl: `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(mealDesc)}`
  };
};
