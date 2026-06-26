require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

const dynamo = require("./dynamo");
const {
  GetCommand,
  ScanCommand
} = require("@aws-sdk/lib-dynamodb");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "db.json");
const STUDENTS_TABLE = process.env.STUDENTS_TABLE || "Students";

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

async function getStudent(studentId) {
  if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
    const fallback = readDB();
    fallback.__source = "local-db-no-region";
    return fallback;
  }

  try {
    if (studentId) {
      const result = await dynamo.send(
        new GetCommand({
          TableName: STUDENTS_TABLE,
          Key: {
            studentId: String(studentId)
          }
        })
      );

      if (result.Item) {
        result.Item.__source = "dynamodb-get";
        return result.Item;
      }

      console.warn(`DynamoDB item not found for studentId=${studentId}`);
      const fallback = readDB();
      fallback.__source = "local-db-item-not-found";
      return fallback;
    }

    const result = await dynamo.send(
      new ScanCommand({
        TableName: STUDENTS_TABLE,
        Limit: 1
      })
    );

    if (!result.Items || result.Items.length === 0) {
      const fallback = readDB();
      fallback.__source = "local-db-empty-table";
      return fallback;
    }

    result.Items[0].__source = "dynamodb-scan";
    return result.Items[0];
  } catch (err) {
    console.error("DynamoDB Error:", err);
    const fallback = readDB();
    fallback.__source = "local-db-dynamodb-error";
    fallback.__error = err?.name || err?.code || err?.message || "DynamoDB error";
    return fallback;
  }
}

// -----------------------------------
// DynamoDB shape normalizers
// -----------------------------------

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && value !== "");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.values(value);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeProfile(student = {}) {
  return {
    name: firstValue(student.profile?.name, student.name, student.studentName),
    id: firstValue(student.profile?.id, student.id, student.studentId),
    course: firstValue(student.profile?.course, student.course, student.program),
    avatar: firstValue(student.profile?.avatar, student.avatar, student.profileImage)
  };
}

function getRawAttendanceItems(student = {}) {
  return asArray(
    firstValue(
      student.courses,
      student.attendance?.courses,
      student.attendance?.subjects,
      student.attendanceSubjects,
      student.subjectAttendance
    )
  );
}

function normalizeCourse(course = {}, index = 0) {
  const delivered = firstValue(course.delivered, course.totalClasses);
  const attended = firstValue(course.attended, course.attendedClasses);
  const attendedDelivered = firstValue(
    course.ad,
    course.attendedDelivered,
    attended !== undefined && delivered !== undefined ? `${attended}/${delivered}` : undefined
  );

  return {
    id: firstValue(course.id, index + 1),
    code: firstValue(course.code, course.subjectCode, course.courseCode, course.subCode, ""),
    name: firstValue(course.name, course.subjectName, course.courseName, course.subName, course.sub, ""),
    cr: firstValue(course.cr, course.creditType, course.type, ""),
    group: firstValue(course.group, course.groupNo, course.groupNumber, ""),
    last: firstValue(course.last, course.lastAttended, course.lastAttendance, ""),
    ad: attendedDelivered || "",
    duty: firstValue(course.duty, course.dutyLeaves, course.leave, 0),
    pct: toNumber(firstValue(course.pct, course.percentage, course.attendance, course.attendancePct, course.att), 0),
    section: firstValue(course.section, course.sectionNo, ""),
    roll: firstValue(course.roll, course.rollNo, course.rollNumber, "")
  };
}

function normalizeCourses(student = {}) {
  return getRawAttendanceItems(student).map(normalizeCourse);
}

function normalizeStats(student = {}) {
  const courses = normalizeCourses(student);
  const computedAttendance = courses.length
    ? courses.reduce((sum, course) => sum + toNumber(course.pct), 0) / courses.length
    : undefined;

  return {
    attendance: toNumber(
      firstValue(
        student.stats?.attendance,
        student.attendance?.overall,
        student.attendance?.percentage,
        student.overallAttendance,
        computedAttendance
      ),
      0
    ),
    cgpa: toNumber(firstValue(student.stats?.cgpa, student.cgpa, student.results?.overall?.cgpa), 0),
    percentage: toNumber(
      firstValue(student.stats?.percentage, student.percentage, student.results?.overall?.percentage),
      0
    ),
    feeBalance: firstValue(student.stats?.feeBalance, student.feeBalance, "Nil")
  };
}

function getRawSemesters(student = {}) {
  return asArray(firstValue(student.results?.semesters, student.semesters, student.gradeSemesters));
}

function normalizeSubject(subject = {}) {
  return {
    name: firstValue(subject.name, subject.subjectName, subject.courseName, subject.subName, subject.sub, ""),
    code: firstValue(subject.code, subject.subjectCode, subject.courseCode, subject.subCode, ""),
    credits: firstValue(subject.credits, subject.credit, subject.creditHours, ""),
    marks: firstValue(subject.marks, subject.score, subject.totalMarks, ""),
    grade: firstValue(subject.grade, subject.resultGrade, "")
  };
}

function groupSubjectsIntoSemesters(subjects = []) {
  const map = new Map();

  subjects.forEach(subject => {
    const semesterNumber = firstValue(subject.semester, subject.sem, subject.term, 1);
    const key = String(semesterNumber);

    if (!map.has(key)) {
      map.set(key, {
        name: `Semester ${semesterNumber}`,
        cgpa: firstValue(subject.cgpa, subject.tgpa, 0),
        percentage: firstValue(subject.percentage, 0),
        subjects: []
      });
    }

    const semester = map.get(key);
    semester.subjects.push(normalizeSubject(subject));
    semester.cgpa = firstValue(subject.cgpa, subject.tgpa, semester.cgpa);
    semester.percentage = firstValue(subject.percentage, semester.percentage);
  });

  return Array.from(map.values());
}

function normalizeResults(student = {}) {
  const rawSemesters = getRawSemesters(student);
  const rawSubjects = asArray(firstValue(student.results?.subjects, student.subjects, student.grades));
  const semesters = rawSemesters.length
    ? rawSemesters.map((semester, index) => ({
        name: firstValue(semester.name, semester.semesterName, `Semester ${firstValue(semester.semester, semester.sem, index + 1)}`),
        cgpa: toNumber(firstValue(semester.cgpa, semester.tgpa), 0),
        percentage: toNumber(firstValue(semester.percentage, semester.percent), 0),
        subjects: asArray(semester.subjects).map(normalizeSubject)
      }))
    : groupSubjectsIntoSemesters(rawSubjects);

  const stats = normalizeStats(student);
  return {
    overall: {
      cgpa: toNumber(firstValue(student.results?.overall?.cgpa, student.overallCgpa, stats.cgpa), 0),
      percentage: toNumber(
        firstValue(student.results?.overall?.percentage, student.overallPercentage, stats.percentage),
        0
      )
    },
    semesters
  };
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
  const student = await getStudent(req.query.id);

  res.json(normalizeProfile(student));
});

// Stats
app.get("/api/stats", async (req, res) => {
  const student = await getStudent(req.query.id);

  res.json(normalizeStats(student));
});

// Drives
app.get("/api/drives", async (req, res) => {
  const student = await getStudent(req.query.id);

  res.json(student?.drives || {});
});

// Courses
app.get("/api/courses", async (req, res) => {
  const student = await getStudent(req.query.id);

  res.json(normalizeCourses(student));
});

// Results and semester details
app.get("/api/results", async (req, res) => {
  const student = await getStudent(req.query.id);

  res.json(normalizeResults(student));
});

// Deployment/debug helper: no secrets, only tells where data came from.
app.get("/api/debug/student", async (req, res) => {
  const student = await getStudent(req.query.id);

  res.json({
    requestedId: req.query.id || null,
    source: student?.__source || "unknown",
    error: student?.__error || null,
    table: STUDENTS_TABLE,
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null,
    profile: normalizeProfile(student),
    topLevelKeys: Object.keys(student || {}).filter(key => !key.startsWith("__"))
  });
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
