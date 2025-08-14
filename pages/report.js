import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

export default function Report() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    async function fetchReport() {
      const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/clinic-reports/reports.xlsx`;
      const res = await fetch(fileUrl);
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      setRows(data);
    }
    fetchReport();
  }, []);

  if (!rows.length) return <p>Loading...</p>;

  const headers = rows[0];
  const dataRows = rows.slice(1);

  return (
    <div>
      <h1>Clinic Reports</h1>
      <table border="1">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          {dataRows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
              <td>
                <input
                  placeholder="Add comment"
                  onBlur={(e) => alert(`Comment for row ${i + 1}: ${e.target.value}`)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
