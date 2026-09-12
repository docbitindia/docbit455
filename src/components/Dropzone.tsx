import React, { useCallback, useRef, useState } from 'react';
import { FileTypeIcon } from './FileTypeIcon';

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
  maxFileSize?: number;
}

const ACCEPTED_EXTENSIONS = [
  '.xlsx',
  '.xls',
  '.xlsm',
  '.csv',
  '.json'
];

const MAX_FILE_SIZE = 1024 * 1024 * 1024;

export function Dropzone({
  onFile,
  disabled = false,
  maxFileSize = MAX_FILE_SIZE
}: Props) {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const [dragging, setDragging] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  /* ================================================================
     FILE VALIDATION
     ================================================================ */

  const getExtension = (
    fileName: string
  ) => {
    const dot =
      fileName.lastIndexOf('.');

    if (dot === -1) {
      return '';
    }

    return fileName
      .slice(dot)
      .toLowerCase();
  };

  const validateFile = (
    file: File
  ): string | null => {
    const extension =
      getExtension(file.name);

    if (
      !ACCEPTED_EXTENSIONS.includes(
        extension
      )
    ) {
      return (
        'Unsupported file type. Please choose an Excel, CSV, or JSON file.'
      );
    }

    if (file.size === 0) {
      return (
        'This file is empty. Please choose a file that contains data.'
      );
    }

    if (
      file.size > maxFileSize
    ) {
      return (
        `This file is larger than ${Math.round(maxFileSize / 1024 / 1024)} MB. DocBit currently accepts files up to 1 GB.`
      );
    }

    return null;
  };

  /* ================================================================
     HANDLE FILE
     ================================================================ */

  const handleFile = useCallback(
    (file: File) => {
      if (disabled) {
        return;
      }

      const validationError =
        validateFile(file);

      if (validationError) {
        setError(
          validationError
        );
        return;
      }

      setError(null);

      onFile(file);
    },
    [disabled, onFile, maxFileSize]
  );

  /* ================================================================
     HANDLE FILE LIST
     ================================================================ */

  const handleFiles = useCallback(
    (
      files: FileList | null
    ) => {
      if (
        disabled ||
        !files ||
        files.length === 0
      ) {
        return;
      }

      /*
       * Only one dataset is processed at a time.
       * If multiple files are dropped, the first
       * file is used intentionally.
       */
      handleFile(files[0]);
    },
    [disabled, handleFile]
  );

  /* ================================================================
     OPEN FILE PICKER
     ================================================================ */

  const openPicker = () => {
    if (disabled) {
      return;
    }

    setError(null);

    inputRef.current?.click();
  };

  /* ================================================================
     DRAG HANDLERS
     ================================================================ */

  const handleDragOver = (
    event: React.DragEvent<HTMLLabelElement>
  ) => {
    event.preventDefault();

    if (!disabled) {
      setDragging(true);
    }
  };

  const handleDragLeave = (
    event: React.DragEvent<HTMLLabelElement>
  ) => {
    /*
     * Prevent flickering when moving between
     * children inside the dropzone.
     */
    if (
      event.currentTarget.contains(
        event.relatedTarget as Node
      )
    ) {
      return;
    }

    setDragging(false);
  };

  const handleDrop = (
    event: React.DragEvent<HTMLLabelElement>
  ) => {
    event.preventDefault();

    setDragging(false);

    if (disabled) {
      return;
    }

    handleFiles(
      event.dataTransfer.files
    );
  };

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <div className="max-w-2xl w-full mx-auto">

      {/* ============================================================
          DROPZONE
         ============================================================ */}

      <div
        onDragOver={(event) => {
          event.preventDefault();

          if (!disabled) {
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(
              event.relatedTarget as Node
            )
          ) {
            return;
          }

          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();

          setDragging(false);

          if (!disabled) {
            handleFiles(
              event.dataTransfer.files
            );
          }
        }}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            event.preventDefault();
            openPicker();
          }
        }}
        role="button"
        tabIndex={
          disabled ? -1 : 0
        }
        aria-label="Upload Excel, CSV, or JSON file"
        className={[
          'relative',
          'block',
          'rounded-2xl',
          'border-2',
          'border-dashed',
          'transition-all',
          'px-6',
          'py-12',
          'sm:py-16',
          'text-center',
          'select-none',
          'outline-none',

          disabled
            ? [
                'cursor-not-allowed',
                'opacity-60'
              ].join(' ')
            : [
                'cursor-pointer',
                'focus-visible:ring-2',
                'focus-visible:ring-blue-600/20',
                'focus-visible:ring-offset-2'
              ].join(' '),

          dragging
            ? [
                'border-[#2563EB]',
                'bg-blue-50/70',
                'scale-[1.01]'
              ].join(' ')
            : [
                'border-ink-200',
                'bg-white',
                'hover:border-[#2563EB]/50',
                'hover:bg-blue-50/[0.18]'
              ].join(' ')
        ].join(' ')}
      >

        {/* ==========================================================
            FILE INPUT
           ========================================================== */}

        <input
          ref={inputRef}
          id="docbit-file-upload"
          type="file"
          accept=".xlsx,.xls,.csv,.json"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            handleFiles(
              event.target.files
            );

            /*
             * Allow selecting the same file
             * again after an error or replacement.
             */
            event.currentTarget.value =
              '';
          }}
        />

        {/* ==========================================================
            UPLOAD ICON
           ========================================================== */}

        <div
          className={[
            'mx-auto',
            'h-12',
            'w-12',
            'rounded-xl',
            'flex',
            'items-center',
            'justify-center',
            'mb-4',
            'transition-all',
            'duration-150',

            dragging
              ? 'bg-blue-100 scale-105'
              : 'bg-paper-100'
          ].join(' ')}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className={
              dragging
                ? 'text-[#2563EB]'
                : 'text-ink-700'
            }
            aria-hidden="true"
          >
            <path
              d="M12 16V4M12 4l-4 4M12 4l4 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <path
              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* ==========================================================
            MAIN MESSAGE
           ========================================================== */}

        <p className="text-ink-900 font-medium">
          Drop your file here, or{' '}
          <span
            className={[
              'text-[#2563EB]',
              'underline',
              'underline-offset-2',
              'decoration-[#2563EB]/40'
            ].join(' ')}
          >
            browse your device
          </span>
        </p>

        {/* ==========================================================
            SUPPORTED FORMATS
           ========================================================== */}

        <div className="mt-6 flex items-center justify-center gap-4 sm:gap-6" aria-label="Supported file types">
          {(['excel','csv','json'] as const).map((type) => (
            <div key={type} className="flex min-w-[54px] flex-col items-center gap-1.5">
              <FileTypeIcon type={type} size={34} />
              <span className="text-[11px] font-semibold text-ink-600">{type === 'excel' ? 'Excel' : type.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-ink-600/60">up to {Math.round(maxFileSize / 1024 / 1024)} MB</p>

      </div>

      {/* ============================================================
          VALIDATION ERROR
         ============================================================ */}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3"
        >
          <div className="flex items-start gap-2.5">

            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 text-xs font-semibold">
              !
            </span>

            <div className="min-w-0">

              <p className="text-xs font-medium text-rose-700">
                File couldn't be added
              </p>

              <p className="text-[11px] text-rose-600/80 mt-0.5 leading-relaxed">
                {error}
              </p>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}