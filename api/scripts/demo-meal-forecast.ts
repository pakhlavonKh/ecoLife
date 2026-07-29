/**
 * Generate a sample meal-forecast.xlsx for manual inspection (no DB).
 * Usage: npx tsx scripts/demo-meal-forecast.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseLocalDateTime } from '../src/common/utils/datetime';
import {
  buildDayMealCounts,
  enumerateDatesInclusive,
  parseMealTimes,
} from '../src/exports/meal-forecast.engine';
import { buildMealForecastXlsx } from '../src/exports/meal-forecast.xlsx';
import { buildMealForecastPdf } from '../src/exports/meal-forecast.pdf';

async function main() {
  const from = '2026-08-05';
  const to = '2026-08-07';
  const mealTimes = parseMealTimes({});
  const dates = enumerateDatesInclusive(from, to);

  const stays = [
    {
      checkIn: parseLocalDateTime('2026-08-05', '16:00'),
      checkOut: parseLocalDateTime('2026-08-07', '12:00'),
      guests: 7,
    },
    {
      checkIn: parseLocalDateTime('2026-08-05', '14:00'),
      checkOut: parseLocalDateTime('2026-08-06', '12:00'),
      guests: 2,
    },
  ];

  const days = buildDayMealCounts(stays, dates, mealTimes);
  const rooms = [
    {
      roomNumber: '201',
      cottageName: 'Seshanba kottej',
      guests: 7,
      checkInLabel: '05/08/2026 16:00',
      checkOutLabel: '07/08/2026 12:00',
      checkIn: stays[0].checkIn,
      checkOut: stays[0].checkOut,
    },
    {
      roomNumber: '401',
      cottageName: 'Payshanba kottej',
      guests: 2,
      checkInLabel: '05/08/2026 14:00',
      checkOutLabel: '06/08/2026 12:00',
      checkIn: stays[1].checkIn,
      checkOut: stays[1].checkOut,
    },
  ];

  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });

  const xlsx = await buildMealForecastXlsx({ from, to, mealTimes, days, rooms });
  const pdf = await buildMealForecastPdf({ from, to, mealTimes, days, rooms });

  const xlsxPath = path.join(outDir, `meal-forecast_${from}_${to}.xlsx`);
  const pdfPath = path.join(outDir, `meal-forecast_${from}_${to}.pdf`);
  fs.writeFileSync(xlsxPath, xlsx);
  fs.writeFileSync(pdfPath, pdf);

  console.log('Summary (Сводка):');
  console.table(
    days.map((d) => ({
      Дата: d.date,
      Завтрак: d.breakfast,
      Обед: d.lunch,
      Ужин: d.dinner,
      Итого: d.total,
    })),
  );
  console.log('Wrote:', xlsxPath);
  console.log('Wrote:', pdfPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
