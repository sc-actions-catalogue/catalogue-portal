# Catalogue Portal

Static UI for the Actions & Workflow Catalogue.

The portal uses a `SubmissionAdapter` abstraction. Production must point the adapter at an authenticated backend that triggers `catalogue-control` workflows or repository dispatch. No privileged GitHub credential belongs in browser JavaScript.

When served from GitHub Pages, set `window.CATALOGUE_API_BASE` before `app.js` loads or replace `productionApiBase` in `app.js` with the HTTPS URL of the deployed submission service. Without that backend, hosted form submissions intentionally fail closed.
