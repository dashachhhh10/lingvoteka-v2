import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { createEmptyCard, fsrs, Rating, type Card } from 'ts-fsrs';
import { auth } from './auth.js';
import { prisma } from './database.js';
import { normaliseMeaning, normaliseTerm } from './vocabulary-identity.js';

const scheduler = fsrs({ enable_fuzz: false });
const NEW_PER_DAY = 10;

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
export class StudyController {
  private async userId(request: Request) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();
    return session.user.id;
  }

  @Get('vocabulary')
  async vocabulary(@Req() request: Request) {
    const ownerId = await this.userId(request);
    return prisma.vocabItem.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        term: true,
        translation: true,
        example: true,
        createdAt: true,
        reviewStates: { where: { userId: ownerId }, select: { due: true, lastReviewedAt: true } },
      },
    });
  }

  @Post('vocabulary')
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
      },
      select: { id: true, term: true, translation: true, example: true },
    });
  }

  @Get('reviews/queue')
  async queue(@Req() request: Request) {
    const userId = await this.userId(request);
    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const introduced = await prisma.reviewState.count({
      where: { userId, introducedAt: { gte: start } },
    });
    const due = await prisma.reviewState.findMany({
      where: { userId, due: { lte: now } },
      orderBy: { due: 'asc' },
      take: 40,
      include: {
        vocabItem: { select: { id: true, term: true, translation: true, example: true } },
      },
    });
    const remainingNew = Math.max(0, NEW_PER_DAY - introduced);
    const fresh = remainingNew
      ? await prisma.vocabItem.findMany({
          where: { ownerId: userId, reviewStates: { none: { userId } } },
          orderBy: { createdAt: 'asc' },
          take: remainingNew,
          select: { id: true, term: true, translation: true, example: true },
        })
      : [];
    return {
      dueCount: due.length,
      newCount: fresh.length,
      cards: [
        ...due.map((state) => ({ ...state.vocabItem, kind: 'due' as const })),
        ...fresh.map((item) => ({ ...item, kind: 'new' as const })),
      ],
    };
  }

  @Post('reviews/:vocabId')
  async review(
    @Req() request: Request,
    @Param('vocabId') vocabId: string,
    @Body() body: { rating?: unknown },
  ) {
    const userId = await this.userId(request);
    const rating = Number(body?.rating);
    if (![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(rating))
      throw new BadRequestException('Выбери оценку ответа');
    const vocab = await prisma.vocabItem.findFirst({
      where: { id: vocabId, ownerId: userId },
      select: { id: true },
    });
    if (!vocab) throw new BadRequestException('Слово не найдено');
    const now = new Date();
    try {
      return await prisma.$transaction(
        async (tx) => {
          const state = await tx.reviewState.findUnique({
            where: { userId_vocabItemId: { userId, vocabItemId: vocabId } },
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
                  vocabItemId: vocabId,
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
