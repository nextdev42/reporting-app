const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Postgres DB using environment variables from Render
const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  port: 5432,
});

// Make sure tables exist (RUNS AUTOMATICALLY AT START)
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      timestamp TEXT,
      username TEXT,
      clinic TEXT,
      title TEXT,
      description TEXT,
      image TEXT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      report_id INTEGER REFERENCES reports(id),
      timestamp TEXT,
      username TEXT,
      clinic TEXT,
      comment TEXT
    );
  `);
  console.log("✅ Database tables ensured");
}
initDB();

// Serve static files and image uploads
app.use(express.static("public"));
app.use("/uploads", express.static("reports/uploads"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer (for file upload)
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// Helper: Tanzania time
function getTanzaniaTimestamp() {
  const now = new Date();
  const tzOffset = 3 * 60;
  const tTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
  return tTime.toLocaleString("sw-TZ", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

// POST /submit  --- add a report
app.post("/submit", upload.single("image"), async (req, res) => {
  const { username, clinic, title, description } = req.body;
  if (!username || !clinic || !title || !description) {
    return res.status(400).send("Jaza sehemu zote muhimu.");
  }

  let imgPath = "";
  if (req.file) {
    const filename = Date.now() + "_" + req.file.originalname;
    const newPath = path.join(uploadDir, filename);
    fs.renameSync(req.file.path, newPath);
    imgPath = "/uploads/" + filename;
  }

  const time = getTanzaniaTimestamp();
  try {
    await pool.query(
      "INSERT INTO reports (timestamp, username, clinic, title, description, image) VALUES ($1,$2,$3,$4,$5,$6)",
      [ time, username, clinic, title, description, imgPath ]
    );
    res.redirect("/report.html");
  } catch(err) {
    console.error(err);
    res.status(500).send("Tatizo kwenye database.");
  }
});

// GET /api/reports  --- fetch with comments
app.get("/api/reports", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM reports ORDER BY id DESC");
    const reports = r.rows;
    const ids = reports.map(x => x.id);
    if (!ids.length) return res.json([]);

    const c = await pool.query(
      "SELECT * FROM comments WHERE report_id = ANY($1::int[]) ORDER BY id ASC", [ids]
    );
    const comments = c.rows;

    reports.forEach(rep => {
      rep.comments = comments.filter(cm => cm.report_id === rep.id);
    });
    res.json(reports);
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: "Tatizo kwenye DB" });
  }
});

// POST /api/comments/:id  --- add comment
app.post("/api/comments/:id", async (req, res) => {
  const report_id = req.params.id;
  const { username, clinic, comment } = req.body;
  if (!username || !clinic || !comment)
    return res.status(400).send("Jaza sehemu zote za maoni.");

  const t = getTanzaniaTimestamp();
  try {
    await pool.query(
      "INSERT INTO comments (report_id, timestamp, username, clinic, comment) VALUES ($1,$2,$3,$4,$5)",
      [ report_id, t, username, clinic, comment ]
    );
    res.send("Maoni yamehifadhiwa");
  } catch(err) {
    res.status(500).send("Tatizo kuingiza maoni");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
