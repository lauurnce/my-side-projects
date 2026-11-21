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
