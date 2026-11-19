export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadText(text: string, fileName: string, mime = 'application/json;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), fileName);
}
