-- CreateTable
CREATE TABLE "ReviewState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vocabItemId" TEXT NOT NULL,
    "card" JSONB NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "introducedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" TEXT NOT NULL,
    "reviewStateId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "log" JSONB NOT NULL,

    CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewState_userId_due_idx" ON "ReviewState"("userId", "due");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewState_userId_vocabItemId_key" ON "ReviewState"("userId", "vocabItemId");

-- CreateIndex
CREATE INDEX "ReviewEvent_reviewStateId_reviewedAt_idx" ON "ReviewEvent"("reviewStateId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "ReviewState" ADD CONSTRAINT "ReviewState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewState" ADD CONSTRAINT "ReviewState_vocabItemId_fkey" FOREIGN KEY ("vocabItemId") REFERENCES "VocabItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_reviewStateId_fkey" FOREIGN KEY ("reviewStateId") REFERENCES "ReviewState"("id") ON DELETE CASCADE ON UPDATE CASCADE;
