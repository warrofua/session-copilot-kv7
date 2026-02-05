# Security Policies and Procedures Manual

## Scope
This manual applies to all systems and users of Session Co-Pilot handling PHI.

## Access Control
- Unique user accounts are required.
- Role-based access is enforced (`manager`, `bcba`, `rbt`, `parent`).
- Session timeout is set to 30 minutes of inactivity.
- Authentication uses HttpOnly cookies.

## Encryption Standards
- In transit: TLS 1.2+.
- At rest (cloud): Cosmos DB platform encryption.
- At rest (client): IndexedDB AES-GCM encryption via Web Crypto.
- Integrity: HMAC signatures validated on encrypted payload read.

## Key Management
- User-specific encryption salt stored server-side.
- Encryption and integrity keys are derived from user password at login.
- Derived keys are memory-resident and cleared on logout.

## Logging and Monitoring
- PHI access and modifications are audit logged in Cosmos DB `AuditLog` container.
- Azure diagnostic settings are enabled for SWA and Cosmos resources.

## Vulnerability and Patch Management
- Dependencies are scanned and updated on a regular release cadence.
- Security fixes are prioritized over feature work.

## Incident Handling
- Follow `compliance/incident-response-plan.md`.

## Review Cadence
- Review this manual quarterly.
- Review immediately after significant architecture/security changes.
