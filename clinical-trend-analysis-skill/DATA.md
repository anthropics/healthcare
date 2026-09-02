# Synthea / FHIR bundle data

## Shipping data to users

| Approach | Notes |
|----------|--------|
| **GitHub Release zip** | Keeps git lean; document `unzip` → `synthea-data/` |
| **Documented download** | Smallest repo; users fetch Synthea or your export |
| **Large files in git** | Avoid unless using **Git LFS** |

This repo **gitignores** `synthea-data/*.json`. Only the README under `synthea-data/` is tracked.

## License / size

Align redistribution of Synthea exports with [Synthea](https://github.com/synthetichealth/synthea) terms and your organization.
