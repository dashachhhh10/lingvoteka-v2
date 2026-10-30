import {
  BadRequestException,
  Body,
  Delete,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { fromNodeHeaders } from 'better-auth/node';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { auth } from './auth.js';
import { prisma } from './database.js';
import { annotateDraft } from './draft-matches.js';
import { loadFile } from './file-storage.js';
import type { Draft } from './material-analysis.js';
import { MaterialQueueService } from './material-queue.js';
import {
  MaterialAnalysisResponseDto,
  MaterialCreatedDto,
  MaterialDetailDto,
  MaterialDraftDto,
  MaterialSummaryDto,
} from './openapi.dto.js';
import { SessionGuard } from './session.guard.js';
import { validateMaterialInput, withStoredMaterialFiles } from './material-input.js';
import { normaliseMeaning, normaliseTerm } from './vocabulary-identity.js';
import {
  isPartOfSpeech,
  isSemanticTopic,
  normalizeSemanticTopic,
  validCategories,
} from './vocabulary-categories.js';

async function writeMaterial<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(error.code)
      )
        continue;
      throw error;
    }
  }
}

@Controller('materials')
@UseGuards(SessionGuard)
@ApiTags('Материалы')
@ApiCookieAuth('sessionCookie')
@ApiUnauthorizedResponse({ description: 'Сессия отсутствует или истекла' })
export class MaterialsController {
  constructor(@Inject(MaterialQueueService) private readonly materialQueue: MaterialQueueService) {}

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
    if (
      material.analysisDraft &&
      typeof material.analysisDraft === 'object' &&
      !Array.isArray(material.analysisDraft)
    ) {
      const draft = material.analysisDraft as unknown as Draft;
      if (Array.isArray(draft.vocabulary) && Array.isArray(draft.grammar))
        return { ...material, analysisDraft: await annotateDraft(ownerId, draft) };
    }
    return material;
  }

  @Get()
  @ApiOperation({ summary: 'Получить свои материалы' })
  @ApiOkResponse({ type: [MaterialSummaryDto] })
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
  @ApiOperation({ summary: 'Получить материал и черновик AI-разбора' })
  @ApiParam({ name: 'id', description: 'ID материала' })
  @ApiOkResponse({ type: MaterialDetailDto })
  @ApiNotFoundResponse({ description: 'Материал не принадлежит текущему пользователю' })
  async detail(@Req() request: Request, @Param('id') id: string) {
    return this.ownedMaterial(id, await this.ownerId(request));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'Материал и уникальные записи удалены; файл поставлен на фоновое удаление',
  })
  @ApiOperation({
    summary: 'Удалить свой материал, его уникальные учебные записи и запланировать удаление файлов',
  })
  @ApiParam({ name: 'id', description: 'ID материала' })
  @ApiNotFoundResponse({ description: 'Материал не принадлежит текущему пользователю' })
  async remove(@Req() request: Request, @Param('id') id: string) {
    const ownerId = await this.ownerId(request);
    await writeMaterial(async (tx) => {
      const material = await tx.material.findFirst({
        where: { id, ownerId },
        include: { files: true, vocabulary: true, grammar: true },
      });
      if (!material) throw new NotFoundException('Материал не найден');
      if (material.files.length)
        await tx.fileDeletion.createMany({
          data: material.files.map((file) => ({ storageKey: file.storageKey })),
          skipDuplicates: true,
        });
      await tx.material.delete({ where: { id } });
      await tx.vocabItem.deleteMany({
        where: {
          ownerId,
          id: { in: material.vocabulary.map((item) => item.vocabItemId) },
          manuallyAdded: false,
          materials: { none: {} },
        },
      });
      await tx.grammarTopic.deleteMany({
        where: {
          ownerId,
          id: { in: material.grammar.map((item) => item.grammarTopicId) },
          manuallyAdded: false,
          materials: { none: {} },
        },
      });
    });
  }

  @Post()
  @ApiOperation({ summary: 'Загрузить текст и/или до пяти файлов урока' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          maxLength: 160,
          description: 'Если не указано, берётся имя первого файла без расширения',
        },
        noteText: { type: 'string', maxLength: 80000 },
        lessonDate: { type: 'string', format: 'date' },
        deadline: { type: 'string', format: 'date' },
        files: { type: 'array', maxItems: 5, items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @ApiCreatedResponse({ type: MaterialCreatedDto })
  @ApiBadRequestResponse({
    description: 'Нет текста/файлов, неверная дата или неподдерживаемый файл',
  })
  @UseInterceptors(
    FilesInterceptor('files', 5, { limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 4 } }),
  )
  async create(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const ownerId = await this.ownerId(request);
    const input = await validateMaterialInput(body, files);
    return withStoredMaterialFiles(ownerId, files, (stored) =>
      prisma.material.create({
        data: { ownerId, ...input, files: { create: stored } },
        select: { id: true, title: true, status: true },
      }),
    );
  }

  @Post(':id/analyze')
  @HttpCode(202)
  @ApiOperation({ summary: 'Запустить фоновый AI-разбор материала' })
  @ApiParam({ name: 'id', description: 'ID материала' })
  @ApiAcceptedResponse({ type: MaterialAnalysisResponseDto })
  async analyze(@Req() request: Request, @Param('id') id: string) {
    const ownerId = await this.ownerId(request);
    await this.ownedMaterial(id, ownerId);
    const claimed = await prisma.material.updateMany({
      where: {
        id,
        ownerId,
        status: { in: ['DRAFT', 'ERROR', 'REVIEW'] },
      },
      data: { status: 'PROCESSING', analysisError: null },
    });
    if (!claimed.count) throw new BadRequestException('Материал уже сохранён или разбирается');
    try {
      const jobId = await this.materialQueue.enqueue(id);
      if (!jobId) throw new Error('Queue rejected a duplicate job');
      return { status: 'PROCESSING' };
    } catch (error) {
      console.error('Material enqueue failed', { materialId: id, error });
      await prisma.material.updateMany({
        where: { id, ownerId, status: 'PROCESSING' },
        data: {
          status: 'ERROR',
          analysisError: 'Не удалось запустить разбор. Попробуй ещё раз.',
        },
      });
      throw new ServiceUnavailableException('Не удалось запустить разбор. Попробуй ещё раз.');
    }
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Сохранить проверенные слова и темы материала' })
  @ApiParam({ name: 'id', description: 'ID материала' })
  @ApiBody({ type: MaterialDraftDto })
  @ApiCreatedResponse({ type: MaterialDetailDto })
  @ApiBadRequestResponse({
    description: 'Черновик имеет неверный формат или материал ещё обрабатывается',
  })
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
      partOfSpeech: typeof item.partOfSpeech === 'string' ? item.partOfSpeech : '',
      semanticTopic: typeof item.semanticTopic === 'string' ? item.semanticTopic : '',
      allowNewMeaning: item.allowNewMeaning === true,
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
    await writeMaterial(async (tx) => {
      for (const item of vocabulary) {
        const partOfSpeech = isPartOfSpeech(item.partOfSpeech) ? item.partOfSpeech : null;
        const topic = normalizeSemanticTopic(item.semanticTopic);
        const semanticTopic = isSemanticTopic(topic) ? topic : null;
        const categorized = validCategories(partOfSpeech, semanticTopic);
        const existingWords = await tx.vocabItem.findMany({
          where: { ownerId, normalized: normaliseTerm(item.term) },
          orderBy: { createdAt: 'asc' },
        });
        const exact = existingWords.find(
          (word) => word.normalizedMeaning === normaliseMeaning(item.translation),
        );
        const existing = exact ?? (!item.allowNewMeaning ? existingWords[0] : undefined);
        const vocab =
          existing ??
          (await tx.vocabItem.upsert({
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
              partOfSpeech,
              semanticTopic,
              categoryStatus: categorized ? 'READY' : 'PENDING',
              flashcards: { create: { kind: 'IT_TO_RU' } },
            },
            update: {},
          }));
        if (partOfSpeech || semanticTopic) {
          const nextPartOfSpeech = vocab.partOfSpeech ?? partOfSpeech;
          const nextSemanticTopic = vocab.semanticTopic ?? semanticTopic;
          await tx.vocabItem.updateMany({
            where: { id: vocab.id, ownerId },
            data: {
              partOfSpeech: nextPartOfSpeech,
              semanticTopic: nextSemanticTopic,
              categoryStatus: validCategories(nextPartOfSpeech, nextSemanticTopic)
                ? 'READY'
                : 'PENDING',
            },
          });
        }
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
  @ApiOperation({ summary: 'Скачать свой исходный файл' })
  @ApiParam({ name: 'id', description: 'ID материала' })
  @ApiParam({ name: 'fileId', description: 'ID файла' })
  @ApiOkResponse({
    content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiNotFoundResponse({ description: 'Файл не принадлежит текущему пользователю' })
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
    const bytes = await loadFile(file.storageKey);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    response.send(bytes);
  }
}
