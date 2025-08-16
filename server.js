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
async function initTables(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      jina TEXT NOT NULL,
      ukoo TEXT NOT NULL,
      namba TEXT NOT NULL,
      kituo TEXT NOT NULL,
      password TEXT NOT NULL
    );`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR(255) PRIMARY KEY NOT NULL,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL
    );`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT NOW(),
      user_id INTEGER REFERENCES users(id),
      title TEXT,
      description TEXT,
      image TEXT
    );`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      report_id INTEGER REFERENCES reports(id),
      user_id INTEGER REFERENCES users(id),
      timestamp TIMESTAMP DEFAULT NOW(),
      comment TEXT
    );`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      report_id INTEGER REFERENCES reports(id),
      user_id INTEGER REFERENCES users(id),
      vote SMALLINT CHECK (vote IN (1, -1)),
      UNIQUE(report_id, user_id)
    );`);

  console.log("✅ All tables ensured");
}

initTables().then(() => {
  app.listen(PORT, ()=>console.log(`🚀 Server running on port ${PORT}`));
});

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
  cookie: { maxAge: 24*60*60*1000, sameSite: 'lax', httpOnly:true }
}));

// Multer setup
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// Auth helper
function auth(req,res,next){ 
  if(!req.session.userId) return res.redirect("/index.html"); 
  next(); 
}

// ========== Routes ==========

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

// Submit report
app.post("/submit", auth, upload.single("image"), async (req,res)=>{
  const { title, description } = req.body;
  if(!title||!description) return res.status(400).send("Jaza title na description.");
  let imageUrl="";
  if(req.file){
    try{ 
      const uploadResult = await cloudinary.uploader.upload(req.file.path,{folder:"clinic-reports"});
      imageUrl=uploadResult.secure_url; 
    } catch(err){ console.error("Cloudinary error:",err); }
  }
  await pool.query(
    "INSERT INTO reports(timestamp,user_id,title,description,image) VALUES(NOW(),$1,$2,$3,$4)",
    [req.session.userId,title,description,imageUrl]
  );
  res.redirect("/dashboard.html");
});

// Get all reports (dashboard) with votes and pagination
app.get("/api/reports", auth, async (req, res) => {
  try {
    let { page = 1, limit = 10, clinic = "", username = "", search = "" } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    // Build dynamic WHERE conditions
    const conditions = [];
    const params = [];
    let idx = 1;

    if (clinic) {
      conditions.push(`LOWER(u.kituo) = LOWER($${idx++})`);
      params.push(clinic);
    }

    if (username) {
      conditions.push(`LOWER(u.jina) LIKE LOWER($${idx++})`);
      params.push(`%${username}%`);
    }

    if (search) {
      conditions.push(`(LOWER(r.title) LIKE LOWER($${idx++}) OR LOWER(r.description) LIKE LOWER($${idx++}))`);
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSQL = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total matching reports
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM reports r JOIN users u ON r.user_id=u.id ${whereSQL}`,
      params
    );
    const totalReports = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalReports / limit);

    // Fetch reports with votes
    const rr = await pool.query(`
      SELECT r.*, u.jina AS username, u.kituo AS clinic,
        COALESCE((SELECT SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END) FROM votes v WHERE v.report_id=r.id),0) AS thumbs_up,
        COALESCE((SELECT SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END) FROM votes v WHERE v.report_id=r.id),0) AS thumbs_down
      FROM reports r
      JOIN users u ON r.user_id=u.id
      ${whereSQL}
      ORDER BY r.id DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, [...params, limit, offset]);

    // Fetch comments for these reports
    const reportIds = rr.rows.map(r => r.id);
    let comments = [];
    if (reportIds.length) {
      const ccRes = await pool.query(`
        SELECT c.*, u.jina AS username, u.kituo AS clinic
        FROM comments c JOIN users u ON c.user_id=u.id
        WHERE report_id = ANY($1::int[])
        ORDER BY c.id DESC
      `, [reportIds]);
      comments = ccRes.rows;
    }

    rr.rows.forEach(rp => {
      rp.comments = comments.filter(c => c.report_id === rp.id);
    });

    res.json({
      reports: rr.rows,
      page,
      totalPages,
      totalReports
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Tatizo kupata ripoti");
  }
});

// Thumbs up / down
app.post("/api/vote/:id", auth, async (req,res)=>{
  const { vote } = req.body; // vote = 1 or -1
  if(![1,-1].includes(parseInt(vote))) return res.status(400).send("Invalid vote");
  try{
    await pool.query(`
      INSERT INTO votes(report_id,user_id,vote)
      VALUES($1,$2,$3)
      ON CONFLICT(report_id,user_id) DO UPDATE SET vote=EXCLUDED.vote
    `,[req.params.id,req.session.userId,vote]);
    res.send("Vote saved");
  } catch(err){ console.error(err); res.status(500).send("Tatizo ku-save vote"); }
});

// Get all reports by a specific user (user page, no votes)
app.get("/api/user/:username/reports", auth, async (req,res)=>{
  try{
    const { username } = req.params;
    const rr = await pool.query(`
      SELECT r.*, u.jina AS username, u.kituo AS clinic
      FROM reports r
      JOIN users u ON r.user_id=u.id
      WHERE LOWER(u.jina)=LOWER($1)
      ORDER BY r.id DESC
    `,[username]);
    res.json(rr.rows);
  } catch(err){ console.error(err); res.status(500).send("Tatizo kupata ripoti za mtumiaji huyo"); }
});


// Get reports by logged-in user with optional date filtering and pagination
app.get("/api/user/reports", auth, async (req, res) => {
  try {
    let { page = 1, limit = 10, start, end } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    let where = [`r.user_id = $1`];
    let params = [req.session.userId];
    let idx = 2;

    if (start) {
      where.push(`r.timestamp >= $${idx++}`);
      params.push(start);
    }
    if (end) {
      where.push(`r.timestamp <= $${idx++}`);
      params.push(end);
    }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Count total reports
    const countRes = await pool.query(`SELECT COUNT(*) FROM reports r ${whereSQL}`, params);
    const totalReports = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalReports / limit);
    const offset = (page - 1) * limit;

    // Fetch reports with comments
    const rr = await pool.query(`
      SELECT r.* 
      FROM reports r
      ${whereSQL}
      ORDER BY r.id DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, [...params, limit, offset]);

    const reportIds = rr.rows.map(r => r.id);
    let comments = [];
    if (reportIds.length) {
      const ccRes = await pool.query(`
        SELECT c.*, u.jina AS username, u.kituo AS clinic
        FROM comments c JOIN users u ON c.user_id=u.id
        WHERE report_id = ANY($1::int[])
        ORDER BY c.id DESC
      `, [reportIds]);
      comments = ccRes.rows;
    }

    rr.rows.forEach(rp => {
      rp.comments = comments.filter(c => c.report_id === rp.id);
    });

    res.json({ reports: rr.rows, page, totalPages, totalReports });
  } catch (err) {
    console.error(err);
    res.status(500).send("Tatizo kupata ripoti zako");
  }
});
// Add comment
app.post("/api/comments/:id", auth, async (req,res)=>{
  const { comment } = req.body;
  if(!comment) return res.status(400).send("Andika maoni.");
  await pool.query(
    "INSERT INTO comments(report_id,user_id,timestamp,comment) VALUES($1,$2,NOW(),$3)",
    [req.params.id,req.session.userId,comment]
  );
  res.send("Maoni yamehifadhiwa");
});
