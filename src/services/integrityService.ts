const PBKDF2_ITERATIONS = 310000;
const PBKDF2_HASH = 'SHA-256';

function utf8ToBytes(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

function bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

/**
 * Simple canonicalization by stringifying with sorted keys.
 * Recursively sorts object keys to ensure deterministic output.
 */
function canonicalize(value: unknown): string {
    const sortKeys = (obj: unknown): unknown => {
        if (Array.isArray(obj)) {
            return obj.map(sortKeys);
        }
        if (typeof obj === 'object' && obj !== null) {
            return Object.keys(obj as Record<string, unknown>).sort().reduce((acc, key) => {
                acc[key] = sortKeys((obj as Record<string, unknown>)[key]);
                return acc;
            }, {} as Record<string, unknown>);
        }
        return obj;
    };
    return JSON.stringify(sortKeys(value));
}

/**
 * Derives a cryptographic signing key from a password and salt using PBKDF2.
 */
export async function deriveSigningKey(password: string, saltBase64: string): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        utf8ToBytes(password) as unknown as BufferSource,
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: base64ToBytes(saltBase64) as unknown as BufferSource,
            iterations: PBKDF2_ITERATIONS,
            hash: PBKDF2_HASH
        },
        keyMaterial,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign', 'verify']
    );
}

/**
 * Signs data using HMAC-SHA256 with the derived key.
 * @returns Base64 encoded signature.
 */
export async function signData(data: unknown, key: CryptoKey): Promise<string> {
    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        utf8ToBytes(canonicalize(data)) as unknown as BufferSource
    );
    return bytesToBase64(new Uint8Array(signature));
}

/**
 * Verifies that the signature matches the data using the provided key.
 */
export async function verifySignature(data: unknown, signatureBase64: string, key: CryptoKey): Promise<boolean> {
    const signature = base64ToBytes(signatureBase64);
    return crypto.subtle.verify(
        'HMAC',
        key,
        signature as unknown as BufferSource,
        utf8ToBytes(canonicalize(data)) as unknown as BufferSource
    );
}
