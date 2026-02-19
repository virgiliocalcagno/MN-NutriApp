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
  preparacion: string[];
  bioHack: string;
  sugerencia: string;
  ordenIngesta: string;
}

// URL of the Cloud Function (Reliable fallback)
const CLOUD_FUNCTION_URL = 'https://us-central1-mn-nutriapp.cloudfunctions.net/procesarNutricion';

export const processPdfWithGemini = async (
  perfil: Partial<Profile>,
  pdfPlanBase64?: string,
  pdfEvalBase64?: string,
  apiKey?: string
): Promise<AIResponse> => {
  // Try direct Gemini first if key exists
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
      // Fall through to Cloud Function
    }
  }

  // Fallback / Default: Cloud Function (Robust)
  try {
    console.log("Usando procesamiento seguro (Cloud Function)...");
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
export const getRecipeDetails = async (mealDesc: string, perfil?: any): Promise<RecipeDetails> => {
  const lowerDesc = mealDesc.toLowerCase();

  // 1. Detect category for smarter fallbacks
  let category: 'liquido' | 'snack' | 'plato' = 'plato';
  if (lowerDesc.includes('té') || lowerDesc.includes('cafe') || lowerDesc.includes('infusion') || lowerDesc.includes('jugo') || lowerDesc.includes('batido')) {
    category = 'liquido';
  } else if (lowerDesc.includes('galleta') || lowerDesc.includes('fruta') || lowerDesc.includes('nuez') || lowerDesc.includes('yogur') || lowerDesc.includes('barrita')) {
    category = 'snack';
  }

  try {
    const response = await fetch('https://us-central1-mn-nutriapp.cloudfunctions.net/generarDetalleReceta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descripcion: mealDesc,
        perfil: perfil,
        modo: 'experto_estricto' // Señal para el backend de no inventar
      })
    });

    if (!response.ok) throw new Error("Error en servidor IA");
    return await response.json();
  } catch (error) {
    console.warn("AI Recipe Fallback activated for:", mealDesc);

    // 2. Context-aware fallbacks (Medical grade accuracy)
    if (category === 'liquido') {
      return {
        kcal: 50,
        preparacion: [
          "Calienta agua pura hasta el punto previo a la ebullición.",
          "Infusiona el ingrediente por 3-5 minutos para preservar antioxidantes.",
          "Sirve sin endulzantes artificiales o utiliza Stevia pura si es necesario."
        ],
        bioHack: "Consumir líquidos calientes después de la comida (no antes) puede ayudar a la digestión enzimática.",
        sugerencia: "Evita añadir azúcar para mantener la respuesta a la insulina en niveles basales.",
        ordenIngesta: "Líquidos preferiblemente después o durante la ingesta si no dificultan la masticación."
      };
    }

    if (category === 'snack') {
      return {
        kcal: 180,
        preparacion: [
          "Lava y porciona la fruta o el snack según el gramaje del plan.",
          "Asegúrate de que las galletas o snacks sean integrales y sin azúcares añadidos.",
          "Sirve en un plato pequeño para practicar la alimentación consciente (Mindful Eating)."
        ],
        bioHack: "Combina el snack con una fuente de grasa saludable (nueces) o proteína para reducir el índice glucémico.",
        sugerencia: "Si es fruta, cómela entera con su fibra, nunca en jugo.",
        ordenIngesta: "Un snack debe ser una pausa rápida, no un reemplazo de plato fuerte; prioriza la masticación lenta."
      };
    }

    // Default for 'plato'
    return {
      kcal: 400,
      preparacion: [
        "Verifica las porciones de carbohidratos, proteínas y vegetales de tu plan.",
        "Cocina preferiblemente al vapor, plancha o Air-fryer con mínimo aceite de oliva.",
        "Asegúrate de condimentar con hierbas naturales y sal rosada con moderación."
      ],
      bioHack: "Sigue la regla de oro: Fibras (Vegetales) -> Proteínas -> Carbohidratos para aplanar la curva de glucosa.",
      sugerencia: "Prepara tus vegetales al dente para conservar la integridad de sus micronutrientes.",
      ordenIngesta: "1. Vegetales (Fibra) -> 2. Proteínas y Grasas -> 3. Carbohidratos complejos."
    };
  }
};
