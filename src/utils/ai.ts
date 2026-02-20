
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
  console.log("Iniciando motor v30.0 para:", mealDesc);

  // v30.0: API key from param, env, or firebase config
  const effectiveApiKey = apiKey || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

  if (effectiveApiKey && effectiveApiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(effectiveApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Actúa como un Chef de Alta Cocina y Experto en Bio-hacking. Tu tarea es transformar una lista de ingredientes en una experiencia visual y educativa.

      REGLAS CRÍTICAS:
      1. Imagen: Genera una descripción detallada para un modelo de imagen (como DALL-E) que muestre solo el plato servido, estilo gourmet, sin texto encima.
      2. Título: Crea un nombre apetitoso (ej: 'Bowl de Atún Cítrico' en lugar de 'Atún con pepino').
      3. Instrucciones: Escribe 4 pasos de cocina reales y específicos para esos ingredientes. Prohibido usar 'Organización' o 'Cocinado'.
      4. Digestión Eficiente (Hack): Genera un consejo científico corto para ese plato (ej: 'El ácido del limón en este atún pre-digiere la proteína para evitar pesadez').
      5. Formato: Devuelve estrictamente un JSON con las llaves: titulo, foto_prompt, ingredientes_lista, pasos_preparacion (array), y bio_hack.

      INGREDIENTES A TRANSFORMAR:
      "${mealDesc}"

      EJEMPLO DE SALIDA:
      {
        "titulo": "Salmón Sellado con Pan Pita y Toque Tropical",
        "foto_prompt": "Professional food photography of a seared salmon fillet, whole wheat pita bread, and fresh papaya cubes, gourmet plating, natural light, no text.",
        "ingredientes_lista": ["90g Salmón", "1 Pan pita integral", "1/2 taza Lechosa", "Vegetales verdes"],
        "pasos_preparacion": [
          "Seca el salmón y séllalo en una sartén caliente con el aceite de oliva por 4 minutos.",
          "Tuesta el pan pita hasta que esté suave y corta la lechosa en cubos uniformes.",
          "Mezcla los vegetales con un toque de limón para activar las enzimas.",
          "Emplata el salmón sobre la cama de vegetales y sirve con la fruta a un lado."
        ],
        "bio_hack": "Mastica cada bocado 30 veces para activar la amilasa salival y absorber mejor los carbohidratos del pan pita."
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const imageQuery = encodeURIComponent(parsed.foto_prompt || `${parsed.titulo}, gourmet food photography`);

        return {
          titulo: parsed.titulo,
          kcal: 0,
          ingredientes: parsed.ingredientes_lista,
          preparacion: parsed.pasos_preparacion,
          imageUrl: `https://source.unsplash.com/featured/?${imageQuery}`,
          bioHack: {
            titulo: "DIGESTIÓN EFICIENTE",
            pasos: ["MASTICA 30 VECES CADA BOCADO", "ESPERA 60M PARA BEBER"],
            explicacion: parsed.bio_hack
          },
          nutrientes: { proteina: "", grasas: "", carbos: "", fibra: "" },
          sugerencia: "Técnica del Chef de Alta Cocina.",
          notaPro: "Experiencia de Bio-hacking Gastronómico."
        };
      }
    } catch (e) {
      console.error("Gemini v30.0 Error:", e);
    }
  }

  // FALLBACK v30.0
  return {
    titulo: `Chef's Choice: ${mealDesc}`,
    kcal: 0,
    ingredientes: [`90g de proteína de ${mealDesc}`, "Vegetales de temporada", "Aceite de Oliva", "Pan integral"],
    preparacion: [
      "Seca el ingrediente principal retirando humedad para una técnica perfecta.",
      "Sella a fuego vivo aplicando los tiempos de sellado técnicos para el sabor.",
      "Ensambla los acompañamientos creando una estructura armónica y nutritiva.",
      "Finaliza con un toque de aceite de oliva en crudo para realzar sabores."
    ],
    bioHack: {
      titulo: "DIGESTIÓN EFICIENTE",
      pasos: ["MASTICA 30 VECES CADA BOCADO", "ESPERA 60M PARA BEBER"],
      explicacion: "La masticación consciente es el primer bio-hack para una absorción perfecta y evitar inflamación."
    },
    nutrientes: { proteina: "", grasas: "", carbos: "", fibra: "" },
    sugerencia: "La técnica es el alma de la nutrición.",
    notaPro: "Un balance perfecto centrado en la excelencia.",
    imageUrl: `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(mealDesc)}`
  };
};
