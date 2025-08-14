import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase.storage.from("reports").download("reports.xlsx");
    if (error || !data) return res.status(500).json([]);

    const buffer = Buffer.from(await data.arrayBuffer());
    const workbook = XLSX.read(buffer);
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(ws);

    res.status(200).json(jsonData);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
}
