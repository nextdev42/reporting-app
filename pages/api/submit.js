import formidable from "formidable";
import fs from "fs-extra";
import path from "path";
import sharp from "sharp";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const form = formidable({ multiples: false });
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).send("Form parse error");

    const { username, clinic, title, description } = fields;
    const imageFile = files.image;

    if (!username || !clinic || !title || !description || !imageFile) {
      return res.status(400).send("Missing required fields");
    }

    // Resize image to reduce storage
    const tmpPath = path.join("/tmp", imageFile.originalFilename);
    await sharp(imageFile.filepath).resize(800, 800, { fit: "inside" }).toFile(tmpPath);

    // Upload to Supabase storage
    const { data, error: uploadError } = await supabase.storage
      .from("reports")
      .upload(`images/${Date.now()}-${imageFile.originalFilename}`, fs.createReadStream(tmpPath), {
        cacheControl: "3600",
        upsert: false,
        contentType: imageFile.mimetype
      });

    if (uploadError) return res.status(500).send("Image upload failed");

    const { publicURL } = supabase.storage.from("reports").getPublicUrl(data.path);

    // Excel file in Supabase bucket or local temp
    const excelLocalPath = path.join("/tmp", "reports.xlsx");
    let workbook;
    if (fs.existsSync(excelLocalPath)) {
      workbook = XLSX.readFile(excelLocalPath);
    } else {
      workbook = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([]);
      XLSX.utils.book_append_sheet(workbook, ws, "Reports");
      XLSX.utils.sheet_add_aoa(ws, [["Username", "Clinic", "Title", "Description", "Image URL"]], { origin: 0 });
    }

    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const row = { Username: username, Clinic: clinic, Title: title, Description: description, "Image URL": publicURL };
    XLSX.utils.sheet_add_json(ws, [row], { skipHeader: true, origin: -1 });
    XLSX.writeFile(workbook, excelLocalPath);

    // Optionally upload Excel to Supabase for persistence
    const excelUpload = await supabase.storage
      .from("reports")
      .upload("reports.xlsx", fs.createReadStream(excelLocalPath), { upsert: true, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    if (excelUpload.error) return res.status(500).send("Excel upload failed");

    res.status(200).send("Report saved successfully!");
  });
}
