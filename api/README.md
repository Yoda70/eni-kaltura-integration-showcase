# Metadata Extraction Factory API

Shared application core exposed through REST and MCP.

## REST
- `GET /api/v1/health`
- `POST /api/v1/kaltura/transcripts/verify`
- `POST /api/v1/kaltura/transcripts/extract`
- `POST /api/v1/kaltura/transcripts/extract-preferred`

## MCP
- `POST /mcp`
- `tools/list`
- `tools/call`

## Required environment variables
`KALTURA_SERVICE_URL`, `KALTURA_PARTNER_ID`, `KALTURA_ADMIN_SECRET`, `SPA_ALLOWED_ORIGIN`.
