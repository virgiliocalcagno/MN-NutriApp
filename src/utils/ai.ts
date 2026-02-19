
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
  // 1. Try Cloud Function first
  try {
    const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/generarDetalleReceta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descripcion: mealDesc, perfil, modo: 'v10_protocolo_optimo' })
    });
    if (response.ok) return await response.json();
  } catch (e) { }

  // 2. High-Precision Local Fallback with Gemini 2.0 Flash
  if (apiKey && apiKey !== 'AIzaSyAF5rs3cJFs_E6S7ouibqs7B2fgVRDLzc0') {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como Nutricionista Clínico experto en Nutrición de Precisión.
      
      OBJETIVO: Generar una ficha técnica de preparación para: "${mealDesc}".
      
      REGLAS DE SEGURIDAD CRÍTICAS:
      1. CATEGORIZACIÓN: Diferencia estrictamente entre:
         - SUPLEMENTOS (Proteína, Whey, Aminoácidos): NUNCA USAR CALOR. Mezcla mecánica en shaker con líquido FRÍO o ambiente.
         - BEBIDAS FRÍAS (Jugos, Leche): No usar calor.
         - INFUSIONES (Té, Café): Solo aquí se usa agua caliente (85°C).
         - SÓLIDOS CRUDOS (Fruta, Galletas): Solo lavado y porcionado. No inventar cocción.
         - SÓLIDOS COCINADOS (Carnes, Arroz): Usar técnicas de calor seco (plancha, air-fryer).
      
      2. BIO-HACK: Enfócate en la SECCIÓN DE INGESTA (Vegetales > Proteína > Carbo). Si es un batido, el hack es sobre la velocidad de ingesta y saciedad.

      FORMATO JSON (SIN MARKDOWN):
      {
        "kcal": número,
        "ingredientes": ["Cantidad exacta e ingrediente", "..."],
        "preparacion": ["Paso 1 técnico", "Paso 2 técnico", "..."],
        "bioHack": { "titulo": "...", "pasos": ["...", "..."], "explicacion": "..." },
        "nutrientes": { "proteina": "...g", "grasas": "...g", "carbos": "...g", "fibra": "...g" },
        "sugerencia": "...",
        "notaPro": "..."
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Gemini 2.0 Recipe Failed:", e);
    }
  }

  // 3. Ultra-Safe Minimal Fallback (Solo si todo lo demás falla)
  return {
    kcal: 0,
    ingredientes: [mealDesc],
    preparacion: ["Mantenimiento de seguridad: No se pudo generar una receta segura por IA. Sigue las instrucciones de tu plan impreso."],
    bioHack: { titulo: "Verificación Requerida", pasos: ["Consulta tu plan original"], explicacion: "Seguridad ante todo." },
    nutrientes: { proteina: "Consultar", grasas: "Consultar", carbos: "Consultar", fibra: "Consultar" },
    sugerencia: "Consulta con tu médico sobre este plato específico.",
    notaPro: "Protocolo de seguridad activado por falta de contexto clínico."
  };
};
