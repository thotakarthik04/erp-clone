require("dotenv").config();

const dynamo = require("./dynamo");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");

async function test() {
  await dynamo.send(
    new PutCommand({
      TableName: "Students",
      Item: {
        studentId: "TEST001",
        name: "Karthik",
        cgpa: 9.1,
        attendance: 95
      }
    })
  );

  console.log("Data inserted successfully");
}

test().catch(console.error);