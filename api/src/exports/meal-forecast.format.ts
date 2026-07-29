import { formatLocalTime, localParts } from '../common/utils/datetime';

/** Display date as DD/MM/YYYY (resort local). */
export function formatExportDate(instant: Date): string {
  const p = localParts(instant);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${String(p.year).padStart(4, '0')}`;
}

/** Display datetime as DD/MM/YYYY HH:mm (resort local). */
export function formatExportDateTime(instant: Date): string {
  return `${formatExportDate(instant)} ${formatLocalTime(instant)}`;
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function formatExportIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
