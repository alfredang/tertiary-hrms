import ExcelJS from "exceljs";

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile("staff.xlsx");
const worksheet = workbook.worksheets[0];

const headers: Record<number, string> = {};
worksheet.getRow(1).eachCell((cell, col) => {
  headers[col] = String(cell.value ?? "").trim();
});

const data: Record<string, unknown>[] = [];
worksheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const obj: Record<string, unknown> = {};
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    if (headers[col]) obj[headers[col]] = cell.text || cell.value;
  });
  data.push(obj);
});

console.log("Total rows:", data.length);
console.log("\nFirst 3 rows:");
console.log(JSON.stringify(data.slice(0, 3), null, 2));

console.log("\nColumn headers:");
if (data.length > 0) {
  console.log(Object.keys(data[0] as Record<string, unknown>));
}
