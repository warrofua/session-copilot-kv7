# HIPAA Risk Analysis

## System Overview
Session Co-Pilot stores and processes PHI locally in browser storage and in Azure backend services.

## Risk Register

| Risk | Likelihood | Impact | Current Controls | Residual Risk |
|---|---:|---:|---|---:|
| Browser device theft exposes local PHI | Medium | High | IndexedDB encryption at rest, session timeout | Medium |
| Token theft via XSS | Low | High | HttpOnly cookie auth, CSP headers | Low |
| Unauthorized API access | Low | High | JWT verification, RBAC, audit logging | Low |
| Data tampering in local store | Medium | High | HMAC signatures over encrypted payloads | Low |
| Misconfiguration of cloud secrets | Medium | High | Secrets in SWA settings, rotated Cosmos keys, no frontend Cosmos secret | Medium |
| Incomplete monitoring/alerting | Medium | Medium | Diagnostic settings enabled | Medium |

## Required Follow-ups
- Confirm BAA execution and legal record retention.
- Establish alert rules for critical audit/security events.
- Perform annual external penetration testing.

## Review Date
- Initial: 2026-02-05
- Next review: 2026-05-05
