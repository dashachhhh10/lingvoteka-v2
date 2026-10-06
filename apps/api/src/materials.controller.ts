import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { Prisma } from '@prisma/client';
import { auth } from './auth.js';
import { prisma } from './database.js';
import { analyzeMaterial, type Draft } from './material-analysis.js';
import { SessionGuard } from './session.guard.js';
import { normaliseMeaning, normaliseTerm, vocabularyIdentity } from './vocabulary-identity.js';

const uploadRoot = resolve(process.env.UPLOAD_DIR ?? './data/uploads');
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

async function validFile(file: Express.Multer.File) {
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

@Controller('materials')
@UseGuards(SessionGuard)
export class MaterialsController {
  private async ownerId(request: Request): Promise<string> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();
    return session.user.id;
  }

  private async ownedMaterial(id: string, ownerId: string) {
    const material = await prisma.material.findFirst({
      where: { id, ownerId },
      include: {
        files: { select: { id: true, name: true, mimeType: true, byteSize: true } },
        vocabulary: { include: { vocabItem: true } },
        grammar: { include: { grammarTopic: true } },
      },
    });
    if (!material) throw new NotFoundException('Материал не найден');
    return material;
  }

  @Get()
  async list(@Req() request: Request) {
    const ownerId = await this.ownerId(request);
    return prisma.material.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        lessonDate: true,
        deadline: true,
        status: true,
        analysisError: true,
        createdAt: true,
        _count: { select: { files: true, vocabulary: true, grammar: true } },
      },
    });
  }

  @Get(':id')
  async detail(@Req() request: Request, @Param('id') id: string) {
    return this.ownedMaterial(id, await this.ownerId(request));
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 5, { limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 4 } }),
  )
  async create(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const ownerId = await this.ownerId(request);
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
    const noteText = typeof body.noteText === 'string' ? body.noteText.trim().slice(0, 80_000) : '';
    if (!title) throw new BadRequestException('Укажи название материала');
    if (!noteText && !files.length) throw new BadRequestException('Добавь текст или файл');
    if (files.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024)
      throw new BadRequestException('Общий размер файлов — не более 20 МБ');
    await Promise.all(files.map(validFile));
    const written: string[] = [];
    try {
      await mkdir(uploadRoot, { recursive: true });
      const stored = [];
      for (const file of files) {
        const storageKey = resolve(uploadRoot, randomUUID());
        await writeFile(storageKey, file.buffer, { flag: 'wx', mode: 0o600 });
        written.push(storageKey);
        stored.push({
          name: file.originalname.slice(0, 255),
          mimeType: file.mimetype,
          byteSize: file.size,
          storageKey,
        });
      }
      return await prisma.material.create({
        data: {
          ownerId,
          title,
          noteText: noteText || null,
          lessonDate: dateValue(body.lessonDate),
          deadline: dateValue(body.deadline),
          files: { create: stored },
        },
        select: { id: true, title: true, status: true },
      });
    } catch (error) {
      await Promise.all(written.map((path) => rm(path, { force: true })));
      throw error;
    }
  }

  @Post(':id/analyze')
  async analyze(@Req() request: Request, @Param('id') id: string) {
    const ownerId = await this.ownerId(request);
    await this.ownedMaterial(id, ownerId);
    const stale = new Date(Date.now() - 3 * 60_000);
    const claimed = await prisma.material.updateMany({
      where: {
        id,
        ownerId,
        OR: [
          { status: { in: ['DRAFT', 'ERROR', 'REVIEW'] } },
          { status: 'PROCESSING', updatedAt: { lt: stale } },
        ],
      },
      data: { status: 'PROCESSING', analysisError: null },
    });
    if (!claimed.count) throw new BadRequestException('Материал уже сохранён или разбирается');
    try {
      const material = await prisma.material.findUniqueOrThrow({
        where: { id },
        include: { files: true },
      });
      const draft = await analyzeMaterial(material.noteText, material.files);
      const known = await prisma.vocabItem.findMany({
        where: {
          ownerId,
          normalized: { in: draft.vocabulary.map((item) => normaliseTerm(item.term)) },
        },
        select: { normalized: true, normalizedMeaning: true },
      });
      const knownTerms = new Set(known.map((item) => item.normalized));
      const knownIdentities = new Set(
        known.map((item) => `${item.normalized}\u0000${item.normalizedMeaning}`),
      );
      draft.vocabulary = draft.vocabulary.map((item) => {
        const alreadyInVocabulary = knownIdentities.has(
          vocabularyIdentity(item.term, item.translation),
        );
        return {
          ...item,
          alreadyInVocabulary,
          otherMeaningInVocabulary:
            !alreadyInVocabulary && knownTerms.has(normaliseTerm(item.term)),
        };
      });
      await prisma.material.update({
        where: { id },
        data: { status: 'REVIEW', analysisDraft: draft },
      });
      return { status: 'REVIEW', draft };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось разобрать материал';
      console.error('Material analysis failed', { materialId: id, message });
      await prisma.material.update({
        where: { id },
        data: { status: 'ERROR', analysisError: message.slice(0, 300) },
      });
      throw new BadRequestException(
        message.startsWith('AI не настроен')
          ? message
          : 'Разбор не удался. Попробуй ещё раз или добавь записи вручную.',
      );
    }
  }

  @Post(':id/review')
  async review(@Req() request: Request, @Param('id') id: string, @Body() body: Draft) {
    const ownerId = await this.ownerId(request);
    const material = await this.ownedMaterial(id, ownerId);
    if (material.status === 'PROCESSING' || material.status === 'READY')
      throw new BadRequestException('Дождись разбора или открой новый материал');
    if (
      !Array.isArray(body?.vocabulary) ||
      !Array.isArray(body?.grammar) ||
      body.vocabulary.length > 100 ||
      body.grammar.length > 50
    ) {
      throw new BadRequestException('Неверный формат списка слов или тем');
    }
    const vocabulary = body.vocabulary.map((item) => ({
      term: typeof item.term === 'string' ? item.term.trim().slice(0, 160) : '',
      translation:
        typeof item.translation === 'string' ? item.translation.trim().slice(0, 300) : '',
      example: typeof item.example === 'string' ? item.example.trim().slice(0, 500) : '',
      sourceExcerpt:
        typeof item.sourceExcerpt === 'string' ? item.sourceExcerpt.trim().slice(0, 500) : '',
    }));
    const grammar = body.grammar.map((item) => ({
      title: typeof item.title === 'string' ? item.title.trim().slice(0, 160) : '',
      summary: typeof item.summary === 'string' ? item.summary.trim().slice(0, 1000) : '',
      sourceExcerpt:
        typeof item.sourceExcerpt === 'string' ? item.sourceExcerpt.trim().slice(0, 500) : '',
    }));
    if (
      vocabulary.some((item) => !item.term || !item.translation) ||
      grammar.some((item) => !item.title)
    ) {
      throw new BadRequestException('У каждого слова нужны написание и перевод, у темы — название');
    }
    await prisma.$transaction(async (tx) => {
      for (const item of vocabulary) {
        const vocab = await tx.vocabItem.upsert({
          where: {
            ownerId_normalized_normalizedMeaning: {
              ownerId,
              normalized: normaliseTerm(item.term),
              normalizedMeaning: normaliseMeaning(item.translation),
            },
          },
          create: {
            ownerId,
            normalized: normaliseTerm(item.term),
            normalizedMeaning: normaliseMeaning(item.translation),
            term: item.term,
            translation: item.translation,
            example: item.example || null,
          },
          update: {},
        });
        await tx.materialVocab.upsert({
          where: { materialId_vocabItemId: { materialId: id, vocabItemId: vocab.id } },
          create: {
            materialId: id,
            vocabItemId: vocab.id,
            sourceExcerpt: item.sourceExcerpt || null,
          },
          update: {},
        });
      }
      for (const item of grammar) {
        const topic = await tx.grammarTopic.upsert({
          where: { ownerId_normalized: { ownerId, normalized: normaliseTerm(item.title) } },
          create: {
            ownerId,
            normalized: normaliseTerm(item.title),
            title: item.title,
            summary: item.summary || null,
          },
          update: {},
        });
        await tx.materialGrammar.upsert({
          where: { materialId_grammarTopicId: { materialId: id, grammarTopicId: topic.id } },
          create: {
            materialId: id,
            grammarTopicId: topic.id,
            sourceExcerpt: item.sourceExcerpt || null,
          },
          update: {},
        });
      }
      await tx.material.update({
        where: { id },
        data: { status: 'READY', analysisDraft: Prisma.DbNull, analysisError: null },
      });
    });
    return this.ownedMaterial(id, ownerId);
  }

  @Get(':id/files/:fileId')
  async download(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    const ownerId = await this.ownerId(request);
    const file = await prisma.materialFile.findFirst({
      where: { id: fileId, material: { id, ownerId } },
    });
    if (!file) throw new NotFoundException('Файл не найден');
    const bytes = await readFile(file.storageKey);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    response.send(bytes);
  }
}
