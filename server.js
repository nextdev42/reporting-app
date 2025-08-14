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
const upload = multer({ dest: "reports/uploads/" });

// Ensure db folder exists
if (!fs.existsSync("db")) fs.mkdirSync("db");

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

// Handle report submission
app.post("/submit", upload.single("image"), (req, res) => {
  const { username, clinic, title, description } = req.body;
  const timestamp = new Date().toLocaleString();
  let imagePath = "";

  if (req.file) {
    const targetPath = path.join("reports/uploads", req.file.originalname);
    fs.renameSync(req.file.path, targetPath);
    imagePath = targetPath;
  }

  // Insert into SQLite
  const stmt = db.prepare("INSERT INTO reports (timestamp, username, clinic, title, description, image) VALUES (?, ?, ?, ?, ?, ?)");
  stmt.run(timestamp, username, clinic, title, description, imagePath, (err) => {
    if (err) return res.status(500).send("Database error: " + err.message);
    res.redirect("/report.html");
  });
  stmt.finalize();
});

// API to fetch all reports as JSON (for front-end rendering)
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
