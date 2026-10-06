-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lessonDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "noteText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "analysisDraft" JSONB,
    "analysisError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialFile" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabItem" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "example" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarTopic" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrammarTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialVocab" (
    "materialId" TEXT NOT NULL,
    "vocabItemId" TEXT NOT NULL,
    "sourceExcerpt" TEXT,

    CONSTRAINT "MaterialVocab_pkey" PRIMARY KEY ("materialId","vocabItemId")
);

-- CreateTable
CREATE TABLE "MaterialGrammar" (
    "materialId" TEXT NOT NULL,
    "grammarTopicId" TEXT NOT NULL,
    "sourceExcerpt" TEXT,

    CONSTRAINT "MaterialGrammar_pkey" PRIMARY KEY ("materialId","grammarTopicId")
);

-- CreateIndex
CREATE INDEX "Material_ownerId_createdAt_idx" ON "Material"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VocabItem_ownerId_normalized_key" ON "VocabItem"("ownerId", "normalized");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarTopic_ownerId_normalized_key" ON "GrammarTopic"("ownerId", "normalized");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialFile" ADD CONSTRAINT "MaterialFile_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabItem" ADD CONSTRAINT "VocabItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarTopic" ADD CONSTRAINT "GrammarTopic_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialVocab" ADD CONSTRAINT "MaterialVocab_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialVocab" ADD CONSTRAINT "MaterialVocab_vocabItemId_fkey" FOREIGN KEY ("vocabItemId") REFERENCES "VocabItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialGrammar" ADD CONSTRAINT "MaterialGrammar_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialGrammar" ADD CONSTRAINT "MaterialGrammar_grammarTopicId_fkey" FOREIGN KEY ("grammarTopicId") REFERENCES "GrammarTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
