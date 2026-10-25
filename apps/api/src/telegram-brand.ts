import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prisma } from './database.js';
import { telegramApi } from './telegram-bot.js';

/** Persist the asset digest so ordinary restarts do not repeatedly upload the avatar. */
export async function synchronizeTelegramAvatar(botId: number) {
  if (!Number.isSafeInteger(botId) || botId <= 0) throw new Error('Invalid Telegram bot identity');
  const bytes = await readFile(
    new URL('../../../assets/telegram/lingvoteka-avatar-v1.jpg', import.meta.url),
  );
  const avatarHash = createHash('sha256').update(bytes).digest('hex');
  const state = await prisma.telegramBotProfile.findUnique({ where: { botId: String(botId) } });
  if (state?.avatarHash === avatarHash) return 'unchanged';
  const body = new FormData();
  body.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  body.set('avatar', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'lingvoteka.jpg');
  await telegramApi('setMyProfilePhoto', body);
  await prisma.telegramBotProfile.upsert({
    where: { botId: String(botId) },
    create: { botId: String(botId), avatarHash },
    update: { avatarHash },
  });
  return 'updated';
}
