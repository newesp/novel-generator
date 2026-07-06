interface PersistableImageOutputInput {
  url: string;
  mimeType: string;
  fetcher?: typeof fetch;
}

interface PersistableImageOutput {
  url: string;
  mimeType: string;
}

/** Converts temporary remote image URLs to data URLs before persisting them in local storage. */
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
  const storedMimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || mimeType;
  return {
    url: bytesToDataUrl(new Uint8Array(await response.arrayBuffer()), storedMimeType),
    mimeType: storedMimeType,
  };
}

function isRemoteImageUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
