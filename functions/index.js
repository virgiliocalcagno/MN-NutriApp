const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { VertexAI } = require('@google-cloud/vertexai');
const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sharp = require('sharp');

admin.initializeApp();
const db = admin.firestore();

exports.processImageForAnalysis = onDocumentUpdated({
  document: "scans/{scanJobId}",
  memory: "1GiB",
  region: "us-central1"
}, async (event) => {
  const beforeData = event.data.before ? event.data.before.data() : {};
  const afterData = event.data.after ? event.data.after.data() : {};

  // CRITICAL: Only trigger if status CHANGED TO 'processing'
  if (afterData.status !== 'processing' || beforeData.status === 'processing' || !afterData.storagePath) {
    console.log(`Bypassing scan ${event.params.scanJobId}. Status from ${beforeData.status} to ${afterData.status}`);
    return;
  }

  const scanJobId = event.params.scanJobId;
  const userId = afterData.userId;
  const storagePath = afterData.storagePath;
  const jobRef = event.data.after.ref;

  try {
    console.log(`STARTING NutriScan Job (Updated Trigger): ${scanJobId}`);
    const fileBucket = 'mn-nutriapp.firebasestorage.app';
    const bucket = getStorage().bucket(fileBucket);
    const fileName = path.basename(storagePath);
    const tempFilePath = path.join(os.tmpdir(), fileName);

    await bucket.file(storagePath).download({ destination: tempFilePath });

    let resizedBase64 = '';
    let mimeType = 'image/jpeg';

    // Optimization for AI: Sharp resize
    try {
      const resizedBuffer = await sharp(tempFilePath).resize(1000).jpeg({ quality: 75 }).toBuffer();
      resizedBase64 = resizedBuffer.toString('base64');
    } catch (sharpPreErr) {
      console.warn('Sharp pre-process failed, using original:', sharpPreErr.message);
      resizedBase64 = fs.readFileSync(tempFilePath).toString('base64');
    }

    // AI Analysis
    const vertexAI = new VertexAI({ project: 'mn-nutriapp', location: 'us-central1' });
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Analiza esta imagen como un Analista Nutricional experto de MN-NutriApp. Responde EXCLUSIVAMENTE en JSON.`;
    // Using a simpler prompt here for the chunk replacement, but I will include the full one in the actual call.
    // Wait, I should use the full prompt to be consistent.

    const fullPrompt = `Analiza esta imagen de comida como un Coach Metabólico Experto y Analista Nutricional de MN-NutriApp.
        
        PERFIL PACIENTE:
        - Meta: ${afterData.userGoal || 'Salud General'}
        
        TU MISIÓN:
        1. IDENTIFICACIÓN PRECISA: Identifica todos los componentes del plato.
        2. ESTIMACIÓN NUTRICIONAL: Calcula calorías, proteínas, carbohidratos y grasas. Sé riguroso y realista.
        3. SEMÁFORO METABÓLICO: 
           - VERDE: Combustión óptima, baja carga glucémica.
           - AMARILLO: Cuidado con proporciones o salsas.
           - ROJO: Picos de insulina probables, inflamatorio.
        4. ANÁLISIS TÉCNICO: Explica BREVEMENTE por qué cayó en ese color.
        5. BIO-HACK EXPERTO: Da una ESTRATEGIA ACCIONABLE para mitigar el impacto negativo o potenciar el positivo.
        
        RESPONDE EXCLUSIVAMENTE EN JSON:
        {
            "platos": ["Nombre del Plato Detectado"],
            "totalCalorias": 123,
            "semaforo": "VERDE" | "AMARILLO" | "ROJO",
            "macros": { "p": "10g", "c": "25g", "f": "8g" },
            "analisis": "Explicación técnica simplificada...",
            "bioHack": "Estrategia experta (ej: Añade 1 cda de Vinagre de Manzana antes)."
        }`;

    const result = await modelIA.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }, { inlineData: { mimeType: 'image/jpeg', data: resizedBase64 } }] }]
    });

    const aiText = result.response.candidates[0].content.parts[0].text;
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return JSON");
    const aiResult = JSON.parse(jsonMatch[0]);

    // Thumbnail Generation (CRITICAL for mobile visibility)
    let thumbnailPath = '';
    try {
      const thumbFileName = `thumb_${scanJobId}.jpg`;
      const thumbFilePathLocal = path.join(os.tmpdir(), thumbFileName);
      const thumbStoragePath = `user-uploads/${userId}/${thumbFileName}`;

      await sharp(tempFilePath).resize(800).jpeg({ quality: 80 }).toFile(thumbFilePathLocal);
      await bucket.upload(thumbFilePathLocal, { destination: thumbStoragePath, metadata: { contentType: 'image/jpeg' } });
      thumbnailPath = thumbStoragePath;
      fs.unlinkSync(thumbFilePathLocal);
    } catch (thumbErr) {
      console.warn('Thumbnail generation failed:', thumbErr.message);
    }

    fs.unlinkSync(tempFilePath);

    await jobRef.update({
      status: 'completed',
      result: aiResult,
      thumbnailPath: thumbnailPath || storagePath
    });

  } catch (error) {
    console.error(`Job ${scanJobId} Error:`, error);
    await jobRef.update({ status: 'error', error: error.message });
  }
});

exports.procesarNutricion = onRequest({
  cors: true,
  timeoutSeconds: 120,
  region: "us-central1",
  memory: "1GiB"
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
               - IMPORTANTE: Para cada ejercicio, intenta incluir un enlace informativo o de video ("link") de 'eresfitness.com' o YouTube si es posible.
            4. LISTA DE MERCADO DOMINICANA (PROHIBICIÓN MÉTRICA ABSOLUTA):
               - REGLA DE ORO: Jamás uses "g", "gr", "gramos", "kg", "kilos" ni "ml". Usa "Lbs" u "Oz".
               - Convierte raciones a Cantidades Comerciales Dominicanas (Libras o Onzas).
               - ESTRUCTURA JSON: ["Nombre", "Cantidad_Comercial", NivelStock, "Categoría", "Pasillo"]

            RESPONDE ÚNICAMENTE CON ESTE FORMATO JSON:
            {
              "perfilAuto": { ... },
              "semana": { ... },
              "ejercicios": {
                "LUNES": [ {"n": "🏋️ Ejercicio", "i": "3x12", "link": "https://eresfitness.com/ejercicio/nombre-del-ejercicio/"} ],
                ...
              },
              "compras": [ ... ]
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
    const prompt = `Analiza esta imagen de comida como un Coach Metabólico Experto y Analista Nutricional de MN-NutriApp.
        
        PERFIL PACIENTE:
        - Nombre: ${p.paciente || 'Nuevo Paciente'}
        - Meta: ${p.objetivo || 'Salud General'}
        - Patologías/Alergias: ${p.condiciones || 'Ninguna'}
        
        TU MISIÓN:
        1. IDENTIFICACIÓN PRECISA: Identifica todos los componentes del plato.
        2. ESTIMACIÓN NUTRICIONAL: Calcula calorías, proteínas, carbohidratos y grasas. Sé riguroso y realista.
        3. SEMÁFORO METABÓLICO: 
           - VERDE: Combustión óptima, baja carga glucémica.
           - AMARILLO: Cuidado con proporciones o salsas.
           - ROJO: Picos de insulina probables, inflamatorio.
        4. ANÁLISIS TÉCNICO: Explica BREVEMENTE por qué cayó en ese color (ej: "Exceso de carbohidratos simples").
        5. BIO-HACK EXPERTO: Da una ESTRATEGIA ACCIONABLE para mitigar el impacto negativo o potenciar el positivo. Usa un tono profesional y motivador.
        
        RESPONDE EXCLUSIVAMENTE EN JSON:
        {
            "platos": ["Nombre del Plato Detectado"],
            "totalCalorias": 123,
            "semaforo": "VERDE" | "AMARILLO" | "ROJO",
            "macros": { "p": "10g", "c": "25g", "f": "8g" },
            "analisis": "Explicación técnica simplificada...",
            "bioHack": "Estrategia experta (ej: Añade 1 cda de Vinagre de Manzana antes)."
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