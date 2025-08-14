import formidable from "formidable";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Disable Next.js body parsing
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = new formidable.IncomingForm();
  form.keepExtensions = true;

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: "Form parse error" });

    try {
      const { username, clinic, title, description } = fields;
      if (!username || !clinic || !title || !description) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const imageFile = files.image;
      let imageUrl = "";

      // --- Handle image upload in memory ---
      if (imageFile) {
        const buffer = await imageFile[0]?.toBuffer?.() || require('fs').readFileSync(imageFile.filepath);
        const imagePath = `images/${Date.now()}-${imageFile.originalFilename}`;

        const { data: imgData, error: uploadErr } = await supabase.storage
          .from("clinic-reports")
          .upload(imagePath, buffer, { upsert: true, contentType: imageFile.mimetype });

        if (uploadErr) throw uploadErr;

        imageUrl = supabase.storage.from("clinic-reports").getPublicUrl(imgData.path).publicURL;
      }

      // --- Handle Excel in memory ---
      let workbook;
      try {
        const { data, error } = await supabase.storage
          .from("clinic-reports")
          .download("reports.xlsx");

        if (error) throw error;

        const arrayBuffer = await data.arrayBuffer();
        workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });

      } catch {
        // First-time creation
        workbook = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([["Username","Clinic","Title","Description","Timestamp","Image URL"]]);
        XLSX.utils.book_append_sheet(workbook, ws, "Reports");
      }

      const ws = workbook.Sheets[workbook.SheetNames[0]];

      // --- Add new row ---
      const timestamp = new Date().toISOString();
      XLSX.utils.sheet_add_json(ws, [{
        Username: username,
        Clinic: clinic,
        Title: title,
        Description: description,
        Timestamp: timestamp,
        "Image URL": imageUrl
      }], { skipHeader: true, origin: -1 });

      // --- Write Excel to buffer and upload ---
      const excelBuffer = XLSX.write(workbook, { type: "buffer" });
      const { error: excelUploadErr } = await supabase.storage
        .from("clinic-reports")
        .upload("reports.xlsx", excelBuffer, {
          upsert: true,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });

      if (excelUploadErr) throw excelUploadErr;

      return res.status(200).json({ message: "Report saved successfully!" });

    } catch (error) {
      console.error("API Error:", error);
      return res.status(500).json({ error: error.message || "Server error occurred" });
    }
  });
}
