import PDFDocument from 'pdfkit';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DayMealCounts } from './meal-forecast.engine';
import { formatExportIsoDate } from './meal-forecast.format';
import type { MealForecastRoomRow } from './meal-forecast.types';

function resolveFont(file: string): string {
  const candidates = [
    path.join(process.cwd(), 'assets', 'fonts', file),
    path.join(__dirname, '..', '..', 'assets', 'fonts', file),
    path.join(__dirname, 'assets', 'fonts', file),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`PDF font not found: ${file}`);
}

function formatGuestBreakdown(b: { adults: number; children: number; infants: number; total: number }): string {
  if (b.total === 0) return '0';
  const parts: string[] = [];
  if (b.adults > 0) parts.push(`${b.adults}в`);
  if (b.children > 0) parts.push(`${b.children}д`);
  if (b.infants > 0) parts.push(`${b.infants}м`);
  return `${b.total} (${parts.join('/')})`;
}

export async function buildMealForecastPdf(opts: {
  from: string;
  to: string;
  mealTimes: { breakfast: string; lunch: string; dinner: string };
  days: DayMealCounts[];
  rooms: MealForecastRoomRow[];
}): Promise<Buffer> {
  const regular = resolveFont('NotoSans-Regular.ttf');
  const bold = resolveFont('NotoSans-Bold.ttf');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 35, right: 35 },
      info: {
        Title: `Прогноз питания ${opts.from} — ${opts.to}`,
        Author: 'EcoLife',
      },
    });
    doc.registerFont('MealSans', regular);
    doc.registerFont('MealSans-Bold', bold);

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('MealSans-Bold').text('Прогноз питания', {
      align: 'left',
    });
    doc.moveDown(0.3);
    doc
      .fontSize(11)
      .font('MealSans')
      .fillColor('#444444')
      .text(`${formatExportIsoDate(opts.from)} — ${formatExportIsoDate(opts.to)}`);
    doc
      .fontSize(10)
      .text(
        `Завтрак ${opts.mealTimes.breakfast}  ·  Обед ${opts.mealTimes.lunch}  ·  Ужин ${opts.mealTimes.dinner}`,
      );
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    // If single-day report, render a clean daily summary table (rows = meals, cols = people types)
    if (opts.days.length === 1) {
      const day = opts.days[0];
      const colX = [35, 125, 205, 285, 365, 445];
      const colW = [90, 80, 80, 80, 80, 85];
      const headers = [
        'Приём пищи',
        'Время',
        'Взрослые',
        'Дети',
        'Младенцы',
        'Всего порций',
      ];

      drawSummaryHeader(doc, colX, colW, headers);

      const meals = [
        { name: 'Завтрак', time: opts.mealTimes.breakfast, data: day.breakfast },
        { name: 'Обед', time: opts.mealTimes.lunch, data: day.lunch },
        { name: 'Ужин', time: opts.mealTimes.dinner, data: day.dinner },
      ];

      const rowH = 24;
      for (const m of meals) {
        const y = doc.y;
        doc.font('MealSans-Bold').fontSize(10).fillColor('#000000').text(m.name, colX[0], y + 5, {
          width: colW[0],
          align: 'left',
          lineBreak: false,
        });
        doc.font('MealSans').fontSize(10).fillColor('#333333').text(m.time, colX[1], y + 5, {
          width: colW[1],
          align: 'center',
          lineBreak: false,
        });
        doc.font('MealSans').fontSize(10).fillColor('#000000').text(String(m.data.adults), colX[2], y + 5, {
          width: colW[2],
          align: 'center',
          lineBreak: false,
        });
        doc.font('MealSans').fontSize(10).fillColor('#000000').text(String(m.data.children), colX[3], y + 5, {
          width: colW[3],
          align: 'center',
          lineBreak: false,
        });
        doc.font('MealSans').fontSize(10).fillColor('#000000').text(String(m.data.infants), colX[4], y + 5, {
          width: colW[4],
          align: 'center',
          lineBreak: false,
        });
        doc.font('MealSans-Bold').fontSize(11).fillColor('#000000').text(String(m.data.total), colX[5], y + 5, {
          width: colW[5],
          align: 'center',
          lineBreak: false,
        });

        doc
          .moveTo(35, y + rowH)
          .lineTo(530, y + rowH)
          .strokeColor('#dddddd')
          .stroke();
        doc.y = y + rowH;
      }

      // Total Row
      const ty = doc.y;
      doc.rect(35, ty, 495, 26).fill('#e2efda');
      doc.fillColor('#000000');
      doc.font('MealSans-Bold').fontSize(10).text('ИТОГО ЗА ДЕНЬ', colX[0], ty + 7, {
        width: colW[0],
        align: 'left',
        lineBreak: false,
      });
      doc.font('MealSans-Bold').fontSize(10).text('—', colX[1], ty + 7, {
        width: colW[1],
        align: 'center',
        lineBreak: false,
      });
      doc.font('MealSans-Bold').fontSize(10).text(String(day.total.adults), colX[2], ty + 7, {
        width: colW[2],
        align: 'center',
        lineBreak: false,
      });
      doc.font('MealSans-Bold').fontSize(10).text(String(day.total.children), colX[3], ty + 7, {
        width: colW[3],
        align: 'center',
        lineBreak: false,
      });
      doc.font('MealSans-Bold').fontSize(10).text(String(day.total.infants), colX[4], ty + 7, {
        width: colW[4],
        align: 'center',
        lineBreak: false,
      });
      doc.font('MealSans-Bold').fontSize(12).text(String(day.total.total), colX[5], ty + 6, {
        width: colW[5],
        align: 'center',
        lineBreak: false,
      });

      doc.y = ty + 36;
    } else {
      // Multi-day table
      const colX = [35, 115, 220, 325, 430];
      const colW = [75, 100, 100, 100, 95];
      const headers = [
        'Дата',
        `Завтрак (${opts.mealTimes.breakfast})`,
        `Обед (${opts.mealTimes.lunch})`,
        `Ужин (${opts.mealTimes.dinner})`,
        'Итого / день',
      ];

      drawSummaryHeader(doc, colX, colW, headers);

      const sums = {
        b: { adults: 0, children: 0, infants: 0, total: 0 },
        l: { adults: 0, children: 0, infants: 0, total: 0 },
        d: { adults: 0, children: 0, infants: 0, total: 0 },
        t: { adults: 0, children: 0, infants: 0, total: 0 },
      };

      const rowH = 22;

      for (const day of opts.days) {
        if (doc.y + rowH > doc.page.height - 60) {
          doc.addPage();
          drawSummaryHeader(doc, colX, colW, headers);
        }
        const y = doc.y;
        const vals = [
          formatExportIsoDate(day.date),
          formatGuestBreakdown(day.breakfast),
          formatGuestBreakdown(day.lunch),
          formatGuestBreakdown(day.dinner),
          formatGuestBreakdown(day.total),
        ];
        for (let i = 0; i < vals.length; i++) {
          doc
            .font(i === 0 ? 'MealSans' : 'MealSans-Bold')
            .fontSize(i === 0 ? 10 : 9)
            .fillColor('#000000')
            .text(vals[i], colX[i], y + 4, {
              width: colW[i],
              align: i === 0 ? 'left' : 'center',
              lineBreak: false,
            });
        }
        doc
          .moveTo(35, y + rowH)
          .lineTo(530, y + rowH)
          .strokeColor('#dddddd')
          .stroke();
        doc.y = y + rowH;

        sums.b.adults += day.breakfast.adults;
        sums.b.children += day.breakfast.children;
        sums.b.infants += day.breakfast.infants;
        sums.b.total += day.breakfast.total;

        sums.l.adults += day.lunch.adults;
        sums.l.children += day.lunch.children;
        sums.l.infants += day.lunch.infants;
        sums.l.total += day.lunch.total;

        sums.d.adults += day.dinner.adults;
        sums.d.children += day.dinner.children;
        sums.d.infants += day.dinner.infants;
        sums.d.total += day.dinner.total;

        sums.t.adults += day.total.adults;
        sums.t.children += day.total.children;
        sums.t.infants += day.total.infants;
        sums.t.total += day.total.total;
      }

      const ty = doc.y + 4;
      const totals = [
        'ИТОГО',
        formatGuestBreakdown(sums.b),
        formatGuestBreakdown(sums.l),
        formatGuestBreakdown(sums.d),
        formatGuestBreakdown(sums.t),
      ];
      for (let i = 0; i < totals.length; i++) {
        doc
          .font('MealSans-Bold')
          .fontSize(9)
          .fillColor('#000000')
          .text(totals[i], colX[i], ty, {
            width: colW[i],
            align: i === 0 ? 'left' : 'center',
            lineBreak: false,
          });
      }
      doc.y = ty + 28;
    }

    doc.end();
  });
}

function drawSummaryHeader(
  doc: PDFKit.PDFDocument,
  colX: number[],
  colW: number[],
  headers: string[],
) {
  const y = doc.y;
  doc.rect(35, y - 2, 495, 18).fill('#e8f0e8');
  doc.fillColor('#000000');
  for (let i = 0; i < headers.length; i++) {
    doc
      .font('MealSans-Bold')
      .fontSize(9)
      .text(headers[i], colX[i], y + 2, {
        width: colW[i],
        align: i === 0 ? 'left' : 'center',
        lineBreak: false,
      });
  }
  doc.y = y + 22;
}

