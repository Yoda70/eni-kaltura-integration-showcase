import { ApplicationError } from '../errors/application-error.mjs';

export function parseSrt(srt, maxSegments = 5000) {
  if (!String(srt || '').trim()) throw new ApplicationError('EMPTY_SRT_CONTENT', 'Empty SRT content', 422);
  const blocks = String(srt).trim().split(/\r?\n\s*\r?\n/);
  const segments = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const timeIndex = lines[0]?.includes('-->') ? 0 : 1;
    const match = lines[timeIndex]?.match(/^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!match) continue;
    const text = lines.slice(timeIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    segments.push({ index: segments.length + 1, start: match[1].replace('.',','), end: match[2].replace('.',','), text });
    if (segments.length > maxSegments) throw new ApplicationError('SRT_SEGMENT_LIMIT_EXCEEDED', `SRT exceeds ${maxSegments} segments`, 413);
  }
  if (!segments.length) throw new ApplicationError('INVALID_SRT_CONTENT', 'No valid SRT segments found', 422);
  return { segments, cleanText: segments.map(x => x.text).filter(Boolean).join(' ').trim() };
}
