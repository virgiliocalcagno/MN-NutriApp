
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
        modo: 'v10_protocolo_optimo'
      })
    });

    if (!response.ok) throw new Error("Error en servidor IA");
    return await response.json();
  } catch (error) {
    console.warn("AI Recipe Fallback v10 activated for:", mealDesc);

    // Fallback de élite basado en el ejemplo del usuario (Atún/Tortilla) o similar
    if (category === 'liquido') {
      return {
        kcal: 45,
        ingredientes: ["250ml de Agua Filtrada", "1 bolsita de té o infusión herbal", "Stevia pura (opcional)"],
        preparacion: [
          "Acondicionamiento del Agua: Calienta el agua filtrada hasta los 85°C (punto previo a la ebullición) para no quemar las hojas.",
          "Infusión: Sumerge la bolsa y deja reposar exactamente 4 minutos para una extracción óptima de polifenoles.",
          "Servicio: Retira la bolsa sin exprimirla y sirve en porcelana para mantener la temperatura basal."
        ],
        bioHack: {
          titulo: "Hidratación Termogénica",
          pasos: ["Bebe después de la comida principal", "No endulces para mantener la insulina en reposo"],
          explicacion: "La temperatura del líquido ayuda a la emulsificación de las grasas ingeridas, facilitando la acción de las lipasas gástricas."
        },
        nutrientes: { proteina: "0g", grasas: "0g", carbos: "0g", fibra: "0g" },
        sugerencia: "Agrega una rodaja de limón real para mejorar la biodisponibilidad de los antioxidantes.",
        notaPro: "Consumir té verde o negro después de las comidas puede inhibir la absorción de hierro; si tienes anemia, espera 60 minutos."
      };
    }

    if (category === 'snack') {
      return {
        kcal: 180,
        ingredientes: ["1 Porción de fruta de temporada", "15g de Nueces o Almendras", "Canela en polvo"],
        preparacion: [
          "Porcionado Exacto: Corta la fruta en cubos uniformes para controlar la carga glucémica.",
          "Activación: Acompaña con las semillas crudas para añadir una fuente de grasa que ralentice la digestión.",
          "Finalizado: Espolvorea canela para mejorar la sensibilidad a la insulina celular."
        ],
        bioHack: {
          titulo: "Control Glucémico en Snacks",
          pasos: ["Come primero las nueces", "Sigue con la fruta entera"],
          explicacion: "La grasa de la nuez induce la liberación de colecistoquinina (CCK), indicando saciedad al cerebro antes de procesar el azúcar de la fruta."
        },
        nutrientes: { proteina: "4g", grasas: "9g", carbos: "22g", fibra: "5g" },
        sugerencia: "Nunca consumas la fruta en jugo; la ausencia de fibra provoca picos de glucosa hepática indeseados.",
        notaPro: "Este snack tiene una densidad nutricional alta; mastica cada bocado al menos 20 veces para optimizar la amilasa salival."
      };
    }

    // Default 'Plato Optimizado' (Basado en el ejemplo del usuario)
    return {
      kcal: 295,
      ingredientes: ["140g de Atún en agua (escurrido)", "1 Tortilla de trigo integral", "5ml de Aceite de Oliva VE", "Mix de Espinacas y Pepino"],
      preparacion: [
        "Acondicionamiento de la Proteína: Mezcla el atún con el aceite de oliva y pimienta. El aceite facilita la absorción de vitaminas liposolubles (A, D, E, K).",
        "Tratamiento de la Base: Calienta la tortilla 30s por lado sin tostar (evita compuestos pro-inflamatorios de glicación avanzada).",
        "Ensamblaje Técnico: Coloca la cama de vegetales primero, luego la proteína y cierra con firmeza.",
        "Emplatado: Sirve los vegetales frescos adicionales al lado para maximizar la ingesta de fibra cruda."
      ],
      bioHack: {
        titulo: "Secuenciación de Nutrientes",
        pasos: ["1. Vegetales (Fibra)", "2. Proteína y Grasa", "3. Carbohidrato"],
        explicacion: "La fibra crea una 'malla' intestinal que ralentiza la absorción de glucosa. La proteína libera hormonas de saciedad (GLP-1) antes de llegar al carbohidrato."
      },
      nutrientes: { proteina: "26g", grasas: "8g", carbos: "28g", fibra: "6g" },
      sugerencia: "Agrega unas gotas de vinagre de sidra de manzana a los vegetales para mejorar la respuesta insulínica de la comida completa.",
      notaPro: "Usa pimienta negra recién molida; la piperina aumenta la absorción de nutrientes en un 200%."
    };
  }
};
