const AES_GCM_IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_HASH = 'SHA-256';

export interface EncryptedData {
    ciphertext: string;
    iv: string;
    algorithm: 'AES-GCM';
    version: 1;
}

function utf8ToBytes(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

function bytesToUtf8(bytes: ArrayBuffer): string {
    return new TextDecoder().decode(bytes);
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

function dateReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Date) {
        return { __type: 'date', value: value.toISOString() };
    }
    return value;
}

function dateReviver(_key: string, value: unknown): unknown {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
        return new Date(value);
    }
    if (
        typeof value === 'object' &&
        value !== null &&
        '__type' in value &&
        'value' in value &&
        (value as { __type: unknown }).__type === 'date' &&
        typeof (value as { value: unknown }).value === 'string'
    ) {
        return new Date((value as { value: string }).value);
    }
    return value;
}

export async function deriveEncryptionKey(password: string, saltBase64: string): Promise<CryptoKey> {
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
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptJson<T>(value: T, key: CryptoKey): Promise<EncryptedData> {
    const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const plaintext = utf8ToBytes(JSON.stringify(value, dateReplacer));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintext as unknown as BufferSource
    );

    return {
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
        iv: bytesToBase64(iv),
        algorithm: 'AES-GCM',
        version: 1
    };
}

export async function decryptJson<T>(value: EncryptedData, key: CryptoKey): Promise<T> {
    const plaintextBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(value.iv) as unknown as BufferSource },
        key,
        base64ToBytes(value.ciphertext) as unknown as BufferSource
    );
    return JSON.parse(bytesToUtf8(plaintextBuffer), dateReviver) as T;
}
