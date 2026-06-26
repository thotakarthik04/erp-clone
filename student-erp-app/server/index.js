const express = require("express");
const path = require("path");
const fs = require("fs");
const loadEnv = require("./loadEnv");

loadEnv();

const dynamo = require("./dynamo");
const {
  GetCommand,
  ScanCommand
} = require("@aws-sdk/lib-dynamodb");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "db.json");
const STUDENTS_TABLE =
  process.env.STUDENTS_TABLE ||
  process.env.DYNAMODB_TABLE ||
  "Students";
const STUDENT_KEY_NAME =
  process.env.STUDENTS_PARTITION_KEY ||
  process.env.STUDENT_PARTITION_KEY ||
  "studentId";
const LOCAL_FALLBACK_ENABLED = process.env.ALLOW_LOCAL_FALLBACK === "true";

app.use(express.json());

// Avoid stale frontend/API responses during deployment.
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

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

async function scanStudentById(studentId, source) {
  const idValue = String(studentId);
  const idFields = Array.from(
    new Set([
      STUDENT_KEY_NAME,
      "studentId",
      "studentID",
      "studentid",
      "id"
    ])
  );

  const names = {
    "#profile": "profile",
    "#profileId": "id"
  };

  const expressions = idFields.map((field, index) => {
    const nameKey = `#id${index}`;
    names[nameKey] = field;
    return `${nameKey} = :studentId`;
  });

  expressions.push("#profile.#profileId = :studentId");

  const result = await dynamo.send(
    new ScanCommand({
      TableName: STUDENTS_TABLE,
      FilterExpression: expressions.join(" OR "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: {
        ":studentId": idValue
      },
      Limit: 1
    })
  );

  if (result.Items && result.Items.length > 0) {
    result.Items[0].__source = source;
    return result.Items[0];
  }

  return null;
}

async function scanFirstStudent(source) {
  const result = await dynamo.send(
    new ScanCommand({
      TableName: STUDENTS_TABLE,
      Limit: 1
    })
  );

  if (result.Items && result.Items.length > 0) {
    result.Items[0].__source = source;
    return result.Items[0];
  }

  return null;
}

function getErrorText(err) {
  if (!err) return null;
  return err.name || err.code || err.message || String(err);
}

function dynamoFailure(source, err) {
  return {
    __dynamoFailed: true,
    __source: source,
    __error: getErrorText(err),
    profile: {
      name: "DynamoDB not connected",
      id: "",
      course: "Check AWS region, credentials, table name, and IAM permission",
      avatar: "images/profile.jpg.png"
    },
    stats: {
      attendance: 0,
      cgpa: 0,
      percentage: 0,
      feeBalance: "DynamoDB error"
    },
    drives: {},
    courses: [],
    results: {
      overall: {
        cgpa: 0,
        percentage: 0
      },
      semesters: []
    }
  };
}

function localFallback(source, err) {
  if (!LOCAL_FALLBACK_ENABLED) {
    return dynamoFailure(source, err);
  }

  const fallback = readDB();
  fallback.__source = source;
  fallback.__error = getErrorText(err);
  fallback.__localFallbackEnabled = true;
  return fallback;
}

async function getStudent(studentId) {
  if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
    return localFallback(
      "dynamodb-missing-region",
      new Error("AWS_REGION or AWS_DEFAULT_REGION is missing")
    );
  }

  try {
    if (studentId) {
      let getError = null;

      try {
        const result = await dynamo.send(
          new GetCommand({
            TableName: STUDENTS_TABLE,
            Key: {
              [STUDENT_KEY_NAME]: String(studentId)
            }
          })
        );

        if (result.Item) {
          result.Item.__source = "dynamodb-get";
          return result.Item;
        }
      } catch (err) {
        getError = err;
        console.warn(
          `DynamoDB direct lookup failed using key ${STUDENT_KEY_NAME}:`,
          err?.name || err?.code || err?.message || err
        );
      }

      let scanned = null;

      try {
        scanned = await scanStudentById(
          studentId,
          getError ? "dynamodb-scan-after-get-error" : "dynamodb-scan-after-get-miss"
        );
      } catch (err) {
        console.warn(
          `DynamoDB scan lookup failed for studentId=${studentId}:`,
          err?.name || err?.code || err?.message || err
        );
      }

      if (scanned) {
        return scanned;
      }

      console.warn(`DynamoDB item not found for studentId=${studentId}`);
      const firstStudent = await scanFirstStudent("dynamodb-scan-after-id-not-found");

      if (firstStudent) {
        return firstStudent;
      }

      return localFallback(
        "dynamodb-item-not-found",
        getError || new Error(`No DynamoDB item found for studentId=${studentId}`)
      );
    }

    const firstStudent = await scanFirstStudent("dynamodb-scan");

    if (!firstStudent) {
      return localFallback(
        "dynamodb-empty-table",
        new Error(`No items found in DynamoDB table ${STUDENTS_TABLE}`)
      );
    }

    return firstStudent;
  } catch (err) {
    console.error("DynamoDB Error:", err);
    return localFallback("dynamodb-error", err);
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
    id: firstValue(
      student.profile?.id,
      student.id,
      student.studentId,
      student.studentID,
      student.studentid
    ),
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
    partitionKey: STUDENT_KEY_NAME,
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null,
    hasAwsAccessKey: Boolean(process.env.AWS_ACCESS_KEY_ID),
    hasAwsSecretKey: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
    localFallbackEnabled: LOCAL_FALLBACK_ENABLED,
    cwd: process.cwd(),
    serverDir: __dirname,
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
