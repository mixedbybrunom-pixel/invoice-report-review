import { useRef, useState, type DragEvent } from 'react';
import { FileSpreadsheet, UploadCloud, AlertCircle, Loader2 } from 'lucide-react';

interface UploadZoneProps {
  onFile: (file: File) => void;
  busy: boolean;
  error: string | null;
}

export function UploadZone({ onFile, busy, error }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center animate-fade-in">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Validate a delivery report</h2>
        <p className="mt-2 text-sm text-ink-2">
          Drop the Excel export here. Every invoice is checked against the master file and flagged for review.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={`group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200 ${
          dragging
            ? 'scale-[1.01] border-accent bg-accent-soft'
            : 'border-line-strong bg-surface hover:border-accent hover:bg-surface-2'
        }`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink transition-transform duration-300 group-hover:-translate-y-1">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
        </div>
        <div>
          <p className="font-medium">{busy ? 'Reading your report...' : 'Drop your report here, or choose a file'}</p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-ink-3">
            <FileSpreadsheet className="h-3.5 w-3.5" /> .xlsx or .xls files
          </p>
          {!busy && <button type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }} className="btn-primary mt-4 min-h-11 px-5">Browse files</button>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-pop-in dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

