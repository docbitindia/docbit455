import React from 'react';
import type { DatasetSchema, RawDataset } from '../../types/dataset';
import type { ProcessedReport } from '../../types/processed';
import type {
  ExtractSettings,
  ReportConfig
} from '../../types/report';

interface Props {
  raw: RawDataset;
  schema: DatasetSchema;
  report: ProcessedReport;
  config: ReportConfig;
  onHeaderRowChange: (index: number) => void;
  onSwitchSheet: (sheetName: string) => void;
  update: (
    updater: (prev: ReportConfig) => ReportConfig
  ) => void;
}

export function GeneralPanel({
  raw,
  schema,
  report,
  config,
  onHeaderRowChange,
  onSwitchSheet,
  update
}: Props) {
  const design = config.design;

  const previewRowOptions = Math.min(
    raw.rows.length,
    15
  );

  const setDesign = (
    patch: Partial<ExtractSettings>
  ) => {
    update((prev) => ({
      ...prev,
      design: {
        ...prev.design,
        ...patch
      }
    }));
  };

  return (
    <div className="space-y-5">

      {/* ==========================================================
          SHEET
         ========================================================== */}

      {raw.meta.sheetNames &&
        raw.meta.sheetNames.length > 1 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600/60 mb-2.5">
              Sheet
            </h3>

            <p className="text-xs text-ink-600/60 mb-2">
              This workbook has{' '}
              {raw.meta.sheetNames.length} sheets.
              DocBit analyzed the one with the most
              data — switch if that's not the right one.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {raw.meta.sheetNames.map((name) => {
                const active =
                  name === raw.meta.sheetName;

                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      !active &&
                      onSwitchSheet(name)
                    }
                    className={[
                      'rounded-full',
                      'px-3 py-1',
                      'text-xs font-medium',
                      'border',
                      'outline-none',
                      'transition-colors',
                      'focus:outline-none',
                      'focus-visible:ring-2',
                      'focus-visible:ring-[#2563EB]/20',

                      active
                        ? [
                            'bg-[#2563EB]',
                            'border-[#2563EB]',
                            'text-white'
                          ].join(' ')
                        : [
                            'bg-white',
                            'border-ink-200',
                            'text-ink-600/70',
                            'hover:border-[#2563EB]/50',
                            'hover:text-[#2563EB]'
                          ].join(' ')
                    ].join(' ')}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

      {/* ==========================================================
          HEADER ROW
         ========================================================== */}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600/60 mb-2.5">
          Header row
        </h3>

        <p className="text-xs text-ink-600/60 mb-2">
          Pick the row that contains your column names.
          Rows above it (titles, metadata) are ignored
          automatically.
        </p>

        <div className="rounded-lg border border-ink-200 bg-white divide-y divide-ink-100 max-h-56 overflow-auto thin-scroll">
          {Array.from({
            length: previewRowOptions
          }).map((_, i) => {
            const rowPreview =
              raw.rows[i] ?? [];

            const label = rowPreview
              .filter(
                (c) =>
                  c !== null &&
                  c !== undefined &&
                  String(c).trim() !== ''
              )
              .slice(0, 4)
              .map((c) => String(c))
              .join(' · ');

            const active =
              i === schema.headerRowIndex;

            return (
              <button
                key={i}
                type="button"
                onClick={() =>
                  onHeaderRowChange(i)
                }
                className={[
                  'w-full',
                  'text-left',
                  'px-3 py-2',
                  'text-xs',
                  'flex items-center gap-2',
                  'outline-none',
                  'transition-colors',
                  'focus:outline-none',
                  'focus-visible:ring-2',
                  'focus-visible:ring-inset',
                  'focus-visible:ring-[#2563EB]/20',

                  active
                    ? [
                        'bg-blue-50',
                        'text-[#2563EB]',
                        'font-medium'
                      ].join(' ')
                    : [
                        'text-ink-700',
                        'hover:bg-paper-100'
                      ].join(' ')
                ].join(' ')}
              >
                <span className="font-mono w-14 shrink-0">
                  Row {i + 1}
                </span>

                <span className="truncate text-ink-600/70">
                  {label || '(empty row)'}
                </span>

                {active && (
                  <span className="ml-auto text-[10px] shrink-0 font-semibold text-[#2563EB]">
                    HEADER
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ==========================================================
          DATA QUALITY / PROFILE
         ========================================================== */}

      <section className="rounded-xl border border-ink-200 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-ink-100 bg-paper-50">
          <p className="text-xs font-semibold text-ink-900">Data quality</p>
          <p className="mt-0.5 text-[10px] text-ink-600/55">A quick profile of the normalized records.</p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-ink-100">
          <ProfileStat label="Completeness" value={`${(report.profile?.completenessPercent ?? 100).toFixed(1)}%`} />
          <ProfileStat label="Empty cells" value={(report.profile?.emptyCellCount ?? 0).toLocaleString()} />
          <ProfileStat label="Duplicate rows" value={(report.profile?.duplicateRowCount ?? 0).toLocaleString()} />
          <ProfileStat label="Records" value={(report.profile?.rowCount ?? report.rows.length).toLocaleString()} />
        </div>
      </section>

      {/* ==========================================================
          TABLE DENSITY
         ========================================================== */}

      <section>
        <Field label="Table density">
          <div className="flex gap-2">
            {(
              ['comfortable', 'compact'] as const
            ).map((density) => {
              const active =
                design.density === density;

              return (
                <button
                  key={density}
                  type="button"
                  onClick={() =>
                    setDesign({
                      density
                    })
                  }
                  className={[
                    'flex-1',
                    'rounded-md',
                    'border',
                    'px-2 py-1.5',
                    'text-xs',
                    'capitalize',
                    'outline-none',
                    'transition-colors',
                    'focus:outline-none',
                    'focus-visible:ring-2',
                    'focus-visible:ring-[#2563EB]/20',

                    active
                      ? [
                          'border-[#2563EB]',
                          'bg-blue-50',
                          'text-[#2563EB]',
                          'font-medium'
                        ].join(' ')
                      : [
                          'border-ink-200',
                          'text-ink-700',
                          'hover:bg-paper-100',
                          'hover:border-[#2563EB]/40'
                        ].join(' ')
                  ].join(' ')}
                >
                  {density}
                </button>
              );
            })}
          </div>
        </Field>
      </section>


    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="block text-xs font-semibold uppercase tracking-wide text-ink-600/60 mb-1.5">
        {label}
      </span>

      {children}
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return <div className="bg-white px-3 py-2"><p className="text-sm font-semibold tabular-nums text-ink-900">{value}</p><p className="text-[10px] text-ink-600/55">{label}</p></div>;
}
