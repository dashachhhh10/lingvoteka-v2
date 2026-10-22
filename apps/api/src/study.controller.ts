import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { auth } from './auth.js';
import { prisma } from './database.js';
import { normaliseMeaning, normaliseTerm } from './vocabulary-identity.js';
import {
  AddVocabularyDto,
  CategoryQueueDto,
  RatingInputDto,
  PracticeQueueDto,
  ReviewQueueDto,
  ReviewResultDto,
  VocabItemDto,
  VocabularyListItemDto,
} from './openapi.dto.js';

const scheduler = fsrs({ enable_fuzz: false });

function parseCard(value: Prisma.JsonValue): Card {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Review card is corrupt');
  const card = value as Record<string, unknown>;
  return {
    due: new Date(String(card.due)),
    stability: Number(card.stability),
    difficulty: Number(card.difficulty),
    elapsed_days: Number(card.elapsed_days),
    scheduled_days: Number(card.scheduled_days),
    learning_steps: Number(card.learning_steps),
    reps: Number(card.reps),
    lapses: Number(card.lapses),
    state: Number(card.state) as Card['state'],
    last_review: card.last_review ? new Date(String(card.last_review)) : undefined,
  };
}

@Controller()
@ApiTags('Словарь и повторение')
@ApiCookieAuth('sessionCookie')
@ApiUnauthorizedResponse({ description: 'Сессия отсутствует или истекла' })
export class StudyController {
  private async userId(request: Request) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();
    return session.user.id;
  }

  @Get('vocabulary')
  @ApiOperation({ summary: 'Получить слова с источниками и состоянием повторения' })
  @ApiOkResponse({ type: [VocabularyListItemDto] })
  async vocabulary(@Req() request: Request) {
    const ownerId = await this.userId(request);
    const words = await prisma.vocabItem.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        term: true,
        translation: true,
        example: true,
        partOfSpeech: true,
        semanticTopic: true,
        categoryStatus: true,
        createdAt: true,
        flashcards: {
          where: { kind: 'IT_TO_RU' },
          select: {
            reviewStates: {
              where: { userId: ownerId },
              select: { due: true, lastReviewedAt: true },
            },
          },
        },
        materials: {
          select: {
            material: { select: { id: true, title: true, createdAt: true } },
          },
        },
      },
    });
    return words.map(({ flashcards, ...word }) => ({
      ...word,
      reviewStates: flashcards.flatMap((card) => card.reviewStates),
    }));
  }

  @Post('vocabulary/categories/classify')
  @ApiOperation({
    summary: 'Запустить определение тем для ранее сохранённых слов после действия пользователя',
  })
  @ApiCreatedResponse({ type: CategoryQueueDto })
  async classifyExistingCategories(@Req() request: Request) {
    const ownerId = await this.userId(request);
    const result = await prisma.vocabItem.updateMany({
      where: { ownerId, categoryStatus: { in: ['AWAITING_APPROVAL', 'ERROR'] } },
      data: { categoryStatus: 'PENDING' },
    });
    return { queued: result.count };
  }

  @Post('vocabulary')
  @ApiOperation({ summary: 'Добавить слово вручную' })
  @ApiBody({ type: AddVocabularyDto })
  @ApiCreatedResponse({ type: VocabItemDto })
  @ApiBadRequestResponse({ description: 'Слово или перевод не указаны' })
  @ApiConflictResponse({ description: 'Такое значение слова уже есть в словаре' })
  async addVocabulary(
    @Req() request: Request,
    @Body() body: { term?: unknown; translation?: unknown; example?: unknown },
  ) {
    const ownerId = await this.userId(request);
    const term = typeof body?.term === 'string' ? body.term.trim().slice(0, 160) : '';
    const translation =
      typeof body?.translation === 'string' ? body.translation.trim().slice(0, 300) : '';
    const example = typeof body?.example === 'string' ? body.example.trim().slice(0, 500) : '';
    if (!term || !translation) throw new BadRequestException('Укажи слово и перевод');
    const existing = await prisma.vocabItem.findUnique({
      where: {
        ownerId_normalized_normalizedMeaning: {
          ownerId,
          normalized: normaliseTerm(term),
          normalizedMeaning: normaliseMeaning(translation),
        },
      },
    });
    if (existing) throw new ConflictException('Это значение слова уже есть в словаре');
    return prisma.vocabItem.create({
      data: {
        ownerId,
        term,
        normalized: normaliseTerm(term),
        translation,
        normalizedMeaning: normaliseMeaning(translation),
        example: example || null,
        flashcards: { create: { kind: 'IT_TO_RU' } },
      },
      select: { id: true, term: true, translation: true, example: true },
    });
  }

  @Get('reviews/queue')
  @ApiOperation({ summary: 'Получить очередь новых и просроченных карточек' })
  @ApiOkResponse({ type: ReviewQueueDto })
  async queue(@Req() request: Request) {
    const userId = await this.userId(request);
    const now = new Date();
    const due = await prisma.reviewState.findMany({
      where: { userId, due: { lte: now } },
      orderBy: { due: 'asc' },
      include: {
        flashcard: {
          include: {
            vocabItem: { select: { term: true, translation: true, example: true } },
          },
        },
      },
    });
    const fresh = await prisma.flashcard.findMany({
      where: {
        kind: 'IT_TO_RU',
        vocabItem: { ownerId: userId },
        reviewStates: { none: { userId } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        vocabItem: { select: { term: true, translation: true, example: true } },
      },
    });
    return {
      dueCount: due.length,
      newCount: fresh.length,
      cards: [
        ...due.map((state) => ({
          id: state.flashcard.id,
          ...state.flashcard.vocabItem,
          kind: 'due' as const,
        })),
        ...fresh.map((card) => ({ id: card.id, ...card.vocabItem, kind: 'new' as const })),
      ],
    };
  }

  @Get('reviews/practice')
  @ApiOperation({ summary: 'Карточки для свободной практики без изменения расписания' })
  @ApiOkResponse({ type: PracticeQueueDto })
  @ApiBadRequestResponse({ description: 'Неверная категория слов' })
  async practice(
    @Req() request: Request,
    @Query('topic') topic?: string,
    @Query('partOfSpeech') partOfSpeech?: string,
  ) {
    const userId = await this.userId(request);
    for (const value of [topic, partOfSpeech]) {
      if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 100))
        throw new BadRequestException('Выбери категорию слов');
    }
    if (topic && partOfSpeech) throw new BadRequestException('Выбери одну категорию для занятия');
    const cards = await prisma.flashcard.findMany({
      where: {
        kind: 'IT_TO_RU',
        vocabItem: {
          ownerId: userId,
          ...(topic === '__uncategorized__'
            ? { semanticTopic: null }
            : topic
              ? { semanticTopic: topic }
              : {}),
          ...(partOfSpeech === '__uncategorized__'
            ? { partOfSpeech: null }
            : partOfSpeech
              ? { partOfSpeech }
              : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        vocabItem: { select: { term: true, translation: true, example: true } },
      },
    });
    return {
      cards: cards.map((card) => ({ id: card.id, ...card.vocabItem, kind: 'practice' as const })),
    };
  }

  @Post('reviews/:flashcardId')
  @ApiOperation({ summary: 'Оценить ответ и пересчитать срок по FSRS' })
  @ApiParam({ name: 'flashcardId', description: 'ID карточки' })
  @ApiBody({ type: RatingInputDto })
  @ApiCreatedResponse({ type: ReviewResultDto })
  @ApiBadRequestResponse({ description: 'Неверная оценка или карточка не найдена' })
  @ApiConflictResponse({ description: 'Карточка уже оценена или ещё не готова к повторению' })
  async review(
    @Req() request: Request,
    @Param('flashcardId') flashcardId: string,
    @Body() body: { rating?: unknown },
  ) {
    const userId = await this.userId(request);
    const rating = Number(body?.rating);
    if (![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(rating))
      throw new BadRequestException('Выбери оценку ответа');
    const flashcard = await prisma.flashcard.findFirst({
      where: { id: flashcardId, vocabItem: { ownerId: userId } },
      select: { id: true },
    });
    if (!flashcard) throw new BadRequestException('Карточка не найдена');
    const now = new Date();
    try {
      return await prisma.$transaction(
        async (tx) => {
          const state = await tx.reviewState.findUnique({
            where: { userId_flashcardId: { userId, flashcardId } },
          });
          if (state && state.due > now)
            throw new ConflictException('Карточка ещё не готова к повторению');
          const card = state ? parseCard(state.card) : createEmptyCard(now);
          const next = scheduler.next(
            card,
            now,
            rating as Rating.Again | Rating.Hard | Rating.Good | Rating.Easy,
          );
          const cardJson = JSON.parse(JSON.stringify(next.card)) as Prisma.InputJsonValue;
          const logJson = JSON.parse(JSON.stringify(next.log)) as Prisma.InputJsonValue;
          const saved = state
            ? await tx.reviewState.update({
                where: { id: state.id },
                data: { card: cardJson, due: next.card.due, lastReviewedAt: now },
              })
            : await tx.reviewState.create({
                data: {
                  userId,
                  flashcardId,
                  card: cardJson,
                  due: next.card.due,
                  introducedAt: now,
                  lastReviewedAt: now,
                },
              });
          await tx.reviewEvent.create({
            data: { reviewStateId: saved.id, rating, reviewedAt: now, log: logJson },
          });
          return { due: next.card.due, state: next.card.state };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException('Карточка уже оценена. Обнови очередь.');
      throw error;
    }
  }
}
