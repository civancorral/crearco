/**
 * Normalize Mexican phone numbers to WhatsApp JID format.
 * Input examples: "5512345678", "525512345678", "+525512345678", "15512345678"
 * Output: "525512345678@s.whatsapp.net"
 */
export function normalizePhone(phone) {
  if (!phone) return null;

  // Strip everything except digits
  let digits = phone.replace(/\D/g, '');

  // Remove leading '1' country code (US) if 11 digits — unlikely for MX but handle
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.substring(1);
  }

  // 10-digit Mexican number — prepend country code
  if (digits.length === 10) {
    digits = '52' + digits;
  }

  // 12-digit with country code 52
  if (digits.length === 12 && digits.startsWith('52')) {
    return digits;
  }

  // 13-digit with +521 (old mobile format) — normalize to 52 + 10 digits
  if (digits.length === 13 && digits.startsWith('521')) {
    return '52' + digits.substring(3);
  }

  // If already 12 digits, return as-is
  if (digits.length === 12) {
    return digits;
  }

  // Fallback: return cleaned digits
  return digits;
}

/**
 * Convert normalized phone to WhatsApp JID
 */
export function phoneToJid(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `${normalized}@s.whatsapp.net`;
}

/**
 * Extract phone number from JID
 */
export function jidToPhone(jid) {
  if (!jid) return null;
  return jid.replace(/@.*$/, '');
}
