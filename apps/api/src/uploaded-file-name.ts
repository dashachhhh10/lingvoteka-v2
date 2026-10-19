function decodedName(originalName: string): string {
  if ([...originalName].some((character) => character.codePointAt(0)! > 255)) return originalName;
  try {
    const bytes = Uint8Array.from(originalName, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return originalName;
  }
}

export function uploadedFileName(originalName: string): string {
  const decoded = decodedName(originalName)
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\\/g, '/');
  return (decoded.split('/').pop()?.trim() || 'Файл').normalize('NFC').slice(0, 255);
}

export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim().slice(0, 160);
}
