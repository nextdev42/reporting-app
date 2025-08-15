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

// Multer setup
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// Auth middleware
function auth(req, res, next) {
  if (!req.session.userId) return res.redirect("/index.html");
  next();
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

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
