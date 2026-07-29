import ExcelJS from 'exceljs';
import type { DayMealCounts } from './meal-forecast.engine';
import { formatExportIsoDate } from './meal-forecast.format';
import type { MealForecastRoomRow } from './meal-forecast.types';

export async function buildMealForecastXlsx(opts: {
  from: string;
  to: string;
  mealTimes: { breakfast: string; lunch: string; dinner: string };
  days: DayMealCounts[];
  rooms: MealForecastRoomRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EcoLife';
  wb.created = new Date();

  const summary = wb.addWorksheet('Сводка', {
    properties: { defaultRowHeight: 22 },
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  summary.mergeCells('A1:E1');
  const title = summary.getCell('A1');
  title.value = `Прогноз питания ${opts.from} — ${opts.to}`;
  title.font = { bold: true, size: 16, name: 'Calibri' };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  summary.getRow(1).height = 28;

  summary.getCell('A2').value =
    `Завтрак ${opts.mealTimes.breakfast} · Обед ${opts.mealTimes.lunch} · Ужин ${opts.mealTimes.dinner}`;
  summary.getCell('A2').font = { size: 11, color: { argb: 'FF666666' }, name: 'Calibri' };
  summary.mergeCells('A2:E2');

  const headerRow = summary.addRow([
    'Дата',
    'Завтрак',
    'Обед',
    'Ужин',
    'Итого гостей/день',
  ]);
  headerRow.font = { bold: true, size: 12, name: 'Calibri' };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F0E8' },
    };
    cell.border = thinBorder();
  });
  headerRow.height = 24;

  let sumB = 0;
  let sumL = 0;
  let sumD = 0;
  let sumT = 0;

  for (const day of opts.days) {
    const row = summary.addRow([
      formatExportIsoDate(day.date),
      day.breakfast,
      day.lunch,
      day.dinner,
      day.total,
    ]);
    row.font = { size: 14, name: 'Calibri' };
    row.getCell(1).alignment = { horizontal: 'left' };
    for (let c = 2; c <= 5; c++) {
      row.getCell(c).alignment = { horizontal: 'center' };
      row.getCell(c).font = { size: 16, bold: true, name: 'Calibri' };
    }
    row.eachCell((cell) => {
      cell.border = thinBorder();
    });
    sumB += day.breakfast;
    sumL += day.lunch;
    sumD += day.dinner;
    sumT += day.total;
  }

  const totalRow = summary.addRow(['ИТОГО', sumB, sumL, sumD, sumT]);
  totalRow.font = { bold: true, size: 14, name: 'Calibri' };
  totalRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD4E4D4' },
    };
    cell.border = thinBorder();
  });
  for (let c = 2; c <= 5; c++) {
    totalRow.getCell(c).alignment = { horizontal: 'center' };
    totalRow.getCell(c).font = { bold: true, size: 16, name: 'Calibri' };
  }

  summary.getColumn(1).width = 14;
  summary.getColumn(2).width = 14;
  summary.getColumn(3).width = 12;
  summary.getColumn(4).width = 12;
  summary.getColumn(5).width = 20;

  const roomsSheet = wb.addWorksheet('По номерам', {
    properties: { defaultRowHeight: 20 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const roomHeader = roomsSheet.addRow([
    'Номер',
    'Коттедж',
    'Гостей',
    'Заезд',
    'Выезд',
  ]);
  roomHeader.font = { bold: true, size: 12, name: 'Calibri' };
  roomHeader.alignment = { horizontal: 'center', vertical: 'middle' };
  roomHeader.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F0E8' },
    };
    cell.border = thinBorder();
  });

  for (const r of opts.rooms) {
    const row = roomsSheet.addRow([
      r.roomNumber,
      r.cottageName,
      r.guests,
      r.checkInLabel,
      r.checkOutLabel,
    ]);
    row.font = { size: 12, name: 'Calibri' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.eachCell((cell) => {
      cell.border = thinBorder();
    });
  }

  roomsSheet.getColumn(1).width = 10;
  roomsSheet.getColumn(2).width = 22;
  roomsSheet.getColumn(3).width = 10;
  roomsSheet.getColumn(4).width = 18;
  roomsSheet.getColumn(5).width = 18;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: 'FFCCCCCC' },
  };
  return { top: edge, left: edge, bottom: edge, right: edge };
}
