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
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  if (opts.days.length === 1) {
    const day = opts.days[0];
    const b = day.breakfast;
    const l = day.lunch;
    const d = day.dinner;
    const t = day.total;

    summary.mergeCells('A1:F1');
    const title = summary.getCell('A1');
    title.value = `Прогноз питания на ${formatExportIsoDate(day.date)}`;
    title.font = { bold: true, size: 16, name: 'Calibri' };
    title.alignment = { vertical: 'middle', horizontal: 'left' };
    summary.getRow(1).height = 28;

    summary.getCell('A2').value =
      `Завтрак ${opts.mealTimes.breakfast} · Обед ${opts.mealTimes.lunch} · Ужин ${opts.mealTimes.dinner}`;
    summary.getCell('A2').font = { size: 11, color: { argb: 'FF666666' }, name: 'Calibri' };
    summary.mergeCells('A2:F2');

    const headerRow = summary.getRow(4);
    headerRow.values = [
      'Приём пищи',
      'Время',
      'Взрослые',
      'Дети',
      'Младенцы',
      'Всего порций',
    ];
    headerRow.font = { bold: true, size: 11, name: 'Calibri' };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 24;
    for (let c = 1; c <= 6; c++) {
      const cell = headerRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F0E8' },
      };
      cell.border = thinBorder();
    }
    headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

    const meals = [
      { name: 'Завтрак', time: opts.mealTimes.breakfast, data: b, bg: 'FFE0ECE4' },
      { name: 'Обед', time: opts.mealTimes.lunch, data: l, bg: 'FFDDEBF7' },
      { name: 'Ужин', time: opts.mealTimes.dinner, data: d, bg: 'FFFCE4D6' },
    ];

    for (const m of meals) {
      const row = summary.addRow([
        m.name,
        m.time,
        m.data.adults,
        m.data.children,
        m.data.infants,
        m.data.total,
      ]);
      row.font = { size: 11, name: 'Calibri' };
      row.height = 22;
      row.getCell(1).font = { bold: true, size: 11, name: 'Calibri' };
      row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      for (let c = 3; c <= 6; c++) {
        const cell = row.getCell(c);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (c === 6) cell.font = { bold: true, size: 11, name: 'Calibri' };
        cell.border = thinBorder();
      }
      row.getCell(1).border = thinBorder();
      row.getCell(2).border = thinBorder();
    }

    const totalRow = summary.addRow([
      'ИТОГО ЗА ДЕНЬ',
      '—',
      t.adults,
      t.children,
      t.infants,
      t.total,
    ]);
    totalRow.font = { bold: true, size: 12, name: 'Calibri' };
    totalRow.height = 26;
    for (let c = 1; c <= 6; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2EFDA' },
      };
      cell.border = thinBorder();
      cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle' };
    }

    summary.getColumn(1).width = 18;
    summary.getColumn(2).width = 12;
    summary.getColumn(3).width = 14;
    summary.getColumn(4).width = 12;
    summary.getColumn(5).width = 14;
    summary.getColumn(6).width = 16;
  } else {
    summary.mergeCells('A1:Q1');
    const title = summary.getCell('A1');
    title.value = `Прогноз питания ${formatExportIsoDate(opts.from)} — ${formatExportIsoDate(opts.to)}`;
    title.font = { bold: true, size: 16, name: 'Calibri' };
    title.alignment = { vertical: 'middle', horizontal: 'left' };
    summary.getRow(1).height = 28;

    summary.getCell('A2').value =
      `Завтрак ${opts.mealTimes.breakfast} · Обед ${opts.mealTimes.lunch} · Ужин ${opts.mealTimes.dinner}`;
    summary.getCell('A2').font = { size: 11, color: { argb: 'FF666666' }, name: 'Calibri' };
    summary.mergeCells('A2:Q2');

    // Multi-tier header:
    // Row 3: Group Headers
    summary.mergeCells('A3:A4');
    summary.getCell('A3').value = 'Дата';

    summary.mergeCells('B3:E3');
    summary.getCell('B3').value = `Завтрак (${opts.mealTimes.breakfast})`;

    summary.mergeCells('F3:I3');
    summary.getCell('F3').value = `Обед (${opts.mealTimes.lunch})`;

    summary.mergeCells('J3:M3');
    summary.getCell('J3').value = `Ужин (${opts.mealTimes.dinner})`;

    summary.mergeCells('N3:Q3');
    summary.getCell('N3').value = 'Итого за день';

    const groupRow = summary.getRow(3);
    groupRow.font = { bold: true, size: 12, name: 'Calibri' };
    groupRow.alignment = { horizontal: 'center', vertical: 'middle' };
    groupRow.height = 24;

    const subHeaders = [
      '', // A: Date
      'Взр', 'Дет', 'Млад', 'Всего', // Breakfast
      'Взр', 'Дет', 'Млад', 'Всего', // Lunch
      'Взр', 'Дет', 'Млад', 'Всего', // Dinner
      'Взр', 'Дет', 'Млад', 'Всего', // Total
    ];

    const subHeaderRow = summary.getRow(4);
    subHeaderRow.values = subHeaders;
    subHeaderRow.font = { bold: true, size: 11, name: 'Calibri' };
    subHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
    subHeaderRow.height = 22;

    // Apply styles to headers (Rows 3 & 4)
    for (let r = 3; r <= 4; r++) {
      const row = summary.getRow(r);
      for (let c = 1; c <= 17; c++) {
        const cell = row.getCell(c);
        let bg = 'FFE8F0E8';
        if (c >= 2 && c <= 5) bg = 'FFE0ECE4';
        if (c >= 6 && c <= 9) bg = 'FFDDEBF7';
        if (c >= 10 && c <= 13) bg = 'FFFCE4D6';
        if (c >= 14 && c <= 17) bg = 'FFE2EFDA';

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bg },
        };
        cell.border = thinBorder();
      }
    }

    const sums = {
      bA: 0, bC: 0, bI: 0, bT: 0,
      lA: 0, lC: 0, lI: 0, lT: 0,
      dA: 0, dC: 0, dI: 0, dT: 0,
      tA: 0, tC: 0, tI: 0, tT: 0,
    };

    for (const day of opts.days) {
      const b = day.breakfast;
      const l = day.lunch;
      const d = day.dinner;
      const t = day.total;

      const row = summary.addRow([
        formatExportIsoDate(day.date),
        b.adults, b.children, b.infants, b.total,
        l.adults, l.children, l.infants, l.total,
        d.adults, d.children, d.infants, d.total,
        t.adults, t.children, t.infants, t.total,
      ]);
      row.font = { size: 11, name: 'Calibri' };
      row.getCell(1).alignment = { horizontal: 'left' };
      for (let c = 2; c <= 17; c++) {
        const cell = row.getCell(c);
        cell.alignment = { horizontal: 'center' };
        // Bold total columns (5, 9, 13, 17)
        if (c % 4 === 1 || c === 17) {
          cell.font = { bold: true, size: 11, name: 'Calibri' };
        }
        cell.border = thinBorder();
      }

      sums.bA += b.adults; sums.bC += b.children; sums.bI += b.infants; sums.bT += b.total;
      sums.lA += l.adults; sums.lC += l.children; sums.lI += l.infants; sums.lT += l.total;
      sums.dA += d.adults; sums.dC += d.children; sums.dI += d.infants; sums.dT += d.total;
      sums.tA += t.adults; sums.tC += t.children; sums.tI += t.infants; sums.tT += t.total;
    }

    const totalRow = summary.addRow([
      'ИТОГО',
      sums.bA, sums.bC, sums.bI, sums.bT,
      sums.lA, sums.lC, sums.lI, sums.lT,
      sums.dA, sums.dC, sums.dI, sums.dT,
      sums.tA, sums.tC, sums.tI, sums.tT,
    ]);
    totalRow.font = { bold: true, size: 12, name: 'Calibri' };
    totalRow.height = 24;
    for (let c = 1; c <= 17; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD4E4D4' },
      };
      cell.border = thinBorder();
      if (c > 1) cell.alignment = { horizontal: 'center' };
    }

    summary.getColumn(1).width = 14;
    for (let c = 2; c <= 17; c++) {
      summary.getColumn(c).width = (c % 4 === 1 || c === 17) ? 9 : 7;
    }
  }

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

