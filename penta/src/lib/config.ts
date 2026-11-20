const megabyte = 1024 * 1024;

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
