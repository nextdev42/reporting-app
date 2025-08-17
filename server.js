// server.js
const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
// Set views folder and EJS engine
app.set("views", path.join(__dirname, "views")); // folder where your .ejs files are
app.set("view engine", "ejs");
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  port: 5432,
});

// ====== Ensure tables exist ======
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
      timestamp TIMESTAMPTZ DEFAULT now(),
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
      timestamp TIMESTAMPTZ DEFAULT now(),
      comment TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reactions (
      id SERIAL PRIMARY KEY,
      report_id INTEGER REFERENCES reports(id),
      user_id INTEGER REFERENCES users(id),
      type TEXT CHECK(type IN ('up','down')),
      UNIQUE(report_id, user_id)
    );
  `);

  console.log("✅ Tables ensured");
}
initTables();

// ====== Middleware ======
app.use(express.static("public"));
app.use("/uploads", express.static("reports/uploads"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: "supersecret123!",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000, sameSite: 'lax', httpOnly:true }
}));

// Multer setup
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// ====== Auth helper ======
function auth(req,res,next){ if(!req.session.userId) return res.redirect("/"); next(); }

// ====== Tanzania timestamp helper ======
function getTanzaniaTimestamp(){
  const now = new Date();
  const tzOffsetMinutes = 3 * 60; // UTC+3
  return new Date(now.getTime() + (tzOffsetMinutes - now.getTimezoneOffset())*60000);
}

// Format timestamp for display
function formatTanzaniaTime(date) {
  const ts = new Date(date);
  return !isNaN(ts) 
    ? ts.toLocaleString("sw-TZ", {
        day:"2-digit", month:"long", year:"numeric",
        hour:"2-digit", minute:"2-digit", second:"2-digit",
        hour12:false
      })
    : "Haijulikani";
}

// ====== Routes ======
// Redirect logged-in users away from public login/register pages
app.get("/", (req,res)=>{
  if(req.session.userId){
    return res.redirect("/dashboard.html");
  }
  return res.sendFile(path.join(__dirname,"public","index.html"));
});

app.get("/login", (req,res)=>{
  if(req.session.userId){
    return res.redirect("/dashboard.html");
  }
  return res.sendFile(path.join(__dirname,"public","index.html"));
});

app.get("/register", (req,res)=>{
  if(req.session.userId){
    return res.redirect("/dashboard.html");
  }
  return res.sendFile(path.join(__dirname,"public","index.html"));
});
// Register
app.post("/register", async (req,res)=>{
  const { jina, ukoo, namba, kituo, password, confirmPassword } = req.body;
  if(!jina||!ukoo||!namba||!kituo||!password||!confirmPassword) return res.status(400).send("Jaza sehemu zote muhimu.");
  if(password !== confirmPassword) return res.status(400).send("Password hazifanani.");
  const exists = await pool.query("SELECT * FROM users WHERE LOWER(jina) = LOWER($1)",[jina]);
  if(exists.rows.length>0) return res.status(400).send("Jina tayari limechukuliwa.");
  const hash = await bcrypt.hash(password,10);
  await pool.query("INSERT INTO users(jina,ukoo,namba,kituo,password) VALUES($1,$2,$3,$4,$5)",[jina,ukoo,namba,kituo,hash]);
  res.redirect("/index.html");
});

// Login
app.post("/login", async (req,res)=>{
  const { jina, password } = req.body;
  if(!jina||!password) return res.status(400).send("Jaza jina na password.");
  const r = await pool.query("SELECT * FROM users WHERE LOWER(jina)=LOWER($1)",[jina]);
  const user = r.rows[0];
  if(!user) return res.status(400).send("Jina halijarejistri.");
  const ok = await bcrypt.compare(password,user.password);
  if(!ok) return res.status(400).send("Password si sahihi.");
  req.session.userId = user.id;
  req.session.jina = user.jina;
  req.session.kituo = user.kituo;
  res.redirect("/dashboard.html");
});

// Dashboard
app.get("/dashboard.html", auth, (req,res)=>res.sendFile(path.join(__dirname,"public","dashboard.html")));

// Logout
app.get("/logout", (req,res)=>{ 
  req.session.destroy(err=>{ 
    if(err) return res.status(500).send("Tatizo ku-logout"); 
    res.clearCookie("connect.sid"); 
    res.redirect("/index.html"); 
  }); 
});

// User info
app.get("/api/user", auth, (req,res)=>res.json({jina:req.session.jina, kituo:req.session.kituo}));


// List of all users for mention dropdown
app.get("/api/users", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT DISTINCT LOWER(jina) AS jina FROM users ORDER BY LOWER(jina) ASC");
    
    // Capitalize first letter (optional)
    const users = r.rows.map(u => u.jina.charAt(0).toUpperCase() + u.jina.slice(1));
    
    res.json(users);
  } catch (err) {
    console.error("Error fetching users", err);
    res.status(500).send("Server error");
  }
});

// Route to show all reports of a specific user
// Route to show all reports of a specific user

app.get("/user/:username", auth, async (req, res) => {
  const username = req.params.username;

  try {
    const userReports = await pool.query(
      `SELECT r.*, u.jina AS username, u.kituo AS clinic
       FROM reports r
       JOIN users u ON r.user_id = u.id
       WHERE TRIM(LOWER(u.jina)) LIKE TRIM(LOWER($1)) || '%'
       ORDER BY r.timestamp DESC`,
      [username]
    );

    const reportIds = userReports.rows.map(r => r.id);
    let comments = [];
    if (reportIds.length) {
      const commentRes = await pool.query(
        `SELECT c.*, u.jina AS username, u.kituo AS clinic
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE report_id = ANY($1::int[])
         ORDER BY c.id DESC`,
        [reportIds]
      );
      comments = commentRes.rows;
    }

    userReports.rows.forEach(r => {
      r.comments = comments
        .filter(c => c.report_id === r.id)
        .map(c => ({ ...c, timestamp: formatTanzaniaTime(c.timestamp) }));
      r.timestamp = formatTanzaniaTime(r.timestamp);
    });

    console.log("Found:", userReports.rows.length)  // <-- optional debug
    res.render("user-reports", { username, reports: userReports.rows });

  } catch (err) {
    console.error(err);
    res.status(500).send("Kuna tatizo kwenye seva");
  }
});
// ====== Submit report ======

app.post("/submit", auth, upload.single("image"), async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) return res.status(400).json({ error: "Jaza title na description." });

  let imageUrl = "";
  if (req.file) {
    try {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: "clinic-reports" });
      imageUrl = uploadResult.secure_url;
    } catch (err) {
      console.error("Cloudinary error:", err);
    }
  }

  try {
    const result = await pool.query(
      "INSERT INTO reports(timestamp, user_id, title, description, image) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [getTanzaniaTimestamp(), req.session.userId, title, description, imageUrl]
    );

    const report = result.rows[0];

    // Add username, clinic, thumbs, comments
    report.username = req.session.jina;
    report.clinic = req.session.kituo;
    report.thumbs_up = 0;
    report.thumbs_down = 0;
    report.comments = [];
    report.timestamp = formatTanzaniaTime(report.timestamp);

    res.json(report); // <-- return JSON instead of redirect
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Tatizo ku-hifadhi ripoti" });
  }
});

  

// ====== Get reports ======
app.get("/api/reports", auth, async (req,res)=>{
  try {
    let { page=1, limit=15, clinic, username, search, startDate, endDate } = req.query;
    page = parseInt(page); limit = parseInt(limit);
    if(page<1) page=1;

    let whereClauses=[]; let params=[]; let idx=1;

    if(clinic){ whereClauses.push(`u.kituo ILIKE $${idx++}`); params.push(`%${clinic}%`); }
    if(username){ whereClauses.push(`u.jina ILIKE $${idx++}`); params.push(`%${username}%`); }
    if(search){ 
      whereClauses.push(`(
        r.title ILIKE $${idx} OR 
        r.description ILIKE $${idx} OR
        EXISTS (SELECT 1 FROM comments c WHERE c.report_id=r.id AND c.comment ILIKE $${idx})
      )`);
      params.push(`%${search}%`); idx++;
    }
    if(startDate){ whereClauses.push(`r.timestamp >= $${idx++}`); params.push(new Date(startDate)); }
    if(endDate){ const end = new Date(endDate); end.setHours(23,59,59,999); whereClauses.push(`r.timestamp <= $${idx++}`); params.push(end); }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countRes = await pool.query(`SELECT COUNT(*) FROM reports r JOIN users u ON r.user_id=u.id ${whereSQL}`, params);
    const totalReports = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalReports/limit);
    const offset = (page - 1) * limit;

    const reportRes = await pool.query(
      `SELECT r.*, u.jina AS username, u.kituo AS clinic
       FROM reports r
       JOIN users u ON r.user_id=u.id
       ${whereSQL}
       ORDER BY r.id DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );

    const reportIds = reportRes.rows.map(r=>r.id);

    let comments = [];
    if(reportIds.length){
      const commentRes = await pool.query(
        `SELECT c.*, u.jina AS username, u.kituo AS clinic
         FROM comments c
         JOIN users u ON c.user_id=u.id
         WHERE report_id = ANY($1::int[])
         ORDER BY c.id DESC`,
        [reportIds]
      );
      comments = commentRes.rows;
    }

    let reactions = [];
    if(reportIds.length){
      const reactRes = await pool.query(
        `SELECT report_id,
                COUNT(*) FILTER (WHERE type='up') AS thumbs_up,
                COUNT(*) FILTER (WHERE type='down') AS thumbs_down
         FROM reactions
         WHERE report_id = ANY($1::int[])
         GROUP BY report_id`,
        [reportIds]
      );
      reactions = reactRes.rows;
    }

    reportRes.rows.forEach(r=>{
      r.comments = comments
        .filter(c=>c.report_id===r.id)
        .map(c=>({...c, timestamp: formatTanzaniaTime(c.timestamp)}));

      const react = reactions.find(re=>re.report_id===r.id);
      r.thumbs_up = react ? parseInt(react.thumbs_up) : 0;
      r.thumbs_down = react ? parseInt(react.thumbs_down) : 0;

      r.timestamp = formatTanzaniaTime(r.timestamp);
    });

    res.json({ reports: reportRes.rows, page, totalPages, totalReports, limit });
  } catch(err){
    console.error(err);
    res.status(500).send("Tatizo kupata ripoti");
  }
});

// ====== Add comment ======
// ====== Add comment ======
app.post("/api/comments/:id", auth, async (req,res)=>{
  const { comment } = req.body;
  if(!comment) return res.status(400).json({ error: "Andika maoni." });

  try {
    // Insert comment
    const result = await pool.query(
      "INSERT INTO comments(report_id,user_id,timestamp,comment) VALUES($1,$2,$3,$4) RETURNING *",
      [req.params.id, req.session.userId, getTanzaniaTimestamp(), comment]
    );

    const newComment = result.rows[0];

    // Add username, clinic, formatted timestamp
    newComment.username = req.session.jina;
    newComment.clinic = req.session.kituo;
    newComment.timestamp = formatTanzaniaTime(newComment.timestamp);

    res.json(newComment); // <-- frontend can now render immediately
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Tatizo ku-hifadhi comment" });
  }
});


// ====== React to report (with validation) ======
app.post("/api/reactions/:reportId", auth, async (req, res) => {
  const { reportId } = req.params;
  const { type } = req.body;
  const userId = req.session.userId;

  if (!["up","down"].includes(type)) return res.status(400).send("Invalid reaction type.");

  try {
    const reportRes = await pool.query("SELECT user_id FROM reports WHERE id=$1", [reportId]);
    if (!reportRes.rows.length) return res.status(404).send("Ripoti haipo.");

    const authorId = reportRes.rows[0].user_id;
    if (authorId === userId) return res.status(403).send("Huwezi kutoa thumbs kwenye ripoti yako.");

    const existing = await pool.query(
      "SELECT * FROM reactions WHERE report_id=$1 AND user_id=$2",
      [reportId, userId]
    );
    if (existing.rows.length) return res.status(400).send("Umesha toa thumbs kwenye ripoti hii.");

    await pool.query(
      "INSERT INTO reactions(report_id, user_id, type) VALUES($1,$2,$3)",
      [reportId, userId, type]
    );

    const thumbs = await pool.query(
      `SELECT
         SUM(CASE WHEN type='up' THEN 1 ELSE 0 END) AS thumbs_up,
         SUM(CASE WHEN type='down' THEN 1 ELSE 0 END) AS thumbs_down
       FROM reactions WHERE report_id=$1`,
      [reportId]
    );

    res.json({ 
      thumbs_up: parseInt(thumbs.rows[0].thumbs_up) || 0, 
      thumbs_down: parseInt(thumbs.rows[0].thumbs_down) || 0 
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Tatizo ku-react");
  }
});

// ====== Start server ======
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
