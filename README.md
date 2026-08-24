# Catalogue Portal

Static UI for the Actions & Workflow Catalogue.

The portal uses a `SubmissionAdapter` abstraction. Production must point the adapter at an authenticated backend that triggers `catalogue-control` workflows or repository dispatch. No privileged GitHub credential belongs in browser JavaScript.

When served from GitHub Pages without a backend, the portal opens a prefilled intake issue in `sc-actions-catalogue/catalogue-control`. GitHub Actions then processes issues labelled `catalogue-intake`.
