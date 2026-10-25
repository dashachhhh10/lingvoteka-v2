import { BadRequestException } from '@nestjs/common';
import JSZip from 'jszip';
import { storeFile, removeFile } from './file-storage.js';
import { titleFromFileName, uploadedFileName } from './uploaded-file-name.js';

export type MaterialUpload = Pick<
  Express.Multer.File,
  'originalname' | 'mimetype' | 'buffer' | 'size'
>;

const allowedMime = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function dateValue(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException('Неверный формат даты');
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new BadRequestException('Неверная дата');
  return date;
}

async function validFile(file: MaterialUpload) {
  if (!allowedMime.has(file.mimetype))
    throw new BadRequestException(`Неподдерживаемый тип файла: ${file.originalname}`);
  const bytes = file.buffer;
  if (file.mimetype === 'application/pdf' && bytes.subarray(0, 5).toString() !== '%PDF-')
    throw new BadRequestException('Файл PDF повреждён');
  if (
    file.mimetype === 'image/png' &&
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new BadRequestException('Файл PNG повреждён');
  if (file.mimetype === 'image/jpeg' && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))
    throw new BadRequestException('Файл JPEG повреждён');
  if (file.mimetype.includes('openxmlformats')) {
    try {
      const zip = await JSZip.loadAsync(bytes);
      const expected = file.mimetype.includes('presentation')
        ? 'ppt/presentation.xml'
        : 'word/document.xml';
      if (!zip.file(expected)) throw new Error('Missing document part');
    } catch {
      throw new BadRequestException('Файл DOCX/PPTX повреждён');
    }
  }
}

export async function validateMaterialInput(
  body: Record<string, unknown>,
  files: MaterialUpload[],
) {
  const firstFileName = files[0] ? uploadedFileName(files[0].originalname) : '';
  const typedTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
  const title = typedTitle || (firstFileName ? titleFromFileName(firstFileName) : '');
  const noteText = typeof body.noteText === 'string' ? body.noteText.trim().slice(0, 80_000) : '';
  if (!title) throw new BadRequestException('Укажи название материала');
  if (!noteText && !files.length) throw new BadRequestException('Добавь текст или файл');
  if (files.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024)
    throw new BadRequestException('Общий размер файлов — не более 20 МБ');
  if (files.length > 5)
    throw new BadRequestException('В одном материале может быть до пяти файлов');
  if (files.some((file) => file.size > 10 * 1024 * 1024 || file.size !== file.buffer.length))
    throw new BadRequestException('Один файл — не более 10 МБ');
  await Promise.all(files.map(validFile));
  return {
    title,
    noteText: noteText || null,
    lessonDate: dateValue(body.lessonDate),
    deadline: dateValue(body.deadline),
  };
}

export async function withStoredMaterialFiles<T>(
  ownerId: string,
  files: MaterialUpload[],
  persist: (
    stored: { name: string; mimeType: string; byteSize: number; storageKey: string }[],
  ) => Promise<T>,
): Promise<T> {
  const written: string[] = [];
  try {
    const stored = [];
    for (const file of files) {
      const storageKey = await storeFile(ownerId, file.buffer, file.mimetype);
      written.push(storageKey);
      stored.push({
        name: uploadedFileName(file.originalname),
        mimeType: file.mimetype,
        byteSize: file.size,
        storageKey,
      });
    }
    return await persist(stored);
  } catch (error) {
    const cleanup = await Promise.allSettled(written.map(removeFile));
    if (cleanup.some((result) => result.status === 'rejected'))
      console.error('Could not clean up uploaded material files');
    throw error;
  }
}
