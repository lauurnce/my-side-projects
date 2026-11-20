import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UploadDrop } from "./UploadDrop";

afterEach(cleanup);

const drop = {
  name: "submission",
  title: "Drop your file",
  hint: "DOCX or PDF only · max 25 MB",
  accept: ".docx,.pdf",
};

const report = new File(["report"], "report.pdf", { type: "application/pdf" });

function fileInput() {
  return screen.getByLabelText(/Drop your file/) as HTMLInputElement;
}

describe("UploadDrop", () => {
  it("finds the file input by its label and forwards accept and name", () => {
    render(<UploadDrop {...drop} onFiles={vi.fn()} />);
    const input = fileInput();
    expect(input.type).toBe("file");
    expect(input.name).toBe("submission");
    expect(input.accept).toBe(".docx,.pdf");
    expect(screen.getByText(drop.hint)).toBeTruthy();
  });

  it("is idle by default with an empty status tied to the input", () => {
    render(<UploadDrop {...drop} onFiles={vi.fn()} />);
    const input = fileInput();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect(input.getAttribute("aria-describedby")).toBe(status.id);
    expect(input.disabled).toBe(false);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.closest("label")?.hasAttribute("aria-busy")).toBe(false);
  });

  it("calls onFiles with an array when a file is chosen", () => {
    const onFiles = vi.fn();
    render(<UploadDrop {...drop} onFiles={onFiles} />);
    fireEvent.change(fileInput(), { target: { files: [report] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith([report]);
  });

  it("calls onFiles with an array when a file is dropped", () => {
    const onFiles = vi.fn();
    render(<UploadDrop {...drop} onFiles={onFiles} />);
    const label = fileInput().closest("label") as HTMLLabelElement;
    fireEvent.drop(label, { dataTransfer: { files: [report] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith([report]);
  });

  it("marks drag over and clears it on leave and on drop", () => {
    render(<UploadDrop {...drop} onFiles={vi.fn()} />);
    const label = fileInput().closest("label") as HTMLLabelElement;
    fireEvent.dragEnter(label);
    expect(label.getAttribute("data-dragging")).toBe("true");
    fireEvent.dragLeave(label);
    expect(label.getAttribute("data-dragging")).toBe("false");
    fireEvent.dragOver(label);
    expect(label.getAttribute("data-dragging")).toBe("true");
    fireEvent.drop(label, { dataTransfer: { files: [report] } });
    expect(label.getAttribute("data-dragging")).toBe("false");
  });

  it("sets aria-busy, disables the input and ignores drops while uploading", () => {
    const onFiles = vi.fn();
    render(<UploadDrop {...drop} state="uploading" message="Uploading report.pdf" onFiles={onFiles} />);
    const input = fileInput();
    const label = input.closest("label") as HTMLLabelElement;
    expect(label.getAttribute("aria-busy")).toBe("true");
    expect(input.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Uploading report.pdf");
    fireEvent.drop(label, { dataTransfer: { files: [report] } });
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("sets aria-invalid and a status message that starts with Error", () => {
    render(<UploadDrop {...drop} state="error" message="Only DOCX or PDF files" onFiles={vi.fn()} />);
    expect(fileInput().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Error: Only DOCX or PDF files");
  });

  it("does not repeat the Error prefix", () => {
    render(<UploadDrop {...drop} state="error" message="Error: File is over 25 MB" onFiles={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("Error: File is over 25 MB");
  });

  it("shows a fixed sentence for an error with no message", () => {
    render(<UploadDrop {...drop} state="error" onFiles={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("Upload failed. Try again.");
  });
});
