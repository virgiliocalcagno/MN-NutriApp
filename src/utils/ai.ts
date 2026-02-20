
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Profile } from "../types/store";

export interface AIResponse {
  perfilAuto: Partial<Profile>;
  semana: Record<string, Record<string, string>>;
  ejercicios: Record<string, any[]>;
  compras: [string, string, number, string, string][];
}

export interface RecipeDetails {
  titulo?: string;
  kcal: number;
  ingredientes: string[];
  preparacion: { titulo: string; descripcion: string }[];
  imageUrl?: string;
  bioHack: {
    titulo: string;
    pasos: string[];
    explicacion: string;
  };
  nutrientes: {
    proteina: string;
    grasas: string;
    carbos: string;
  };
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
  console.log("Iniciando motor v31.0 (Recetas Pro) para:", mealDesc);

  const effectiveApiKey = apiKey || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

  if (effectiveApiKey && effectiveApiKey.length > 20) {
    try {
      const genAI = new GoogleGenerativeAI(effectiveApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Eres un Chef de Alta Cocina y Experto en Bio-hacking Nutricional.
Transforma estos ingredientes en una receta profesional con datos nutricionales reales.

INGREDIENTES: "${mealDesc}"

RESPONDE ÚNICAMENTE con un JSON puro (sin markdown, sin backticks) con esta estructura EXACTA:
{
  "titulo": "Nombre gourmet del plato",
  "foto_prompt": "Descripción en inglés para generar foto gourmet del plato, natural light, no text overlay",
  "kcal": 620,
  "nutrientes": { "proteina": "45g", "grasas": "18g", "carbos": "30g" },
  "ingredientes_lista": ["150g Salmón fresco", "1/2 taza Quinoa cocida", "6 espárragos trigueros", "1 cdita aceite de oliva, limón, sal y pimienta"],
  "pasos_preparacion": [
    { "titulo": "Limpieza y marinado", "descripcion": "Lavar bien el salmón y marinar con zumo de limón fresco, sal marina y pimienta negra recién molida." },
    { "titulo": "Cocción técnica del salmón", "descripcion": "Cocinar a fuego medio. Colocar primero por el lado de la piel para obtener una textura crujiente y sellar jugos." },
    { "titulo": "Salteado rápido", "descripcion": "Saltear los espárragos a fuego alto con un poco de aceite de oliva durante 3-4 minutos para mantener el color verde vibrante y clorofila." }
  ],
  "bio_hack": {
    "titulo": "SECUENCIACIÓN METABÓLICA",
    "explicacion": "Para optimizar la curva de glucosa y mejorar la respuesta insulínica, consume los ingredientes en este orden:",
    "pasos": ["1. Espárragos (Fibra)", "2. Salmón (Prot/Grasa)", "3. Quinoa (Almidón)"]
  }
}

REGLAS:
- kcal debe ser un número REAL estimado (no 0).
- nutrientes con valores reales estimados.
- pasos_preparacion: cada paso es un OBJETO con "titulo" y "descripcion". Mínimo 3 pasos.
- bio_hack.pasos: secuencia óptima de consumo de los ingredientes del plato.
- Prohibido usar "Organización" o "Cocinado" como título de paso.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      const cleanJson = text.replace(/```json|```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const imageQuery = encodeURIComponent(parsed.foto_prompt || `${parsed.titulo}, gourmet food photography`);

        return {
          titulo: parsed.titulo,
          kcal: parsed.kcal || 0,
          ingredientes: parsed.ingredientes_lista || [],
          preparacion: (parsed.pasos_preparacion || []).map((p: any) =>
            typeof p === 'string' ? { titulo: "Paso", descripcion: p } : { titulo: p.titulo, descripcion: p.descripcion }
          ),
          imageUrl: `https://source.unsplash.com/featured/?${imageQuery}`,
          bioHack: {
            titulo: parsed.bio_hack?.titulo || "BIO-HACK",
            pasos: parsed.bio_hack?.pasos || [],
            explicacion: parsed.bio_hack?.explicacion || ""
          },
          nutrientes: {
            proteina: parsed.nutrientes?.proteina || "",
            grasas: parsed.nutrientes?.grasas || "",
            carbos: parsed.nutrientes?.carbos || ""
          }
        };
      }
    } catch (e) {
      console.error("Gemini v31.0 Error:", e);
    }
  }

  // FALLBACK v31.0
  return {
    titulo: mealDesc,
    kcal: 0,
    ingredientes: ["Ingredientes del plato"],
    preparacion: [
      { titulo: "Preparación base", descripcion: "Acondiciona el ingrediente principal retirando humedad." },
      { titulo: "Cocción", descripcion: "Aplica la técnica de calor principal respetando los tiempos." },
      { titulo: "Ensamble", descripcion: "Integra los acompañamientos en una base armónica." },
      { titulo: "Finalización", descripcion: "Toque de aceite de oliva en crudo para realzar sabores." }
    ],
    bioHack: {
      titulo: "SECUENCIACIÓN METABÓLICA",
      pasos: ["1. Vegetales (Fibra)", "2. Proteína", "3. Carbohidratos"],
      explicacion: "Consume en este orden para optimizar tu curva de glucosa."
    },
    nutrientes: { proteina: "", grasas: "", carbos: "" },
    imageUrl: `https://via.placeholder.com/600x400.png?text=${encodeURIComponent(mealDesc)}`
  };
};
