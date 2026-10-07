function integer(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) throw new Error(`Invalid integer environment variable ${name}`);
  return value;
}

export function loadEnvironment() {
  return Object.freeze({
    port: integer('PORT', 10000),
    serviceUrl: String(process.env.KALTURA_SERVICE_URL || 'https://www.kaltura.com/api_v3').replace(/\/$/, ''),
    partnerId: String(process.env.KALTURA_PARTNER_ID || ''),
    adminSecret: String(process.env.KALTURA_ADMIN_SECRET || ''),
    testCategoryName: String(process.env.KALTURA_TEST_CATEGORY_NAME || 'TEST_METADATA_EXTRACTION'),
    allowedOrigin: String(process.env.SPA_ALLOWED_ORIGIN || ''),
    factoryVersion: String(process.env.FACTORY_VERSION || '1.1.0'),
    environmentName: String(process.env.FACTORY_ENVIRONMENT || 'preview'),
    maxSrtBytes: integer('FACTORY_MAX_SRT_BYTES', 5_000_000),
    maxSegments: integer('FACTORY_MAX_SEGMENTS', 5_000),
    mcpEnabled: String(process.env.MCP_ENABLED || 'true').toLowerCase() === 'true',
    mcpPath: String(process.env.MCP_PATH || '/mcp'),
    mcpMaxResponseBytes: integer('MCP_MAX_RESPONSE_BYTES', 500_000),
    sessionExpirySeconds: integer('KALTURA_SESSION_EXPIRY_SECONDS', 3600)
  });
}

export function validateKalturaEnvironment(env) {
  const missing = [];
  if (!env.partnerId) missing.push('KALTURA_PARTNER_ID');
  if (!env.adminSecret) missing.push('KALTURA_ADMIN_SECRET');
  if (missing.length) {
    const error = new Error(`Missing environment variables: ${missing.join(', ')}`);
    error.code = 'CONFIGURATION_ERROR';
    error.httpStatus = 500;
    throw error;
  }
}
