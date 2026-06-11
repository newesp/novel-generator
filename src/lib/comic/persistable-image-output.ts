interface PersistableImageOutputInput {
  url: string;
  mimeType: string;
  fetcher?: typeof fetch;
}

interface PersistableImageOutput {
  url: string;
  mimeType: string;
}

export async function persistableImageOutput({
  url,
  mimeType,
  fetcher = fetch,
}: PersistableImageOutputInput): Promise<PersistableImageOutput> {
  if (!isRemoteImageUrl(url)) return { url, mimeType };

  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Unable to download generated image before saving: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const storedMimeType = blob.type || mimeType;
  return {
    url: await blobToDataUrl(blob, storedMimeType),
    mimeType: storedMimeType,
  };
}

function isRemoteImageUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

async function blobToDataUrl(blob: Blob, mimeType: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
