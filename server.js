const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

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
      display_name TEXT NOT NULL,
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
  cookie: { maxAge: 24*60*60*1000, sameSite:'lax', httpOnly:true }
}));

// Multer for file uploads
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// Helper: authentication middleware
function auth(req, res, next) {
  if (!req.session.userId) return res.redirect("/index.html");
  next();
}

// Helper: Tanzania timestamp
function tTime() {
  const now = new Date();
  return new Date(now.getTime() + (3*60 + now.getTimezoneOffset())*60000)
    .toLocaleString("sw-TZ", {
      day:"2-digit", month:"long", year:"numeric",
      hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
    });
}

// ================= Routes ==================

// Register a user
app.post("/register", async (req, res) => {
  const { jina, ukoo, namba, kituo, password, confirmPassword } = req.body;
  if (!jina || !ukoo || !namba || !kituo || !password || !confirmPassword)
    return res.status(400).send("Jaza sehemu zote muhimu.");
  if (password !== confirmPassword)
    return res.status(400).send("Password hazifanani.");

  const hash = await bcrypt.hash(password, 10);
  try {
    // store lowercase for login checks, original for display
    await pool.query(
      `INSERT INTO users(jina, display_name, ukoo, namba, kituo, password)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [jina.toLowerCase(), jina, ukoo, namba, kituo, hash]
    );
    res.redirect("/index.html");
  } catch(err) {
    console.error(err);
    res.status(500).send("Tatizo kwenye database.");
  }
});

// Login user (case-insensitive)
app.post("/login", async (req, res) => {
  const { jina, password } = req.body;
  if (!jina || !password) return res.status(400).send("Jaza jina na password.");

  try {
    const r = await pool.query("SELECT * FROM users WHERE jina=$1", [jina.toLowerCase()]);
    const user = r.rows[0];
    if (!user) return res.status(400).send("Jina halijarejistri.");

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).send("Password si sahihi.");

    // store display_name in session for greeting
    req.session.userId = user.id;
    req.session.jina = user.display_name;
    req.session.kituo = user.kituo;
    res.redirect("/dashboard.html");
  } catch(err) {
    console.error(err);
    res.status(500).send("Tatizo kwenye DB");
  }
});

// Dashboard
app.get("/dashboard.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname,"public","dashboard.html"));
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send("Tatizo ku-logout");
    res.clearCookie("connect.sid");
    res.redirect("/index.html");
  });
});

// Get current user info (for greeting)
app.get("/api/user", auth, (req, res) => {
  res.json({ jina: req.session.jina, kituo: req.session.kituo });
});

// Submit a report
app.post("/submit", auth, upload.single("image"), async (req,res) => {
  const { title, description } = req.body;
  if (!title || !description) return res.status(400).send("Jaza title na description.");
  let imgPath = "";
  if (req.file) {
    const nm = Date.now() + "_" + req.file.originalname;
    fs.renameSync(req.file.path, path.join(uploadDir, nm));
    imgPath = "/uploads/" + nm;
  }
  await pool.query(
    `INSERT INTO reports(timestamp, user_id, title, description, image)
     VALUES($1,$2,$3,$4,$5)`,
    [tTime(), req.session.userId, title, description, imgPath]
  );
  res.redirect("/dashboard.html");
});

// Get reports with comments
app.get("/api/reports", auth, async (req,res) => {
  const rr = await pool.query(`
    SELECT r.*, u.display_name AS username, u.kituo AS clinic
    FROM reports r JOIN users u ON r.user_id=u.id
    ORDER BY r.id DESC
  `);
  const ids = rr.rows.map(r => r.id);
  if (!ids.length) return res.json([]);

  const cc = await pool.query(`
    SELECT c.*, u.display_name AS username, u.kituo AS clinic
    FROM comments c JOIN users u ON c.user_id=u.id
    WHERE report_id = ANY($1::int[])
    ORDER BY c.id DESC
  `, [ids]);

  rr.rows.forEach(rp => {
    rp.comments = cc.rows.filter(c => c.report_id === rp.id);
  });
  res.json(rr.rows);
});

// Add a comment
app.post("/api/comments/:id", auth, async (req,res) => {
  const { comment } = req.body;
  if (!comment) return res.status(400).send("Andika maoni.");

  await pool.query(
    `INSERT INTO comments(report_id, user_id, timestamp, comment)
     VALUES($1,$2,$3,$4)`,
    [req.params.id, req.session.userId, tTime(), comment]
  );
  res.send("Maoni yamehifadhiwa");
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
