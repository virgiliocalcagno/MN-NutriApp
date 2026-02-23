/**
 * Utility for client-side image compression using Canvas.
 * Reduces image size before upload to prevent memory errors and speed up processing.
 */

export const compressImage = async (file: File, maxWidth: number = 1024, quality: number = 0.75): Promise<File> => {
    return new Promise((resolve, reject) => {
        // Use createObjectURL instead of FileReader to save memory on mobile
        const imageUrl = URL.createObjectURL(file);
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
                        const compressedFile = new File([blob], file.name, {
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
            reject(new Error("Error al cargar la imagen. Es posible que el formato no sea compatible o el archivo sea demasiado pesado."));
        };

        img.src = imageUrl;
    });
};
