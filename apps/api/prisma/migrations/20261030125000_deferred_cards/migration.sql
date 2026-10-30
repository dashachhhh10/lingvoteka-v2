CREATE TABLE "DeferredCard" (
    "userId" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeferredCard_pkey" PRIMARY KEY ("userId", "flashcardId"),
    CONSTRAINT "DeferredCard_rating_check" CHECK ("rating" IN (1, 2))
);
CREATE INDEX "DeferredCard_userId_updatedAt_idx" ON "DeferredCard"("userId", "updatedAt");
ALTER TABLE "DeferredCard" ADD CONSTRAINT "DeferredCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeferredCard" ADD CONSTRAINT "DeferredCard_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
