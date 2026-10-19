ALTER TABLE "VocabItem"
  ADD COLUMN "partOfSpeech" TEXT,
  ADD COLUMN "semanticTopic" TEXT,
  ADD COLUMN "categoryStatus" TEXT NOT NULL DEFAULT 'PENDING';

CREATE INDEX "VocabItem_categoryStatus_ownerId_idx" ON "VocabItem"("categoryStatus", "ownerId");
