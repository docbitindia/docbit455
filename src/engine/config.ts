import type { DatasetSchema } from '../types/dataset';
import type { ColumnConfig, ReportConfig, ReportBranding } from '../types/report';
import { makeId } from '../utils/id';


export const DEFAULT_REPORT_BRANDING: ReportBranding = {
  logoUrl: 'https://res.cloudinary.com/dlesei0kn/image/upload/v1787478477/file_000000005a44820885c9d29411b18ee4_rsbyqc.png',
  title: 'DocBit Data Report',
  subtitle: 'Prepared data overview',
  phone: '',
  email: '',
  link: '',
  theme: '#2563EB',
  bottomText: 'Generated with DocBit',
  iconUrls: ['/file-icons/excel.svg', '/file-icons/csv.svg', '/file-icons/json.svg']
};

export function normalizeReportConfig(config: ReportConfig): ReportConfig {
  return {
    ...config,
    design: {
      ...config.design,
      branding: { ...DEFAULT_REPORT_BRANDING, ...((config.design as unknown as { branding?: Partial<ReportBranding> }).branding ?? {}) }
    }
  };
}

export function createDefaultConfig(schema: DatasetSchema, sourceFileName?: string): ReportConfig {
  const columns: ColumnConfig[] = schema.columns.map((col, i) => ({
    key: col.key,
    visible: true,
    displayName: col.originalName,
    order: i,
    type: col.dataType,
    settings: defaultColumnSettings(col.dataType)
  }));

  const fileName = sourceFileName ? sourceFileName.replace(/\.[^.]+$/, '') : 'extracted_data';

  return {
    revision: 0,
    headerRowIndex: schema.headerRowIndex,
    excludedRanges: [],
    columns,
    filterGroup: { id: makeId('fg'), logic: 'AND', conditions: [] },
    sorts: [],
    group: { columnKey: null, aggregates: [] },
    calculations: [],
    design: {
      fileName,
      showSummary: true,
      density: 'comfortable',
branding: { ...DEFAULT_REPORT_BRANDING }
    }
  };
}

export function defaultColumnSettings(type: import('../types/dataset').DataType): import('../types/report').ColumnDisplaySettings {
  return {
    numberFormat: 'standard',
    decimalPlaces: 2,
    thousandsSeparator: true,
    decimalSeparator: 'dot',
    currencyEnabled: false,
    percentageEnabled: false,
    currencySymbol: '$',
    currencyCode: 'USD',
    negativeDisplay: 'minus',
    dateFormat: 'DD MMM YYYY',
    customDateFormat: '',
    alignment: 'left',
    width: 150,
    wrapping: 'truncate',
    trimWhitespace: true,
    textCase: 'none',
    urlDisplay: 'full',
    openLinks: true,
    openInNewTab: true,
    validateUrl: true,
    booleanStyle: 'text',
    trueLabel: 'Yes',
    falseLabel: 'No',
    nullDisplay: ''
  };
}

/** Rebuilds column config when the header row changes, preserving stable column intent. */
export function remapColumnsForNewSchema(
  previous: ColumnConfig[],
  schema: DatasetSchema
): ColumnConfig[] {
  const prevByKey = new Map(previous.map((c) => [c.key, c]));
  return schema.columns.map((col, i) => {
    const prev = prevByKey.get(col.key);
    return {
      key: col.key,
      visible: prev ? prev.visible : true,
      displayName: col.originalName,
      order: prev ? prev.order : i,
      type: col.dataType,
      settings: prev?.settings ? { ...defaultColumnSettings(col.dataType), ...prev.settings } : defaultColumnSettings(col.dataType)
    };
  });
}
