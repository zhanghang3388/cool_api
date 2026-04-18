export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatBalance(microCents: number): string {
  return `$${(microCents / 1_000_000).toFixed(4)}`;
}
