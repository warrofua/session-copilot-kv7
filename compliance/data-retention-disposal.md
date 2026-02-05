# Data Retention and Disposal Policy

## Retention Baseline
- Audit logs: retain for at least 6 years.
- Session/clinical records: retain per contractual and legal requirements.

## Storage Locations
- Local device IndexedDB (encrypted)
- Azure Cosmos DB containers (encrypted)
- Azure diagnostic logs and telemetry

## Disposal Requirements
- On retention expiry, securely delete records from cloud containers.
- Ensure backups follow equivalent retention/deletion schedules.
- For local browser data, provide user workflows for secure sign-out/clearance.

## Verification
- Quarterly retention audits.
- Document deletion jobs and outcomes.
