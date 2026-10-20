import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { auth } from './auth.js';
import { prisma } from './database.js';
import { passwordResetAvailable } from './email.js';
import { ThemeInputDto, UserResponseDto } from './openapi.dto.js';

type Theme = 'light' | 'dark';

@Controller()
@ApiTags('Сервис и аккаунт')
export class AppController {
  @Get('capabilities')
  capabilities() {
    return { passwordResetAvailable: passwordResetAvailable() };
  }

  @Get('health')
  @ApiOperation({ summary: 'Проверить доступность API' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', example: 'ok' } },
    },
  })
  health() {
    return { status: 'ok' };
  }

  @Get('me')
  @ApiCookieAuth('sessionCookie')
  @ApiOperation({ summary: 'Получить текущий аккаунт' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Сессия отсутствует или истекла' })
  async me(@Req() request: Request) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, theme: true },
    });
    return { user };
  }

  @Patch('me/theme')
  @ApiCookieAuth('sessionCookie')
  @ApiOperation({ summary: 'Изменить светлую или тёмную тему' })
  @ApiBody({ type: ThemeInputDto })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Сессия отсутствует или истекла' })
  async updateTheme(@Req() request: Request, @Body() body: { theme?: Theme }) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();
    if (body?.theme !== 'light' && body?.theme !== 'dark') {
      throw new BadRequestException('Выбери светлую или тёмную тему');
    }
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { theme: body.theme },
      select: { id: true, name: true, email: true, theme: true },
    });
    return { user };
  }
}
