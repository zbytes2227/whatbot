// lib/phone.js
// Pure helpers shared by the browser and the server. No Node-only imports.

export const DEFAULT_COUNTRY_CODE = '91';
export const MAX_NUMBERS_PER_LIST = 200000;

/**
 * Normalise a phone number to digits including the country code
 * (e.g. "919876543210"). Returns null when the value cannot be a valid
 * WhatsApp number.
 */
export function normalizePhone(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;

  const hasPlus = value.startsWith('+') || value.startsWith('00');
  let digits = value.replace(/[^0-9]/g, '');
  if (value.startsWith('00')) digits = digits.slice(2);

  if (!hasPlus) {
    if (digits.length === 10 && /^[6-9]/.test(digits) && countryCode === '91') return `91${digits}`;
    if (digits.length === 10 && countryCode !== '91') return `${countryCode}${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `${countryCode}${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith('91')) return /^91[6-9]/.test(digits) ? digits : null;
  }

  if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith('0')) return digits;
  return null;
}

/**
 * A candidate like "98765 43210 91234 56789" may hold several numbers, and a
 * single number may be split into groups ("+91 98765 43210"). Walk the
 * groups and take the shortest run that forms a valid number each time.
 * Returns normalised numbers, with null for a run that never became valid.
 */
function splitCandidate(candidate, countryCode) {
  const groups = candidate.trim().split(/[\s\-().]+/).filter(Boolean);
  const found = [];
  let start = 0;
  while (start < groups.length) {
    let match = null;
    let end = start;
    for (; end < groups.length && end < start + 6; end += 1) {
      match = normalizePhone(groups.slice(start, end + 1).join(' '), countryCode);
      if (match) break;
    }
    if (match) {
      found.push(match);
      start = end + 1;
    } else {
      found.push(null);
      start += 1;
      // Skip the remaining short fragments of this unparseable group.
      while (start < groups.length && groups[start].replace(/\D/g, '').length < 6) start += 1;
    }
  }
  return found;
}

/**
 * Extract every phone number from free text, CSV or spreadsheet pastes.
 * Returns unique normalised numbers in first-seen order plus the count of
 * candidate tokens that could not be parsed.
 */
export function extractPhones(text, countryCode = DEFAULT_COUNTRY_CODE) {
  const input = String(text || '').replace(/[^\x00-\x7F]/g, ' ');
  const seen = new Set();
  const numbers = [];
  let invalid = 0;

  // A candidate is an optional +, then digits possibly broken up by spaces,
  // dashes, dots or brackets ("+91 98765-43210", "(0) 98765 43210").
  const candidate = /\+?\d[\d\s\-().]{6,}\d/g;
  for (const cell of input.split(/[\n\r,;\t|]+/)) {
    const matches = cell.match(candidate);
    if (!matches) continue;
    for (const match of matches) {
      for (const normalized of splitCandidate(match, countryCode)) {
        if (!normalized) {
          invalid += 1;
        } else if (!seen.has(normalized)) {
          seen.add(normalized);
          numbers.push(normalized);
        }
      }
    }
  }

  return { numbers, invalid };
}

/** Human-friendly rendering: "+91 98765 43210". */
export function formatPhone(digits) {
  const value = String(digits || '');
  if (/^91\d{10}$/.test(value)) return `+91 ${value.slice(2, 7)} ${value.slice(7)}`;
  return value ? `+${value}` : '';
}
