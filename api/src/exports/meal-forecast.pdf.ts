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
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
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

    const colX = [40, 130, 210, 290, 370];
    const colW = [90, 80, 80, 80, 120];
    const headers = [
      'Дата',
      'Завтрак',
      'Обед',
      'Ужин',
      'Итого гостей/день',
    ];

    drawSummaryHeader(doc, colX, colW, headers);

    let sumB = 0;
    let sumL = 0;
    let sumD = 0;
    let sumT = 0;
    const rowH = opts.days.length <= 14 ? 22 : 18;
    const fontSize = opts.days.length <= 14 ? 12 : 10;

    for (const day of opts.days) {
      if (doc.y + rowH > doc.page.height - 60) {
        doc.addPage();
        drawSummaryHeader(doc, colX, colW, headers);
      }
      const y = doc.y;
      const vals = [
        formatExportIsoDate(day.date),
        String(day.breakfast),
        String(day.lunch),
        String(day.dinner),
        String(day.total),
      ];
      for (let i = 0; i < vals.length; i++) {
        doc
          .font(i === 0 ? 'MealSans' : 'MealSans-Bold')
          .fontSize(i === 0 ? fontSize : fontSize + 1)
          .text(vals[i], colX[i], y, {
            width: colW[i],
            align: i === 0 ? 'left' : 'center',
            lineBreak: false,
          });
      }
      doc
        .moveTo(40, y + rowH - 2)
        .lineTo(490, y + rowH - 2)
        .strokeColor('#dddddd')
        .stroke();
      doc.y = y + rowH;
      sumB += day.breakfast;
      sumL += day.lunch;
      sumD += day.dinner;
      sumT += day.total;
    }

    const ty = doc.y + 4;
    const totals = ['ИТОГО', String(sumB), String(sumL), String(sumD), String(sumT)];
    for (let i = 0; i < totals.length; i++) {
      doc
        .font('MealSans-Bold')
        .fontSize(12)
        .text(totals[i], colX[i], ty, {
          width: colW[i],
          align: i === 0 ? 'left' : 'center',
          lineBreak: false,
        });
    }
    doc.y = ty + 28;

    doc.addPage();
    doc.fontSize(14).font('MealSans-Bold').fillColor('#000000').text('По номерам');
    doc.moveDown(0.5);

    const rColX = [40, 110, 280, 340, 430];
    const rColW = [70, 170, 60, 90, 90];
    const rHeaders = ['Номер', 'Коттедж', 'Гостей', 'Заезд', 'Выезд'];
    drawRoomHeader(doc, rColX, rColW, rHeaders);

    for (const r of opts.rooms) {
      if (doc.y + 18 > doc.page.height - 50) {
        doc.addPage();
        drawRoomHeader(doc, rColX, rColW, rHeaders);
      }
      const y = doc.y;
      const vals = [
        r.roomNumber,
        r.cottageName,
        String(r.guests),
        r.checkInLabel,
        r.checkOutLabel,
      ];
      for (let i = 0; i < vals.length; i++) {
        doc
          .font('MealSans')
          .fontSize(9)
          .text(vals[i], rColX[i], y, {
            width: rColW[i],
            align: i === 2 ? 'center' : 'left',
            lineBreak: false,
            ellipsis: true,
          });
      }
      doc.y = y + 16;
    }

    if (opts.rooms.length === 0) {
      doc.fontSize(10).fillColor('#666666').text('Нет активных броней в диапазоне.');
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
  doc.rect(40, y - 2, 450, 18).fill('#e8f0e8');
  doc.fillColor('#000000');
  for (let i = 0; i < headers.length; i++) {
    doc
      .font('MealSans-Bold')
      .fontSize(9)
      .text(headers[i], colX[i], y, {
        width: colW[i],
        align: i === 0 ? 'left' : 'center',
        lineBreak: false,
      });
  }
  doc.y = y + 20;
}

function drawRoomHeader(
  doc: PDFKit.PDFDocument,
  colX: number[],
  colW: number[],
  headers: string[],
) {
  const y = doc.y;
  doc.rect(40, y - 2, 480, 16).fill('#e8f0e8');
  doc.fillColor('#000000');
  for (let i = 0; i < headers.length; i++) {
    doc
      .font('MealSans-Bold')
      .fontSize(9)
      .text(headers[i], colX[i], y, {
        width: colW[i],
        align: i === 2 ? 'center' : 'left',
        lineBreak: false,
      });
  }
  doc.y = y + 18;
}
