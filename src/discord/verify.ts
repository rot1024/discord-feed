// Verify Discord Interactions request signature using Web Crypto API (Ed25519)

export async function verifyDiscordRequest(
  request: Request,
  publicKey: string
): Promise<{ isValid: boolean; body: string }> {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const body = await request.text();

  if (!signature || !timestamp) {
    return { isValid: false, body };
  }

  try {
    const isValid = await verifySignature(signature, timestamp, body, publicKey);
    return { isValid, body };
  } catch {
    return { isValid: false, body };
  }
}

async function verifySignature(
  signature: string,
  timestamp: string,
  body: string,
  publicKey: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const message = encoder.encode(timestamp + body);

  const signatureBytes = hexToBytes(signature);
  const publicKeyBytes = hexToBytes(publicKey);

  const key = await crypto.subtle.importKey(
    "raw",
    publicKeyBytes,
    { name: "Ed25519", namedCurve: "Ed25519" },
    false,
    ["verify"]
  );

  return await crypto.subtle.verify("Ed25519", key, signatureBytes, message);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
