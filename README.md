# Catalogue Portal

Static UI for the Actions & Workflow Catalogue.

The portal uses a `SubmissionAdapter` abstraction. Production must point the adapter at an authenticated backend that triggers `catalogue-control` workflows or repository dispatch. No privileged GitHub credential belongs in browser JavaScript.
