/**
 * Downscale a photo in the browser before uploading it.
 *
 * A modern phone camera produces 4–12 MB JPEGs, but the model only ever sees a
 * 224px centre crop. Resizing client-side cuts upload time dramatically on a
 * mobile connection and keeps requests well under the server's 10 MB limit,
 * with no effect on the prediction.
 */

const MAX_EDGE = 1280;
const QUALITY = 0.85;
/** Files below this are already small enough that re-encoding only costs time. */
const SKIP_BELOW_BYTES = 600 * 1024;

export async function compressImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    if (scale === 1) {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    // The backend validates by extension, so keep a .jpg name.
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // Any failure (unsupported codec, OOM) falls back to the original file.
    return file;
  }
}
