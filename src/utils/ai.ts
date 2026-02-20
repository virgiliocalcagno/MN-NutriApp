
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
  console.log("Iniciando motor v22.0 (Restricción Líquidos) para:", mealDesc);

  // 1. MOTOR TITÁNICO: Gemini 2.0 Flash con Restricciones Médicas Estrictas
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como un Nutricionista Jefe y Especialista en Bio-Hacking.

      TU TAREA: Explicar cómo preparar este plato y dar consejos de Bio-Hack: "${mealDesc}"
      
      REGLAS MÉDICAS CRÍTICAS (NO NEGOCIABLES):
      1. RESTRICCIÓN DE LÍQUIDOS: NUNCA recomiendes beber agua, jugos, té o cualquier líquido desde 30 minutos ANTES hasta 60 minutos DESPUÉS de la comida. Es una regla médica estricta para este paciente.
      2. TERMINOLOGÍA: Usa siempre el término "Bio-Hack" para los consejos.
      3. FOCO: Enfócate exclusivamente en la receta profesional, el orden de ingesta de los alimentos sólidos y cómo mitigar efectos dañinos (picos de insulina, inflamación).
      4. TONO: Cercano, práctico y autoritario en materia de salud.

      SALIDA REQUERIDA (JSON PURO):
      {
        "kcal": número_estimado,
        "ingredientes": ["Cantidad - Nombre del ingrediente", "..."],
        "preparacion": ["PASO: Explicación de cocina para ${mealDesc}", "..."],
        "bioHack": { 
            "titulo": "Título de Bio-Hack sobre ${mealDesc}", 
            "pasos": ["Protocolo de ingesta de sólidos 1", "Técnica de mitigación 2", "..."], 
            "explicacion": "Análisis de cómo este Bio-Hack protege tu metabolismo." 
        },
        "nutrientes": { "proteina": "Xg", "grasas": "Xg", "carbos": "Xg", "fibra": "Xg" },
        "sugerencia": "Tip extra para la preparación.",
        "notaPro": "Efecto esperado en tu energía y saciedad.",
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
      console.error("Gemini Medical Rules Error:", e);
    }
  }

  // 2. FALLBACK MÉDICO v22.0 (Sin Líquidos)
  const isDrink = /té|te|cafe|café|infusión|agua|jugo|batido/i.test(mealDesc);

  return {
    kcal: isDrink ? 15 : 320,
    ingredientes: [
      `Base sólida: Porción controlada de ${mealDesc}.`,
      "Protección: Verduras de hoja verde para el inicio.",
      "Grasa funcional: Aceite de Oliva para ralentizar la digestión.",
      "Sazonado: Sal del Himalaya y especias naturales."
    ],
    preparacion: [
      `PASO 1: Organizar los componentes de ${mealDesc}.`,
      "COCINADO: Preparar respetando los tiempos para evitar compuestos tóxicos.",
      `ORDEN: Servir primero la fibra, luego la proteína y finalmente el carbohidrato de ${mealDesc}.`,
      "POST-COMIDA: Esperar 60 minutos antes de ingerir cualquier líquido."
    ],
    bioHack: {
      titulo: `Protección Metabólica para ${mealDesc}`,
      pasos: [
        `1. Consume la fibra de tu ${mealDesc} primero`,
        "2. Mastica cada bocado hasta que sea líquido",
        "3. Respeta la ventana de no líquidos (30 min antes / 60 min después)"
      ],
      explicacion: `Evitar líquidos con el "${mealDesc}" previene la dilución de los jugos gástricos, asegurando una digestión perfecta y máxima absorción de nutrientes sin picos de insulina.`
    },
    nutrientes: { proteina: isDrink ? "0g" : "20g", grasas: isDrink ? "0g" : "10g", carbos: isDrink ? "2g" : "25g", fibra: "4g" },
    sugerencia: `No olvides que el primer paso para digerir bien el "${mealDesc}" empieza en la boca con la masticación.`,
    notaPro: "Energía garantizada sin pesadez estomacal gracias al protocolo de líquidos."
  };
};
