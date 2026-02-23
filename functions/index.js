const { onRequest } = require("firebase-functions/v2/https");
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

exports.processImageForAnalysis = onObjectFinalized({
  bucket: 'mn-nutriapp.firebasestorage.app',
  region: 'us-central1',
  timeoutSeconds: 300,
  memory: '1GiB'
}, async (event) => {
  const fileBucket = event.data.bucket;
  const filePath = event.data.name;
  const contentType = event.data.contentType;

  if (!contentType.startsWith('image/')) {
    return console.log('This is not an image.');
  }

  if (!filePath.startsWith('user-uploads/')) {
    return console.log('Not a user upload, skipping.');
  }

  // Extract userId and fileId (scanJobId) from the path
  const parts = filePath.split('/');
  const userId = parts[1];
  const fileName = parts[2];
  const fileExt = path.extname(fileName).toLowerCase();
  const scanJobId = path.basename(fileName, path.extname(fileName));
  console.log(`Processing NutriScan Job: ${scanJobId} for User: ${userId} (${fileExt})`);

  const jobRef = db.collection('scans').doc(scanJobId);

  try {
    const bucket = getStorage().bucket(fileBucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    await bucket.file(filePath).download({ destination: tempFilePath });
    console.log('Image downloaded locally to', tempFilePath);

    let resizedBase64 = '';
    let mimeType = 'image/jpeg';

    // Detect HEIC/HEIF - Sharp usually lacks the decoder for these in standard Cloud Functions
    if (fileExt === '.heic' || fileExt === '.heif') {
      console.log('HEIC/HEIF detected. Bypassing Sharp and converting directly to Base64...');
      const buffer = fs.readFileSync(tempFilePath);
      resizedBase64 = buffer.toString('base64');
      mimeType = 'image/heic';
    } else {
      try {
        // Normal processing with Sharp for other formats
        const resizedBuffer = await sharp(tempFilePath).resize(1000).jpeg({ quality: 75 }).toBuffer();
        resizedBase64 = resizedBuffer.toString('base64');
      } catch (sharpErr) {
        console.warn('Sharp failed, attempting direct conversion as fallback:', sharpErr.message);
        const buffer = fs.readFileSync(tempFilePath);
        resizedBase64 = buffer.toString('base64');
        mimeType = contentType; // Use original content type
      }
    }

    fs.unlinkSync(tempFilePath); // Clean up temp file

    // Get user profile for context
    const userDoc = await db.collection('users').doc(userId).get();
    const profile = userDoc.exists ? userDoc.data().profile : {};
    const profileContext = {
      paciente: profile.paciente || 'Nuevo Paciente',
      objetivo: profile.objetivos ? profile.objetivos.join(", ") : 'Salud General',
      condiciones: profile.comorbilidades ? profile.comorbilidades.join(", ") : 'Ninguna'
    };

    // Call Gemini AI
    const vertexAI = new VertexAI({ project: 'mn-nutriapp', location: 'us-central1' });
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Analiza esta imagen de comida como un Coach Metabólico Experto y Analista Nutricional de MN-NutriApp.
        
        PERFIL PACIENTE:
        - Nombre: ${profileContext.paciente}
        - Meta: ${profileContext.objetivo}
        - Patologías/Alergias: ${profileContext.condiciones}
        
        TU MISIÓN:
        1. IDENTIFICACIÓN PRECISA: Identifica todos los componentes del plato.
        2. ESTIMACIÓN NUTRICIONAL: Calcula calorías, proteínas, carbohidratos y grasas. Sé riguroso y realista. (Responde en Kcal y macros en g).
        3. SEMÁFORO METABÓLICO: VERDE | AMARILLO | ROJO.
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

    const imagePart = { inlineData: { mimeType: mimeType, data: resizedBase64 } };
    const textPart = { text: prompt };
    const request = { contents: [{ role: 'user', parts: [textPart, imagePart] }] };

    const result = await modelIA.generateContent(request);
    const text = result.response.candidates[0].content.parts[0].text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("La IA no generó JSON. Raw: " + text);
    }

    const aiResult = JSON.parse(jsonMatch[0]);
    // Removed base64 image to avoid Firestore 1MB limit. 
    // The frontend will use the storagePath to show the image.

    await jobRef.update({ status: 'completed', result: aiResult });
    console.log(`Job ${scanJobId} completed successfully.`);

  } catch (error) {
    console.error(`Error processing job ${scanJobId}:`, error);
    await jobRef.update({ status: 'error', error: error.message });
  }
});

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