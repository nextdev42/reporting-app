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
function auth(req,res,next){ if(!req.session.userId) return res.redirect("/index.html"); next(); }

// ====== Tanzania timestamp helper ======
function getTanzaniaTimestamp(){
  const now = new Date();
  return new Date(now.getTime() + (3*60 + now.getTimezoneOffset())*60000);
}

// ====== Routes ======

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
    }
    catch(err){ console.error("Cloudinary error:",err); }
  }
  await pool.query(
    "INSERT INTO reports(timestamp,user_id,title,description,image) VALUES($1,$2,$3,$4,$5)",
    [getTanzaniaTimestamp(), req.session.userId, title, description, imageUrl]
  );
  res.redirect("/dashboard.html");
});

// Get reports with filtering, search, pagination, comments, reactions
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
    // Date filtering
    if(startDate){ whereClauses.push(`r.timestamp >= $${idx++}`); params.push(new Date(startDate)); }
    if(endDate){ const end = new Date(endDate); end.setHours(23,59,59,999); whereClauses.push(`r.timestamp <= $${idx++}`); params.push(end); }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Total count
    const countRes = await pool.query(`SELECT COUNT(*) FROM reports r JOIN users u ON r.user_id=u.id ${whereSQL}`, params);
    const totalReports = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalReports/limit);
    const offset = (page-1)*limit;

    // Fetch reports
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

    // Fetch comments
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

    // Fetch reactions
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

    // Attach comments, reactions, format timestamp
    reportRes.rows.forEach(r=>{
      r.comments = comments.filter(c=>c.report_id===r.id);
      const react = reactions.find(re=>re.report_id===r.id);
      r.thumbs_up = react ? parseInt(react.thumbs_up) : 0;
      r.thumbs_down = react ? parseInt(react.thumbs_down) : 0;

      // Format timestamp Tanzania
      const tzOffset = 3*60; // UTC+3
      const localTime = new Date(new Date(r.timestamp).getTime() + tzOffset*60*1000);
      r.timestamp = localTime.toLocaleString("sw-TZ", { 
        day:"2-digit", month:"long", year:"numeric",
        hour:"2-digit", minute:"2-digit", second:"2-digit",
        hour12:false
      });
    });

    res.json({ reports: reportRes.rows, page, totalPages, totalReports, limit });
  } catch(err){
    console.error(err);
    res.status(500).send("Tatizo kupata ripoti");
  }
});

// Add comment
app.post("/api/comments/:id", auth, async (req,res)=>{
  const { comment } = req.body;
  if(!comment) return res.status(400).send("Andika maoni.");
  await pool.query(
    "INSERT INTO comments(report_id,user_id,timestamp,comment) VALUES($1,$2,$3,$4)",
    [req.params.id, req.session.userId, getTanzaniaTimestamp(), comment]
  );
  res.send("Maoni yamehifadhiwa");
});

// React to report

// React to report (thumb up / thumb down)
app.post("/api/reports/:id/react", auth, async (req, res) => {
  const { type } = req.body; // 'up' or 'down'
  if (!['up', 'down'].includes(type)) return res.status(400).send("Invalid reaction type.");

  const reportId = req.params.id;
  const userId = req.session.userId;

  try {
    // Insert or update reaction
    await pool.query(`
      INSERT INTO reactions(report_id, user_id, type)
      VALUES ($1, $2, $3)
      ON CONFLICT (report_id, user_id)
      DO UPDATE SET type = EXCLUDED.type
    `, [reportId, userId, type]);

    // Fetch updated reaction counts
    const countsRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE type='up') AS thumbs_up,
        COUNT(*) FILTER (WHERE type='down') AS thumbs_down
      FROM reactions
      WHERE report_id = $1
    `, [reportId]);

    const counts = countsRes.rows[0];
    res.json({
      thumbs_up: parseInt(counts.thumbs_up, 10),
      thumbs_down: parseInt(counts.thumbs_down, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Tatizo kuhifadhi reaction");
  }
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
                                                
