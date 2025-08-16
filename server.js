const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const cloudinary = require("cloudinary").v2;

// Initialize environment configuration
require("dotenv").config();

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT || 5432,
});

// ======================
//  DATABASE INITIALIZATION
// ======================
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        jina TEXT NOT NULL UNIQUE,
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        image TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        comment TEXT NOT NULL
      );
    `);

    await pool.query(`
  CREATE TABLE IF NOT EXISTS reactions (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    type TEXT CHECK(type IN ('up','down')),
    UNIQUE(report_id, user_id)
  );
`);

    console.log("✅ Database initialized");
  } catch (err) {
    console.error("❌ Database initialization failed", err);
    process.exit(1);
  }
}

initDatabase();

// ======================
//  MIDDLEWARE
// ======================
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || "fallback_secret_123",
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, 
    sameSite: 'lax', 
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// File upload handling
const uploadDir = "reports/uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ======================
//  HELPER FUNCTIONS
// ======================
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).redirect("/index.html");
  }
  next();
}

function formatTanzaniaDate(date) {
  return date.toLocaleString("sw-TZ", { 
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Africa/Dar_es_Salaam"
  });
}

// ======================
//  ROUTES
// ======================
// User Registration
app.post("/register", async (req, res) => {
  const { jina, ukoo, namba, kituo, password, confirmPassword } = req.body;
  
  // Validation
  if (!jina || !ukoo || !namba || !kituo || !password || !confirmPassword) {
    return res.status(400).send("Tafadhali jaza sehemu zote.");
  }
  
  if (password !== confirmPassword) {
    return res.status(400).send("Nywila hazifanani.");
  }
  
  try {
    // Check existing user
    const exists = await pool.query(
      "SELECT id FROM users WHERE LOWER(jina) = LOWER($1)", 
      [jina]
    );
    
    if (exists.rows.length > 0) {
      return res.status(400).send("Jina hili limeshasajiriwa.");
    }
    
    // Create new user
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users(jina, ukoo, namba, kituo, password) VALUES($1, $2, $3, $4, $5)",
      [jina, ukoo, namba, kituo, hash]
    );
    
    res.redirect("/index.html");
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send("Tatizo la kumbukumbu");
  }
});

// User Login
app.post("/login", async (req, res) => {
  const { jina, password } = req.body;
  
  if (!jina || !password) {
    return res.status(400).send("Tafadhali jaza jina na nywila.");
  }
  
  try {
    // Find user
    const result = await pool.query(
      "SELECT * FROM users WHERE LOWER(jina) = LOWER($1)", 
      [jina]
    );
    
    const user = result.rows[0];
    if (!user) {
      return res.status(400).send("Jina halijasajiriwa.");
    }
    
    // Verify password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).send("Nywila si sahihi.");
    }
    
    // Create session
    req.session.userId = user.id;
    req.session.jina = user.jina;
    req.session.kituo = user.kituo;
    
    res.redirect("/dashboard.html");
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Tatizo la mfumo");
  }
});

// User Logout
app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Tatizo la kuondoka");
    }
    res.clearCookie("connect.sid");
    res.redirect("/index.html");
  });
});

// Dashboard Access
app.get("/dashboard.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// User Info Endpoint
app.get("/api/user", requireAuth, (req, res) => {
  res.json({
    jina: req.session.jina,
    kituo: req.session.kituo
  });
});

// Report Submission
app.post("/submit", requireAuth, upload.single("image"), async (req, res) => {
  const { title, description } = req.body;
  
  if (!title || !description) {
    return res.status(400).send("Tafadhali jaza jina na maelezo.");
  }
  
  try {
    let imageUrl = "";
    
    // Handle image upload
    if (req.file) {
      try {
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
          folder: "clinic-reports",
          quality: "auto:good"
        });
        imageUrl = uploadResult.secure_url;
        fs.unlinkSync(req.file.path); // Remove local file
      } catch (err) {
        console.error("Cloudinary upload error:", err);
      }
    }
    
    // Create report
    await pool.query(
      `INSERT INTO reports(user_id, title, description, image)
       VALUES($1, $2, $3, $4)`,
      [req.session.userId, title, description, imageUrl]
    );
    
    res.redirect("/dashboard.html");
  } catch (err) {
    console.error("Report submission error:", err);
    res.status(500).send("Tatizo la kutuma ripoti");
  }
});

// Get Reports with Pagination
app.get("/api/reports", requireAuth, async (req, res) => {
  try {
    // Parse parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const { clinic, username, search, startDate, endDate } = req.query;
    
    // Prepare query
    const where = [];
    const params = [];
    let paramIndex = 1;
    
    // Apply filters
    if (clinic) {
      where.push(`u.kituo ILIKE $${paramIndex}`);
      params.push(`%${clinic}%`);
      paramIndex++;
    }
    
    if (username) {
      where.push(`u.jina ILIKE $${paramIndex}`);
      params.push(`%${username}%`);
      paramIndex++;
    }
    
    if (search) {
      where.push(`(
        r.title ILIKE $${paramIndex} OR 
        r.description ILIKE $${paramIndex} OR
        EXISTS (SELECT 1 FROM comments c WHERE c.report_id = r.id AND c.comment ILIKE $${paramIndex})
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (startDate) {
      where.push(`r.created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      where.push(`r.created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }
    
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    
    // Get paginated reports
    const offset = (page - 1) * limit;
    
    const reportsQuery = `
      SELECT r.*, u.jina AS username, u.kituo AS clinic
      FROM reports r
      JOIN users u ON r.user_id = u.id
      ${whereClause}
      ORDER BY r.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const reportsResult = await pool.query(
      reportsQuery,
      [...params, limit, offset]
    );
    
    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM reports r JOIN users u ON r.user_id = u.id ${whereClause}`,
      params
    );
    
    const totalReports = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalReports / limit);
    
    // Process reports
    const reports = reportsResult.rows;
    const reportIds = reports.map(r => r.id);
    
    // Get comments
    let comments = [];
    if (reportIds.length) {
      const commentsResult = await pool.query(
        `SELECT c.*, u.jina AS username, u.kituo AS clinic
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE report_id = ANY($1)`,
        [reportIds]
      );
      comments = commentsResult.rows;
    }
    
    // Get reactions
    let reactions = [];
    if (reportIds.length) {
      const reactionsResult = await pool.query(
        `SELECT report_id,
                COUNT(*) FILTER (WHERE type = 'up') AS thumbs_up,
                COUNT(*) FILTER (WHERE type = 'down') AS thumbs_down
         FROM reactions
         WHERE report_id = ANY($1)
         GROUP BY report_id`,
        [reportIds]
      );
      reactions = reactionsResult.rows;
    }
    
    // Format response
    const formattedReports = reports.map(report => {
      const reportComments = comments.filter(c => c.report_id === report.id);
      const reportReactions = reactions.find(r => r.report_id === report.id);
      
      return {
        ...report,
        timestamp: formatTanzaniaDate(report.created_at),
        comments: reportComments.map(c => ({
          ...c,
          timestamp: formatTanzaniaDate(c.created_at)
        })),
        thumbs_up: reportReactions ? parseInt(reportReactions.thumbs_up) : 0,
        thumbs_down: reportReactions ? parseInt(reportReactions.thumbs_down) : 0
      };
    });
    
    res.json({
      reports: formattedReports,
      page,
      totalPages,
      totalReports,
      hasMore: page < totalPages
    });
    
  } catch (err) {
    console.error("Reports fetch error:", err);
    res.status(500).send("Tatizo la kupata ripoti");
  }
});

// Add Comment
app.post("/api/comments/:id", requireAuth, async (req, res) => {
  const { comment } = req.body;
  const reportId = req.params.id;
  
  if (!comment || !reportId) {
    return res.status(400).send("Tafadhali jaza maoni sahihi.");
  }
  
  try {
    await pool.query(
      `INSERT INTO comments(report_id, user_id, comment)
       VALUES($1, $2, $3)`,
      [reportId, req.session.userId, comment]
    );
    
    res.send("Maoni yamehifadhiwa");
  } catch (err) {
    console.error("Comment submission error:", err);
    res.status(500).send("Tatizo la kuhifadhi maoni");
  }
});

// Handle Reaction
app.post("/api/reports/:id/react", requireAuth, async (req, res) => {
  const { type } = req.body;
  const reportId = req.params.id;
  
  if (!['up', 'down'].includes(type)) {
    return res.status(400).send("Aina batili ya maoni");
  }
  
  try {
    // Upsert reaction
    await pool.query(`
      INSERT INTO reactions (report_id, user_id, type)
      VALUES ($1, $2, $3)
      ON CONFLICT (report_id, user_id)
      DO UPDATE SET type = EXCLUDED.type
    `, [reportId, req.session.userId, type]);
    
    // Get updated counts
    const counts = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE type = 'up') AS thumbs_up,
        COUNT(*) FILTER (WHERE type = 'down') AS thumbs_down
      FROM reactions
      WHERE report_id = $1
    `, [reportId]);
    
    res.json({
      thumbs_up: parseInt(counts.rows[0].thumbs_up),
      thumbs_down: parseInt(counts.rows[0].thumbs_down)
    });
    
  } catch (err) {
    console.error("Reaction error:", err);
    res.status(500).send("Tatizo la kuhifadhi maoni");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
