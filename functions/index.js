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
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
    const jsonMatch = aiText.match(/{[sS]*}/);
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
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

    const jsonMatch = text.match(/{[sS]*}/);
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
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

    const jsonMatch = text.match(/{[sS]*}/);
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
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await modelIA.generateContent({ contents: [{ role: 'user', parts: [{ text: 'hola' }] }] });
    res.status(200).send({ status: "OK", response: result.response.candidates[0].content.parts[0].text });
  } catch (e) {
    res.status(500).send({ status: "FAIL", error: e.message });
  }
});

exports.obtenerConsejoFitness = onRequest({
  cors: true, timeoutSeconds: 60, region: "us-central1"
}, async (req, res) => {
  try {
    const vertexAI = new VertexAI({ project: 'mn-nutriapp', location: 'us-central1' });
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const { profile } = req.body;

    if (!profile) return res.status(400).send({ error: "Falta el perfil" });

    const prompt = `Dime 3 consejos cortos y fáciles para que esta persona entrene mejor.
Usa un lenguaje motivador y súper sencillo.

PERFIL:
- Metas: ${profile.metas_y_objetivos?.objetivos_generales?.join(', ') || 'General'}
- Salud: ${profile.diagnostico_clinico?.comorbilidades?.join(', ') || 'Normal'}
- Edad: ${profile.perfil_biometrico?.edad}, Genero: ${profile.perfil_biometrico?.genero}
- Peso InBody: ${profile.analisis_inbody_actual?.peso_actual_kg || 'N/A'} kg
- Meta Peso: ${profile.metas_y_objetivos?.peso_ideal_meta || 'No definida'}

REGLAS:
1. Si tiene comorbilidades (presión alta, etc): Dile que vaya suave y respire.
2. Si quiere músculo: Dile que descanse bien entre series.
3. Si quiere bajar de peso: Dile que mueva peso y haga algo de cardio.
4. No uses palabras raras.

FORMATO: Pon solo 3 puntos cortos con un dibujo (emoji), nada más.`;

    const result = await modelIA.generateContent(prompt);
    res.status(200).send({ advice: result.response.candidates[0].content.parts[0].text });
  } catch (error) {
    console.error("obtenerConsejoFitness Error:", error);
    res.status(500).send({ error: error.message });
  }
});

exports.generarRutinaFit = onRequest({
  cors: true, timeoutSeconds: 60, region: "us-central1"
}, async (req, res) => {
  try {
    const vertexAI = new VertexAI({ project: 'mn-nutriapp', location: 'us-central1' });
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const { profile, selectedGoals, difficulty } = req.body;
    
    if (!profile) return res.status(400).send({ error: "Falta el perfil" });

    const pe = profile.prescripcion_ejercicio || {};
    const dc = profile.diagnostico_clinico || {};
    const mo = profile.metas_y_objetivos || {};
    const ib = profile.analisis_inbody_actual || {};
    const pb = profile.perfil_biometrico || {};

    const imc = ib.peso_actual_kg ? (Number(ib.peso_actual_kg) / ((Number(pb.estatura_cm) || 160) / 100) ** 2).toFixed(1) : 'N/A';

    const prompt = `ROL: Fisiólogo del Ejercicio Clínico.

MISIÓN EXCLUSIVA: Generar una rutina en la pantalla Zona Fit basada en el ProfileView y en los ObjetivosSeleccionados (pueden ser uno o varios).

═══ PERFIL DEL PACIENTE PARA CONSULTA ═══
- Edad: ${pb.edad || 'N/A'}, Género: ${pb.genero || 'N/A'}
- IMC Aprox: ${imc}
- Comorbilidades: ${dc.comorbilidades?.join(', ') || 'Ninguna'}
- Medicamentos: ${dc.medicamentos_actuales?.join(', ') || 'Ninguno'}
- Alergias / Observaciones: ${dc.alergias?.join(', ')} / ${dc.observaciones_medicas?.join(', ')}
- Meta (Hidratación): ${mo.agua_objetivo_ml || 2800} ml

═══ PRESCRIPCIÓN MÉDICA DE EJERCICIO ═══
- FCM (Latidos por min): ${pe.fcm_latidos_min || 'N/A'}
- FC promedio entreno: ${pe.fc_promedio_entrenamiento || 'N/A'}
- Fuerza: ${pe.fuerza_dias_semana || '3'} días
- Aeróbico: ${pe.aerobico_dias_semana || '2'} días

═══ OBJETIVOS SELECCIONADOS ═══
- Metas: ${selectedGoals && selectedGoals.length > 0 ? selectedGoals.join(', ') : (mo.objetivos_generales?.join(', ') || 'Salud General')}

═══ CONFIGURACIÓN DE INTENSIDAD ═══
- Dificultad Seleccionada: ${difficulty || 'Media'} (Baja / Media / Alta)

LÓGICA DE FUSIÓN (MÚLTIPLES OBJETIVOS):
1. Prioridad 1: Seguridad Clínica: Respeta siempre las alertas de HTA y límites de FCM.
2. Prioridad 2: Mix de Entrenamiento:
- Si elige "Ganancia Muscular": DEBES incluir ejercicios de FUERZA SEGURA (Banda elástica, Flexión en pared, Sentadilla con silla, Elevación de talones). No te limites solo a caminar.
- Si elige "Pérdida de Grasa": Intercala ráfagas de marcha rápida con ejercicios de resistencia de alta repetición.

CLÁUSULA DE NO MODIFICACIÓN (SEGURIDAD DEL PROYECTO):
SOLO LECTURA: Tienes prohibido alterar campos de SmartScan, Nutrición o Datos Generales. Tu salida debe ser un objeto nuevo y aislado para la Zona Fit.

AJUSTE CLÍNICO Y NIVEL DE CARGA: 
- Nivel ${difficulty || 'Media'}: 
  - Baja: 1-2 series, repeticiones moderadas (10-12), descansos largos (90s).
  - Media: 3 series, repeticiones estándar (12-15), descansos de 60s.
  - Alta: 3-4 series, mayor volumen o tempo lento, descansos de 45s.
- Si detectas HTA o Edad > 50 años: PROHIBIDO Planchas, Flexiones en suelo, Pesas sobre cabeza, saltos.
- FUERZA SEGURA PERMITIDA: Caminata, Estiramientos, Banda Elástica, Yoga suave, Flexiones en pared, Sentadilla apoyada.
- Volumen: Máx 4-5 ejercicios por sesión para perfiles de riesgo. Prioriza calidad y seguridad.

ESTRUCTURA DE SALIDA OBLIGATORIA (JSON EXACTO PARA ZONA FIT):
{
  "zona_fit_response": {
    "metadata": {
      "user_id": "ID_DEL_USUARIO",
      "timestamp": "YYYY-MM-DD",
      "profile_status": "Lectura_Exitosa"
    },
    "entrenamiento_semanal": {
      "justificacion_clinica": "Justificación global del plan de 7 días según edad y HTA",
      "intensidad_segura": "Moderada o Ligera (LPM)",
      "objetivos_logrados": ["Grasa", "Cardio"]
    },
    "plan_semanal": {
      "Lunes": { "tipo": "Fuerza / Cardio / Descanso", "ejercicios": [{ "id": "ex_001", "nombre": "Ejemplo", "categoria": "Músculo", "series": 3, "repeticiones": 12, "objetivo": "Fuerza", "video_url": "..." }] },
      "Martes": { "tipo": "...", "ejercicios": [] },
      "Miércoles": { "tipo": "...", "ejercicios": [] },
      "Jueves": { "tipo": "...", "ejercicios": [] },
      "Viernes": { "tipo": "...", "ejercicios": [] },
      "Sábado": { "tipo": "...", "ejercicios": [] },
      "Domingo": { "tipo": "...", "ejercicios": [] }
    },
    "alertas_seguridad": {
      "hidratacion_requerida_ml": 2800,
      "restriccion_impacto": "Nota sobre el impacto",
      "nota_medicamento": "Aviso sobre medicamentos"
    }
  }
}

ESTILO: Minimalista, clínico y moderno. NO uses markdown fuera del JSON. Devuelve SÓLO el objeto JSON.`;

    const result = await modelIA.generateContent(prompt);
    const text = result.response.candidates[0].content.parts[0].text;
    res.status(200).send({ text });
  } catch (error) {
    console.error("generarRutinaFit Error:", error);
    res.status(500).send({ error: error.message });
  }
});

exports.obtenerReceta = onRequest({
  cors: true, timeoutSeconds: 60, region: "us-central1"
}, async (req, res) => {
  try {
    const vertexAI = new VertexAI({ project: 'mn-nutriapp', location: 'us-central1' });
    const modelIA = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const { mealDesc, perfil, isVariant, originalRecipeTitle } = req.body;
    
    if (!mealDesc) return res.status(400).send({ error: "Falta mealDesc" });

    const p = perfil || {};

    const prompt = `Eres un asistente de cocina que prepara las recetas EXACTAS del plan nutricional del paciente.

PLATO DEL MENÚ: "${mealDesc}"
PACIENTE: ${p.perfil_biometrico?.nombre_completo || 'Usuario'}

═══ REGLAS ESTRICTAS ═══

1. FIDELIDAD TOTAL: Usa ÚNICAMENTE los ingredientes que aparecen en la descripción del plato. NO inventes, NO agregues, NO sustituyas ingredientes.
2. NOMBRE REAL: El título debe ser el nombre original del plato tal como está escrito en el plan. NO lo renombres con nombres de alta cocina.
3. CANTIDADES EXACTAS: Respeta las cantidades indicadas (120g, 2 unidades, 1 cdita, etc.). Si dice "vegetales libres", puedes sugerir opciones pero aclarando que son a elección.
4. PREPARACIÓN PRÁCTICA: Pasos simples y reales de cocina casera. Nada de "sous-vide", "coulis", "emulsiones", ni técnicas de restaurante.
5. Si dice "vegetales libres" o similar, listados como "Vegetales a elección (lechuga, tomate, pepino, etc.)" — NO los pongas como ingredientes fijos con cantidades.

RESPONDE CON JSON PURO:
{
  "titulo": "Nombre original del plato tal cual",
  "foto_prompt": "simple home cooked [main ingredient] plate, clean background, natural light",
  "tiempo": "20 min",
  "dificultad": "Baja",
  "kcal": 350,
  "nutrientes": { "proteina": "30g", "grasas": "8g", "carbos": "40g" },
  "ingredientes_lista": ["Ingrediente exacto con cantidad del plan"],
  "pasos_preparacion": [
    { "titulo": "Paso simple", "descripcion": "Instrucción práctica de cocina casera..." }
  ],
  "bio_hack": {
    "titulo": "CONSEJO NUTRICIONAL",
    "explicacion": "Un consejo práctico sobre cómo aprovechar este plato.",
    "pasos": ["1. Come primero los vegetales", "2. Luego la proteína", "3. Al final los carbohidratos"]
  }
}
${isVariant ? `
SEMILLA DE VARIACIÓN Y CREATIVIDAD (IGNORAR PARA INGREDIENTES): ${Date.now()}-${Math.random()}
MUY IMPORTANTE: Ya has generado una receta para esto llamada "${originalRecipeTitle}". Para esta petición, GENERA UNA VARIANTE ÚNICA Y CREATIVA de la preparación (diferentes métodos de cocción, emplatado o bio-hacks al original), MANTENIENDO SIEMPRE LOS INGREDIENTES Y MACROS EXACTOS.
` : ''}
`;

    const result = await modelIA.generateContent(prompt);
    const text = result.response.candidates[0].content.parts[0].text;
    res.status(200).send({ text });
  } catch (error) {
    console.error("obtenerReceta Error:", error);
    res.status(500).send({ error: error.message });
  }
});
