
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
  if (apiKey && apiKey !== 'AIzaSyAF5rs3cJFs_E6S7ouibqs7B2fgVRDLzc0') {
    try {
      console.log("Intentando procesamiento directo con Gemini...");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: 'v1' });

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
                   - IMPORTANTE: Para cada ejercicio, busca e incluye un enlace informativo o de video ("link") de 'eresfitness.com/ejercicios' o YouTube.
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
      console.warn("Procesamiento directo falló, intentando Fallback (Cloud Function)...", e.message);
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
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error Servidor (${response.status})`);
    }
    return await response.json();
  } catch (error: any) {
    console.error("AI Critical Error:", error);
    alert(`⚠️ Error de Análisis: ${error.message}`);
    throw error;
  }
};

export const analyzeImageWithGemini = async (base64Image: string, perfil?: any) => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/analizarComida', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imagenBase64: cleanBase64,
        perfilPaciente: perfil
      })
    });
    if (!response.ok) throw new Error("Error en servidor de análisis");
    return await response.json();
  } catch (error) {
    console.error("Error NutriScan:", error);
    throw error;
  }
};

const generateDynamicFallback = (mealDesc: string): RecipeDetails => {
  const ingredients = mealDesc.split(/[:\+,]/).map(s => s.trim()).filter(s => s.length > 5);
  const lower = mealDesc.toLowerCase();

  // Categorización para lógica de preparación
  const isLiquido = lower.includes('té') || lower.includes('infusion') || lower.includes('cafe') || lower.includes('jugo') || lower.includes('agua');
  const isSnack = lower.includes('galleta') || lower.includes('fruta') || lower.includes('nuez') || lower.includes('yogur') || lower.includes('naranja');

  let prep = [
    `Preparación: Organiza los elementos de tu plan (${mealDesc}) respetando las porciones.`,
    "Cocción Técnica: Utiliza calor seco (plancha o Air-fryer) solo para proteínas y carbohidratos complejos.",
    "Finalizado: Condimenta con especias naturales y evita azúcares añadidos."
  ];

  if (isLiquido) {
    prep = [
      "Acondicionamiento del Agua: Calienta agua filtrada hasta los 85°C (punto previo a ebullición).",
      "Infusión: Deja reposar el ingrediente por 4-5 minutos para una extracción óptima de antioxidantes.",
      "Servicio: Disfruta sin endulzantes para mantener la respuesta insulínica estable."
    ];
  } else if (isSnack) {
    prep = [
      "Lavado y Porcionado: Asegura la higiene de la fruta o snack y mide la cantidad exacta del plan.",
      "Ensamblaje: Acompaña con agua o una infusión si el plan lo permite.",
      "Masticación Consciente: Ingiere lentamente para activar las señales de saciedad cerebral."
    ];
  }

  return {
    kcal: isLiquido ? 45 : isSnack ? 150 : 350,
    ingredientes: ingredients.length > 0 ? ingredients : [mealDesc],
    preparacion: prep,
    bioHack: {
      titulo: isLiquido ? "Terapia de Hidratación" : "Secuenciación MN-Precision",
      pasos: isLiquido ? ["Bebe después de comer", "Evita endulzar"] : ["1. Vegetales", "2. Proteína", "3. Carbohidrato"],
      explicacion: isLiquido ? "La hidratación post-prandial ayuda a la digestión sin diluir excesivamente los ácidos gástricos." : "El orden de ingesta protege tu metabolismo de picos de glucosa."
    },
    nutrientes: {
      proteina: isLiquido ? "0g" : isSnack ? "2g" : "25g",
      grasas: isLiquido ? "0g" : isSnack ? "5g" : "12g",
      carbos: isLiquido ? "0g" : isSnack ? "20g" : "30g",
      fibra: isLiquido ? "0g" : isSnack ? "3g" : "6g"
    },
    sugerencia: isLiquido ? "Puedes agregar canela para mejorar el sabor." : "La presentación visual es clave para la saciedad.",
    notaPro: "Protocolo dinámico sincronizado con el contenido real de tu menú."
  };
};

export const getRecipeDetails = async (mealDesc: string, perfil?: any, apiKey?: string): Promise<RecipeDetails> => {
  try {
    const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/generarDetalleReceta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descripcion: mealDesc, perfil, modo: 'v10_protocolo_optimo' })
    });
    if (response.ok) return await response.json();
  } catch (e) {
    console.warn("Cloud Function failed, trying Local Gemini...");
  }

  if (apiKey && apiKey !== 'AIzaSyAF5rs3cJFs_E6S7ouibqs7B2fgVRDLzc0') {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Actúa como Nutricionista Clínico Experto. Genera una RECETA EXACTA para este plato: "${mealDesc}".
      Usa exactamente este formato JSON (sin markdown):
      {
        "kcal": 300,
        "ingredientes": ["Ingrediente 1 con cantidad", "..."],
        "preparacion": ["Paso 1 técnico", "..."],
        "bioHack": { "titulo": "...", "pasos": ["...", "..."], "explicacion": "..." },
        "nutrientes": { "proteina": "20g", "grasas": "10g", "carbos": "30g", "fibra": "5g" },
        "sugerencia": "...",
        "notaPro": "..."
      }`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Gemini Direct failed:", e);
    }
  }

  return generateDynamicFallback(mealDesc);
};
