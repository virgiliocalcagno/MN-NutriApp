const { onRequest } = require("firebase-functions/v2/https");
const { VertexAI } = require('@google-cloud/vertexai');
const admin = require('firebase-admin');

admin.initializeApp();

exports.procesarNutricion = onRequest({
  cors: true, timeoutSeconds: 120, region: "us-central1"
}, async (req, res) => {
  try {
    const vertexAI = new VertexAI({ project: 'mn-nutriapp', location: 'us-central1' });
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const { perfil, pdfPlan, pdfEval } = req.body;
    const p = perfil ? JSON.parse(perfil) : {};

    let promptParts = [{
      text: `Actúa como procesador médico experto para MN-NutriApp. 
            
            CONTEXTO PACIENTE ACTUAL (SI EXISTE):
            - Nombre Paciente: ${p.paciente || 'Nuevo Paciente'}
            - Médico Tratante: ${p.doctor || 'No especificado'}
            - Edad: ${p.edad || '--'}
            - Peso: ${p.peso || '--'}
            - Cintura: ${p.cintura || '--'}
            - Estatura: ${p.estatura || '--'}
            - Alergias CONOCIDAS: ${p.alergias || 'Ninguna'}
            - Comorbilidades: ${p.comorbilidades ? p.comorbilidades.join(', ') : 'Ninguna'}

            IMPORTANTE: Si los documentos PDF corresponden a una persona DISTINTA a la del contexto actual, DEBES extraer y devolver los datos de la persona del PDF.

            TAREAS:
            1. EXTRAE Y RELLENA EL PERFIL: Analiza los documentos y extrae: Nombre del Paciente, Doctor, Edad, Peso, Estatura, Cintura, Objetivos, Comorbilidades, Tipo de Sangre, Alergias y Meta Calórica.
            2. MENÚ DE 7 DÍAS: Transcribe el menú para CADA DÍA. IMPORTANTE: Respeta las Alergias. Usa EMOJIS.
            3. RUTINA DE EJERCICIOS DIARIA: Crea una rutina específica para CADA DÍA.
            4. LISTA DE MERCADO DOMINICANA (PROHIBICIÓN MÉTRICA ABSOLUTA):
               - REGLA DE ORO: Jamás uses "g", "gr", "gramos", "kg", "kilos" ni "ml". Usa "Lbs" u "Oz".
               - Convierte raciones a Cantidades Comerciales Dominicanas (Libras o Onzas).
               - ESTRUCTURA JSON: ["Nombre", "Cantidad_Comercial", NivelStock, "Categoría", "Pasillo"]

            RESPONDE ÚNICAMENTE CON ESTE FORMATO JSON:
            {
              "perfilAuto": {
                "paciente": "...", "doctor": "...", "edad": "...", "peso": "...", "estatura": "...", "cintura": "...",
                "sangre": "...", "alergias": "...",
                "objetivos": [], "comorbilidades": [],
                "metaCalorias": 0
              },
              "semana": { 
                "LUNES": {"DESAYUNO": "...", "MERIENDA_AM": "...", "ALMUERZO": "...", "MERIENDA_PM": "...", "CENA": "..." },
                ... (todos los días con EMOJIS)
              },
              "ejercicios": {
                "LUNES": [ {"n": "🏋️ Ejercicio", "i": "3x12", "link": ""} ],
                ... (todos los días)
              },
              "compras": [ ["Nombre", "Cantidad Comercial (Lbs/Oz)", 1, "Categoría", "Pasillo"] ]
            }`
    }];

    if (pdfPlan) promptParts.push({ inlineData: { mimeType: "application/pdf", data: pdfPlan } });
    if (pdfEval) promptParts.push({ inlineData: { mimeType: "application/pdf", data: pdfEval } });

    const result = await modelIA.generateContent({ contents: [{ role: 'user', parts: promptParts }] });
    const text = result.response.candidates[0].content.parts[0].text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).send({ error: "La IA no generó JSON", raw: text });

    const data = JSON.parse(jsonMatch[0]);
    res.status(200).send(data);

  } catch (e) {
    console.error("Global Error:", e);
    res.status(500).send({ error: e.message });
  }
});

exports.analizarComida = onRequest({
  cors: true, timeoutSeconds: 60, region: "us-central1"
}, async (req, res) => {
  try {
    const vertexAI = new VertexAI({ project: 'mn-nutriapp', location: 'us-central1' });
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const { imagenBase64, image, perfilPaciente } = req.body;
    const finalImage = imagenBase64 || image;
    const p = perfilPaciente || {};

    if (!finalImage) {
      return res.status(400).send({ error: "No se proporcionó imagenBase64 o image" });
    }

    // Prompt Experto para Bio-Hacks y Análisis
    const prompt = `Analiza esta imagen de comida como un Coach Metabólico experto.
        
        PERFIL PACIENTE:
        - Meta: ${p.objetivo || 'Salud General'}
        - Patologías/Alergias: ${p.condiciones || 'Ninguna'}
        
        TU MISIÓN:
        1. Identificar alimentos y estimar calorías totales (sé realista).
        2. SEMÁFORO METABÓLICO: 
           - VERDE (Balanceado), AMARILLO (Precaución), ROJO (Exceso/Desbalance).
        3. BIO-HACK (Consejo de Experto):
           - No solo digas "es malo". Da una ESTRATEGIA para mitigar el impacto (ej: "Come fibra antes", "Camina después", "Añade proteína").
        
        RESPONDE SOLO JSON:
        {
            "platos": ["Nombre Plato", ...],
            "totalCalorias": 0,
            "semaforo": "VERDE" | "AMARILLO" | "ROJO",
            "macros": { "p": "0g", "c": "0g", "f": "0g" },
            "analisis": "Breve explicación del semáforo...",
            "bioHack": "Tu consejo experto y accionable aquí."
        }`;

    const parts = [
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: finalImage } }
    ];

    const result = await modelIA.generateContent({ contents: [{ role: 'user', parts }] });
    const text = result.response.candidates[0].content.parts[0].text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).send({ error: "Error analizando imagen", raw: text });

    res.status(200).send(JSON.parse(jsonMatch[0]));

  } catch (e) {
    console.error("Error NutriScan:", e);
    res.status(500).send({ error: e.message });
  }
});


exports.testIA = onRequest({
  cors: true, region: "us-central1"
}, async (req, res) => {
  const vertexAI = new VertexAI({ project: 'mn-nutriapp', location: 'us-central1' });
  try {
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await modelIA.generateContent({ contents: [{ role: 'user', parts: [{ text: 'hola' }] }] });
    res.status(200).send({ status: "OK", response: result.response.candidates[0].content.parts[0].text });
  } catch (e) {
    res.status(500).send({ status: "FAIL", error: e.message });
  }
});