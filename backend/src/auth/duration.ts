/**
 * Convertit une durée de type `15m`, `7d`, `1h`, `30s` en millisecondes.
 * Sert à calculer `expiresAt` des refresh / reset tokens à partir de la config.
 */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Durée invalide: "${value}" (attendu ex. "15m", "7d")`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const factors: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * factors[unit];
}
