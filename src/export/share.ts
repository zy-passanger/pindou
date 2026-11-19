export async function shareBlob(blob: Blob, fileName: string, title: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title });
    return true;
  } catch {
    return false;
  }
}
