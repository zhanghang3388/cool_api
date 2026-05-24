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
 * Logo is bundled at `/logo.png` (under frontend/public) so it renders on
 * first paint with no flicker. Site name still comes from runtime config
 * since admin can rebrand without redeploying — text swap is much less
 * jarring than a logo swap.
 */
export default function SiteLogo({
  subtitle,
  size = 'w-8 h-8',
  nameClass = 'font-semibold text-sm tracking-wide',
}: Props) {
  const { data } = usePublicSiteConfig();
  const name = data?.site_name?.trim() || 'AetherGate';

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${size} rounded-lg overflow-hidden shrink-0 bg-base-200`}
      >
        <img
          src="/logo.png"
          alt={`${name} logo`}
          className="w-full h-full object-contain"
        />
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
