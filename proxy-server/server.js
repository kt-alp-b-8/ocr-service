const express = require("express");
const cors = require("cors");
const axios = require("axios");
const app = express();
const PORT = 3000;

// CORS 설정 및 대용량 JSON 처리
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// OCR API 프록시 엔드포인트
app.post("/proxy/ocr", async (req, res) => {
  try {
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
    res.json(response.data);
  } catch (error) {
    console.error("Error proxying to OCR API:", error);
    res.status(500).json({
      error: "Failed to process OCR request",
      details: error.response ? error.response.data : error.message,
    });
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});
