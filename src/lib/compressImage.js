// Resizes and re-encodes an image in the browser before upload, so
// storage/bandwidth usage stays small regardless of the original photo's
// resolution (phone camera photos are routinely 3000px+ / several MB).
// Uses the browser's built-in Canvas API — no extra dependency.
const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.8;

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width >= height && width > MAX_DIMENSION) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else if (height > width && height > MAX_DIMENSION) {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to compress image'));
            return;
          }
          // Re-wrap as a File so it still has a name/type for upload.
          const compressedFile = new File([blob], renameToJpeg(file.name), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = objectUrl;
  });
}

function renameToJpeg(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '');
  return `${base}.jpg`;
}
