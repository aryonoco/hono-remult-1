import type { FireStatus } from './enums';

export const STATUS_BADGE_BASE =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium';

export const STATUS_BADGE_CLASSES: Readonly<Record<FireStatus, string>> = {
  going: 'bg-red-100 text-red-800 border-red-300',
  contained: 'bg-amber-100 text-amber-800 border-amber-300',
  underControlFirst: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  underControlSecond: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  safe: 'bg-green-100 text-green-800 border-green-300',
  safeOverrun: 'bg-green-100 text-green-800 border-green-300',
  safeNotFound: 'bg-gray-100 text-gray-800 border-gray-300',
  safeFalseAlarm: 'bg-gray-100 text-gray-800 border-gray-300',
  notFound: 'bg-orange-100 text-orange-800 border-orange-300',
};
