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

  // 👇 Ensure username column is present and unique
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
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
  CREATE TABLE IF NOT EXISTS mentions (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_read BOOLEAN DEFAULT false
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


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: "supersecret123!",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000, sameSite: 'lax', httpOnly:true }
}));
app.use(express.static("public"));
app.use("/uploads", express.static("reports/uploads"));

// Multer setup
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// ====== Auth helper ======
function auth(req,res,next){ if(!req.session.userId) return res.redirect("/"); next(); }

// Redirect logged-in users to their profile page
// Redirect logged-in users to their profile
// Middleware to redirect logged-in users to their profile
const redirectToProfile = async (req, res, next) => {
  if (req.session?.userId) {
    try {
      const result = await pool.query("SELECT username FROM users WHERE id=$1", [req.session.userId]);
      if (result.rows.length && result.rows[0].username) {
        return res.redirect(`/user/${encodeURIComponent(result.rows[0].username)}`);
      } else {
        // Invalid session? Destroy it
        req.session.destroy(() => res.redirect("/index.html"));
        return;
      }
    } catch (err) {
      console.error("Error fetching username for redirect:", err);
      req.session.destroy(() => res.redirect("/index.html"));
      return;
    }
  }
  next();
};

// Apply to public routes

// Apply to public routes
app.get("/", redirectToProfile, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/index.html", redirectToProfile, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/login", redirectToProfile, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/register", redirectToProfile, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
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
// Redirect logged-in users away from public pages




// Register
// Register
app.post("/register", async (req,res)=>{
  const { jina, ukoo, namba, kituo, password, confirmPassword } = req.body;
  if(!jina||!ukoo||!namba||!kituo||!password||!confirmPassword) return res.status(400).send("Jaza sehemu zote muhimu.");
  if(password !== confirmPassword) return res.status(400).send("Password hazifanani.");

  // generate username e.g. johndoe
  const rawUsername = (jina + ukoo).replace(/\s+/g,'').toLowerCase();

  // check uniqueness
  const exists = await pool.query("SELECT * FROM users WHERE username=$1",[rawUsername]);
  if(exists.rows.length>0) return res.status(400).send("Username tayari limechukuliwa, tumia jina tofauti.");

  const hash = await bcrypt.hash(password,10);

  await pool.query(
    "INSERT INTO users(jina,ukoo,namba,kituo,username,password) VALUES($1,$2,$3,$4,$5,$6)",
    [jina,ukoo,namba,kituo,rawUsername,hash]
  );
  res.redirect("/index.html");
});

// Login
// Login
app.post("/login", async (req,res)=>{
  const { username, password } = req.body; // changed!

  if(!username||!password) return res.status(400).send("Jaza username na password.");
  const r = await pool.query("SELECT * FROM users WHERE username=$1",[username.toLowerCase()]);
  const user = r.rows[0];
  if(!user) return res.status(400).send("User hajapatikana.");
  const ok = await bcrypt.compare(password,user.password);
  if(!ok) return res.status(400).send("Password si sahihi.");

  // Save to session
  req.session.userId = user.id;
  req.session.username = user.username;  // <--- username in session
  req.session.jina = user.jina;
  req.session.kituo = user.kituo;

  res.redirect(`/user/${user.username}`);
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
  const result = await pool.query("SELECT username FROM users ORDER BY username ASC");
  res.json(result.rows.map(u=>u.username)); // return just the lowercase username
});

// Route to show all reports of a specific user
// Route to show all reports of a specific user



// Route to render user page
// Route to render user page with reports, comments, and mentions
app.get("/user/:username", auth, async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();

    // Get user info
    const userRes = await pool.query("SELECT id, kituo FROM users WHERE username=$1", [username]);
    if (!userRes.rows.length) return res.status(404).send("User not found");
    const userId = userRes.rows[0].id;
    const clinic = userRes.rows[0].kituo;

    // Fetch user reports with thumbs
    const reportsRes = await pool.query(
      `SELECT r.*, 
              COALESCE(ru.thumbs_up,0) AS thumbs_up,
              COALESCE(ru.thumbs_down,0) AS thumbs_down
       FROM reports r
       LEFT JOIN (
         SELECT report_id,
                SUM(CASE WHEN type='up' THEN 1 ELSE 0 END) AS thumbs_up,
                SUM(CASE WHEN type='down' THEN 1 ELSE 0 END) AS thumbs_down
         FROM reactions
         GROUP BY report_id
       ) ru ON ru.report_id = r.id
       WHERE r.user_id=$1
       ORDER BY r.id DESC`,
      [userId]
    );

    const reports = [];
    for (let r of reportsRes.rows) {
      // Fetch comments for each report
      const commentsRes = await pool.query(
        `SELECT c.comment, c.timestamp, u.username
         FROM comments c
         JOIN users u ON c.user_id=u.id
         WHERE c.report_id=$1
         ORDER BY c.id ASC`,
        [r.id]
      );

      reports.push({
        ...r,
        timestamp: formatTanzaniaTime(r.timestamp),
        comments: commentsRes.rows.map(c => ({
          ...c,
          timestamp: formatTanzaniaTime(c.timestamp)
        }))
      });
    }

    // Fetch unread mentions for this user
    // Fetch unread mentions for this user
const mentionsRes = await pool.query(
  `SELECT m.id, m.report_id, m.comment_id, m.created_at,
          c.comment,
          u.username AS from_user,      -- who wrote the comment
          ru.username AS report_user    -- owner of the report
   FROM mentions m
   JOIN comments c ON m.comment_id = c.id
   JOIN users u ON c.user_id = u.id
   JOIN reports r ON m.report_id = r.id
   JOIN users ru ON r.user_id = ru.id
   WHERE m.mentioned_user_id = $1 AND m.is_read = false
   ORDER BY m.created_at DESC`,
  [userId]
);
const mentions = mentionsRes.rows;
    res.render("user-reports", {
      username,
      loggedInUser: req.session.username,
      clinic,
      reports,
      mentions,
      formatTanzaniaTime
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Tatizo kuonyesha ripoti za mtumiaji");
  }
});
    
    
// ====== Submit report ======



    // ====== Submit report ======
app.post("/submit", auth, upload.single("image"), async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) 
    return res.status(400).json({ error: "Jaza title na description." });

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
      `INSERT INTO reports(timestamp, user_id, title, description, image) 
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [getTanzaniaTimestamp(), req.session.userId, title, description, imageUrl]
    );

    const report = result.rows[0];

    // Attach extra fields for frontend
    report.username = req.session.username;
    report.clinic = req.session.kituo;  // use `kituo` as clinic
    report.thumbs_up = 0;
    report.thumbs_down = 0;
    report.comments = [];
    report.timestamp = formatTanzaniaTime(report.timestamp);

    res.json(report);  // frontend receives JSON and can render immediately
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Tatizo ku-hifadhi ripoti" });
  }
});

  

// ====== Get reports ======

// GET /api/reports?username=...

app.get("/api/reports", auth, async (req, res) => {
  try {
    const username = (req.query.username || "").toLowerCase();
    let query = `
      SELECT 
        r.id, r.timestamp, r.title, r.description, r.image, r.user_id, 
        u.username, u.kituo AS clinic,
        COALESCE(ru.thumbs_up, 0) AS thumbs_up,
        COALESCE(ru.thumbs_down, 0) AS thumbs_down,
        ru.user_thumb
      FROM reports r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN (
        SELECT report_id,
               SUM(CASE WHEN type='up' THEN 1 ELSE 0 END) AS thumbs_up,
               SUM(CASE WHEN type='down' THEN 1 ELSE 0 END) AS thumbs_down,
               MAX(CASE WHEN user_id=$1 THEN type END) AS user_thumb
        FROM reactions
        GROUP BY report_id
      ) ru ON ru.report_id = r.id
    `;

    const params = [req.session.userId]; // correct session variable
    if (username) {
      query += ` WHERE u.username = $2`;
      params.push(username);
    }

    query += ` ORDER BY r.id DESC`;

    const { rows: reports } = await pool.query(query, params);

    // Attach comments
    for (let r of reports) {
      const { rows: comments } = await pool.query(
        `SELECT c.comment, c.timestamp, u.username 
         FROM comments c 
         JOIN users u ON c.user_id = u.id 
         WHERE c.report_id = $1
         ORDER BY c.id ASC`,
        [r.id]
      );
      r.comments = comments.map(c => ({
        ...c,
        timestamp: formatTanzaniaTime(c.timestamp)
      }));
    }

    res.json({ reports });
  } catch (err) {
    console.error(err);
    res.status(500).send("Hitilafu katika kupakia ripoti");
  }
});
    
    
  app.get("/api/mentions", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id, m.report_id, m.comment_id, m.created_at,
             c.comment,
             r.title,
             u.username AS comment_user,   -- who wrote the comment
             ru.username AS report_user    -- who owns the report
      FROM mentions m
      JOIN comments c ON m.comment_id = c.id
      JOIN reports r ON m.report_id = r.id
      JOIN users u ON c.user_id = u.id
      JOIN users ru ON r.user_id = ru.id   -- 🔹 join to get report owner
      WHERE m.mentioned_user_id = $1 AND m.is_read = false
      ORDER BY m.created_at DESC
    `, [req.session.userId]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Tatizo ku-fetch mentions");
  }
});

app.get("/reports/:id", auth, async (req, res) => {
  try {
    const reportId = req.params.id;

    // Fetch the report
    const reportRes = await pool.query(
      `SELECT r.*, u.username AS report_user
       FROM reports r
       JOIN users u ON r.user_id=u.id
       WHERE r.id=$1`, [reportId]
    );

    if (!reportRes.rows.length) return res.status(404).send("Ripoti haipo");

    const r = reportRes.rows[0];

    // Fetch comments for this report
    const commentsRes = await pool.query(
      `SELECT c.*, u.username
       FROM comments c
       JOIN users u ON c.user_id=u.id
       WHERE c.report_id=$1
       ORDER BY c.id ASC`, [reportId]
    );

    const report = {
      ...r,
      comments: commentsRes.rows.map(c => ({
        ...c,
        timestamp: formatTanzaniaTime(c.timestamp)
      }))
    };

    res.render("user-reports", {
      username: r.report_user,
      loggedInUser: req.session.username,
      clinic: null,   // optional
      reports: [report], // only this report
      mentions: []     // optional
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Tatizo kuonyesha ripoti");
  }
});

app.post("/api/mentions/:id/read", auth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE mentions SET is_read = true WHERE id=$1 AND mentioned_user_id=$2",
      [req.params.id, req.session.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Tatizo ku-update mention");
  }
});

app.get("/reports/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the report
    const { rows } = await pool.query(
      `SELECT reports.*, users.username, users.kituo 
       FROM reports 
       JOIN users ON reports.user_id = users.id 
       WHERE reports.id = $1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).send("Report not found");
    }

    const report = rows[0];

    // Also fetch comments for this report
    const comments = await pool.query(
      `SELECT comments.*, users.username, users.kituo 
       FROM comments 
       JOIN users ON comments.user_id = users.id 
       WHERE comments.report_id = $1
       ORDER BY comments.timestamp ASC`,
      [id]
    );

    res.render("report-view", { report, comments: comments.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error loading report");
  }
});

// ====== Add comment ======
// ====== Add comment ======
app.post("/api/comments/:id", auth, async (req,res)=>{
  const { comment } = req.body;
  if (!comment) return res.status(400).json({ error: "Andika maoni." });

  try {
    // Insert comment
    const result = await pool.query(
      "INSERT INTO comments(report_id,user_id,timestamp,comment) VALUES($1,$2,$3,$4) RETURNING *",
      [req.params.id, req.session.userId, getTanzaniaTimestamp(), comment]
    );

    const newComment = result.rows[0];

    // Add username, clinic, formatted timestamp
    newComment.username = req.session.username;
    newComment.clinic = req.session.kituo;
    newComment.timestamp = formatTanzaniaTime(newComment.timestamp);

    // 🔹 Handle mentions here
    const mentionMatches = comment.match(/@(\w+)/g) || [];
    for (let mention of mentionMatches) {
      const username = mention.slice(1).toLowerCase();
      const { rows } = await pool.query(
        "SELECT id FROM users WHERE LOWER(username)=$1",
        [username]
      );
      if (rows.length) {
        await pool.query(
          "INSERT INTO mentions(report_id, comment_id, mentioned_user_id) VALUES($1,$2,$3)",
          [req.params.id, newComment.id, rows[0].id]
        );
      }
    }

    res.json(newComment); // send to frontend

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Tatizo ku-hifadhi comment" });
  }
});

app.get("/fix-usernames", async (req, res) => {
  try {
    // Generate new usernames for users missing them
    const result = await pool.query(`
      WITH base AS (
        SELECT 
          id,
          LOWER(REPLACE(jina || ukoo, ' ', '')) AS base_username
        FROM users
        WHERE username IS NULL OR username = ''
      ),
      numbered AS (
        SELECT 
          id,
          base_username,
          ROW_NUMBER() OVER (PARTITION BY base_username ORDER BY id) AS rn
        FROM base
      ),
      unique_usernames AS (
        SELECT 
          id,
          CASE 
            WHEN rn = 1 THEN base_username
            ELSE base_username || rn
          END AS new_username
        FROM numbered
      )
      UPDATE users u
      SET username = uu.new_username
      FROM unique_usernames uu
      WHERE u.id = uu.id
      RETURNING u.id, u.jina, u.ukoo, u.username AS old_username, uu.new_username;
    `);

    res.json({
      message: "✅ Usernames updated successfully!",
      updated: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to update usernames");
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
