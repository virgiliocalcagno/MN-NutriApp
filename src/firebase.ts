import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { v4 as uuidv4 } from 'uuid';

export const firebaseConfig = {
    apiKey: "AIzaSyAF5rs3cJFs_E6S7ouibqs7B2fgVRDLzc0",
    authDomain: "mn-nutriapp.firebaseapp.com",
    projectId: "mn-nutriapp",
    storageBucket: "mn-nutriapp.firebasestorage.app",
    messagingSenderId: "706226122083",
    appId: "1:706226122083:web:754e9feedc0cc0b5377756",
    measurementId: "G-J39PRJB106",
    geminiApiKey: (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY || ""
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

/**
 * Sube una imagen a Firebase Storage para su posterior análisis.
 * @param file El archivo de imagen a subir.
 * @param userId El ID del usuario.
 * @param customId (Opcional) ID personalizado para el archivo.
 */
export const uploadImageForAnalysis = async (file: File, userId: string, customId?: string): Promise<string> => {
    if (!userId) {
        throw new Error("El ID de usuario es necesario para subir la imagen.");
    }
    const fileId = customId || uuidv4();
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const storagePath = `user-uploads/${userId}/${fileId}.${fileExtension}`;

    const storageRef = ref(storage, storagePath);

    console.log(`[Firebase] Iniciando subida: ${storagePath}`);
    await uploadBytes(storageRef, file);
    console.log(`[Firebase] Archivo subido con éxito.`);

    return storagePath;
};
