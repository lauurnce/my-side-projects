export type UploadState = "idle" | "uploading" | "error";

export type UploadDropProps = {
  name: string;
  title: string;
  hint: string;
  accept: string;
  state?: UploadState;
  message?: string;
  onFiles: (files: File[]) => void;
};

export function UploadDrop({ name, title, accept }: UploadDropProps) {
  return (
    <label>
      {title}
      <input type="file" name={name} accept={accept} />
    </label>
  );
}
