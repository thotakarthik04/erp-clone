require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

const dynamo = require("./dynamo");
const {
  ScanCommand
} = require("@aws-sdk/lib-dynamodb");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "db.json");

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Serve frontend
app.use(express.static(path.join(__dirname, "..", "src")));

// -----------------------------------
// DynamoDB Helper
// -----------------------------------

async function getStudent() {
  try {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: "Students",
        Limit: 1
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0];
  } catch (err) {
    console.error("DynamoDB Error:", err);
    return null;
  }
}

// -----------------------------------
// Local DB Helpers (legacy)
// -----------------------------------

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function writeDB(data) {
  fs.writeFileSync(
    DB_PATH,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

// -----------------------------------
// API Routes
// -----------------------------------

// Profile
app.get("/api/profile", async (req, res) => {
  const student = await getStudent();

  res.json(student?.profile || {});
});

// Stats
app.get("/api/stats", async (req, res) => {
  const student = await getStudent();

  res.json(student?.stats || {});
});

// Drives
app.get("/api/drives", async (req, res) => {
  const student = await getStudent();

  res.json(student?.drives || {});
});

// Courses
app.get("/api/courses", async (req, res) => {
  const student = await getStudent();

  res.json(student?.courses || []);
});

// -----------------------------------
// Legacy CRUD (optional)
// -----------------------------------

app.put("/api/stats", (req, res) => {
  const db = readDB();

  db.stats = req.body || {};

  writeDB(db);

  res.json(db.stats);
});

app.put("/api/drives", (req, res) => {
  const db = readDB();

  db.drives = req.body || {};

  writeDB(db);

  res.json(db.drives);
});

app.post("/api/courses", (req, res) => {
  const db = readDB();

  db.courses = db.courses || [];

  const item = req.body;

  item.id = Date.now();

  db.courses.push(item);

  writeDB(db);

  res.status(201).json(item);
});

app.put("/api/courses/:id", (req, res) => {
  const db = readDB();

  db.courses = db.courses || [];

  const id = parseInt(req.params.id, 10);

  const idx = db.courses.findIndex(
    c => c.id === id
  );

  if (idx === -1) {
    return res.sendStatus(404);
  }

  db.courses[idx] = {
    ...db.courses[idx],
    ...req.body
  };

  writeDB(db);

  res.json(db.courses[idx]);
});

app.delete("/api/courses/:id", (req, res) => {
  const db = readDB();

  db.courses = db.courses || [];

  const id = parseInt(req.params.id, 10);

  db.courses = db.courses.filter(
    c => c.id !== id
  );

  writeDB(db);

  res.sendStatus(204);
});

// -----------------------------------
// SPA Fallback
// -----------------------------------

app.get("*", (req, res) => {
  const index = path.join(
    __dirname,
    "..",
    "src",
    "index.html"
  );

  if (fs.existsSync(index)) {
    return res.sendFile(index);
  }

  res.status(404).send("Not found");
});

// -----------------------------------
// Start Server
// -----------------------------------

app.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );
});