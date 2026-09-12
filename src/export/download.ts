export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(title: string, extension: string): string {
  const base = title.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'report';
  return `${base}.${extension}`;
}
