import { useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import { fileProblem } from "../../../utils/fundUploads";
import {
  DROPZONE_CHOOSE,
  DROPZONE_HINT,
  DROPZONE_READING_HINT,
  DROPZONE_READING_TITLE,
  DROPZONE_TITLE,
} from "../../../utils/fundUploadsCopy";

/**
 * Where a fact sheet goes in: drop a PDF or choose one.
 *
 * The obvious refusals (not a PDF, too big, empty) happen here so they cost no
 * round trip; everything else is the server's to say, and arrives as `error`.
 * While a sheet is being read the zone becomes the progress notice, so there
 * is one place on the page that says what is happening.
 */
export default function FactSheetDropzone({
  onFile,
  busy,
  error,
}: {
  onFile: (file: File) => void;
  busy: boolean;
  error: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const take = (file: File | undefined) => {
    if (!file) return;
    const problem = fileProblem(file);
    setLocalError(problem);
    if (!problem) onFile(file);
  };

  if (busy) {
    return (
      <div className="as-card flex items-center gap-4 p-5" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 shrink-0 animate-spin text-lime-700" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-bold text-brand-primary">{DROPZONE_READING_TITLE}</p>
          <p className="text-xs leading-relaxed text-forest-500">{DROPZONE_READING_HINT}</p>
        </div>
      </div>
    );
  }

  const shown = localError ?? error;

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files?.[0]);
        }}
        // One row, as the conservative design drew it: the icon, what to do, and the
        // button. The dashed border still says "drop here".
        className={`flex flex-wrap items-center gap-4 rounded-[16px] border-2 border-dashed p-4 transition-colors sm:p-5 ${
          dragging ? "border-forest-700 bg-forest-50" : "border-forest-900/15 bg-white"
        }`}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-700">
          <FileUp className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-0.5">
          <p className="text-base font-bold text-forest-900">{DROPZONE_TITLE}</p>
          <p className="text-xs text-brand-muted-fg">{DROPZONE_HINT}</p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="as-btn as-btn-primary shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700"
        >
          <FileUp className="h-4 w-4" aria-hidden />
          {DROPZONE_CHOOSE}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            take(e.target.files?.[0]);
            // So choosing the same file again after an error still fires.
            e.target.value = "";
          }}
        />
      </div>
      {shown && (
        <p className="flex items-start gap-2 text-xs font-semibold text-warning-strong" role="alert">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {shown}
        </p>
      )}
    </div>
  );
}
