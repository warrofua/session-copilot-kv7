# Session Co-Pilot Encryption & Security Plan

## Current Encryption Status

### Encryption in Transit: ✅ YES (Secure)

**What's Encrypted:**
- **Azure Static Web Apps**: Automatically serves over HTTPS (TLS 1.2+)
- **Azure Functions API**: HTTPS enforced by Azure platform
- **Cosmos DB connections**: Azure SDK uses TLS 1.2+ encryption
- **GitHub Models API**: HTTPS connections

**Status:** All network traffic is encrypted in transit. ✅

### Encryption at Rest: ⚠️ PARTIAL (Needs Improvement)

**What IS encrypted at rest:**
- **Cosmos DB**: ✅ Azure encrypts all data at rest automatically (AES-256)
- **Azure Functions environment variables**: ✅ Encrypted by Azure platform
- **Azure Static Web Apps secrets**: ✅ Encrypted by Azure platform

**What is NOT encrypted at rest:**
- **IndexedDB (browser)**: ❌ Stores PHI (Protected Health Information) in plaintext
- **localStorage (JWT tokens)**: ❌ Stores authentication tokens in plaintext
- **Service Worker cache**: ❌ Cached data not encrypted

---

## CRITICAL SECURITY ISSUE FOUND 🚨

### Issue: Cosmos DB Connection String Exposed to Frontend

**Location:** `src/services/cosmosService.ts:6`

```typescript
const COSMOS_CONNECTION_STRING = import.meta.env.VITE_COSMOS_CONNECTION_STRING || '';
```

**Problem:**
Your Cosmos DB connection string is being exposed to the frontend JavaScript bundle. Any user can:
1. Open browser DevTools and view the built JavaScript files
2. Extract the `VITE_COSMOS_CONNECTION_STRING` value
3. Use it to directly access your entire Cosmos DB
4. Read, modify, or delete all data without authentication
5. Bypass all API access controls and audit logging

**Impact:**
- **Severity:** CRITICAL
- **HIPAA Violation:** YES (unauthorized access to PHI)
- **Data at Risk:** ALL user data, sessions, behaviors, incidents, organizations

**Current Architecture (WRONG):**
```
Frontend → Cosmos DB (direct access with exposed credentials)
```

**Correct Architecture:**
```
Frontend → Azure Functions API → Cosmos DB
         ↑ (JWT auth)        ↑ (server-side credentials)
```

### Solution: Remove Frontend Cosmos DB Access

**Immediate Actions Required:**
1. Remove `VITE_COSMOS_CONNECTION_STRING` from `.env`
2. Remove `VITE_COSMOS_CONNECTION_STRING` from GitHub Secrets
3. Delete or completely refactor `src/services/cosmosService.ts`
4. Move all Cosmos DB sync operations to Azure Functions backend
5. Rotate Cosmos DB keys (since they may have been exposed in Git history or builds)

**Implementation:**
```typescript
// BEFORE (INSECURE):
// src/services/cosmosService.ts
import { CosmosClient } from '@azure/cosmos';
const client = new CosmosClient(import.meta.env.VITE_COSMOS_CONNECTION_STRING);
await client.database('SessionCopilotDB').container('Sessions').items.upsert(data);

// AFTER (SECURE):
// src/services/syncService.ts
export async function syncSessionData(sessionData: SessionData): Promise<boolean> {
  const response = await fetch('/api/sync/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify(sessionData)
  });

  if (!response.ok) {
    throw new Error('Sync failed');
  }

  return true;
}

// api/src/functions/syncSession.ts (NEW)
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { verifyToken } from '../utils/auth.js';
import { upsertSession } from '../services/cosmosDb.js';

async function syncSessionHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // Verify JWT
  const user = await verifyToken(request);
  if (!user) {
    return { status: 401, jsonBody: { error: 'Unauthorized' } };
  }

  const sessionData = await request.json();

  // Server-side Cosmos DB access (secure)
  const result = await upsertSession(user.orgId, sessionData);

  return { status: 200, jsonBody: { success: true, id: result.id } };
}

app.http('syncSession', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'sync/session',
  handler: syncSessionHandler
});
```

---

## Required Security Improvements

### 1. Encrypt IndexedDB Data (HIGH PRIORITY - HIPAA Required)

Since IndexedDB stores PHI (behavioral data, session notes, incidents), it MUST be encrypted at rest per HIPAA requirements.

**Why This Matters:**
- Browser data is stored unencrypted on disk
- Accessible if device is lost/stolen
- Can be extracted by malware
- HIPAA violation if PHI is not encrypted

**Implementation: Web Crypto API (Recommended)**

```typescript
// src/services/encryption.ts

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_DERIVATION_ITERATIONS = 100000;

/**
 * Derive an encryption key from a user password
 * @param password - User's password or passphrase
 * @param salt - Random salt (store per-user in Cosmos DB)
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: KEY_DERIVATION_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data before storing in IndexedDB
 */
export async function encryptData(data: unknown, key: CryptoKey): Promise<EncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization vector
  const encoded = new TextEncoder().encode(JSON.stringify(data));

  const encrypted = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    encoded
  );

  return {
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(encrypted),
    algorithm: ENCRYPTION_ALGORITHM
  };
}

/**
 * Decrypt data after reading from IndexedDB
 */
export async function decryptData(
  encrypted: EncryptedData,
  key: CryptoKey
): Promise<unknown> {
  const iv = base64ToArrayBuffer(encrypted.iv);
  const data = base64ToArrayBuffer(encrypted.data);

  const decrypted = await crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    data
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

// Helper functions
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

export interface EncryptedData {
  iv: string;        // Base64-encoded initialization vector
  data: string;      // Base64-encoded encrypted data
  algorithm: string; // Encryption algorithm used
}
```

**Updated Dexie Schema:**

```typescript
// src/db/db.ts

export interface BehaviorEvent {
    id?: number;
    sessionId: number;
    // Encrypted payload
    encryptedData: EncryptedData;
    // Keep timestamp unencrypted for indexing/queries
    timestamp: Date;
    createdAt: Date;
    synced: boolean;
}

// Similar updates for SkillTrial, SessionNote, Incident
```

**Usage in Application:**

```typescript
// src/services/sessionService.ts
import { encryptData, decryptData } from './encryption';
import { db } from '../db/db';
import { useEncryptionStore } from '../stores/encryptionStore';

export async function addBehaviorEvent(event: BehaviorEventData) {
  const encryptionKey = useEncryptionStore.getState().key;

  if (!encryptionKey) {
    throw new Error('Encryption key not available. Please log in again.');
  }

  // Encrypt the sensitive data
  const encryptedData = await encryptData({
    behaviorType: event.behaviorType,
    count: event.count,
    duration: event.duration,
    antecedent: event.antecedent,
    consequent: event.consequent,
    functionGuess: event.functionGuess,
    intervention: event.intervention,
    intensity: event.intensity,
    notes: event.notes
  }, encryptionKey);

  // Store encrypted data
  await db.behaviorEvents.add({
    sessionId: event.sessionId,
    encryptedData,
    timestamp: new Date(),
    createdAt: new Date(),
    synced: false
  });
}

export async function getBehaviorEvents(sessionId: number): Promise<BehaviorEventData[]> {
  const encryptionKey = useEncryptionStore.getState().key;

  if (!encryptionKey) {
    throw new Error('Encryption key not available');
  }

  const events = await db.behaviorEvents
    .where('sessionId')
    .equals(sessionId)
    .toArray();

  // Decrypt all events
  return Promise.all(
    events.map(async (event) => {
      const decrypted = await decryptData(event.encryptedData, encryptionKey);
      return {
        id: event.id,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        ...(decrypted as BehaviorEventData)
      };
    })
  );
}
```

**Key Management:**

```typescript
// src/stores/encryptionStore.ts
import { create } from 'zustand';
import { deriveKey } from '../services/encryption';

interface EncryptionStore {
  key: CryptoKey | null;
  salt: Uint8Array | null;
  initializeKey: (password: string, salt: Uint8Array) => Promise<void>;
  clearKey: () => void;
}

export const useEncryptionStore = create<EncryptionStore>((set) => ({
  key: null,
  salt: null,

  initializeKey: async (password: string, salt: Uint8Array) => {
    const key = await deriveKey(password, salt);
    set({ key, salt });
  },

  clearKey: () => {
    set({ key: null, salt: null });
  }
}));
```

**Login Flow Integration:**

```typescript
// src/contexts/AuthContext.tsx

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // ... existing auth code

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // API returns user + salt for encryption
      const response = await apiLogin(email, password);
      setUser(response.user);

      // Initialize encryption key from password
      const salt = base64ToUint8Array(response.encryptionSalt);
      await useEncryptionStore.getState().initializeKey(password, salt);

      await refreshUser();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    apiLogout();
    setUser(null);
    setLearners([]);
    setOrganization(null);
    setError(null);

    // Clear encryption key from memory
    useEncryptionStore.getState().clearKey();
  };

  // ... rest of provider
}
```

**Backend: Store Encryption Salt per User:**

```typescript
// api/src/functions/register.ts

async function registerHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // ... validation

  // Generate unique salt for this user's encryption
  const encryptionSalt = crypto.randomBytes(32);

  const user = await createUser({
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    encryptionSalt: encryptionSalt.toString('base64'), // Store salt
    // ... other fields
  });

  return {
    status: 201,
    jsonBody: {
      token,
      user: safeUser,
      encryptionSalt: encryptionSalt.toString('base64') // Send to client
    }
  };
}
```

---

### 2. Secure JWT Token Storage (MEDIUM PRIORITY)

**Current Issue:**
Tokens stored in localStorage are:
- Accessible to JavaScript (XSS vulnerability)
- Persistent across browser restarts
- Not encrypted
- Vulnerable to token theft

**Solution: HttpOnly Cookies (Recommended)**

**Benefits:**
- Not accessible to JavaScript (XSS protection)
- Automatically sent with requests
- Can be set as Secure (HTTPS only)
- Can use SameSite attribute (CSRF protection)

**Implementation:**

```typescript
// api/src/utils/auth.ts

export function setAuthCookie(response: HttpResponseInit, token: string) {
  const cookieOptions = [
    `token=${token}`,
    'HttpOnly',           // Not accessible to JavaScript
    'Secure',             // HTTPS only
    'SameSite=Strict',    // CSRF protection
    'Path=/',
    `Max-Age=${7 * 24 * 60 * 60}`, // 7 days
  ];

  response.headers = {
    ...response.headers,
    'Set-Cookie': cookieOptions.join('; ')
  };
}

export function getTokenFromCookie(request: HttpRequest): string | null {
  const cookies = request.headers.get('cookie');
  if (!cookies) return null;

  const match = cookies.match(/token=([^;]+)/);
  return match ? match[1] : null;
}

export function clearAuthCookie(response: HttpResponseInit) {
  response.headers = {
    ...response.headers,
    'Set-Cookie': 'token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
  };
}
```

**Updated Login Handler:**

```typescript
// api/src/functions/login.ts

async function loginHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // ... authentication logic

  const token = generateToken(user);
  const { passwordHash: _, ...safeUser } = user;

  const response: HttpResponseInit = {
    status: 200,
    jsonBody: {
      user: safeUser,
      // Don't send token in JSON anymore
    }
  };

  // Set token as HttpOnly cookie
  setAuthCookie(response, token);

  return response;
}
```

**Frontend Changes:**

```typescript
// src/services/authService.ts

// REMOVE these localStorage functions:
// export function getToken(): string | null {
//   return localStorage.getItem(TOKEN_KEY);
// }
// export function setToken(token: string): void {
//   localStorage.setItem(TOKEN_KEY, token);
// }

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // IMPORTANT: Send cookies
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  // Token is now in HttpOnly cookie, not in response body
  const data = await response.json();
  return data;
}

export async function getMe(): Promise<MeResponse> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: 'include' // IMPORTANT: Send cookies
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Session expired');
    }
    const error = await response.json();
    throw new Error(error.error || 'Failed to get user info');
  }

  return response.json();
}
```

**Alternative: Encrypted SessionStorage**

If you need the token in JavaScript for some reason:

```typescript
// src/services/tokenStorage.ts
import { encryptData, decryptData } from './encryption';

const SESSION_KEY = 'encrypted_session';

export async function setEncryptedToken(token: string, encryptionKey: CryptoKey) {
  const encrypted = await encryptData({ token }, encryptionKey);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(encrypted));
}

export async function getEncryptedToken(encryptionKey: CryptoKey): Promise<string | null> {
  const item = sessionStorage.getItem(SESSION_KEY);
  if (!item) return null;

  try {
    const encrypted = JSON.parse(item);
    const decrypted = await decryptData(encrypted, encryptionKey);
    return (decrypted as { token: string }).token;
  } catch {
    return null;
  }
}

export function clearEncryptedToken() {
  sessionStorage.removeItem(SESSION_KEY);
}
```

---

### 3. Add Content Security Policy (CSP)

Prevent XSS attacks by controlling what resources can load.

**Create:** `staticwebapp.config.json` (or update existing)

```json
{
  "globalHeaders": {
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.azure.com https://*.cosmosdb.azure.com https://models.github.com; img-src 'self' data: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
  },
  "routes": [
    {
      "route": "/api/*",
      "allowedRoles": ["authenticated"]
    }
  ],
  "navigationFallback": {
    "rewrite": "/index.html"
  }
}
```

**CSP Breakdown:**
- `default-src 'self'`: Only load resources from same origin by default
- `script-src 'self' 'unsafe-inline'`: Allow inline scripts (for Vite/React)
- `connect-src`: Allow API calls to Azure and GitHub Models
- `img-src 'self' data: https:`: Allow images from same origin, data URIs, and HTTPS
- `frame-ancestors 'none'`: Prevent clickjacking
- `object-src 'none'`: Block Flash and other plugins

**Note:** You may need to adjust `'unsafe-inline'` once you move to production. Use nonces or hashes for better security.

---

### 4. Implement Audit Logging

Track all access to PHI for HIPAA compliance.

```typescript
// api/src/services/auditLog.ts

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: string;          // 'read', 'create', 'update', 'delete'
  entityType: string;      // 'session', 'behavior', 'incident', etc.
  entityId: string;
  orgId: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
  dataAccessed?: string[]; // Fields accessed
}

export async function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
  const auditEntry: AuditLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry
  };

  // Store in Cosmos DB audit container
  await getContainer(CONTAINERS.AUDIT_LOG).items.create(auditEntry);

  // Also log to Application Insights for monitoring
  console.log('[AUDIT]', JSON.stringify(auditEntry));
}
```

**Middleware to Log All API Calls:**

```typescript
// api/src/middleware/auditMiddleware.ts

export async function auditMiddleware(
  request: HttpRequest,
  user: User,
  action: string,
  entityType: string,
  entityId: string
) {
  const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  await logAuditEvent({
    userId: user.id,
    userEmail: user.email,
    action,
    entityType,
    entityId,
    orgId: user.orgId || 'none',
    ipAddress,
    userAgent,
    success: true
  });
}
```

**Usage in API Handlers:**

```typescript
// api/src/functions/getSession.ts

async function getSessionHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const user = await verifyToken(request);
  if (!user) {
    return { status: 401, jsonBody: { error: 'Unauthorized' } };
  }

  const sessionId = request.params.id;
  const session = await getSession(sessionId);

  // Verify user has access
  if (session.orgId !== user.orgId) {
    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      action: 'read',
      entityType: 'session',
      entityId: sessionId,
      orgId: user.orgId || 'none',
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      success: false,
      failureReason: 'Access denied - different organization'
    });

    return { status: 403, jsonBody: { error: 'Access denied' } };
  }

  // Log successful access
  await auditMiddleware(request, user, 'read', 'session', sessionId);

  return { status: 200, jsonBody: session };
}
```

---

### 5. Add Data Integrity Controls

Ensure data hasn't been tampered with.

```typescript
// src/services/integrity.ts

/**
 * Generate HMAC signature for data integrity
 */
export async function signData(data: unknown, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(JSON.stringify(data));

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    dataBytes
  );

  return arrayBufferToBase64(signature);
}

/**
 * Verify HMAC signature
 */
export async function verifySignature(
  data: unknown,
  signature: string,
  key: CryptoKey
): Promise<boolean> {
  const expectedSignature = await signData(data, key);
  return signature === expectedSignature;
}

/**
 * Generate a signing key from user's encryption key
 */
export async function deriveSigningKey(encryptionKey: CryptoKey): Promise<CryptoKey> {
  // Export the key material
  const keyData = await crypto.subtle.exportKey('raw', encryptionKey);

  // Import as HMAC key
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}
```

**Usage:**

```typescript
// When storing data
const signature = await signData(behaviorEvent, signingKey);
await db.behaviorEvents.add({
  ...behaviorEvent,
  signature
});

// When reading data
const isValid = await verifySignature(
  behaviorEvent,
  storedSignature,
  signingKey
);

if (!isValid) {
  throw new Error('Data integrity check failed - possible tampering');
}
```

---

## HIPAA Compliance Checklist

### Technical Safeguards (45 CFR § 164.312)

- [ ] **Access Control**
  - [x] Unique user identification (email-based login)
  - [x] Emergency access procedure (admin override - needs documentation)
  - [ ] Automatic logoff (implement session timeout)
  - [x] Encryption and decryption (implement IndexedDB encryption)

- [ ] **Audit Controls**
  - [ ] Hardware/software activity logging (implement audit log)
  - [ ] Track PHI access/modifications
  - [ ] Log authentication attempts
  - [ ] Retain logs for 6 years

- [ ] **Integrity Controls**
  - [ ] Data integrity verification (implement HMAC signatures)
  - [ ] Detect unauthorized modifications

- [ ] **Transmission Security**
  - [x] TLS 1.2+ for all network communications
  - [x] End-to-end encryption
  - [ ] Network segmentation (Azure-provided)

### Administrative Safeguards (45 CFR § 164.308)

- [ ] **Risk Analysis** (Required)
  - [ ] Document all risks to PHI
  - [ ] Document security measures
  - [ ] Update annually

- [ ] **Business Associate Agreement** (Required)
  - [ ] Sign BAA with Microsoft Azure
  - [ ] Sign BAA with any third-party services (Stripe, email providers)

- [ ] **Security Training**
  - [ ] Train all users on HIPAA requirements
  - [ ] Document training completion

- [ ] **Incident Response Plan**
  - [ ] Document breach notification procedures
  - [ ] Define incident response team
  - [ ] Test annually

### Physical Safeguards (45 CFR § 164.310)

- [x] **Azure Data Center Security** (Microsoft-provided)
- [ ] **Workstation Security** (organization's responsibility)
  - [ ] Document policies for user devices
  - [ ] Require device encryption
  - [ ] Screen lock policies

### Documentation Requirements

- [ ] Create and maintain:
  - [ ] Security policies and procedures manual
  - [ ] Risk analysis documentation
  - [ ] Workforce training records
  - [ ] Incident response plan
  - [ ] Business associate agreements
  - [ ] Privacy policy and notices
  - [ ] Data retention and disposal procedures

---

## Azure HIPAA Configuration

### 1. Sign Business Associate Agreement

**Steps:**
1. Go to Azure Portal → Service Trust Portal
2. Navigate to Compliance Manager
3. Request BAA for your subscription
4. Microsoft will countersign and provide documentation

**Cost:** Free for Enterprise Agreement customers; may have additional requirements for Pay-As-You-Go

### 2. Enable Azure Security Features

**Cosmos DB:**
```bash
# Enable audit logging
az cosmosdb update \
  --name your-cosmos-account \
  --resource-group your-rg \
  --enable-diagnostic-logs true

# Enable private endpoints (optional, for extra security)
az cosmosdb private-endpoint-connection approve \
  --account-name your-cosmos-account \
  --resource-group your-rg
```

**Azure Functions:**
```bash
# Enable Application Insights
az functionapp config appsettings set \
  --name your-function-app \
  --resource-group your-rg \
  --settings APPLICATIONINSIGHTS_CONNECTION_STRING=your-connection-string

# Enable HTTPS only
az functionapp update \
  --name your-function-app \
  --resource-group your-rg \
  --set httpsOnly=true
```

**Azure Static Web Apps:**
```bash
# Enable custom domain with SSL (automatic with Azure)
az staticwebapp hostname set \
  --name your-swa \
  --resource-group your-rg \
  --hostname yourdomain.com
```

### 3. Configure Application Insights Filtering

Filter out PHI from logs:

```typescript
// api/src/utils/telemetry.ts

import { TelemetryClient } from 'applicationinsights';

const client = new TelemetryClient(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING);

// Filter out sensitive data before logging
client.addTelemetryProcessor((envelope) => {
  if (envelope.data.baseData) {
    const data = envelope.data.baseData;

    // Remove PHI fields from logs
    const sensitiveFields = ['behaviorType', 'notes', 'antecedent', 'consequent', 'name', 'dob'];

    if (data.properties) {
      sensitiveFields.forEach(field => {
        if (data.properties[field]) {
          data.properties[field] = '[REDACTED]';
        }
      });
    }
  }

  return true;
});

export default client;
```

---

## Implementation Priority & Timeline

### Phase 1: Critical Security (Week 1) - MUST DO IMMEDIATELY

**Priority: CRITICAL**

1. **Remove Frontend Cosmos DB Access**
   - [ ] Remove `VITE_COSMOS_CONNECTION_STRING` from `.env`
   - [ ] Remove from GitHub Secrets
   - [ ] Delete/refactor `src/services/cosmosService.ts`
   - [ ] Create Azure Functions endpoints for sync operations
   - [ ] Update frontend to call API instead of direct Cosmos
   - [ ] **Rotate Cosmos DB keys** (in Azure Portal)

   **Time Estimate:** 2-3 days
   **Blocker:** App won't work until sync is moved to backend

2. **Review Git History for Exposed Secrets**
   - [ ] Use `git log -S "VITE_COSMOS_CONNECTION_STRING"`
   - [ ] If found in history, rotate keys immediately
   - [ ] Consider using git-filter-repo to remove from history

   **Time Estimate:** 1 hour

### Phase 2: Encryption at Rest (Week 2) - HIGH PRIORITY

**Priority: HIGH (HIPAA Required)**

3. **Implement IndexedDB Encryption**
   - [ ] Create encryption service with Web Crypto API
   - [ ] Add encryption store for key management
   - [ ] Update Dexie schema to store encrypted data
   - [ ] Modify all DB read/write operations
   - [ ] Test encryption/decryption performance
   - [ ] Create migration script for existing data

   **Time Estimate:** 5-7 days
   **Dependencies:** None

4. **Implement Secure Token Storage**
   - [ ] Switch from localStorage to HttpOnly cookies
   - [ ] Update all API endpoints to set/read cookies
   - [ ] Update frontend auth service
   - [ ] Test auth flow end-to-end
   - [ ] Handle cookie expiration gracefully

   **Time Estimate:** 2-3 days
   **Dependencies:** None

### Phase 3: Access Controls & Monitoring (Week 3-4) - MEDIUM PRIORITY

**Priority: MEDIUM (HIPAA Required)**

5. **Implement Audit Logging**
   - [ ] Create audit log schema in Cosmos DB
   - [ ] Build audit logging service
   - [ ] Add middleware to all API endpoints
   - [ ] Set up Application Insights filtering
   - [ ] Create audit log viewer for admins

   **Time Estimate:** 4-5 days
   **Dependencies:** None

6. **Add Content Security Policy**
   - [ ] Create `staticwebapp.config.json` with CSP headers
   - [ ] Test CSP in development
   - [ ] Adjust CSP for production (remove unsafe-inline)
   - [ ] Monitor CSP violations

   **Time Estimate:** 1-2 days
   **Dependencies:** None

7. **Implement Data Integrity Controls**
   - [ ] Create HMAC signing service
   - [ ] Add signatures to all stored data
   - [ ] Verify signatures on data read
   - [ ] Handle integrity check failures

   **Time Estimate:** 2-3 days
   **Dependencies:** Encryption implementation

### Phase 4: HIPAA Compliance Documentation (Month 2) - MEDIUM PRIORITY

**Priority: MEDIUM (Legal Requirement)**

8. **Azure HIPAA Configuration**
   - [ ] Sign BAA with Microsoft
   - [ ] Enable diagnostic logging on all services
   - [ ] Configure Application Insights filtering
   - [ ] Set up Azure Security Center
   - [ ] Enable Azure Policy for HIPAA compliance

   **Time Estimate:** 3-4 days
   **Dependencies:** Legal review

9. **Documentation**
   - [ ] Create security policies and procedures manual
   - [ ] Document risk analysis
   - [ ] Create incident response plan
   - [ ] Document user training procedures
   - [ ] Create privacy policy
   - [ ] Document data retention procedures

   **Time Estimate:** 1-2 weeks
   **Dependencies:** Legal/compliance review

### Phase 5: Additional Hardening (Month 3) - LOW PRIORITY

**Priority: LOW (Nice to Have)**

10. **Additional Security Features**
    - [ ] Implement rate limiting
    - [ ] Add CAPTCHA for login
    - [ ] Implement session timeout
    - [ ] Add IP-based access controls (optional)
    - [ ] Set up WAF (Web Application Firewall)
    - [ ] Implement automated security scanning

    **Time Estimate:** 1-2 weeks
    **Dependencies:** Core security features complete

---

## Updated Security Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ User's Device (Client)                                      │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Browser (HTTPS Only)                                │   │
│ │                                                     │   │
│ │  ┌──────────────────────────────────────┐          │   │
│ │  │ IndexedDB (Encrypted)                │          │   │
│ │  │ - AES-256-GCM encryption            │          │   │
│ │  │ - User-derived key (PBKDF2)         │          │   │
│ │  │ - Stores: Behaviors, Skills, Notes  │          │   │
│ │  └──────────────────────────────────────┘          │   │
│ │                                                     │   │
│ │  ┌──────────────────────────────────────┐          │   │
│ │  │ Memory (Runtime Only)                │          │   │
│ │  │ - Encryption key (CryptoKey)        │          │   │
│ │  │ - Decrypted data (for display)      │          │   │
│ │  │ - Cleared on logout                 │          │   │
│ │  └──────────────────────────────────────┘          │   │
│ │                                                     │   │
│ │  ┌──────────────────────────────────────┐          │   │
│ │  │ HttpOnly Cookie                      │          │   │
│ │  │ - JWT token                         │          │   │
│ │  │ - Secure, SameSite=Strict           │          │   │
│ │  │ - Not accessible to JavaScript      │          │   │
│ │  └──────────────────────────────────────┘          │   │
│ │                                                     │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTPS / TLS 1.2+
                       │ (Certificate: Azure-managed)
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Azure Static Web Apps                                       │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Static Assets                                       │   │
│ │ - React app bundle (minified, CSP-protected)       │   │
│ │ - Service Worker (offline caching)                 │   │
│ │ - No secrets in JavaScript                         │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Azure Functions (API)                               │   │
│ │                                                     │   │
│ │  Middleware:                                        │   │
│ │  ┌────────────────────────────────────┐             │   │
│ │  │ 1. JWT Verification (from cookie)  │             │   │
│ │  │ 2. Rate Limiting                   │             │   │
│ │  │ 3. Audit Logging                   │             │   │
│ │  │ 4. Input Validation                │             │   │
│ │  └────────────────────────────────────┘             │   │
│ │                                                     │   │
│ │  Endpoints:                                         │   │
│ │  - POST /api/auth/login                            │   │
│ │  - POST /api/auth/register                         │   │
│ │  - GET  /api/auth/me                               │   │
│ │  - POST /api/sync/session                          │   │
│ │  - POST /api/sync/behavior                         │   │
│ │  - GET  /api/audit/logs (admin only)               │   │
│ │                                                     │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ TLS 1.2+ (Azure internal network)
                       │ Connection pooling
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Azure Cosmos DB                                             │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ Data Encryption                                     │   │
│ │ - At rest: AES-256 (Azure-managed keys)            │   │
│ │ - In transit: TLS 1.2+                             │   │
│ │ - Partition key: orgId (multi-tenant isolation)    │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                             │
│ Containers:                                                 │
│ - Users (partition: id)                                    │
│ - Organizations (partition: id)                            │
│ - Learners (partition: orgId)                              │
│ - Sessions (partition: orgId)                              │
│ - AuditLog (partition: orgId) ← HIPAA required            │
│                                                             │
│ Features Enabled:                                          │
│ - Diagnostic logging ✓                                     │
│ - Point-in-time restore ✓                                  │
│ - Geo-redundancy ✓                                         │
│ - Private endpoints (optional)                             │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Diagnostic logs
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Azure Monitor / Application Insights                        │
│                                                             │
│ - Telemetry (with PHI filtering) ✓                         │
│ - Performance monitoring ✓                                  │
│ - Error tracking ✓                                          │
│ - Audit log retention (6+ years) ✓                         │
│ - Security alerts ✓                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Testing Checklist

### Before Production Launch

- [ ] **Penetration Testing**
  - [ ] SQL injection attempts (not applicable - using Cosmos DB SDK)
  - [ ] XSS attacks (test CSP)
  - [ ] CSRF attacks (test SameSite cookies)
  - [ ] Authentication bypass attempts
  - [ ] Session fixation attacks
  - [ ] Brute force login attempts

- [ ] **Encryption Testing**
  - [ ] Verify IndexedDB data is encrypted on disk
  - [ ] Verify encryption key is cleared on logout
  - [ ] Test decryption with wrong key (should fail)
  - [ ] Test data integrity checks
  - [ ] Verify TLS version (should be 1.2+)

- [ ] **Access Control Testing**
  - [ ] Test role-based access (Manager, BCBA, RBT, Parent)
  - [ ] Verify users can only access their org's data
  - [ ] Test API endpoints without authentication
  - [ ] Test API endpoints with expired tokens
  - [ ] Verify audit logs capture all PHI access

- [ ] **HIPAA Compliance Testing**
  - [ ] Verify all data is encrypted at rest
  - [ ] Verify all data is encrypted in transit
  - [ ] Verify audit logs are complete and accurate
  - [ ] Test data export (right to access)
  - [ ] Test data deletion (right to erasure)
  - [ ] Verify session timeouts work correctly

- [ ] **Third-Party Security Scan**
  - [ ] Run OWASP ZAP scan
  - [ ] Run Burp Suite scan
  - [ ] Check SSL Labs rating (should be A or A+)
  - [ ] Verify security headers with securityheaders.com

---

## Monitoring & Alerting

### Azure Monitor Alerts

Set up alerts for:

1. **Authentication Failures**
   - Trigger: >10 failed login attempts in 5 minutes
   - Action: Email admin, potentially block IP

2. **Unauthorized Access Attempts**
   - Trigger: 403 Forbidden responses
   - Action: Email admin, log to security incident

3. **Data Export Events**
   - Trigger: Any data export action
   - Action: Log to audit trail, notify admin

4. **High Error Rate**
   - Trigger: >5% error rate in 5 minutes
   - Action: Email DevOps team

5. **Cosmos DB Key Access**
   - Trigger: Cosmos DB key regeneration
   - Action: Immediate alert to security team

### Security Metrics Dashboard

Create Azure Dashboard with:
- Authentication success/failure rate
- Active sessions count
- Audit log entries per hour
- API response times
- Error rates by endpoint
- Geographic login distribution (detect anomalies)

---

## Emergency Response Procedures

### If Cosmos DB Key is Compromised

1. **Immediate:** Regenerate primary key in Azure Portal
2. Update Azure Functions app settings with new key
3. Restart all function instances
4. Review audit logs for unauthorized access
5. Notify affected users if data was accessed
6. Document incident per HIPAA breach notification rules (if >500 records)

### If User Data is Breached

1. **Within 24 hours:** Notify affected users
2. **Within 60 days:** Notify HHS Office for Civil Rights (if HIPAA covered entity)
3. **Immediately:** Rotate all credentials
4. **Immediately:** Enable additional security measures (IP whitelisting, MFA)
5. Document incident and response in detail
6. Conduct post-mortem and update security procedures

### If Encryption Key is Lost

- User loses access to their locally encrypted data
- Cannot be recovered (by design)
- User must start with fresh data or restore from cloud sync
- Document in user agreement/privacy policy

---

## Cost Implications

**Estimated Additional Costs for Security:**

1. **Application Insights:** ~$5-20/month (depending on volume)
2. **Cosmos DB Audit Logs:** ~$10-30/month (storage for logs)
3. **Azure Security Center (optional):** $15/server/month
4. **SSL Certificates:** Free (Azure-managed)
5. **BAA with Microsoft:** Free (included in Enterprise Agreement)

**Total Estimated Additional Cost:** $15-65/month

**Development Time:**
- Phase 1 (Critical): 2-3 days
- Phase 2 (Encryption): 1-2 weeks
- Phase 3 (Monitoring): 1 week
- Phase 4 (Compliance): 2-3 weeks
- **Total:** 5-7 weeks of development time

---

## Conclusion

Your application currently has:
- ✅ Encryption in transit (HTTPS everywhere)
- ⚠️ Partial encryption at rest (Cosmos DB yes, IndexedDB no)
- 🚨 **CRITICAL VULNERABILITY:** Cosmos DB credentials exposed to frontend

**Immediate Next Steps:**
1. Remove frontend Cosmos DB access (TODAY)
2. Rotate Cosmos DB keys
3. Implement IndexedDB encryption (THIS WEEK)
4. Switch to HttpOnly cookies (THIS WEEK)
5. Start HIPAA compliance documentation (THIS MONTH)

Once these security measures are in place, you'll have a HIPAA-compliant, production-ready application with proper encryption at rest and in transit.
