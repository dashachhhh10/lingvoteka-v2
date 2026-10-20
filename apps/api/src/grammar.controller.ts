import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  Body,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { auth } from './auth.js';
import { prisma } from './database.js';
import { MaterialQueueService } from './material-queue.js';
import {
  ExerciseAnswerDto,
  ExerciseResultDto,
  GrammarCreateDto,
  GrammarCreatedDto,
  GrammarDetailDto,
  GrammarListItemDto,
  GrammarTheoryDto,
} from './openapi.dto.js';

function theoryText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength)
    throw new BadRequestException('Проверь заполнение и длину текста теории');
  return value.trim();
}

function editableTheory(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Передай теорию для сохранения');
  const theory = value as Record<string, unknown>;
  if (!Array.isArray(theory.examples) || theory.examples.length < 1 || theory.examples.length > 4)
    throw new BadRequestException('Добавь от одного до четырёх примеров');
  if (!Array.isArray(theory.mistakes) || theory.mistakes.length > 4)
    throw new BadRequestException('Укажи не больше четырёх частых ошибок');
  return {
    when: theoryText(theory.when, 2000),
    formation: theoryText(theory.formation, 2000),
    examples: theory.examples.map((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw new BadRequestException('Проверь примеры теории');
      const example = item as Record<string, unknown>;
      return {
        italian: theoryText(example.italian, 400),
        russian: theoryText(example.russian, 400),
      };
    }),
    mistakes: theory.mistakes.map((item: unknown) => theoryText(item, 400)),
  };
}

@Controller('grammar')
@ApiTags('Грамматика')
@ApiCookieAuth('sessionCookie')
@ApiUnauthorizedResponse({ description: 'Сессия отсутствует или истекла' })
export class GrammarController {
  constructor(@Inject(MaterialQueueService) private readonly queue: MaterialQueueService) {}

  private async ownerId(request: Request) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();
    return session.user.id;
  }

  private async topic(id: string, ownerId: string) {
    const topic = await prisma.grammarTopic.findFirst({
      where: { id, ownerId },
      include: {
        materials: {
          select: { sourceExcerpt: true, material: { select: { id: true, title: true } } },
        },
        exercises: {
          orderBy: { position: 'asc' },
          select: { id: true, position: true, prompt: true, options: true },
        },
      },
    });
    if (!topic) throw new NotFoundException('Тема не найдена');
    return topic;
  }

  @Get()
  @ApiOperation({ summary: 'Получить свои грамматические темы' })
  @ApiOkResponse({ type: [GrammarListItemDto] })
  async list(@Req() request: Request) {
    const ownerId = await this.ownerId(request);
    return prisma.grammarTopic.findMany({
      where: { ownerId },
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        summary: true,
        theoryStatus: true,
        _count: { select: { exercises: true, materials: true } },
      },
    });
  }

  @Post()
  @ApiOperation({ summary: 'Добавить тему вручную' })
  @ApiBody({ type: GrammarCreateDto })
  @ApiCreatedResponse({ type: GrammarCreatedDto })
  @ApiBadRequestResponse({ description: 'Название темы не указано' })
  async create(@Req() request: Request, @Body() body: { title?: unknown; summary?: unknown }) {
    const ownerId = await this.ownerId(request);
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 160) : '';
    const summary = typeof body?.summary === 'string' ? body.summary.trim().slice(0, 1000) : '';
    if (!title) throw new BadRequestException('Укажи название темы');
    const normalized = title.replace(/\s+/g, ' ').toLocaleLowerCase('it');
    const existing = await prisma.grammarTopic.findUnique({
      where: { ownerId_normalized: { ownerId, normalized } },
    });
    if (existing) return existing;
    return prisma.grammarTopic.create({
      data: { ownerId, title, normalized, summary: summary || null },
      select: { id: true, title: true, summary: true },
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить тему, теорию, упражнения и источники' })
  @ApiParam({ name: 'id', description: 'ID темы' })
  @ApiOkResponse({ type: GrammarDetailDto })
  @ApiNotFoundResponse({ description: 'Тема не принадлежит текущему пользователю' })
  async detail(@Req() request: Request, @Param('id') id: string) {
    return this.topic(id, await this.ownerId(request));
  }

  @Patch(':id/theory')
  @ApiOperation({ summary: 'Исправить свою созданную AI-теорию вручную' })
  @ApiParam({ name: 'id', description: 'ID темы' })
  @ApiBody({ type: GrammarTheoryDto })
  @ApiOkResponse({ type: GrammarDetailDto })
  @ApiBadRequestResponse({ description: 'Теория ещё не готова или неверно заполнена' })
  @ApiNotFoundResponse({ description: 'Тема не принадлежит текущему пользователю' })
  async editTheory(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const ownerId = await this.ownerId(request);
    await this.topic(id, ownerId);
    const theory = editableTheory(body);
    const updated = await prisma.grammarTopic.updateMany({
      where: { id, ownerId, theoryStatus: 'READY' },
      data: { theory: theory as Prisma.InputJsonValue },
    });
    if (!updated.count) throw new BadRequestException('Сначала создай объяснение');
    return this.topic(id, ownerId);
  }

  @Post(':id/generate')
  @ApiOperation({ summary: 'Поставить создание объяснения и упражнений в фоновую очередь' })
  @ApiParam({ name: 'id', description: 'ID темы' })
  @ApiCreatedResponse({ type: GrammarDetailDto })
  @ApiBadRequestResponse({ description: 'Теория уже создана или создаётся' })
  async generate(@Req() request: Request, @Param('id') id: string) {
    const ownerId = await this.ownerId(request);
    await this.topic(id, ownerId);
    const claimed = await prisma.grammarTopic.updateMany({
      where: {
        id,
        ownerId,
        theoryStatus: { in: ['NOT_GENERATED', 'ERROR'] },
      },
      data: { theoryStatus: 'GENERATING', theoryError: null },
    });
    if (!claimed.count) throw new BadRequestException('Объяснение уже создано или создаётся');
    try {
      await this.queue.enqueueGrammar(id);
    } catch (error) {
      console.error('Could not queue grammar generation', { topicId: id, error });
      await prisma.grammarTopic.updateMany({
        where: { id, ownerId, theoryStatus: 'GENERATING' },
        data: {
          theoryStatus: 'ERROR',
          theoryError: 'Не удалось начать генерацию. Попробуй ещё раз.',
        },
      });
      throw new ServiceUnavailableException('Не удалось начать генерацию. Попробуй ещё раз.');
    }
    return this.topic(id, ownerId);
  }

  @Post('exercises/:exerciseId/check')
  @ApiOperation({ summary: 'Проверить ответ на упражнение' })
  @ApiParam({ name: 'exerciseId', description: 'ID упражнения' })
  @ApiBody({ type: ExerciseAnswerDto })
  @ApiCreatedResponse({ type: ExerciseResultDto })
  @ApiBadRequestResponse({ description: 'Неверный вариант ответа' })
  @ApiNotFoundResponse({ description: 'Упражнение не принадлежит текущему пользователю' })
  async check(
    @Req() request: Request,
    @Param('exerciseId') exerciseId: string,
    @Body() body: { answerIndex?: unknown },
  ) {
    const ownerId = await this.ownerId(request);
    const exercise = await prisma.grammarExercise.findFirst({
      where: { id: exerciseId, topic: { ownerId } },
    });
    if (!exercise) throw new NotFoundException('Упражнение не найдено');
    const answerIndex = Number(body?.answerIndex);
    const options = exercise.options as string[];
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length)
      throw new BadRequestException('Выбери вариант ответа');
    const correct = answerIndex === exercise.answerIndex;
    await prisma.exerciseAttempt.create({
      data: { userId: ownerId, exerciseId, answerIndex, correct },
    });
    return {
      correct,
      answerIndex: exercise.answerIndex,
      answer: options[exercise.answerIndex],
      explanation: exercise.explanation,
    };
  }
}
