import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  Body,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { auth } from './auth.js';
import { prisma } from './database.js';
import { generateGrammarContent } from './grammar-generation.js';

@Controller('grammar')
export class GrammarController {
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
  async detail(@Req() request: Request, @Param('id') id: string) {
    return this.topic(id, await this.ownerId(request));
  }

  @Post(':id/generate')
  async generate(@Req() request: Request, @Param('id') id: string) {
    const ownerId = await this.ownerId(request);
    const topic = await this.topic(id, ownerId);
    const stale = new Date(Date.now() - 3 * 60_000);
    const claimed = await prisma.grammarTopic.updateMany({
      where: {
        id,
        ownerId,
        OR: [
          { theoryStatus: { in: ['NOT_GENERATED', 'ERROR'] } },
          { theoryStatus: 'GENERATING', updatedAt: { lt: stale } },
        ],
      },
      data: { theoryStatus: 'GENERATING', theoryError: null },
    });
    if (!claimed.count) throw new BadRequestException('Объяснение уже создано или создаётся');
    try {
      const generated = await generateGrammarContent({
        title: topic.title,
        summary: topic.summary,
        excerpts: topic.materials
          .map((item) => item.sourceExcerpt)
          .filter((text): text is string => Boolean(text)),
      });
      await prisma.$transaction(async (tx) => {
        await tx.grammarExercise.deleteMany({ where: { topicId: id } });
        await tx.grammarTopic.update({
          where: { id },
          data: {
            theory: generated.theory as unknown as Prisma.InputJsonValue,
            theoryStatus: 'READY',
            theoryError: null,
            exercises: {
              create: generated.exercises.map((exercise, position) => ({
                position,
                prompt: exercise.prompt,
                options: exercise.options,
                answerIndex: exercise.answerIndex,
                explanation: exercise.explanation,
              })),
            },
          },
        });
      });
      return this.topic(id, ownerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать объяснение';
      console.error('Grammar generation failed', { topicId: id, message });
      await prisma.grammarTopic.update({
        where: { id },
        data: { theoryStatus: 'ERROR', theoryError: message.slice(0, 300) },
      });
      throw new BadRequestException(
        message.startsWith('AI не настроен')
          ? message
          : 'Не удалось создать объяснение. Попробуй ещё раз.',
      );
    }
  }

  @Post('exercises/:exerciseId/check')
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
