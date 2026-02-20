import * as XLSX from "xlsx";

const workbook = XLSX.readFile("staff.xlsx");
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log("Total rows:", data.length);
console.log("\nFirst 3 rows:");
console.log(JSON.stringify(data.slice(0, 3), null, 2));

console.log("\nColumn headers:");
if (data.length > 0) {
  console.log(Object.keys(data[0] as Record<string, unknown>));
}
