const express = require("express");
const cors = require("cors");
const axios = require("axios");
const https = require("https");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 3000;

// SSL 인증서 설정
const options = {
  key: fs.readFileSync(path.join(__dirname, "../localhost+2-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "../localhost+2.pem")),
};

// CORS 설정 및 대용량 JSON 처리
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-OCR-SECRET"],
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));

// OCR API 프록시 엔드포인트
app.post("/proxy/ocr", async (req, res) => {
  try {
    console.log("OCR 요청 받음");
    const response = await axios.post(
      "https://bv1gaimcle.apigw.ntruss.com/custom/v1/40004/98ebbd00b8d1af11b184e8d830419073e28dfae2413024a30002111aac0aacce/document/id-card",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-OCR-SECRET": "SlpWQXVMQ1FWY0l2aXptT3FWWWtKcUdMVlFNUHlIekY=",
        },
      }
    );
    console.log("OCR 응답 성공");
    res.json(response.data);
  } catch (error) {
    console.error("Error proxying to OCR API:", error);
    res.status(500).json({
      error: "Failed to process OCR request",
      details: error.response ? error.response.data : error.message,
    });
  }
});

// HTTPS 서버 시작
https.createServer(options, app).listen(PORT, "0.0.0.0", () => {
  console.log(`Proxy server running at https://0.0.0.0:${PORT}`);
});
