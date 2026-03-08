import RNFS from 'react-native-fs';
import * as repo from '../db/repository';
import {getAbsolutePath} from '../utils/file-manager';
import type {ToolResult} from '../agent/tools';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB (conservative for mobile memory)
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function readImageFromFile(fileId: number): Promise<ToolResult> {
  const file = repo.getUploadedFileById(fileId);
  if (!file) {
    return {type: 'text', content: `Error: file #${fileId} not found`};
  }

  if (!SUPPORTED_TYPES.includes(file.mimeType)) {
    return {
      type: 'text',
      content: `Error: unsupported image type "${file.mimeType}". Supported: ${SUPPORTED_TYPES.join(', ')}`,
    };
  }

  if (file.sizeBytes > MAX_IMAGE_SIZE) {
    return {
      type: 'text',
      content: `Error: image too large (${(file.sizeBytes / 1024 / 1024).toFixed(1)}MB, max 20MB)`,
    };
  }

  const absolutePath = getAbsolutePath(file.storedPath);
  const exists = await RNFS.exists(absolutePath);
  if (!exists) {
    return {type: 'text', content: `Error: image file not found on disk`};
  }

  const base64 = await RNFS.readFile(absolutePath, 'base64');
  return {
    type: 'image',
    base64,
    mediaType: file.mimeType,
    description: `Image: ${file.filename} (${(file.sizeBytes / 1024).toFixed(1)}KB)`,
  };
}
