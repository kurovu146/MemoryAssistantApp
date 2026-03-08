import RNFS from 'react-native-fs';
import * as repo from '../db/repository';

const FILES_DIR = `${RNFS.DocumentDirectoryPath}/files`;

async function ensureFilesDir(): Promise<void> {
  const exists = await RNFS.exists(FILES_DIR);
  if (!exists) {
    await RNFS.mkdir(FILES_DIR);
  }
}

function generateStoredPath(originalName: string): string {
  const ext = originalName.includes('.')
    ? originalName.slice(originalName.lastIndexOf('.'))
    : '';
  const hex = (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 8);
  return `files/${Date.now()}-${hex}${ext}`;
}

export function getAbsolutePath(storedPath: string): string {
  return `${RNFS.DocumentDirectoryPath}/${storedPath}`;
}

async function computeHash(filePath: string): Promise<string> {
  return RNFS.hash(filePath, 'sha256');
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SaveFileResult {
  fileId: number;
  absolutePath: string;
  storedPath: string;
  duplicate: false;
}

export interface DuplicateFileResult {
  duplicate: true;
  existingFile: repo.UploadedFile;
}

export async function saveUploadedFile(
  cacheUri: string,
  originalName: string,
  mimeType: string,
): Promise<SaveFileResult | DuplicateFileResult> {
  await ensureFilesDir();

  // Hash the file content to check for duplicates
  const hash = await computeHash(cacheUri);
  const existing = repo.findFileByHash(hash);
  if (existing) {
    // Clean up cache copy
    try {
      await RNFS.unlink(cacheUri);
    } catch {}
    return {duplicate: true, existingFile: existing};
  }

  // Copy from cache to permanent storage
  const storedPath = generateStoredPath(originalName);
  const absolutePath = getAbsolutePath(storedPath);
  await RNFS.copyFile(cacheUri, absolutePath);

  // Get file size
  const stat = await RNFS.stat(absolutePath);
  const sizeBytes = Number(stat.size);

  // Insert DB record
  const fileId = repo.saveUploadedFile(
    originalName,
    storedPath,
    mimeType,
    sizeBytes,
    hash,
  );

  // Clean up cache copy
  try {
    await RNFS.unlink(cacheUri);
  } catch {}

  return {fileId, absolutePath, storedPath, duplicate: false};
}

export async function deleteUploadedFile(fileId: number): Promise<boolean> {
  // Get file info first without deleting DB record
  const fileInfo = repo.getUploadedFileInfo(fileId);
  if (!fileInfo) {
    return false;
  }

  // Delete physical file first — if this fails, DB record stays for retry
  const absolutePath = getAbsolutePath(fileInfo.storedPath);
  try {
    const exists = await RNFS.exists(absolutePath);
    if (exists) {
      await RNFS.unlink(absolutePath);
    }
  } catch (e) {
    console.warn(`Failed to delete file from disk: ${absolutePath}`, e);
  }

  // Then delete DB record + cascade knowledge/entities
  repo.deleteUploadedFileRecord(fileId);
  return true;
}
