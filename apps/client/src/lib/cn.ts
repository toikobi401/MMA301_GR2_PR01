import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, with later Tailwind utilities winning over earlier ones
 * in the same group.
 *
 * Without the merge, `cn('px-4', 'px-6')` would emit both and the result would
 * depend on stylesheet order. This is what lets a caller override a
 * component's default padding by passing className.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
