import { usePublicSiteConfig } from '@/hooks/useAdminSettings';

interface Props {
  /** Optional subtitle shown under the site name (e.g. "AI GATEWAY"). */
  subtitle?: string;
  /** Tailwind size class applied to the logo box (default: w-8 h-8). */
  size?: string;
  /** Tailwind class applied to the site-name text. */
  nameClass?: string;
}

/**
 * Shared header chunk used by login page + both sidebars.
 *
 * Resolves the site name and logo from the public site config so admins'
 * changes propagate everywhere after saving. Falls back to the hard-coded
 * "AetherGate" / "AG" while the first fetch is in flight.
 */
export default function SiteLogo({
  subtitle,
  size = 'w-8 h-8',
  nameClass = 'font-semibold text-sm tracking-wide',
}: Props) {
  const { data } = usePublicSiteConfig();
  const name = data?.site_name?.trim() || 'AetherGate';
  const logo = data?.logo_url?.trim() || '';

  // Take up to two meaningful ASCII chars / one CJK char for the placeholder
  // badge. Keeps the bitmap tight no matter how long the name is.
  const initials = computeInitials(name);

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${size} rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center overflow-hidden shrink-0`}
      >
        {logo ? (
          <img
            src={logo}
            alt={`${name} logo`}
            className="w-full h-full object-contain"
            onError={(e) => {
              // Hide the broken image so the gradient fallback shines through.
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="text-black font-bold text-sm">{initials}</span>
        )}
      </div>
      <div className="min-w-0">
        <h1 className={`${nameClass} truncate`}>{name}</h1>
        {subtitle && (
          <p className="text-[10px] text-gray-500 font-mono truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function computeInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'AG';
  const ascii = trimmed.match(/[A-Za-z0-9]/g);
  if (ascii && ascii.length >= 2) {
    return (ascii[0] + ascii[1]).toUpperCase();
  }
  return Array.from(trimmed)[0] ?? 'A';
}
