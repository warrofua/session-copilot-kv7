# Celeration Integration Plan (ABA / SCC-Aligned)

## Purpose
Use Standard Celeration Chart (SCC) logic so caseload monitoring and inbox guidance reflect clinically meaningful trend signals, not generic slope language.

## What Is Implemented Now
- Celeration is computed from behavior frequency trend on a log scale and normalized to a weekly multiplier (`xN` or `÷N` per week).
- The dashboard stores celeration interpretation for behavior reduction targets:
  - `worsening`: accelerating behavior frequency (`x` side).
  - `improving`: decelerating behavior frequency (`divide` side).
  - `flat`: near no change.
- Inbox payload includes celeration value, percent delta, period (`per_week`), and interpretation for all eight clients.
- Inbox prompt rules explicitly define SCC interpretation for behavior reduction targets so replies do not invert meaning.

## Phase 1: Data Model Upgrades (Next)
1. Add timing-level fields to support true SCC frequencies:
   - observation seconds,
   - count correct,
   - count incorrect,
   - count behavior events,
   - opportunity count.
2. Persist chart-ready daily aggregates in IndexedDB:
   - frequency per minute for each metric stream,
   - minimum non-zero support (record floor),
   - missing day markers.
3. Version the Dexie schema with non-breaking migration and backfill from historical session data where available.

## Phase 2: SCC Analytics Service
1. Build a dedicated `celerationService` that outputs:
   - celeration multiplier per week,
   - bounce (variability band),
   - level change (before/after phase),
   - trend confidence (days present, minimum points).
2. Compute separate trends by target class:
   - behavior reduction targets,
   - skill acquisition (correct frequency),
   - error reduction (incorrect frequency).
3. Add safeguards:
   - no celeration claims below minimum days,
   - explicit "insufficient data" state.

## Phase 3: Dashboard UX Integration
1. Add SCC mode toggle in dashboard controls.
2. For each learner card, show:
   - current celeration (`x1.30/wk` or `÷1.25/wk`),
   - trend direction chip,
   - bounce indicator.
3. Add drill-down panel with 7/14/28 day SCC slices and intervention phase markers.

## Phase 4: Inbox Agent Interpretation Contract
1. Include structured celeration context in chat payload:
   - trend direction by target class,
   - confidence/insufficient-data flags,
   - bounce and recent level shift.
2. Prompt constraints:
   - behavior reduction: `x` = worsening, `÷` = improving,
   - skill acquisition (correct frequency): `x` = improving, `÷` = worsening,
   - never infer thresholds not in payload.
3. Response templates:
   - "monitor," "review now," and "protocol-adjust" based on risk + celeration + confidence.

## Phase 5: Verification
1. Unit tests:
   - celeration math from synthetic known sequences,
   - direction inversion checks (behavior vs skill),
   - low-data guard behavior.
2. Integration tests:
   - inbox answers celeration questions only from payload values,
   - no fabricated thresholds or client-level claims.
3. Playwright regression:
   - SCC values visible on cards,
   - inbox explanation consistency against network payload.

## Research Anchors
- Precision Teaching and SCC emphasize frequency-based monitoring and celeration as multiplicative change over time, commonly communicated as `x`/`divide` per standard period.
- SCC usage in school/clinical studies frequently reports celeration as weekly multipliers (for daily measures), with interpretation tied to intervention decisions.
- Skill and behavior interpretation must be direction-aware:
  - behavior reduction targets: `x` can indicate worsening (higher frequency), `divide` indicates improvement (lower frequency),
  - skill acquisition corrects: `x` generally indicates improvement.

## Sources
- [Precision teaching and fluency data in educational settings (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7781427/)
- [Behavior-analytic progress monitoring and SCC reporting examples (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8458498/)
- [Precision-teaching celeration examples in applied intervention research (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10204687/)
- [Recent precision-teaching implementation reporting with celeration outcomes (PMC, 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12832601/)
