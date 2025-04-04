/**
 * 유틸리티 함수 모듈
 */

/**
 * 현재 브라우저가 필요한 기능을 지원하는지 확인
 * @returns {boolean} 지원 여부
 */
function checkBrowserSupport() {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.MediaRecorder
    );
  }
  
  /**
   * 디바이스 화면 방향 감지
   * @returns {string} 'portrait' 또는 'landscape'
   */
  function getScreenOrientation() {
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }
  
  /**
   * 캔버스 화면 조정
   * @param {HTMLCanvasElement} canvas - 조정할 캔버스 요소
   * @param {number} width - 새 너비
   * @param {number} height - 새 높이
   */
  function resizeCanvas(canvas, width, height) {
    canvas.width = width;
    canvas.height = height;
  }
  
  /**
   * 분석 결과 로깅 (디버깅용)
   * @param {Object} analysis - 분석 결과 객체
   */
  function logAnalysisResults(analysis) {
    console.log('분석 결과:', analysis);
    console.log('점수:', analysis.score);
    console.log('피드백 항목 수:', analysis.feedback.length);
  }
  
  /**
   * 이미지/비디오 URL 생성
   * @param {Blob} blob - 이미지/비디오 blob 데이터
   * @returns {string} 객체 URL
   */
  function createObjectURL(blob) {
    return URL.createObjectURL(blob);
  }
  
  /**
   * 이미지/비디오 URL 해제
   * @param {string} url - 해제할 객체 URL
   */
  function revokeObjectURL(url) {
    URL.revokeObjectURL(url);
  }
  
  /**
   * 데이터를 로컬 스토리지에 저장
   * @param {string} key - 스토리지 키
   * @param {*} data - 저장할 데이터
   */
  function saveToLocalStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('로컬 스토리지 저장 실패:', error);
    }
  }
  
  /**
   * 로컬 스토리지에서 데이터 불러오기
   * @param {string} key - 스토리지 키
   * @returns {*} 저장된 데이터 또는 null
   */
  function getFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('로컬 스토리지 불러오기 실패:', error);
      return null;
    }
  }
  
  /**
   * 날짜/시간 포맷팅
   * @param {Date} date - 날짜 객체
   * @returns {string} 포맷된 날짜/시간 문자열
   */
  function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
  