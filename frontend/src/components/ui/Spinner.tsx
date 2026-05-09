import { cn } from '@/lib/utils';

export default function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin',
        className
      )}
    />
  );
}
