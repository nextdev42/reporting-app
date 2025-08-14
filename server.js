const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload folder
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

// Ensure db folder exists
if (!fs.existsSync("db")) fs.mkdirSync("db");

// Connect to SQLite
const db = new sqlite3.Database("./db/reports.db");

// Create tables if not exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      username TEXT,
      clinic TEXT,
      title TEXT,
      description TEXT,
      image TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      timestamp TEXT,
      username TEXT,
      clinic TEXT,
      comment TEXT,
      FOREIGN KEY(report_id) REFERENCES reports(id)
    )
  `);
});

// Helper function for Tanzania timestamp
function getTanzaniaTimestamp() {
  const now = new Date();
  const tzOffset = 3 * 60; // UTC+3 in minutes
  const tanzaniaTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
  const options = {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  return tanzaniaTime.toLocaleString('sw-TZ', options);
}

// Handle report submission
app.post("/submit", upload.single("image"), (req, res) => {
  const { username, clinic, title, description } = req.body;
  if (!username || !clinic || !title || !description)
    return res.status(400).send("Jaza sehemu zote muhimu.");

  let imagePath = "";
  if (req.file) {
    const targetPath = path.join(uploadDir, req.file.originalname);
    fs.renameSync(req.file.path, targetPath);
    imagePath = targetPath;
  }

  const timestamp = getTanzaniaTimestamp();

  const stmt = db.prepare(
    "INSERT INTO reports (timestamp, username, clinic, title, description, image) VALUES (?, ?, ?, ?, ?, ?)"
  );
  stmt.run(timestamp, username, clinic, title, description, imagePath, (err) => {
    if (err) return res.status(500).send("Tatizo kwenye database: " + err.message);
    res.redirect("/report.html");
  });
  stmt.finalize();
});

// API to fetch all reports with comments
app.get("/api/reports", (req, res) => {
  db.all("SELECT * FROM reports ORDER BY id DESC", (err, reports) => {
    if (err) return res.status(500).json({ error: err.message });

    const reportIds = reports.map(r => r.id);
    if (reportIds.length === 0) return res.json([]);

    db.all(
      `SELECT * FROM comments WHERE report_id IN (${reportIds.join(",")}) ORDER BY id ASC`,
      (err2, comments) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Attach comments to each report
        reports.forEach(r => {
          r.comments = comments.filter(c => c.report_id === r.id);
        });

        res.json(reports);
      }
    );
  });
});

// API to add comment to a report
app.post("/api/comments/:reportId", (req, res) => {
  const reportId = req.params.reportId;
  const { username, clinic, comment } = req.body;
  if (!username || !clinic || !comment)
    return res.status(400).send("Jaza sehemu zote za maoni.");

  const timestamp = getTanzaniaTimestamp();
  const stmt = db.prepare(
    "INSERT INTO comments (report_id, timestamp, username, clinic, comment) VALUES (?, ?, ?, ?, ?)"
  );
  stmt.run(reportId, timestamp, username, clinic, comment, (err) => {
    if (err) return res.status(500).send("Tatizo kuingiza maoni: " + err.message);
    res.send("Maoni yamehifadhiwa");
  });
  stmt.finalize();
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
