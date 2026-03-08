import RNFS from 'react-native-fs';
import JSZip from 'jszip';
import XLSX from 'xlsx';

export type ExtractionResult =
  | {success: true; text: string; pageCount?: number}
  | {success: false; error: string};

const MAX_OUTPUT = 500 * 1024; // 500KB max extracted text

export async function extractText(
  filePath: string,
  mimeType: string,
): Promise<ExtractionResult> {
  const lower = mimeType.toLowerCase();
  try {
    if (lower === 'application/pdf') {
      return await extractPdfText(filePath);
    }
    if (
      lower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filePath.toLowerCase().endsWith('.docx')
    ) {
      return await extractDocxText(filePath);
    }
    if (
      lower === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      lower === 'application/vnd.ms-excel' ||
      filePath.toLowerCase().endsWith('.xlsx') ||
      filePath.toLowerCase().endsWith('.xls')
    ) {
      return await extractXlsxText(filePath);
    }
    if (lower.startsWith('text/') || lower === 'application/json' || lower === 'application/xml') {
      const text = await RNFS.readFile(filePath, 'utf8');
      return {success: true, text: truncate(text)};
    }
    return {success: false, error: `Unsupported file type: ${mimeType}`};
  } catch (e: any) {
    return {success: false, error: e.message ?? 'Unknown extraction error'};
  }
}

async function extractDocxText(filePath: string): Promise<ExtractionResult> {
  const stat = await RNFS.stat(filePath);
  if (Number(stat.size) > 10 * 1024 * 1024) {
    return {success: false, error: 'File too large for extraction (max 10MB)'};
  }
  const base64 = await RNFS.readFile(filePath, 'base64');
  const zip = await JSZip.loadAsync(base64, {base64: true});
  const docXml = zip.file('word/document.xml');
  if (!docXml) {
    return {success: false, error: 'DOCX missing word/document.xml'};
  }
  const xmlContent = await docXml.async('string');
  const text = parseDocxXml(xmlContent);
  if (!text.trim()) {
    return {success: false, error: 'DOCX contains no extractable text'};
  }
  return {success: true, text: truncate(text)};
}

function parseDocxXml(xml: string): string {
  let result = '';
  let inTag = false;
  let tagName = '';
  for (const ch of xml) {
    if (ch === '<') {
      inTag = true;
      tagName = '';
    } else if (ch === '>') {
      inTag = false;
      if (tagName.startsWith('/w:p') || tagName.startsWith('w:br')) {
        result += '\n';
      }
      if (tagName.startsWith('/w:tr')) {
        result += '\n';
      }
      if (tagName.startsWith('/w:tc')) {
        result += '\t';
      }
      tagName = '';
    } else if (inTag) {
      tagName += ch;
    } else {
      result += ch;
    }
  }
  return result
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractXlsxText(filePath: string): Promise<ExtractionResult> {
  const stat = await RNFS.stat(filePath);
  if (Number(stat.size) > 10 * 1024 * 1024) {
    return {success: false, error: 'File too large for extraction (max 10MB)'};
  }
  const base64 = await RNFS.readFile(filePath, 'base64');
  const workbook = XLSX.read(base64, {type: 'base64'});
  let output = '';
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      continue;
    }
    if (workbook.SheetNames.length > 1) {
      output += `=== Sheet: ${name} ===\n`;
    }
    const csv = XLSX.utils.sheet_to_csv(sheet, {FS: '\t'});
    if (csv.trim()) {
      output += csv + '\n\n';
    }
  }
  if (!output.trim()) {
    return {success: false, error: 'XLSX contains no data'};
  }
  return {success: true, text: truncate(output.trim())};
}

async function extractPdfText(_filePath: string): Promise<ExtractionResult> {
  // PDF text extraction requires a native module not yet integrated.
  return {
    success: false,
    error: 'PDF text extraction is not yet supported. Please convert to text or DOCX format.',
  };
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT) {
    return text;
  }
  return text.slice(0, MAX_OUTPUT) + '\n\n[Truncated — original text exceeds 500KB]';
}
