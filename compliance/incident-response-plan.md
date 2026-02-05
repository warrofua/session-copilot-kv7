# Incident Response Plan

## Severity Levels
- Sev1: Confirmed PHI breach or active unauthorized access.
- Sev2: Potential PHI exposure without confirmed exfiltration.
- Sev3: Security control degradation without data exposure.

## Response Team
- Incident Commander: Engineering Manager
- Security Lead: Backend/Infrastructure Owner
- Communications: Product/Operations Lead

## Procedure
1. Detect and triage incident.
2. Contain affected systems (disable impacted access paths, rotate secrets/keys).
3. Investigate scope using audit logs and diagnostics.
4. Eradicate root cause and deploy fix.
5. Recover service safely.
6. Conduct post-incident review and corrective actions.

## Breach Notification (HIPAA)
- Assess incident against HIPAA breach criteria.
- Notify required stakeholders within legally mandated windows.
- Preserve evidence and logs.

## Evidence Collection
- API audit logs
- Azure diagnostics logs
- Deployment and secret rotation records

## Postmortem Requirements
- Root cause
- Timeline
- Impact summary
- Corrective actions with owners and deadlines
