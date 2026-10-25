import 'dotenv/config';
import { configureTelegramBot } from '../src/telegram-setup.js';

try {
  const apply = process.argv.includes('--apply');
  console.log(JSON.stringify(await configureTelegramBot(apply)));
  console.log(apply ? 'telegram_setup=PASS' : 'Settings unchanged. Pass --apply to configure.');
} catch {
  console.error('Telegram setup failed; check bot token, HTTPS origin and Telegram availability');
  process.exitCode = 1;
}
