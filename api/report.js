export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse incoming JSON
    let body = "";
    await new Promise((resolve, reject) => {
      req.on("data", chunk => { body += chunk.toString(); });
      req.on("end", resolve);
      req.on("error", reject);
    });

    let data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: "Invalid JSON format" });
    }

    // Process report (dummy logic)
    const reportId = Date.now();

    return res.status(200).json({
      message: "Report received successfully",
      reportId,
      receivedData: data
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
