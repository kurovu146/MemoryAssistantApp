const CHUNK_TARGET_CHARS = 500;
const OVERLAP_LINES = 3;

export interface Chunk {
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
}

export function chunkDocument(content: string): Chunk[] {
  if (content.length < CHUNK_TARGET_CHARS) {
    const lineCount = Math.max(content.split('\n').length, 1);
    return [{chunkIndex: 0, startLine: 1, endLine: lineCount, content}];
  }

  const lines = content.split('\n');
  const chunks: Chunk[] = [];
  let lineIdx = 0;
  let chunkIndex = 0;

  while (lineIdx < lines.length) {
    const startLineIdx = lineIdx;
    let charAcc = 0;
    let endLineIdx = lineIdx;

    while (endLineIdx < lines.length && charAcc < CHUNK_TARGET_CHARS) {
      charAcc += lines[endLineIdx].length + 1;
      endLineIdx++;
    }

    // Try to extend to paragraph boundary
    const lookAhead = Math.min(endLineIdx + 5, lines.length);
    let foundPara = false;
    for (let i = endLineIdx; i < lookAhead; i++) {
      if (lines[i].trim() === '') {
        endLineIdx = i + 1;
        foundPara = true;
        break;
      }
    }

    // Try sentence boundary if no paragraph break found
    if (!foundPara && endLineIdx > startLineIdx) {
      const last = endLineIdx - 1;
      if (last > startLineIdx && !/[.?!]$/.test(lines[last])) {
        if (endLineIdx < lines.length && /[.?!]$/.test(lines[endLineIdx])) {
          endLineIdx++;
        }
      }
    }

    if (endLineIdx <= startLineIdx) {
      endLineIdx = startLineIdx + 1;
    }

    chunks.push({
      chunkIndex,
      startLine: startLineIdx + 1,
      endLine: endLineIdx,
      content: lines.slice(startLineIdx, endLineIdx).join('\n').trim(),
    });

    chunkIndex++;
    if (endLineIdx >= lines.length) {
      break;
    }
    lineIdx = endLineIdx > OVERLAP_LINES ? endLineIdx - OVERLAP_LINES : endLineIdx;
  }

  return chunks;
}
