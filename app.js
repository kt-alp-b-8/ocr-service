const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureButton = document.getElementById("captureButton");
const retakeButton = document.getElementById("retakeButton");
const nextCaptureButton = document.getElementById("nextCaptureButton");
const completeButton = document.getElementById("completeButton");
const brightnessButton = document.getElementById("brightnessButton");
const resultDiv = document.getElementById("result");
const loadingDiv = document.getElementById("loading");
const capturedImage = document.getElementById("capturedImage");
const ctx = canvas.getContext("2d");

// 프록시 서버 URL 설정
const PROXY_URL = `https://172.30.1.10:3000/proxy/ocr`;

// 캡처된 이미지와 정보 저장
let capturedImages = [];
let isScreenDark = false;

// 페이지 로드 시 카메라 초기화
document.addEventListener("DOMContentLoaded", () => {
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    alert("카메라 접근을 위해서는 HTTPS가 필요합니다.");
    return;
  }
  initCamera();
});

// 카메라 초기화
async function initCamera() {
  try {
    // 기존 스트림이 있다면 모든 트랙을 중지
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }

    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "environment",
        aspectRatio: { ideal: 4 / 3 },
      },
      audio: false,
    };

    console.log("카메라 연결 시도:", constraints);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    // 비디오 로드 완료 시 재생
    video.onloadedmetadata = () => {
      video.play().catch((err) => {
        console.error("비디오 재생 실패:", err);
      });
    };

    console.log("카메라 초기화 성공");
    video.style.display = "block";
    capturedImage.style.display = "none";
  } catch (err) {
    console.error("카메라 접근 오류:", err);
    alert(
      "카메라 접근에 실패했습니다. 브라우저 설정에서 카메라 권한을 허용해주세요."
    );
  }
}

// 가이드 박스 영역 추출
function extractGuideBoxRegion(sourceCanvas) {
  const guideBox = document.querySelector(".guide-box");
  const guideBoxRect = guideBox.getBoundingClientRect();
  const containerRect = document
    .querySelector(".camera-container")
    .getBoundingClientRect();

  const relativeX =
    (guideBoxRect.left - containerRect.left) / containerRect.width;
  const relativeY =
    (guideBoxRect.top - containerRect.top) / containerRect.height;
  const relativeWidth = guideBoxRect.width / containerRect.width;
  const relativeHeight = guideBoxRect.height / containerRect.height;

  const x = relativeX * sourceCanvas.width;
  const y = relativeY * sourceCanvas.height;
  const width = relativeWidth * sourceCanvas.width;
  const height = relativeHeight * sourceCanvas.height;

  const padding = 20;
  const extractCanvas = document.createElement("canvas");
  extractCanvas.width = width + padding * 2;
  extractCanvas.height = height + padding * 2;
  const extractCtx = extractCanvas.getContext("2d");

  extractCtx.drawImage(
    sourceCanvas,
    Math.max(0, x - padding),
    Math.max(0, y - padding),
    width + padding * 2,
    height + padding * 2,
    0,
    0,
    extractCanvas.width,
    extractCanvas.height
  );

  return extractCanvas;
}

// 주민등록번호 마스킹 처리 함수
function maskRRN(rrn) {
  if (!rrn || rrn === "정보 없음") return rrn;

  // 주민등록번호 형식 확인 (000000-0000000 또는 0000000000000)
  if (rrn.includes("-")) {
    const parts = rrn.split("-");
    if (parts.length === 2) {
      return `${parts[0]}-${parts[1].charAt(0)}******`;
    }
  }

  // 하이픈 없는 경우 (13자리)
  if (rrn.length === 13) {
    return `${rrn.substring(0, 6)}-${rrn.charAt(6)}******`;
  }

  return rrn;
}

// Base64 이미지를 프록시 서버를 통해 CLOVA OCR API로 전송
async function sendToClova(imageBase64) {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  console.log("OCR API 요청 시작");

  try {
    console.log("프록시 서버로 요청 전송:", PROXY_URL);
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "V2",
        requestId: "request-" + new Date().getTime(),
        timestamp: new Date().getTime(),
        images: [
          {
            format: "jpg",
            name: "id-document",
            data: base64Data,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("API 응답 오류:", response.status, response.statusText);
      throw new Error(
        `API 요청 실패: ${response.status} ${response.statusText}`
      );
    }

    console.log("OCR API 응답 성공");
    return await response.json();
  } catch (error) {
    console.error("CLOVA OCR API 호출 오류:", error);
    throw error;
  }
}

// CLOVA OCR 결과에서 필요한 정보 추출
function extractInformationFromResponse(response) {
  try {
    console.log("CLOVA OCR 응답:", response);

    if (
      !response.images ||
      !response.images[0] ||
      !response.images[0].idCard ||
      !response.images[0].idCard.result
    ) {
      console.log("유효한 이미지 정보가 없습니다.");
      return null;
    }

    const image = response.images[0];
    const result = image.idCard.result;
    let idInfo = {};

    // 운전면허증인 경우
    if (result.dl) {
      const dl = result.dl;
      idInfo.type = "Driver's License";

      // Optional chaining 연산자를 사용하여 안전하게 데이터 접근
      idInfo.name = dl.name?.[0]?.text || "정보 없음";
      idInfo.rrn = dl.personalNum?.[0]?.text || "정보 없음";
      idInfo.address = dl.address?.[0]?.text || "정보 없음";
      idInfo.issueDate = dl.issueDate?.[0]?.text || "정보 없음";
      idInfo.licenseNum = dl.num?.[0]?.text || "정보 없음";
      idInfo.renewStartDate = dl.renewStartDate?.[0]?.text || "정보 없음";
      idInfo.renewEndDate = dl.renewEndDate?.[0]?.text || "정보 없음";
      idInfo.condition = dl.condition?.[0]?.text || "정보 없음";
    }
    // 주민등록증인 경우
    else if (result.ic) {
      const ic = result.ic;
      idInfo.type = "ID Card";

      // Optional chaining 연산자를 사용하여 안전하게 데이터 접근
      idInfo.name = ic.name?.[0]?.text || "정보 없음";
      idInfo.rrn = ic.personalNum?.[0]?.text || "정보 없음";
      idInfo.address = ic.address?.[0]?.text || "정보 없음";
      idInfo.issueDate = ic.issueDate?.[0]?.text || "정보 없음";
    } else {
      console.log("인식 가능한 신분증 정보가 없습니다.");
      return null;
    }

    // 주민등록번호 마스킹 처리
    if (idInfo.rrn && idInfo.rrn !== "정보 없음") {
      idInfo.rrn = maskRRN(idInfo.rrn);
    }

    console.log("추출된 신분증 정보:", idInfo);
    return idInfo;
  } catch (error) {
    console.error("OCR 결과 파싱 오류:", error);
    return null;
  }
}

// 상태 초기화 함수 추가
function resetOCRState() {
  // 캔버스 초기화
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 캡처된 이미지 초기화
  capturedImage.src = "";

  // 결과 초기화
  resultDiv.innerHTML = "<h2>인식 결과</h2>";

  // 로딩 상태 초기화
  loadingDiv.style.display = "none";
}

// 이미지 캡처 및 OCR 처리
async function captureAndProcess() {
  try {
    // 이전 상태 초기화
    resetOCRState();

    // 캔버스 설정
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // 현재 비디오 스트림 중지
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
    }

    // 캡처 이미지 표시
    capturedImage.src = canvas.toDataURL("image/jpeg");
    video.style.display = "none";
    capturedImage.style.display = "block";

    // 버튼 상태 업데이트
    captureButton.style.display = "none";
    retakeButton.style.display = "inline-block";
    nextCaptureButton.style.display = "inline-block";
    completeButton.style.display = "inline-block";

    // 로딩 표시
    loadingDiv.style.display = "block";
    resultDiv.innerHTML = "<h2>인식 결과</h2>";

    // OCR 처리
    const guideBoxCanvas = extractGuideBoxRegion(canvas);
    const imageBase64 = guideBoxCanvas.toDataURL("image/jpeg");

    // OCR 요청 전 잠시 대기 (이전 요청의 영향을 피하기 위해)
    await new Promise((resolve) => setTimeout(resolve, 100));

    const ocrResult = await sendToClova(imageBase64);
    const idInfo = extractInformationFromResponse(ocrResult);

    if (idInfo) {
      capturedImages.push(idInfo);
      // 결과 표시 (기존 코드와 동일)
      let resultHTML = "<h2>인식 결과</h2><div class='result-container'>";
      resultHTML += `<p>신분증 종류: <strong>${idInfo.type}</strong></p>`;
      resultHTML += `<p>이름: <strong>${idInfo.name}</strong></p>`;
      resultHTML += `<p>주민등록번호: <strong>${idInfo.rrn}</strong></p>`;
      resultHTML += `<p>주소: <strong>${idInfo.address}</strong></p>`;
      resultHTML += `<p>발급일자: <strong>${idInfo.issueDate}</strong></p>`;

      if (idInfo.renewStartDate) {
        resultHTML += `<p>갱신 시작일: <strong>${idInfo.renewStartDate}</strong></p>`;
      }
      if (idInfo.renewEndDate) {
        resultHTML += `<p>갱신 종료일: <strong>${idInfo.renewEndDate}</strong></p>`;
      }

      resultHTML += "</div>";
      resultDiv.innerHTML = resultHTML;
    } else {
      resultDiv.innerHTML =
        "<h2>인식 결과</h2><p class='error-message'>신분증 정보를 인식하지 못했습니다. 다시 시도해주세요.</p>";
    }
  } catch (err) {
    console.error("OCR 처리 오류:", err);
    resultDiv.innerHTML =
      "<h2>인식 결과</h2><p class='error-message'>오류가 발생했습니다. 다시 시도해주세요.</p>";
  } finally {
    loadingDiv.style.display = "none";
  }
}

// 다음 촬영 함수 수정
async function nextCapture() {
  try {
    // OCR 상태 초기화
    resetOCRState();

    // 현재 스트림 정리
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }

    // UI 초기화
    captureButton.style.display = "inline-block";
    retakeButton.style.display = "none";
    nextCaptureButton.style.display = "none";
    completeButton.style.display = "none";

    // 카메라 다시 초기화
    await initCamera();

    // 화면 표시 상태 업데이트
    video.style.display = "block";
    capturedImage.style.display = "none";

    console.log("다음 촬영 준비 완료");
  } catch (error) {
    console.error("다음 촬영 준비 중 오류:", error);
    alert("카메라 재시작에 실패했습니다. 페이지를 새로고침해주세요.");
  }
}

// 다시 촬영 함수 수정
async function retake() {
  try {
    // OCR 상태 초기화
    resetOCRState();

    // 현재 스트림 정리
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }

    // UI 초기화
    captureButton.style.display = "inline-block";
    retakeButton.style.display = "none";
    nextCaptureButton.style.display = "none";
    completeButton.style.display = "none";

    // 마지막 캡처 이미지 제거
    if (capturedImages.length > 0) {
      capturedImages.pop();
    }

    // 카메라 다시 초기화
    await initCamera();

    // 화면 표시 상태 업데이트
    video.style.display = "block";
    capturedImage.style.display = "none";

    console.log("다시 촬영 준비 완료");
  } catch (error) {
    console.error("다시 촬영 준비 중 오류:", error);
    alert("카메라 재시작에 실패했습니다. 페이지를 새로고침해주세요.");
  }
}

// 완료
async function complete() {
  try {
    // 인증 상태 서버에 카운트 증가 요청
    await fetch("https://172.30.1.10:3002/increment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    alert(`신분증 정보가 성공적으로 처리되었습니다.`);
    console.log("모든 캡처된 신분증 정보:", capturedImages);
  } catch (error) {
    console.error("인증 완료 처리 중 오류:", error);
    alert("인증 완료 처리 중 오류가 발생했습니다.");
  }
}

// 화면 밝기 조절
function toggleBrightness() {
  isScreenDark = !isScreenDark;

  if (isScreenDark) {
    video.style.filter = "brightness(0.5)";
    brightnessButton.textContent = "화면 밝게";
  } else {
    video.style.filter = "brightness(1)";
    brightnessButton.textContent = "화면 어둡게";
  }
}

// 이벤트 리스너 설정
captureButton.addEventListener("click", captureAndProcess);
retakeButton.addEventListener("click", retake);
nextCaptureButton.addEventListener("click", nextCapture);
completeButton.addEventListener("click", complete);
brightnessButton.addEventListener("click", toggleBrightness);
