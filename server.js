const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "reports/uploads")));

// Ensure folders exist
if (!fs.existsSync("db")) fs.mkdirSync("db");
if (!fs.existsSync("reports/uploads")) fs.mkdirSync("reports/uploads", { recursive: true });

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

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "reports/uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname),
});
const upload = multer({ storage });

// --- Routes ---

// Submit report
app.post("/submit", upload.single("image"), (req, res) => {
  const { username, clinic, title, description } = req.body;
  if (!username || !clinic || !title || !description)
    return res.status(400).send("Tafadhali jaza sehemu zote muhimu.");

  const timestamp = new Date().toLocaleString("sw-TZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });

  let imagePath = req.file ? `/uploads/${req.file.filename}` : "";

  const stmt = db.prepare(
    "INSERT INTO reports (timestamp, username, clinic, title, description, image) VALUES (?, ?, ?, ?, ?, ?)"
  );
  stmt.run(timestamp, username, clinic, title, description, imagePath, function (err) {
    if (err) return res.status(500).send("Tatizo la database: " + err.message);
    res.status(200).send("Ripoti imehifadhiwa kwa mafanikio!");
  });
  stmt.finalize();
});

// Get all reports with comments
app.get("/api/reports", (req, res) => {
  db.all("SELECT * FROM reports ORDER BY id DESC", [], (err, reports) => {
    if (err) return res.status(500).json({ error: err.message });

    // Attach comments to each report
    const promises = reports.map(
      (r) =>
        new Promise((resolve) => {
          db.all("SELECT * FROM comments WHERE report_id=? ORDER BY id ASC", [r.id], (err2, comments) => {
            if (err2) r.comments = [];
            else r.comments = comments;
            resolve(r);
          });
        })
    );

    Promise.all(promises).then((fullReports) => res.json(fullReports));
  });
});

// Add comment
app.post("/api/comments/:reportId", (req, res) => {
  const reportId = req.params.reportId;
  const { username, clinic, comment } = req.body;
  if (!username || !clinic || !comment)
    return res.status(400).send("Tafadhali jaza sehemu zote za maoni.");

  const timestamp = new Date().toLocaleString("sw-TZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });

  const stmt = db.prepare(
    "INSERT INTO comments (report_id, timestamp, username, clinic, comment) VALUES (?, ?, ?, ?, ?)"
  );
  stmt.run(reportId, timestamp, username, clinic, comment, function (err) {
    if (err) return res.status(500).send("Tatizo la database: " + err.message);
    res.status(200).send("Maoni yamehifadhiwa!");
  });
  stmt.finalize();
});

// Start server
app.listen(PORT, () => {
  console.log(`Server inafanya kazi kwenye http://localhost:${PORT}`);
});
