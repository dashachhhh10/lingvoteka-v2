import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './database.js';
import { sendEmail } from './email.js';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    ...(process.env.NODE_ENV === 'production' ? [] : ['http://127.0.0.1:5173']),
  ],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Сброс пароля Lingvoteka',
        text: `Чтобы задать новый пароль, открой ссылку: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Подтверждение адреса Lingvoteka',
        text: `Чтобы подтвердить почту, открой ссылку: ${url}`,
        verificationUrl: url,
      });
    },
  },
});
