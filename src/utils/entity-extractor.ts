import {callClaude} from '../providers/claude';

const EXTRACTION_PROMPT = `Extract named entities from the following text. Return ONLY a JSON array of objects with "name" and "type" fields.

Valid types: person, project, technology, concept, organization

Rules:
- Only extract clearly named entities (proper nouns, specific names)
- Normalize names (capitalize properly)
- Skip generic terms
- Return empty array [] if no entities found
- Return ONLY the JSON array, no other text

Text:
`;

const VALID_TYPES = ['person', 'project', 'technology', 'concept', 'organization'];

export async function extractAndLinkEntities(
  apiKey: string,
  model: string,
  sourceType: string,
  sourceId: number,
  text: string,
): Promise<number> {
  // Import repo dynamically to avoid circular deps
  const repo = require('../db/repository');

  const truncated = text.length > 3000 ? text.slice(0, 3000) : text;
  const prompt = EXTRACTION_PROMPT + truncated;

  try {
    const response = await callClaude(
      [
        {
          role: 'user',
          content: {type: 'text', text: prompt},
        },
      ],
      [],
      apiKey,
      model,
    );

    const responseText = response.content ?? '';
    const entities = parseEntities(responseText);

    for (const {name, type: entityType} of entities) {
      const entityId = repo.saveEntity(name, entityType);
      if (entityId > 0) {
        const context = buildContextSnippet(text, name);
        repo.addEntityMention(entityId, sourceType, sourceId, context);
      }
    }

    return entities.length;
  } catch {
    return 0;
  }
}

function parseEntities(text: string): {name: string; type: string}[] {
  const trimmed = text.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (obj: any) =>
          typeof obj.name === 'string' &&
          obj.name.trim() !== '' &&
          typeof obj.type === 'string' &&
          VALID_TYPES.includes(obj.type.toLowerCase()),
      )
      .map((obj: any) => ({
        name: obj.name.trim(),
        type: obj.type.toLowerCase().trim(),
      }));
  } catch {
    return [];
  }
}

function buildContextSnippet(
  text: string,
  entityName: string,
): string | undefined {
  const lower = text.toLowerCase();
  const pos = lower.indexOf(entityName.toLowerCase());
  if (pos === -1) {
    return undefined;
  }
  const start = Math.max(0, pos - 30);
  const end = Math.min(text.length, pos + entityName.length + 30);
  return text.slice(start, end);
}
