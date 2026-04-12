/** Basic validation for a Starknet field element address (0x + hex). */
export function isValidStarknetAddress(raw: string): boolean {
  const s = raw.trim();
  // Felts are often 63–64 hex digits (padded). Reject obvious junk like "abc123".
  return /^0x[0-9a-fA-F]{60,64}$/.test(s);
}
