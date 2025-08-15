const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  port: 5432,
});

// Ensure tables exist
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      jina TEXT NOT NULL,
      ukoo TEXT NOT NULL,
      namba TEXT NOT NULL,
      kituo TEXT NOT NULL,
      password TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      timestamp TEXT,
      user_id INTEGER REFERENCES users(id),
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
      user_id INTEGER REFERENCES users(id),
      comment TEXT
    );
  `);
  console.log("✅ Database tables ensured");
}
initDB();

// Middleware
app.use(express.static("public"));
app.use("/uploads", express.static("reports/uploads"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "secretkey123",
  resave: false,
  saveUninitialized: false
}));

// Multer upload setup
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// Helper: Tanzania timestamp
function getTanzaniaTimestamp() {
  const now = new Date();
  const tzOffset = 3 * 60;
  const tTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
  return tTime.toLocaleString("sw-TZ", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
}

// Auth middleware
function auth(req, res, next) {
  if (!req.session.userId) return res.redirect("/index.html");
  next();
}

// -------- User Registration --------
app.post("/register", async (req, res) => {
  const { jina, ukoo, namba, kituo, password, confirmPassword } = req.body;
  if (!jina || !ukoo || !namba || !kituo || !password || !confirmPassword)
    return res.status(400).send("Jaza sehemu zote muhimu.");
  if (password !== confirmPassword)
    return res.status(400).send("Password na confirm password lazima ziwe sawa.");

  const hashed = await bcrypt.hash(password, 10);
  try {
    await pool.query(
      "INSERT INTO users (jina, ukoo, namba, kituo, password) VALUES ($1,$2,$3,$4,$5)",
      [jina, ukoo, namba, kituo, hashed]
    );
    res.redirect("/index.html");
  } catch(err) {
    console.error(err);
    res.status(500).send("Tatizo kwenye database.");
  }
});

// -------- Login --------
app.post("/login", async (req, res) => {
  const { jina, password } = req.body;
  if (!jina || !password) return res.status(400).send("Jaza jina na password.");

  try {
    const r = await pool.query("SELECT * FROM users WHERE jina=$1", [jina]);
    const user = r.rows[0];
    if (!user) return res.status(400).send("Jina halijarejistri.");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).send("Password si sahihi.");

    // Store session info
    req.session.userId = user.id;
    req.session.jina = user.jina;
    req.session.kituo = user.kituo;
    res.redirect("/dashboard.html");
  } catch(err) {
    console.error(err);
    res.status(500).send("Tatizo kwenye DB");
  }
});

// -------- Get Current User Info --------
app.get("/api/user", auth, async (req, res) => {
  res.json({
    jina: req.session.jina,
    kituo: req.session.kituo
  });
});

// -------- Logout --------
app.get("/logout", auth, (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send("Tatizo ku-logout");
    res.redirect("/index.html");
  });
});

// -------- Submit Report --------
app.post("/submit", auth, upload.single("image"), async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) return res.status(400).send("Jaza title na description.");

  const userId = req.session.userId;
  const timestamp = getTanzaniaTimestamp();

  let imgPath = "";
  if (req.file) {
    const filename = Date.now() + "_" + req.file.originalname;
    const newPath = path.join(uploadDir, filename);
    fs.renameSync(req.file.path, newPath);
    imgPath = "/uploads/" + filename;
  }

  try {
    await pool.query(
      "INSERT INTO reports (timestamp, user_id, title, description, image) VALUES ($1,$2,$3,$4,$5)",
      [timestamp, userId, title, description, imgPath]
    );
    res.redirect("/dashboard.html");
  } catch(err) {
    console.error(err);
    res.status(500).send("Tatizo kwenye database.");
  }
});

// -------- Fetch Reports + Comments --------
app.get("/api/reports", auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT r.*, u.jina AS username, u.kituo AS clinic 
      FROM reports r 
      JOIN users u ON r.user_id=u.id 
      ORDER BY r.id DESC
    `);
    const reports = r.rows;
    const ids = reports.map(x => x.id);
    if (!ids.length) return res.json([]);

    const c = await pool.query(`
      SELECT c.*, u.jina AS username, u.kituo AS clinic
      FROM comments c 
      JOIN users u ON c.user_id=u.id 
      WHERE report_id = ANY($1::int[]) 
      ORDER BY c.id ASC
    `, [ids]);

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

// -------- Add Comment --------
app.post("/api/comments/:id", auth, async (req, res) => {
  const reportId = req.params.id;
  const { comment } = req.body;
  if (!comment) return res.status(400).send("Andika maoni.");

  const userId = req.session.userId;
  const timestamp = getTanzaniaTimestamp();

  try {
    await pool.query(
      "INSERT INTO comments (report_id, timestamp, user_id, comment) VALUES ($1,$2,$3,$4)",
      [reportId, timestamp, userId, comment]
    );
    res.send("Maoni yamehifadhiwa");
  } catch(err) {
    console.error(err);
    res.status(500).send("Tatizo kuingiza maoni");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
