export const config = { api: { bodyParser: false } };
export const runtime = "nodejs"; // ✅ Force Node.js runtime

import formidable from "formidable";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: "Form parse error" });

    const { username, clinic, title, description } = fields;
    const imageFile = files.image;

    if (!username || !clinic || !title || !description) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Temporary Excel path
      const tmpExcel = path.join("/tmp", "reports.xlsx");
      let workbook;

      // Try downloading existing Excel
      try {
        const { data, error: downloadError } = await supabase.storage
          .from("clinic-reports")
          .download("reports.xlsx");

        if (downloadError) throw downloadError;

        const buffer = Buffer.from(await data.arrayBuffer());
        workbook = XLSX.read(buffer, { type: "buffer" });
      } catch {
        // Create new workbook if none exists
        workbook = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([
          ["Username","Clinic","Title","Description","Timestamp","Image URL"]
        ]);
        XLSX.utils.book_append_sheet(workbook, ws, "Reports");
      }

      const ws = workbook.Sheets[workbook.SheetNames[0]];

      // Upload image to Supabase storage
      let imageUrl = "";
      if (imageFile) {
        const imagePath = `images/${Date.now()}-${imageFile.originalFilename}`;
        const { data: imgData, error: uploadErr } = await supabase.storage
          .from("clinic-reports")
          .upload(imagePath, fs.createReadStream(imageFile.filepath), {
            upsert: true,
            contentType: imageFile.mimetype
          });

        if (uploadErr) throw uploadErr;

        const { publicURL } = supabase.storage
          .from("clinic-reports")
          .getPublicUrl(imgData.path);
        imageUrl = publicURL;
      }

      // Append new row with timestamp
      const timestamp = new Date().toISOString();
      XLSX.utils.sheet_add_json(ws, [{
        Username: username,
        Clinic: clinic,
        Title: title,
        Description: description,
        Timestamp: timestamp,
        "Image URL": imageUrl
      }], { skipHeader: true, origin: -1 });

      // Write temp Excel
      XLSX.writeFile(workbook, tmpExcel);

      // Upload Excel to Supabase
      const { error: excelUploadErr } = await supabase.storage
        .from("clinic-reports")
        .upload("reports.xlsx", fs.createReadStream(tmpExcel), {
          upsert: true,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });

      if (excelUploadErr) throw excelUploadErr;

      res.status(200).json({ success: true, message: "Report saved successfully!" });
    } catch (uploadError) {
      console.error("Upload Error:", uploadError);
      res.status(500).json({ error: uploadError.message || "Unknown upload error" });
    }
  });
}
