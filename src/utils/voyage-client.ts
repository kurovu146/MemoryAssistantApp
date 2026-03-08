const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const BATCH_LIMIT = 128;

async function fetchEmbeddings(
  apiKey: string,
  texts: string[],
  inputType: 'document' | 'query',
  model: string,
): Promise<Float32Array[]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({input: texts, model, input_type: inputType}),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Voyage API error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {data: {embedding: number[]}[]};
  return json.data.map(d => new Float32Array(d.embedding));
}

export async function embedTexts(
  apiKey: string,
  texts: string[],
  inputType: 'document' | 'query' = 'document',
  model = 'voyage-3',
): Promise<Float32Array[]> {
  if (texts.length === 0) {
    return [];
  }

  const results: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    const batch = texts.slice(i, i + BATCH_LIMIT);
    const embeddings = await fetchEmbeddings(apiKey, batch, inputType, model);
    results.push(...embeddings);
  }
  return results;
}

export async function embedQuery(
  apiKey: string,
  query: string,
  model = 'voyage-3',
): Promise<Float32Array> {
  const results = await embedTexts(apiKey, [query], 'query', model);
  if (results.length === 0) {
    throw new Error('No embedding returned from Voyage API');
  }
  return results[0];
}
