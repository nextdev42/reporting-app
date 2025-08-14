import formidable from "formidable";
import fs from "fs";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = new formidable.IncomingForm();
  
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: "Form parse error" });

    try {
      // Validate required fields
      const required = ["username", "clinic", "title", "description"];
      const missing = required.filter(field => !fields[field]);
      if (missing.length) {
        return res.status(400).json({ 
          error: `Missing fields: ${missing.join(", ")}` 
        });
      }
      const { username, clinic, title, description } = fields;

      // Handle image upload
      let imageUrl = "";
      const imageFile = files.image;
      
      if (imageFile && imageFile.size > 0) {
        try {
          const buffer = fs.readFileSync(imageFile.filepath);
          const imagePath = `images/${Date.now()}-${imageFile.originalFilename}`;

          const { data, error } = await supabase.storage
            .from("clinic-reports")
            .upload(imagePath, buffer, {
              contentType: imageFile.mimetype,
              upsert: true
            });

          if (error) throw error;

          // Get public URL
          const { data: urlData } = supabase.storage
            .from("clinic-reports")
            .getPublicUrl(data.path);
            
          imageUrl = urlData.publicUrl;
        } catch (uploadError) {
          console.error("Image upload failed:", uploadError);
          return res.status(500).json({ error: "Image upload failed" });
        }
      }

      // Handle Excel with retry logic
      const excelFilename = "reports.xlsx";
      let workbook;
      let retries = 3;
      
      while (retries > 0) {
        try {
          // Try to download existing file
          const { data, error } = await supabase.storage
            .from("clinic-reports")
            .download(excelFilename);

          if (error && error.statusCode !== 404) throw error;
          
          if (data) {
            const buffer = Buffer.from(await data.arrayBuffer());
            workbook = XLSX.read(buffer, { type: "buffer" });
          } else {
            // Create new workbook if none exists
            workbook = XLSX.utils.book_new();
            const headers = [["Username", "Clinic", "Title", "Description", "Timestamp", "Image URL"]];
            const ws = XLSX.utils.aoa_to_sheet(headers);
            XLSX.utils.book_append_sheet(workbook, ws, "Reports");
          }
          
          // Add new entry
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          const newRow = {
            Username: username,
            Clinic: clinic,
            Title: title,
            Description: description,
            Timestamp: new Date().toISOString(),
            "Image URL": imageUrl
          };

          XLSX.utils.sheet_add_json(ws, [newRow], {
            skipHeader: true,
            origin: -1
          });

          // Upload updated Excel
          const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
          
          const { error: uploadError } = await supabase.storage
            .from("clinic-reports")
            .upload(excelFilename, excelBuffer, {
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              upsert: true,
              cacheControl: "no-cache"
            });

          if (uploadError) throw uploadError;
          
          // Success - break retry loop
          break;
        } catch (e) {
          retries--;
          if (retries === 0) {
            console.error("Excel operation failed after retries:", e);
            return res.status(500).json({ error: "Failed to update reports database" });
          }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      return res.status(200).json({ 
        message: "Report saved successfully!",
        excelFile: excelFilename
      });

    } catch (error) {
      console.error("API execution error:", error);
      return res.status(500).json({ 
        error: error.message || "Server processing error" 
      });
    }
  });
}
