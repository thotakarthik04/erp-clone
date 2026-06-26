require("dotenv").config();

const fs = require("fs");
const path = require("path");

const dynamo = require("./dynamo");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");

async function migrate() {

  const db = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "db.json"),
      "utf8"
    )
  );

  await dynamo.send(
    new PutCommand({
      TableName: "Students",
      Item: {
        studentId: db.profile.id,
        profile: db.profile,
        stats: db.stats,
        drives: db.drives,
        courses: db.courses
      }
    })
  );

  console.log("Migration Complete");
}

migrate().catch(console.error);