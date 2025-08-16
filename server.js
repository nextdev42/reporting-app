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

// Connect PG
const pool = new Pool({
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  port: 5432,
});

// Ensure tables
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
      timestamp TEXT,
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
      timestamp TEXT,
      comment TEXT
    );`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      report_id INTEGER REFERENCES reports(id),
      user_id INTEGER REFERENCES users(id),
      vote SMALLINT CHECK (vote IN (1, -1))
    );`);

  await pool.query(`
    ALTER TABLE votes
    ADD CONSTRAINT IF NOT EXISTS unique_user_vote UNIQUE(report_id, user_id);
  `);

  console.log("✅ All tables ensured");
}
initTables();

// Middleware
app.use(express.static("public"));
app.use("/uploads", express.static("reports/uploads"));
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
  store: new pgSession({ pool, tableName:'session' }),
  secret: "supersecret123!",
  resave:false,
  saveUninitialized:false,
  cookie:{ maxAge:24*60*60*1000, sameSite:'lax', httpOnly:true }
}));

// multer
const uploadDir = "reports/uploads";
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir,{recursive:true});
const upload = multer({dest:uploadDir});

// auth helper
function auth(req,res,next){
  if(!req.session.userId) return res.redirect("/index.html");
  next();
}

// time helper
function getTzTime(){
  const now=new Date();
  return new Date(now.getTime()+(3*60+now.getTimezoneOffset())*60000)
    .toLocaleString("sw-TZ",{day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
}

// Routes

app.post("/register", async(req,res)=>{
  const {jina,ukoo,namba,kituo,password,confirmPassword}=req.body;
  if(!jina||!ukoo||!namba||!kituo||!password||!confirmPassword) return res.status(400).send("Jaza yote.");
  if(password!==confirmPassword) return res.status(400).send("Password hazifanani.");
  const ex = await pool.query("SELECT 1 FROM users WHERE LOWER(jina)=LOWER($1)",[jina]);
  if(ex.rows.length) return res.status(400).send("Jina limechukuliwa.");
  const hash=await bcrypt.hash(password,10);
  await pool.query("INSERT INTO users(jina,ukoo,namba,kituo,password) VALUES($1,$2,$3,$4,$5)",[jina,ukoo,namba,kituo,hash]);
  res.redirect("/index.html");
});

app.post("/login", async(req,res)=>{
  const {jina,password}=req.body;
  if(!jina||!password) return res.status(400).send("Jaza jina na password.");
  const r = await pool.query("SELECT * FROM users WHERE LOWER(jina)=LOWER($1)",[jina]);
  const user=r.rows[0];
  if(!user) return res.status(400).send("Jina halipo.");
  const ok=await bcrypt.compare(password,user.password);
  if(!ok) return res.status(400).send("Password si sahihi.");
  req.session.userId=user.id;
  req.session.jina=user.jina;
  req.session.kituo=user.kituo;
  res.redirect("/dashboard.html");
});

app.get("/dashboard.html",auth,(req,res)=>res.sendFile(path.join(__dirname,"public","dashboard.html")));

app.get("/logout",(req,res)=>{
  req.session.destroy(err=>{
    if(err) return res.status(500).send("Tatizo ku-logout");
    res.clearCookie("connect.sid");
    res.redirect("/index.html");
  });
});

app.get("/api/user",auth,(req,res)=>res.json({jina:req.session.jina,kituo:req.session.kituo}));

// Upload report
app.post("/submit",auth,upload.single("image"),async(req,res)=>{
  const {title,description}=req.body;
  if(!title||!description) return res.status(400).send("Jaza title/maelezo.");
  let imageUrl="";
  if(req.file){
    try{
      const up=await cloudinary.uploader.upload(req.file.path,{folder:"clinic-reports"});
      imageUrl=up.secure_url;
    }catch(e){console.error("Cloudinary",e);}
  }
  await pool.query("INSERT INTO reports(timestamp,user_id,title,description,image) VALUES($1,$2,$3,$4,$5)",[getTzTime(),req.session.userId,title,description,imageUrl]);
  res.redirect("/dashboard.html");
});

// list reports
app.get("/api/reports",auth,async(req,res)=>{
  try{
    let {page=1,limit=15,clinic,username,search}=req.query;
    page=parseInt(page); limit=parseInt(limit);
    let where=[]; let params=[]; let i=1;

    if(clinic){ where.push(`u.kituo ILIKE $${i++}`); params.push(`%${clinic}%`); }
    if(username){ where.push(`u.jina ILIKE $${i++}`); params.push(`%${username}%`); }
    if(search){
      where.push(`(
        r.title ILIKE $${i} OR 
        r.description ILIKE $${i} OR
        EXISTS(SELECT 1 FROM comments c WHERE c.report_id=r.id AND c.comment ILIKE $${i})
      )`);
      params.push(`%${search}%`); i++;
    }
    const whereSQL = where.length? `WHERE ${where.join(" AND ")}` : "";

    const ct = await pool.query(`SELECT COUNT(*) FROM reports r JOIN users u ON r.user_id=u.id ${whereSQL}`,params);
    const total=parseInt(ct.rows[0].count);
    const totalPages=Math.ceil(total/limit);
    const offset=(page-1)*limit;

    const rr = await pool.query(`
      SELECT r.*,u.jina AS username,u.kituo AS clinic,
             (SELECT COALESCE(SUM(vote=1::int),0) FROM votes WHERE report_id=r.id) AS thumbs_up,
             (SELECT COALESCE(SUM(vote=-1::int),0) FROM votes WHERE report_id=r.id) AS thumbs_down
      FROM reports r JOIN users u ON r.user_id=u.id
      ${whereSQL} ORDER BY r.id DESC
      LIMIT $${i++} OFFSET $${i}`,
     [...params,limit,offset]);

    const ids = rr.rows.map(x=>x.id);
    let cc=[];
    if(ids.length){
      const cRes = await pool.query(`
        SELECT c.*,u.jina AS username,u.kituo AS clinic
        FROM comments c JOIN users u ON c.user_id=u.id
        WHERE report_id = ANY($1::int[])
        ORDER BY c.id DESC`,[ids]);
      cc=cRes.rows;
    }
    rr.rows.forEach(r=>r.comments=cc.filter(c=>c.report_id===r.id));

    res.json({reports:rr.rows,page,totalPages,total});
  }catch(e){console.error(e);res.status(500).send("Tatizo kupata ripoti")}
});

// Vote endpoint
app.post("/api/vote/:id",auth,async(req,res)=>{
  const {vote}=req.body; // +1 or -1
  const reportId=req.params.id;
  try{
    await pool.query(`
      INSERT INTO votes(report_id,user_id,vote)
      VALUES($1,$2,$3)
      ON CONFLICT (report_id,user_id)
      DO UPDATE SET vote=$3
    `,[reportId,req.session.userId,vote]);
    res.send("Ok");
  }catch(e){console.error(e);res.status(500).send("Tatizo kupiga kura")}
});

// My reports
app.get("/api/user/reports",auth,async(req,res)=>{
  try{
    const {start,end} = req.query;
    let where=["r.user_id=$1"]; let params=[req.session.userId]; let idx=2;
    if(start){ where.push(`r.timestamp >= $${idx++}`); params.push(start); }
    if(end){ where.push(`r.timestamp <= $${idx++}`); params.push(end); }
    const rr = await pool.query(`
      SELECT r.*,
             (SELECT SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END) FROM votes WHERE report_id=r.id) AS thumbs_up,
             (SELECT SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END) FROM votes WHERE report_id=r.id) AS thumbs_down
      FROM reports r WHERE ${where.join(" AND ")}
      ORDER BY r.id DESC`,params);
    res.json(rr.rows);
  }catch(err){console.error(err);res.status(500).send("Tatizo kupata ripoti zako")}
});

app.listen(PORT,()=>console.log(`🚀 Server running on port ${PORT}`));
