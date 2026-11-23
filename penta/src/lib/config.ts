export const megabyte = 1024 * 1024;

const pdf = "application/pdf";
const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pptx = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const storagePlan = {
  maxFileBytes: 50 * megabyte,
  totalBytes: 1024 * megabyte,
  functionBodyBytes: 4.5 * megabyte,
  blockBytes: 900 * megabyte,
} as const;

export const submissionUpload = {
  maxBytes: 25 * megabyte,
  mimeTypeByExtension: { pdf, docx },
} as const;

export const deckUpload = {
  maxBytes: 50 * megabyte,
  mimeTypeByExtension: { pdf, pptx },
} as const;

export const routeLimits = {
  modulesPerClass: 30,
  lessonsPerModule: 60,
  moduleTitleLength: 120,
  lessonTitleLength: 160,
  lessonBodyLength: 50000,
  lessonMinutesMax: 600,
  summitMeters: 3000,
} as const;

export const deckLimits = {
  budgetBytes: 700 * megabyte,
  decksPerClass: 40,
  unfinishedPerTeacher: 3,
  titleLength: 120,
  slidesMax: 300,
  slowLoadBytes: 20 * megabyte,
  nearlyFullRatio: 0.9,
  zipDirectoryMaxBytes: 4 * megabyte,
  zipTailBytes: 64 * 1024,
  viewUrlSeconds: 60 * 60,
  downloadUrlSeconds: 60,
  seenAfterMilliseconds: 1000,
} as const;

export const liveLimits = {
  pollDownMilliseconds: 3000,
  pollUpMilliseconds: 15000,
  pollIdleMilliseconds: 20000,
  pollJitterRatio: 0.2,
  lookJitterMilliseconds: 200,
  outOfTouchMilliseconds: 15000,
  moveGapMilliseconds: 400,
  moveTimeoutMilliseconds: 5000,
  moveRetryMilliseconds: 1000,
  unsentNoticeMilliseconds: 2000,
  heartbeatMilliseconds: 5 * 60 * 1000,
  leaseMinutes: 30,
  rejoinMilliseconds: 2000,
  presenceDebounceMilliseconds: 1500,
  seenJitterMilliseconds: 500,
} as const;

export const quizLimits = {
  titleLength: 160,
  instructionsLength: 10000,
  promptLength: 2000,
  optionLength: 300,
  optionsMin: 2,
  optionsMax: 6,
  acceptedAnswersMax: 10,
  answerLength: 200,
  questionPointsMax: 100,
  questionsPerQuiz: 100,
  attemptLimitMax: 10,
  timeLimitMaxMinutes: 300,
  graceSeconds: 15,
  revealAfterDueSeconds: 60,
  saveDebounceMilliseconds: 600,
  timerNoticesMinutes: [10, 5, 1],
} as const;

export const submissionLimits = {
  fileNameLength: 120,
  feedbackLength: 5000,
  pointsMax: 1000,
  uploadWindowMinutes: 30,
  fileUrlSeconds: 60,
  contentTypesMaxBytes: megabyte,
  pdfTailBytes: 1024,
} as const;

export const altitudeWeights = { lessons: 1200, decks: 600, activities: 1200 } as const;

export const threadLimits = {
  titleLength: 160,
  bodyLength: 2000,
  bodyLines: 60,
  postsPerMinute: 5,
  editMinutes: 15,
  editsPerPost: 3,
  postsPerThread: 200,
  pollDownMilliseconds: 10000,
  pollUpMilliseconds: 60000,
  pollJitterRatio: 0.2,
  lookJitterMilliseconds: 300,
  rejoinMilliseconds: 2000,
} as const;

export const slideLimits = {
  width: 1600,
  height: 900,
  slidesMax: 60,
  blocksPerSlide: 30,
  blockMinSize: 24,
  titleLength: 200,
  textLength: 2000,
  boxLength: 200,
  altLength: 200,
  contentMaxBytes: 512 * 1024,
  imageMaxBytes: 2 * megabyte,
  imageMaxSide: 2048,
  imageSendSide: 1920,
  imagesPerDeck: 40,
  historySteps: 50,
  keyStep: 8,
  keyFineStep: 1,
  saveDelayMilliseconds: 1500,
  saveTimeoutMilliseconds: 15000,
  saveRetryMilliseconds: [2000, 4000, 8000, 16000, 30000],
  editorMinWidth: 900,
} as const;
