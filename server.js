const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure required folders exist
if (!fs.existsSync("reports")) fs.mkdirSync("reports");
if (!fs.existsSync("reports/uploads")) fs.mkdirSync("reports/uploads");
if (!fs.existsSync("db")) fs.mkdirSync("db");

// Serve static files
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "reports/uploads"),
  filename: (req, file, cb) => {
    // Prevent overwriting by adding timestamp
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Connect to SQLite
const db = new sqlite3.Database("./db/reports.db");

// Create table if not exists
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

// Serve uploaded images publicly
app.use("/reports/uploads", express.static(path.join(__dirname, "reports/uploads")));

// Handle report submission
app.post("/submit", upload.single("image"), (req, res) => {
  const { username, clinic, title, description } = req.body;
  if (!username || !clinic || !title || !description) {
    return res.status(400).send("Tafadhali jaza sehemu zote muhimu.");
  }

  const timestamp = new Date().toLocaleString();
  const imagePath = req.file ? `/reports/uploads/${req.file.filename}` : "";

  const stmt = db.prepare(`
    INSERT INTO reports (timestamp, username, clinic, title, description, image)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(timestamp, username, clinic, title, description, imagePath, (err) => {
    if (err) return res.status(500).send("Database error: " + err.message);
    res.redirect("/report.html");
  });
  stmt.finalize();
});

// API to fetch all reports as JSON
app.get("/api/reports", (req, res) => {
  db.all("SELECT * FROM reports ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
