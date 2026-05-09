import { cn } from '@/lib/utils';

interface ToggleProps {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export default function Toggle({ active, onToggle, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={cn(
        'toggle-switch',
        active && 'active',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      aria-pressed={active}
    />
  );
}
