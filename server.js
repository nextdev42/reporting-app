const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure folders exist
if (!fs.existsSync("reports")) fs.mkdirSync("reports");
if (!fs.existsSync("reports/uploads")) fs.mkdirSync("reports/uploads");
if (!fs.existsSync("db")) fs.mkdirSync("db");

// Serve static files and uploads
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/reports/uploads", express.static(path.join(__dirname, "reports/uploads")));

// Upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "reports/uploads"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Connect to SQLite
const db = new sqlite3.Database("./db/reports.db");

// Create tables
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
      username TEXT,
      clinic TEXT,
      comment TEXT,
      timestamp TEXT,
      FOREIGN KEY(report_id) REFERENCES reports(id)
    )
  `);
});

// Submit a report
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
  stmt.run(timestamp, username, clinic, title, description, imagePath, function(err) {
    if (err) return res.status(500).send("Database error: " + err.message);
    res.redirect("/report.html");
  });
  stmt.finalize();
});

// Submit a comment
app.post("/comment", (req, res) => {
  const { report_id, username, clinic, comment } = req.body;
  if (!report_id || !username || !clinic || !comment) {
    return res.status(400).send("Tafadhali jaza maoni yote.");
  }

  const timestamp = new Date().toLocaleString();
  const stmt = db.prepare(`
    INSERT INTO comments (report_id, username, clinic, comment, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(report_id, username, clinic, comment, timestamp, function(err) {
    if (err) return res.status(500).send("Database error: " + err.message);
    res.json({ message: "Maoni yamehifadhiwa!" });
  });
  stmt.finalize();
});

// Get all reports with comments
app.get("/api/reports", (req, res) => {
  db.all("SELECT * FROM reports ORDER BY id DESC", (err, reports) => {
    if (err) return res.status(500).json({ error: err.message });

    // Fetch comments for each report
    const promises = reports.map(r => new Promise((resolve, reject) => {
      db.all("SELECT * FROM comments WHERE report_id = ? ORDER BY id ASC", [r.id], (err2, comments) => {
        if (err2) return reject(err2);
        r.comments = comments;
        resolve(r);
      });
    }));

    Promise.all(promises)
      .then(data => res.json(data))
      .catch(e => res.status(500).json({ error: e.message }));
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

