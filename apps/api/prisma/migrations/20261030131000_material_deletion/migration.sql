ALTER TABLE "VocabItem" ADD COLUMN "manuallyAdded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GrammarTopic" ADD COLUMN "manuallyAdded" BOOLEAN NOT NULL DEFAULT false;
-- Retain standalone entries and entries known to predate every material source.
UPDATE "VocabItem" v SET "manuallyAdded" = true WHERE NOT EXISTS (SELECT 1 FROM "MaterialVocab" mv WHERE mv."vocabItemId" = v.id) OR v."createdAt" < (SELECT MIN(m."createdAt") FROM "MaterialVocab" mv JOIN "Material" m ON m.id = mv."materialId" WHERE mv."vocabItemId" = v.id);
UPDATE "GrammarTopic" g SET "manuallyAdded" = true WHERE NOT EXISTS (SELECT 1 FROM "MaterialGrammar" mg WHERE mg."grammarTopicId" = g.id) OR g."createdAt" < (SELECT MIN(m."createdAt") FROM "MaterialGrammar" mg JOIN "Material" m ON m.id = mg."materialId" WHERE mg."grammarTopicId" = g.id);
CREATE TABLE "FileDeletion" (
 "id" TEXT NOT NULL,
 "storageKey" TEXT NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FileDeletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FileDeletion_storageKey_key" ON "FileDeletion"("storageKey");
CREATE INDEX "FileDeletion_retryAt_idx" ON "FileDeletion"("retryAt");
