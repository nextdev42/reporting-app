const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
// ADD THIS WITH YOUR OTHER REQUIREs:
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
async function initTables() {
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
    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR(255) PRIMARY KEY NOT NULL,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL
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
      user_id INTEGER REFERENCES users(id),
      timestamp TEXT,
      comment TEXT
    );
  `);

  console.log("✅ Tables ensured");
}
initTables();

// Middleware
app.use(express.static("public"));
app.use("/uploads", express.static("reports/uploads"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: "supersecret123!",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: true
  }
}));

// Multer setup
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// Helpers
function auth(req, res, next) {
  if (!req.session.userId) return res.redirect("/index.html");
  next();
}

function getTanzaniaTimestamp() {
  const now = new Date();
  return new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000)
    .toLocaleString("sw-TZ", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
}

// ========== Routes ==========

// Register (case-insensitive username check)
app.post("/register", async (req, res) => {
  const { jina, ukoo, namba, kituo, password, confirmPassword } = req.body;
  if (!jina || !ukoo || !namba || !kituo || !password || !confirmPassword)
    return res.status(400).send("Jaza sehemu zote muhimu.");
  if (password !== confirmPassword)
    return res.status(400).send("Password hazifanani.");

  // Ensure username not already taken (case-insensitive)
  const exists = await pool.query(
    "SELECT * FROM users WHERE LOWER(jina) = LOWER($1)", [jina]
  );
  if (exists.rows.length > 0) return res.status(400).send("Jina tayari limechukuliwa.");

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users(jina,ukoo,namba,kituo,password) VALUES($1,$2,$3,$4,$5)",
    [jina, ukoo, namba, kituo, hash]
  );
  res.redirect("/index.html");
});

// Login (case-insensitive)
app.post("/login", async (req, res) => {
  const { jina, password } = req.body;
  if (!jina || !password) return res.status(400).send("Jaza jina na password.");

  const r = await pool.query(
    "SELECT * FROM users WHERE LOWER(jina) = LOWER($1)", [jina]
  );
  const user = r.rows[0];
  if (!user) return res.status(400).send("Jina halijarejistri.");

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).send("Password si sahihi.");

  req.session.userId = user.id;
  req.session.jina = user.jina;   // preserve original case for greeting
  req.session.kituo = user.kituo;
  res.redirect("/dashboard.html");
});

// Dashboard
app.get("/dashboard.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send("Tatizo ku-logout");
    res.clearCookie("connect.sid");
    res.redirect("/index.html");
  });
});

// User info for greeting
app.get("/api/user", auth, (req, res) => {
  res.json({ jina: req.session.jina, kituo: req.session.kituo });
});

// Submit report (cloudinary upload)
app.post("/submit", auth, upload.single("image"), async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) return res.status(400).send("Jaza title na description.");

  let imageUrl = "";
  if (req.file) {
    try {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "clinic-reports"
      });
      imageUrl = uploadResult.secure_url;   // permanent CDN url
    } catch (err) {
      console.error("Cloudinary error:", err);
    }
  }

  await pool.query(
    "INSERT INTO reports(timestamp,user_id,title,description,image) VALUES($1,$2,$3,$4,$5)",
    [getTanzaniaTimestamp(), req.session.userId, title, description, imageUrl]
  );
  res.redirect("/dashboard.html");
});

// Get all reports with comments
app.get("/api/reports", auth, async (req, res) => {
  const rr = await pool.query(`
     SELECT r.*, u.jina AS username, u.kituo AS clinic
     FROM reports r
     JOIN users u ON r.user_id = u.id
     ORDER BY r.id DESC
  `);

  const ids = rr.rows.map(r => r.id);
  if (!ids.length) return res.json([]);

  const cc = await pool.query(`
     SELECT c.*, u.jina AS username, u.kituo AS clinic
     FROM comments c
     JOIN users u ON c.user_id=u.id
     WHERE report_id = ANY($1::int[])
     ORDER BY c.id DESC
  `, [ids]);

  rr.rows.forEach(rp => {
    rp.comments = cc.rows.filter(c => c.report_id === rp.id);
  });

  res.json(rr.rows);
});

// Add comment
app.post("/api/comments/:id", auth, async (req, res) => {
  const { comment } = req.body;
  if (!comment) return res.status(400).send("Andika maoni.");

  await pool.query(`
    INSERT INTO comments(report_id, user_id, timestamp, comment)
    VALUES($1,$2,$3,$4)
  `, [req.params.id, req.session.userId, getTanzaniaTimestamp(), comment]);

  res.send("Maoni yamehifadhiwa");
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
