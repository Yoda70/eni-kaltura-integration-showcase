# Metadata Extraction Factory API Preview

Read-only backend restricted to the KMC category `TEST_METADATA_EXTRACTION`.

Required environment variables:
- KALTURA_SERVICE_URL
- KALTURA_PARTNER_ID
- KALTURA_ADMIN_SECRET
- KALTURA_TEST_CATEGORY_NAME
- SPA_ALLOWED_ORIGIN

For production, replace the admin-secret session adapter with a least-privilege AppToken.
