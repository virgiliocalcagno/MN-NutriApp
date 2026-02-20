
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Profile } from "../types/store";

export interface AIResponse {
  perfilAuto: Partial<Profile>;
  semana: Record<string, Record<string, string>>;
  ejercicios: Record<string, any[]>;
  compras: [string, string, number, string, string][];
}

export interface RecipeDetails {
  titulo?: string; // Título creativo generado por la IA
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
  console.log("Iniciando motor v28.0 (El Cerebro) para:", mealDesc);

  // 1. MOTOR DINÁMICO 'EL CEREBRO': Gemini 2.0 Flash con System Prompt de Chef & Bio-hacker
  if (apiKey && apiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `Actúa como un Chef de Alta Cocina y Experto en Bio-hacking. 
      Tu tarea es transformar los ingredientes de "${mealDesc}" en una experiencia visual y educativa.

      REGLAS CRÍTICAS:
      1. TÍTULO: Crea un nombre apetitoso y gourmet (ej: 'Bowl de Atún Cítrico' en lugar de 'Atún con pepino').
      2. INSTRUCCIONES: Escribe exactamente 4 pasos de cocina reales y específicos para esos ingredientes. PROHIBIDO usar 'Organización' o 'Cocinado' como títulos. Sé técnico y profesional.
      3. DIGESTIÓN EFICIENTE (HACK): Genera un consejo científico corto específico para ese plato (ej: 'El ácido del limón en este atún pre-digiere la proteína para evitar pesadez').
      4. FOTO PROMPT: Genera una descripción detallada para un modelo de imagen que muestre solo el plato servido, estilo gourmet, sin texto encima.
      5. FORMATO: Devuelve estrictamente un JSON puro.

      ESTRUCTURA JSON REQUERIDA:
      {
        "titulo": "Nombre Gourmet",
        "foto_prompt": "Descripción detallada para imagen gourmet",
        "ingredientes_lista": ["Cantidad - Ingrediente con Icono", "..."],
        "pasos_preparacion": [
          "Seca/Limpia el ingrediente base...",
          "Técnica de calor aplicada...",
          "Ensamble técnico del plato...",
          "Toque final técnico y emplatado..."
        ],
        "bio_hack": "Consejo científico específico"
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const imageQuery = encodeURIComponent(parsed.foto_prompt || `${parsed.titulo}, gourmet food photography, natural light, 4k`);

        return {
          titulo: parsed.titulo,
          kcal: 0,
          ingredientes: parsed.ingredientes_lista,
          preparacion: parsed.pasos_preparacion,
          imageUrl: `https://source.unsplash.com/featured/?${imageQuery}`,
          bioHack: {
            titulo: "Ciencia Digestiva",
            pasos: [parsed.bio_hack],
            explicacion: "Consejo científico personalizado para optimizar la digestión y el metabolismo de este plato."
          },
          nutrientes: { proteina: "", grasas: "", carbos: "", fibra: "" },
          sugerencia: "Técnica maestra del Chef de Alta Cocina.",
          notaPro: "Experiencia sensorial exclusiva."
        };
      }
    } catch (e) {
      console.error("Gemini Brain v28.0 Error:", e);
    }
  }

  // 2. FALLBACK DINÁMICO v28.0
  return {
    titulo: `Chef's Choice: ${mealDesc}`,
    kcal: 0,
    ingredientes: [
      `🥩 Proteína base (${mealDesc})`,
      "🌿 Vegetales vibrantes",
      "🫒 AOVE Premium",
      "🧂 Cristales de sal"
    ],
    preparacion: [
      "Acondiciona el ingrediente principal retirando humedad para una técnica perfecta.",
      "Aplica la técnica de calor principal respetando los tiempos de sellado.",
      "Ensambla los acompañamientos creando armonía visual y nutritiva.",
      "Finaliza con un toque de aceite de oliva en crudo para realzar sabores."
    ],
    bioHack: {
      titulo: "Optimización Metabólica",
      pasos: ["Mastica 30 veces cada bocado"],
      explicacion: "La masticación consciente es el primer bio-hack para una absorción perfecta."
    },
    nutrientes: { proteina: "", grasas: "", carbos: "", fibra: "" },
    sugerencia: "La técnica es el alma de la nutrición.",
    notaPro: "Un balance perfecto centrado en la excelencia.",
    imageUrl: `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(mealDesc)}`
  };
};
