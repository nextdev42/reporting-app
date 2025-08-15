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

  console.log("✅ Database ready");
}
initDB();

// Middleware
app.use(express.static("public"));
app.use("/uploads", express.static("reports/uploads"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session',
  }),
  secret: "supersecret123!",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    sameSite: 'lax',
    httpOnly: true,
  }
}));

// Multer setup for file uploads
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// Auth middleware
function auth(req, res, next) {
  if (!req.session.userId) return res.redirect("/index.html");
  next();
}

// Timestamp helper
function getTanzaniaTimestamp() {
  const now = new Date();
  const tzOffset = 3 * 60; // UTC+3
  const tTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
  return tTime.toLocaleString("sw-TZ", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
}

// -------- Routes --------

// Login
app.post("/login", async (req, res) => {
  const { jina, password } = req.body;
  if (!jina || !password) return res.status(400).send("Jaza jina na password.");

  try {
    const result = await pool.query("SELECT * FROM users WHERE jina=$1", [jina]);
    const user = result.rows[0];
    if (!user) return res.status(400).send("Jina halijarejistri.");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).send("Password si sahihi.");

    // Save user info in session
    req.session.userId = user.id;
    req.session.jina = user.jina;
    req.session.kituo = user.kituo;

    res.redirect("/dashboard.html");
  } catch(err) {
    console.error(err);
    res.status(500).send("Tatizo kwenye DB");
  }
});

// Register
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

// Dashboard protected
app.get("/dashboard.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send("Tatizo ku-logout");
    res.clearCookie("connect.sid"); // default cookie name
    res.redirect("/index.html");
  });
});

// Get current user info
app.get("/api/user", auth, (req, res) => {
  res.json({ jina: req.session.jina, kituo: req.session.kituo });
});

// Submit report route
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

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
