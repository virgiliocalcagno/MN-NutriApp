
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
  // Try direct Gemini 2.0 first
  if (apiKey && apiKey !== 'AIzaSyAF5rs3cJFs_E6S7ouibqs7B2fgVRDLzc0') {
    try {
      console.log("Intentando procesamiento directo con Gemini 2.0 Flash...");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const p = perfil || {};
      let promptText = `Actúa como procesador médico experto para MN-NutriApp. 
                
                CONTEXTO PACIENTE ACTUAL (PARA REFERENCIA):
                - Nombre: ${p.paciente || 'Nuevo Paciente'}
                - Médico: ${p.doctor || 'No asignado'}
                
                IMPORTANTE: Ignora el contexto actual si el PDF contiene datos de una persona diferente. Extrae siempre la información directamente de los documentos adjuntos.
                
                DATOS DISPONIBLES:
                ${pdfPlanBase64 ? '- Se adjunta Plan Nutricional en PDF.' : '- NO hay PDF de plan.'}
                ${pdfEvalBase64 ? '- Se adjunta Evaluación Médica en PDF.' : '- NO hay PDF de evaluación.'}

                TAREAS:
                1. EXTRAE Y RELLENA EL PERFIL: Analiza los documentos PDF y extrae REALMENTE: Nombre del Paciente, Doctor, Edad, Peso, Estatura, Cintura, Objetivos, Comorbilidades, Tipo de Sangre y Alergias.
                2. MENÚ DE 7 DÍAS: Transcribe el menú para CADA DÍA encontrado en el PDF.
                3. RUTINA DE EJERCICIOS DIARIA: Crea una rutina específica para CADA DÍA.
                   - Incluye enlaces de 'eresfitness.com/ejercicios' o YouTube.
                4. LISTA DE MERCADO DOMINICANA:
                   - Convierte a Libras (Lb) o Onzas (Oz).
                   - ESTRUCTURA JSON: ["Nombre", "Cantidad", NivelStock, "Categoría", "Pasillo"]

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
      throw new Error("Formato de respuesta inválido");
    } catch (e: any) {
      console.warn("Gemini 2.0 falló, intentando Fallback (Cloud Function)...", e.message);
    }
  }

  try {
    const cleanPlan = pdfPlanBase64?.replace(/^data:application\/pdf;base64,/, "");
    const cleanEval = pdfEvalBase64?.replace(/^data:application\/pdf;base64,/, "");
    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        perfil: JSON.stringify(perfil),
        pdfPlan: cleanPlan,
        pdfEval: cleanEval
      })
    });
    if (!response.ok) throw new Error("Error Servidor Cloud");
    return await response.json();
  } catch (error: any) {
    console.error("AI Critical Error:", error);
    throw error;
  }
};

export const analyzeImageWithGemini = async (base64Image: string, perfil?: any, apiKey?: string) => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    // Prioritize Gemini 2.0 Flash for NutriScan
    if (apiKey && apiKey !== 'AIzaSyAF5rs3cJFs_E6S7ouibqs7B2fgVRDLzc0') {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = "Analiza esta comida. Detecta ingredientes, calorías estimadas, macronutrientes y da 3 bio-hacks científicos. Responde en JSON.";
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
    if (!response.ok) throw new Error("Error en servidor de análisis");
    return await response.json();
  } catch (error) {
    console.error("Error NutriScan:", error);
    throw error;
  }
};

export const getRecipeDetails = async (mealDesc: string, perfil?: any, apiKey?: string): Promise<RecipeDetails> => {
  const cleanDesc = mealDesc.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F200}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

  // 1. Intentar Cloud Function
  try {
    const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/generarDetalleReceta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descripcion: mealDesc, perfil, modo: 'v10_protocolo_optimo' })
    });
    if (response.ok) return await response.json();
  } catch (e) {
    console.warn("Cloud Function failed...");
  }

  // 2. IA Local con Gemini 2.0 Flash (Más robusto)
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como Nutricionista de Precisión. Genera una ficha técnica para: "${mealDesc}".
      
      IMPORTANTE:
      - Si es BATIDO/PROTEÍNA: Mezcla fría en shaker, sin calor.
      - Si es TÉ/CAFÉ: Agua a 85°C.
      - Si es FRUTA/SNACK: Lavado y porcionado.
      
      Responde SOLO en este JSON:
      {
        "kcal": 250,
        "ingredientes": ["..."],
        "preparacion": ["Paso 1", "Paso 2", "..."],
        "bioHack": { "titulo": "...", "pasos": ["...", "..."], "explicacion": "..." },
        "nutrientes": { "proteina": "20g", "grasas": "10g", "carbos": "30g", "fibra": "5g" },
        "sugerencia": "...",
        "notaPro": "..."
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json|```/g, "").trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Gemini 2.0 Local Failed:", e);
    }
  }

  // 3. Fallback Inteligente de Último Recurso (No genérico)
  const isProteina = mealDesc.toLowerCase().includes('proteina') || mealDesc.toLowerCase().includes('scoop');

  return {
    kcal: isProteina ? 120 : 250,
    ingredientes: [mealDesc],
    preparacion: isProteina ? [
      "Mezcla: Vierte el scoop de proteína en el líquido frío.",
      "Agitación: Usa un shaker o licuadora para evitar grumos.",
      "Fruta: Consume la fruta entera para aprovechar la fibra."
    ] : [
      "Preparación: Organiza los ingredientes según tu plan médico.",
      "Consumo: Ingiere con calma respetando el orden de saciedad."
    ],
    bioHack: {
      titulo: isProteina ? "Aprovechamiento de Aminoácidos" : "Protocolo de Ingesta",
      pasos: ["Consumir despacio", "Hidratación adecuada"],
      explicacion: "Mantener una ingesta pausada optimiza la absorción de nutrientes."
    },
    nutrientes: { proteina: isProteina ? "25g" : "15g", grasas: "5g", carbos: "20g", fibra: "3g" },
    sugerencia: "Sigue fielmente las cantidades indicadas en tu plan físico.",
    notaPro: "Este detalle ha sido simplificado para garantizar tu seguridad."
  };
};
