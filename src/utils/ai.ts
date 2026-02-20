
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
  console.log("Iniciando motor v26.0 (Chef Ejecutivo) para:", mealDesc);

  // 1. MOTOR CHEF EJECUTIVO: Gemini 2.0 Flash con Tono Motivador y Técnica Real
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como un Chef Ejecutivo Profesional y Motivador. 
      Transforma los ingredientes de "${mealDesc}" en una receta real que inspire excelencia.
      
      REGLAS DE ORO:
      1. TONO: Profesional, directo y altamente motivador. Haz que el usuario se sienta un pro en la cocina.
      2. PASOS: Máximo 4 pasos numerados. Usa verbos de cocina auténticos (ej: "Sella", "Tuesta", "Carameliza", "Reduce", "Emplata").
      3. INGREDIENTES: Lista con iconos técnicos (ej: "🥩 90g de Proteína", "🌿 Vegetales frescos").
      4. BIO-HACK: Enfócate en un beneficio metabólico o energético potente al terminar.
      5. LÍQUIDOS: Mantener restricción médica (no beber 30min antes / 60min después).

      SALIDA REQUERIDA (JSON PURO):
      {
        "titulo": "Nombre Gourmet e Inspirador",
        "ingredientes": ["Icono Cantidad - Nombre", "..."],
        "preparacion": ["1. [Verbo de acción]: Descripción técnica y motivadora", "2. ...", "3. ...", "4. ..."],
        "bioHack": { 
            "titulo": "Impulso Metabólico", 
            "pasos": ["Acción metabólica clave"], 
            "explicacion": "Explicación de cómo este plato optimiza tu energía o metabolismo." 
        },
        "kcal": 0,
        "nutrientes": { "proteina": "", "grasas": "", "carbos": "", "fibra": "" },
        "sugerencia": "El secreto del Chef Ejecutivo para el éxito del plato.",
        "notaPro": "Cómo se siente comer este plato (textura, energía, satisfacción).",
        "imageUrl": "URL_PLACEHOLDER"
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Nuevo prompt automático solicitado por el usuario para estética minimalista y saludable
        const imageQuery = encodeURIComponent(`Fotografía gourmet de ${parsed.titulo}, primer plano, luz natural, estilo minimalista y saludable, 4k`);
        parsed.imageUrl = `https://source.unsplash.com/featured/?${imageQuery}`;
        return parsed;
      }
    } catch (e) {
      console.error("Gemini Chef Executive Error:", e);
    }
  }

  // 2. FALLBACK CHEF EJECUTIVO v26.0
  return {
    kcal: 0,
    ingredientes: [
      `🥩 Proteína de alta calidad (${mealDesc})`,
      "🌿 Mix de vegetales frescos vibrantes",
      "🫒 Oro líquido (Aceite de Oliva)",
      "🧂 Cristales de sal y especias"
    ],
    preparacion: [
      "1. Sella el ingrediente principal a fuego vivo para capturar todos los jugos y nutrientes.",
      "2. Saltea los vegetales suavemente para mantener su textura crocante y enzimas intactas.",
      "3. Tuesta los carbohidratos ligeramente si aplica para despertar su sabor natural.",
      "4. Emplata con orgullo, añadiendo el toque de aceite de oliva en crudo para brillar."
    ],
    bioHack: {
      titulo: "Activación Metabólica",
      pasos: ["Camina 10-15 min después de comer"],
      explicacion: "El movimiento post-prandial sincroniza la glucosa con tus músculos, optimizando tu energía para el resto del día."
    },
    nutrientes: { proteina: "", grasas: "", carbos: "", fibra: "" },
    sugerencia: "La confianza en la cocina es el ingrediente que no se compra.",
    notaPro: "Un plato equilibrado que te dejará satisfecho y lleno de claridad mental.",
    imageUrl: `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(mealDesc)}`
  };
};
