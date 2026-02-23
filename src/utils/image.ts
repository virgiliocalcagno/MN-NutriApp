/**
 * Utility for client-side image compression using Canvas.
 * Reduces image size before upload to prevent memory errors and speed up processing.
 */

export const compressImage = async (file: File, maxWidth: number = 1024, quality: number = 0.75): Promise<File> => {
    // 1. Handle HEIC/HEIF conversion first
    let fileToProcess = file;
    const isHEIC = file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

    if (isHEIC) {
        console.log("[NutriScan] Detectado HEIC/HEIF. Convirtiendo a JPEG localmente...");
        try {
            const heic2any = (await import('heic2any')).default;
            const convertedBlob = await heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.8
            });

            // heic2any can return an array if the HEIC has multiple images
            const resultBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

            fileToProcess = new File([resultBlob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
                type: 'image/jpeg'
            });
            console.log("[NutriScan] Conversión HEIC a JPEG exitosa.");
        } catch (error) {
            console.error("[NutriScan] Error convirtiendo HEIC:", error);
            // Fallback: Continue with original file, although it might fail in img.onload
        }
    }

    return new Promise((resolve, reject) => {
        // Use createObjectURL instead of FileReader to save memory on mobile
        const imageUrl = URL.createObjectURL(fileToProcess);
        const img = new Image();

        img.onload = () => {
            // Revoke the URL as soon as the image is loaded to free memory
            URL.revokeObjectURL(imageUrl);

            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Maintain aspect ratio
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxWidth) {
                    width *= maxWidth / height;
                    height = maxWidth;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("No se pudo obtener el contexto del Canvas."));
                return;
            }

            // High-quality scaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        // Ensure the filename has a .jpg extension
                        const baseName = fileToProcess.name.replace(/\.[^/.]+$/, "");
                        const newFileName = `${baseName}.jpg`;

                        const compressedFile = new File([blob], newFileName, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    } else {
                        reject(new Error("La compresión falló al generar el archivo final."));
                    }
                },
                'image/jpeg',
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(imageUrl);
            reject(new Error(`Error al cargar la imagen (${fileToProcess.name}). Es posible que el formato no sea compatible.`));
        };

        img.src = imageUrl;
    });
};
