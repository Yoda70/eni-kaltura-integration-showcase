const STATUS = Object.freeze({ '-1':'ERROR','0':'QUEUED','2':'READY','3':'DELETED','7':'IMPORTING','9':'EXPORTING' });
const FORMAT = Object.freeze({ '1':'SRT','2':'DFXP_TTML','3':'WEBVTT','4':'CAP','5':'SCC' });
const LANGUAGES = Object.freeze({ italian:'it', italiano:'it', it:'it', english:'en', inglese:'en', en:'en', french:'fr', francese:'fr', fr:'fr', spanish:'es', spagnolo:'es', es:'es', german:'de', tedesco:'de', de:'de', portuguese:'pt', portoghese:'pt', pt:'pt' });

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeLanguage(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const key = String(value).trim().toLowerCase().replaceAll('-', '_');
    if (LANGUAGES[key]) return LANGUAGES[key];
    if (/^[a-z]{2}$/.test(key)) return key;
    if (/^[a-z]{2}_[a-z]{2}$/.test(key)) return key.replace('_','-');
  }
  return 'und';
}

export function normalizeCaptionAsset(raw = {}) {
  const rawStatusCode = numberOrNull(raw.rawStatusCode ?? raw.statusCode ?? raw.status);
  const rawFormatCode = numberOrNull(raw.formatCode ?? raw.format);
  const status = rawStatusCode !== null ? (STATUS[String(rawStatusCode)] || `UNKNOWN_${rawStatusCode}`) : String(raw.status || 'UNKNOWN_NULL').toUpperCase();
  const format = rawFormatCode !== null ? (FORMAT[String(rawFormatCode)] || `UNKNOWN_${rawFormatCode}`) : String(raw.format || 'UNKNOWN_NULL').toUpperCase();
  const languageCode = normalizeLanguage(raw.languageCode, raw.language, raw.languageName, raw.label);
  const ready = rawStatusCode === 2 || (rawStatusCode === null && status === 'READY');
  const eligibleFormat = rawFormatCode === 1 || format === 'SRT';
  const captionAssetId = raw.captionAssetId ?? raw.id ?? null;
  const exclusionReasons = [];
  if (!ready) exclusionReasons.push(`CAPTION_STATUS_${status}`);
  if (!eligibleFormat) exclusionReasons.push(`FORMAT_NOT_ELIGIBLE_${format}`);
  if (languageCode === 'und') exclusionReasons.push('LANGUAGE_NOT_RECOGNIZED');
  return {
    captionAssetId,
    entryId: raw.entryId ?? null,
    languageCode,
    languageName: raw.languageName ?? raw.language ?? raw.label ?? '',
    label: raw.label ?? '',
    formatCode: rawFormatCode,
    format,
    rawStatusCode,
    status,
    ready,
    extractable: ready && Boolean(captionAssetId),
    eligibleFormat,
    eligibleAsset: ready && eligibleFormat && languageCode !== 'und',
    isDefault: raw.isDefault === true || Number(raw.isDefault) === 1,
    accuracy: raw.accuracy ?? null,
    version: raw.version ?? null,
    updatedAt: raw.updatedAt ?? (raw.updatedAt === 0 ? null : raw.updatedAt) ?? null,
    exclusionReasons
  };
}

export function classifyEntry(entryAvailable, transcripts, requestedLanguages = []) {
  const requested = [...new Set(requestedLanguages.map(x => normalizeLanguage(x)).filter(x => x !== 'und'))];
  const ready = transcripts.filter(x => x.ready);
  const readySrt = ready.filter(x => x.eligibleFormat);
  const eligible = readySrt.filter(x => x.eligibleAsset);
  const availableLanguages = [...new Set(readySrt.map(x => x.languageCode).filter(x => x !== 'und'))];
  const missingLanguages = requested.filter(x => !availableLanguages.includes(x));
  let status;
  if (!entryAvailable) status = 'ENTRY_NOT_FOUND';
  else if (!transcripts.length) status = 'ENTRY_FOUND_NO_CAPTIONS';
  else if (!ready.length) status = 'ONLY_NON_READY_CAPTIONS';
  else if (!readySrt.length) status = 'READY_CAPTIONS_NO_SRT';
  else if (requested.length && missingLanguages.length) status = 'PARTIAL_READY_FOR_INDEXING';
  else status = 'READY_FOR_INDEXING';
  return {
    status,
    eligibleForChatbot: eligible.length > 0,
    technicallyEligible: eligible.length > 0,
    requestedLanguages: requested,
    availableLanguages,
    missingLanguages,
    captionSummary: {
      totalCaptionAssets: transcripts.length,
      readyCaptionAssets: ready.length,
      nonReadyCaptionAssets: transcripts.length - ready.length,
      readySrtAssets: readySrt.length,
      eligibleCaptionAssets: eligible.length,
      readyLanguageCount: availableLanguages.length
    },
    eligibilityReasons: [
      ...(entryAvailable ? ['ENTRY_AVAILABLE'] : []),
      ...(ready.length ? ['READY_CAPTION_AVAILABLE'] : []),
      ...(readySrt.length ? ['READY_SRT_AVAILABLE'] : []),
      ...(availableLanguages.length ? ['LANGUAGE_RECOGNIZED'] : [])
    ],
    exclusionReasons: [
      ...(!entryAvailable ? ['ENTRY_NOT_FOUND'] : []),
      ...(entryAvailable && !transcripts.length ? ['NO_CAPTION_ASSETS'] : []),
      ...(transcripts.length && !ready.length ? ['NO_READY_CAPTION_ASSETS'] : []),
      ...(ready.length && !readySrt.length ? ['NO_READY_SRT_ASSETS'] : []),
      ...missingLanguages.map(x => `MISSING_REQUIRED_LANGUAGE_${x.toUpperCase()}`)
    ]
  };
}
