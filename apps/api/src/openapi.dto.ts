import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PARTS_OF_SPEECH, SEMANTIC_TOPICS } from './vocabulary-categories.js';

export class ThemeInputDto {
  @ApiProperty({ type: String, enum: ['light', 'dark'] })
  theme!: 'light' | 'dark';
}

export class UserDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, format: 'email' }) email!: string;
  @ApiProperty({ type: String, enum: ['light', 'dark'] }) theme!: 'light' | 'dark';
}

export class UserResponseDto {
  @ApiProperty({ type: () => UserDto }) user!: UserDto;
}

export class MaterialFileDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) mimeType!: string;
  @ApiProperty({ type: Number }) byteSize!: number;
}

export class MaterialCountsDto {
  @ApiProperty({ type: Number }) files!: number;
  @ApiProperty({ type: Number }) vocabulary!: number;
  @ApiProperty({ type: Number }) grammar!: number;
}

export class MaterialSummaryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lessonDate!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deadline!: string | null;
  @ApiProperty({ type: String, enum: ['DRAFT', 'PROCESSING', 'REVIEW', 'READY', 'ERROR'] })
  status!: string;
  @ApiProperty({ type: String, nullable: true }) analysisError!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: () => MaterialCountsDto }) _count!: MaterialCountsDto;
}

export class MaterialCreatedDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String, enum: ['DRAFT'] }) status!: string;
}

export class VocabularyDraftDto {
  @ApiProperty({ type: String }) term!: string;
  @ApiProperty({ type: String }) translation!: string;
  @ApiProperty({ type: String }) example!: string;
  @ApiProperty({ type: String }) sourceExcerpt!: string;
  @ApiPropertyOptional({ type: String, enum: [...PARTS_OF_SPEECH] }) partOfSpeech?: string;
  @ApiPropertyOptional({ type: String, enum: [...SEMANTIC_TOPICS] }) semanticTopic?: string;
  @ApiPropertyOptional({ type: Boolean }) alreadyInVocabulary?: boolean;
  @ApiPropertyOptional({ type: Boolean }) otherMeaningInVocabulary?: boolean;
}

export class GrammarDraftDto {
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String }) summary!: string;
  @ApiProperty({ type: String }) sourceExcerpt!: string;
}

export class MaterialDraftDto {
  @ApiProperty({ type: () => [VocabularyDraftDto] }) vocabulary!: VocabularyDraftDto[];
  @ApiProperty({ type: () => [GrammarDraftDto] }) grammar!: GrammarDraftDto[];
}

export class VocabItemDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) term!: string;
  @ApiProperty({ type: String }) translation!: string;
  @ApiProperty({ type: String, nullable: true }) example!: string | null;
}

export class CategorizedVocabItemDto extends VocabItemDto {
  @ApiProperty({ type: String, enum: [...PARTS_OF_SPEECH], nullable: true }) partOfSpeech!:
    string | null;
  @ApiProperty({ type: String, enum: [...SEMANTIC_TOPICS], nullable: true }) semanticTopic!:
    string | null;
  @ApiProperty({ type: String, enum: ['PENDING', 'READY', 'ERROR', 'AWAITING_APPROVAL'] })
  categoryStatus!: string;
}

export class MaterialVocabularyLinkDto {
  @ApiProperty({ type: () => CategorizedVocabItemDto }) vocabItem!: CategorizedVocabItemDto;
  @ApiProperty({ type: String, nullable: true }) sourceExcerpt!: string | null;
}

export class GrammarTopicSummaryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String, nullable: true }) summary!: string | null;
  @ApiProperty({ type: String, enum: ['NOT_GENERATED', 'GENERATING', 'READY', 'ERROR'] })
  theoryStatus!: string;
}

export class MaterialGrammarLinkDto {
  @ApiProperty({ type: () => GrammarTopicSummaryDto }) grammarTopic!: GrammarTopicSummaryDto;
  @ApiProperty({ type: String, nullable: true }) sourceExcerpt!: string | null;
}

export class MaterialDetailDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String, nullable: true }) noteText!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lessonDate!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deadline!: string | null;
  @ApiProperty({ type: String, enum: ['DRAFT', 'PROCESSING', 'REVIEW', 'READY', 'ERROR'] })
  status!: string;
  @ApiProperty({ type: () => MaterialDraftDto, nullable: true })
  analysisDraft!: MaterialDraftDto | null;
  @ApiProperty({ type: String, nullable: true }) analysisError!: string | null;
  @ApiProperty({ type: () => [MaterialFileDto] }) files!: MaterialFileDto[];
  @ApiProperty({ type: () => [MaterialVocabularyLinkDto] })
  vocabulary!: MaterialVocabularyLinkDto[];
  @ApiProperty({ type: () => [MaterialGrammarLinkDto] }) grammar!: MaterialGrammarLinkDto[];
}

export class MaterialAnalysisResponseDto {
  @ApiProperty({ type: String, enum: ['PROCESSING'] }) status!: string;
}

export class AddVocabularyDto {
  @ApiProperty({ type: String }) term!: string;
  @ApiProperty({ type: String }) translation!: string;
  @ApiPropertyOptional({ type: String }) example?: string;
}

export class ReviewStateSummaryDto {
  @ApiProperty({ type: String, format: 'date-time' }) due!: string;
  @ApiProperty({ type: String, format: 'date-time' }) lastReviewedAt!: string;
}

export class VocabularyListItemDto extends CategorizedVocabItemDto {
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: () => [ReviewStateSummaryDto] }) reviewStates!: ReviewStateSummaryDto[];
  @ApiProperty({ type: () => [VocabularySourceDto] }) materials!: VocabularySourceDto[];
}

export class CategoryQueueDto {
  @ApiProperty({ type: Number }) queued!: number;
}

export class MaterialReferenceDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class VocabularySourceDto {
  @ApiProperty({ type: () => MaterialReferenceDto }) material!: MaterialReferenceDto;
}

export class ReviewQueueCardDto {
  @ApiProperty({ type: String, description: 'ID карточки, используемый для оценки ответа' })
  id!: string;
  @ApiProperty({ type: String }) term!: string;
  @ApiProperty({ type: String }) translation!: string;
  @ApiProperty({ type: String, nullable: true }) example!: string | null;
  @ApiProperty({ type: String, enum: ['new', 'due', 'practice'] }) kind!:
    'new' | 'due' | 'practice';
}

export class ReviewQueueDto {
  @ApiProperty({ type: Number }) dueCount!: number;
  @ApiProperty({ type: Number }) newCount!: number;
  @ApiProperty({ type: () => [ReviewQueueCardDto] }) cards!: ReviewQueueCardDto[];
}

export class PracticeQueueDto {
  @ApiProperty({ type: () => [ReviewQueueCardDto] }) cards!: ReviewQueueCardDto[];
}

export class RatingInputDto {
  @ApiProperty({
    type: Number,
    enum: [1, 2, 3, 4],
    description: '1 — не помню; 2 — трудно; 3 — хорошо; 4 — легко',
  })
  rating!: number;
}

export class ReviewResultDto {
  @ApiProperty({ type: String, format: 'date-time' }) due!: string;
  @ApiProperty({ type: Number }) state!: number;
}

export class GrammarCreateDto {
  @ApiProperty({ type: String }) title!: string;
  @ApiPropertyOptional({ type: String }) summary?: string;
}

export class GrammarCreatedDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String, nullable: true }) summary!: string | null;
}

export class GrammarCountsDto {
  @ApiProperty({ type: Number }) exercises!: number;
  @ApiProperty({ type: Number }) materials!: number;
}

export class GrammarListItemDto extends GrammarTopicSummaryDto {
  @ApiProperty({ type: () => GrammarCountsDto }) _count!: GrammarCountsDto;
}

export class GrammarExerciseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number }) position!: number;
  @ApiProperty({ type: String }) prompt!: string;
  @ApiProperty({ type: [String] }) options!: string[];
}

export class TheoryExampleDto {
  @ApiProperty({ type: String }) italian!: string;
  @ApiProperty({ type: String }) russian!: string;
}

export class GrammarTheoryDto {
  @ApiProperty({ type: String }) when!: string;
  @ApiProperty({ type: String }) formation!: string;
  @ApiProperty({ type: () => [TheoryExampleDto] }) examples!: TheoryExampleDto[];
  @ApiProperty({ type: [String] }) mistakes!: string[];
}

export class GrammarMaterialLinkDto {
  @ApiProperty({ type: String, nullable: true }) sourceExcerpt!: string | null;
  @ApiProperty({
    type: 'object',
    properties: { id: { type: 'string' }, title: { type: 'string' } },
  })
  material!: { id: string; title: string };
}

export class GrammarDetailDto extends GrammarTopicSummaryDto {
  @ApiProperty({ type: () => GrammarTheoryDto, nullable: true }) theory!: GrammarTheoryDto | null;
  @ApiProperty({ type: String, nullable: true }) theoryError!: string | null;
  @ApiProperty({ type: () => [GrammarExerciseDto] }) exercises!: GrammarExerciseDto[];
  @ApiProperty({ type: () => [GrammarMaterialLinkDto] }) materials!: GrammarMaterialLinkDto[];
}

export class ExerciseAnswerDto {
  @ApiProperty({ type: Number, minimum: 0, maximum: 3 }) answerIndex!: number;
}

export class ExerciseResultDto {
  @ApiProperty({ type: Boolean }) correct!: boolean;
  @ApiProperty({ type: Number }) answerIndex!: number;
  @ApiProperty({ type: String }) answer!: string;
  @ApiProperty({ type: String }) explanation!: string;
}
