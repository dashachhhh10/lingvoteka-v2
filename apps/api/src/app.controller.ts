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
import { auth } from './auth.js';
import { prisma } from './database.js';

type Theme = 'light' | 'dark';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('me')
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
