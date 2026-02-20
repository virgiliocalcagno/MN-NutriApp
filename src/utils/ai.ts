
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
  console.log("Iniciando motor v25.0 (Chef de Nutrición) para:", mealDesc);

  // 1. MOTOR CHEF TÉCNICO: Gemini 2.0 Flash con Precisión Culinaria
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como un Chef de Nutrición experto. 
      Analiza los ingredientes de "${mealDesc}" y genera una receta técnica.
      
      REGLAS CRÍTICAS:
      1. PROHIBIDO usar frases genéricas como "Organización", "Cocinado", "Preparación" o "Servicio" como títulos.
      2. INGREDIENTES: Lista con iconos al inicio (ej: "🥩 90g de Salmón", "🥬 Vegetales libres").
      3. PREPARACIÓN: Exactamente 4 pasos cortos, técnicos y directos. Sin introducciones.
      4. BIO-HACK: Debe ser un consejo científico específico para mejorar la digestión de este plato exacto.
      5. LÍQUIDOS: Mantener restricción médica (no mencionar beber nada 30min antes/60min después).

      SALIDA REQUERIDA (JSON PURO):
      {
        "titulo": "Título técnico y corto del plato",
        "ingredientes": ["Icono Cantidad - Nombre", "..."],
        "preparacion": ["Verbo en imperativo: Acción técnica directa", "..."],
        "bioHack": { 
            "titulo": "Digestión Eficiente", 
            "pasos": ["Consejo científico 1", "Consejo científico 2"], 
            "explicacion": "Explicación breve del proceso bioquímico/digestivo del consejo." 
        },
        "kcal": 0,
        "nutrientes": { "proteina": "", "grasas": "", "carbos": "", "fibra": "" },
        "sugerencia": "Tip de chef para el punto exacto de cocción.",
        "notaPro": "Resultado sensorial esperado.",
        "imageUrl": "URL_PLACEHOLDER"
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Query de imagen ultra-realista solicitada por el usuario
        const imageQuery = encodeURIComponent(`Fotografía gastronómica profesional, primer plano, estilo gourmet, plato de ${parsed.titulo}, ingredientes frescos de ${parsed.ingredientes.join(", ")}, luz natural de día, fondo de madera clara, 4k, ultra realista`);
        parsed.imageUrl = `https://source.unsplash.com/featured/?${imageQuery}`;
        return parsed;
      }
    } catch (e) {
      console.error("Gemini Chef Tech Error:", e);
    }
  }

  // 2. FALLBACK CHEF v25.0
  return {
    kcal: 0,
    ingredientes: [
      `🥩 Porción técnica de ${mealDesc}`,
      "🥬 Vegetales frescos seleccionados",
      "🫒 Aceite de Oliva Virgen Extra",
      "🧂 Sal marina y especias"
    ],
    preparacion: [
      `Acondiciona ${mealDesc} retirando humedad excesiva para el sellado.`,
      "Aplica técnica de cocción directa a temperatura media hasta punto óptimo.",
      "Integra los vegetales con un toque de limón para preservar enzimas.",
      "Emplata de forma limpia, añadiendo el aceite de oliva en crudo al final."
    ],
    bioHack: {
      titulo: "Digestión Eficiente",
      pasos: ["Mastica 30 veces cada bocado", "Espera 60 min para beber"],
      explicacion: "La masticación prolongada activa la amilasa salival, pre-digiriendo el plato para una absorción sin inflamación."
    },
    nutrientes: { proteina: "", grasas: "", carbos: "", fibra: "" },
    sugerencia: "El reposo de 2 minutos post-cocción mantiene los jugos internos.",
    notaPro: "Textura equilibrada con perfiles de sabor limpios.",
    imageUrl: `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(mealDesc)}`
  };
};
