-- CreateTable
CREATE TABLE "TelegramSubmission" (
    "id" TEXT NOT NULL,
    "batchKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "isAlbum" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "materialId" TEXT,
    "replyMessageId" INTEGER,
    "notifiedStatus" TEXT,
    "notificationRetryAt" TIMESTAMP(3),
    "errorText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "updateId" BIGINT NOT NULL,
    "chatId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB,
    "submissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateTable
CREATE TABLE "TelegramBotProfile" (
    "botId" TEXT NOT NULL,
    "avatarHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBotProfile_pkey" PRIMARY KEY ("botId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSubmission_batchKey_key" ON "TelegramSubmission"("batchKey");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSubmission_materialId_key" ON "TelegramSubmission"("materialId");

-- CreateIndex
CREATE INDEX "TelegramSubmission_status_lastReceivedAt_idx" ON "TelegramSubmission"("status", "lastReceivedAt");

-- CreateIndex
CREATE INDEX "TelegramUpdate_handledAt_createdAt_idx" ON "TelegramUpdate"("handledAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdate_chatId_messageId_key" ON "TelegramUpdate"("chatId", "messageId");

-- AddForeignKey
ALTER TABLE "TelegramSubmission" ADD CONSTRAINT "TelegramSubmission_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramSubmission" ADD CONSTRAINT "TelegramSubmission_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramUpdate" ADD CONSTRAINT "TelegramUpdate_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TelegramSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
