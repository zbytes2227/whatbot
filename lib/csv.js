// lib/csv.js
// CSV encoding with spreadsheet formula-injection protection.

function escapeCell(value) {
  let str = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function csvRow(cells) {
  return `${cells.map(escapeCell).join(',')}\n`;
}

export function startCsvDownload(res, fileName) {
  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.status(200);
  res.write('﻿'); // BOM so Excel detects UTF-8
}
