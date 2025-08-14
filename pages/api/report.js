import formidable from "formidable";
import fs from "fs";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({});
  const [fields, files] = await form.parse(req);

  const username = fields.username?.[0];
  const clinic = fields.clinic?.[0];
  const title = fields.title?.[0];
  const description = fields.description?.[0];
  const imageFile = files.image?.[0];
  const timestamp = new Date().toISOString();

  // Create Excel file in memory
  let data = [["Username", "Clinic", "Title", "Description", "Timestamp"]];
  const tempFile = "/tmp/reports.xlsx";

  try {
    // Download existing file from Supabase
    const { data: existingFile } = await supabase
      .storage
      .from("clinic-reports")
      .download("reports.xlsx");

    if (existingFile) {
      const buf = Buffer.from(await existingFile.arrayBuffer());
      const workbook = XLSX.read(buf, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    }
  } catch {
    // Ignore if not found
  }

  // Append new row
  data.push([username, clinic, title, description, timestamp]);

  // Write new Excel
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reports");
  XLSX.writeFile(wb, tempFile);

  // Upload Excel
  const { error: uploadError } = await supabase.storage
    .from("clinic-reports")
    .upload("reports.xlsx", fs.createReadStream(tempFile), {
      upsert: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

  if (uploadError) {
    return res.status(500).json({ error: uploadError.message });
  }

  res.status(200).json({ success: true });
}
