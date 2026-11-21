export const megabyte = 1024 * 1024;

const pdf = "application/pdf";
const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pptx = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const storagePlan = {
  maxFileBytes: 50 * megabyte,
  totalBytes: 1024 * megabyte,
  functionBodyBytes: 4.5 * megabyte,
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
