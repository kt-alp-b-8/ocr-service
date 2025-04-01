const express = require("express");
const cors = require("cors");
const https = require("https");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 3002;

// SSL 인증서 설정
const options = {
  key: fs.readFileSync(path.join(__dirname, "../localhost+2-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "../localhost+2.pem")),
};

// CORS 설정
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

// 인증된 사용자 수를 저장할 변수
let authenticatedCount = 0;

// 인증 완료 시 카운트 증가
app.post("/increment", (req, res) => {
  authenticatedCount++;
  console.log("인증된 사용자 수 증가:", authenticatedCount);
  res.json({ count: authenticatedCount });
});

// 현재 인증된 사용자 수 조회
app.get("/count", (req, res) => {
  console.log("현재 인증된 사용자 수:", authenticatedCount);
  res.json({ count: authenticatedCount });
});

// HTTPS 서버 시작
https.createServer(options, app).listen(PORT, "0.0.0.0", () => {
  console.log(`Auth status server running at https://0.0.0.0:${PORT}`);
});
