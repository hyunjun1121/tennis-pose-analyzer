/**
 * 테니스 자세 분석 모듈
 */

// poseDetector.js에서 이미 선언된 키포인트 상수를 사용
// 상수 중복 선언을 방지하기 위해 로컬 변수 선언 부분 제거

/** 
 * 모션 데이터 기록을 위한 전역 변수
 */
const MOTION_HISTORY_LENGTH = 30; // 최근 30프레임 기록
let motionHistory = {
  timestamps: [],
  keypoints: [],
  angles: {},
  velocities: {}
};

/**
 * 스트로크 유형별 필요 키포인트
 */
const REQUIRED_KEYPOINTS = {
  forehand: [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE],
  backhand: [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, LEFT_WRIST, LEFT_HIP, LEFT_KNEE],
  serve: [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP],
  volley: [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, LEFT_KNEE, RIGHT_KNEE]
};

/**
 * 스트로크 유형별 이상적인 관절 각도 (전문가 참고값)
 */
const IDEAL_ANGLES = {
  forehand: {
    shoulderToElbowAngle: { mean: 60, stdDev: 15 },
    shoulderAlignment: { mean: 30, stdDev: 12 },
    kneeFlexionRatio: { mean: 0.55, stdDev: 0.1 },
    elbowToWristAngle: { mean: 140, stdDev: 20 },
    hipKneeAngle: { mean: 150, stdDev: 15 },
    shoulderHipAlignment: { mean: 40, stdDev: 10 }
  },
  backhand: {
    shoulderToElbowAngle: { mean: 65, stdDev: 15 },
    shoulderAlignment: { mean: -30, stdDev: 12 },
    elbowToWristAngle: { mean: 145, stdDev: 15 },
    hipKneeAngle: { mean: 145, stdDev: 15 }
  },
  serve: {
    shoulderToElbowAngle: { mean: 130, stdDev: 20 },
    shoulderAlignment: { mean: 50, stdDev: 15 },
    elbowToWristAngle: { mean: 160, stdDev: 15 },
    hipKneeAngle: { mean: 140, stdDev: 15 }
  },
  volley: {
    shoulderToElbowAngle: { mean: 90, stdDev: 15 },
    shoulderToWristDistance: { mean: 80, stdDev: 20 },
    avgKneeAngle: { mean: 140, stdDev: 10 },
    shoulderAlignment: { mean: 0, stdDev: 8 }
  }
};

/**
 * 테니스 자세 분석 함수 - 신체 움직임 시각화 중심
 * @param {Object} pose - 감지된 포즈 데이터
 * @param {string} strokeType - 분석할 스트로크 유형
 * @param {string} cameraPosition - 카메라 위치 설정
 * @returns {Object} 분석 결과
 */
function analyzeTennisForm(pose, strokeType = 'forehand', cameraPosition = 'rear-elevated') {
  // 카메라 위치 기반 포즈 데이터 보정
  const adjustedPose = adjustPoseForCameraPosition(pose, cameraPosition);
  const keypoints = adjustedPose.keypoints;
  
  // 모션 히스토리 업데이트
  updateMotionHistory(pose, strokeType);
  
  // 초기 분석 객체 생성
  let analysis = {
    motionData: {},
    score: 0,
    details: ''
  };
  
  // 카메라 위치에 따라 필요한 키포인트 목록 조정
  const requiredPoints = getRequiredKeypointsForPosition(strokeType, cameraPosition);
  
  // 키포인트 감지 상태 계산
  const keypointStatus = calculateKeypointDetectionStatus(keypoints, requiredPoints);
  
  // 필요한 키포인트가 충분히 감지되었는지 확인
  if (!hasRequiredKeypoints(keypoints, requiredPoints)) {
    // 불충분한 키포인트 상태이지만 부분 데이터 제공
    analysis.motionData.visibilityIssue = {
      detected: keypointStatus.detectedRatio, 
      required: keypointStatus.requiredRatio,
      missingParts: keypointStatus.missingParts
    };
    
    // 부분적인 데이터는 계속 제공
    for (const keypointIndex of requiredPoints) {
      if (isValidKeypoint(keypoints[keypointIndex])) {
        // 개별 유효 키포인트에 대한 기본 정보 추가
        addBasicKeypointData(keypoints, keypointIndex, analysis.motionData);
      }
    }
    
    // 낮은 신뢰도 점수 부여
    analysis.score = 20;
    return analysis;
  }
  
  // 카메라 위치와 스트로크 유형에 따른 분석 수행
  let result;
  switch (strokeType) {
    case 'forehand':
      result = analyzeForhandStroke(keypoints, analysis, cameraPosition);
      break;
    case 'backhand':
      result = analyzeBackhandStroke(keypoints, analysis, cameraPosition);
      break;
    case 'serve':
      result = analyzeServeStroke(keypoints, analysis, cameraPosition);
      break;
    case 'volley':
      result = analyzeVolleyStroke(keypoints, analysis, cameraPosition);
      break;
    default:
      result = analyzeForhandStroke(keypoints, analysis, cameraPosition);
  }
  
  // 키포인트 감지 상태에 따라 신뢰도 정보 추가
  if (keypointStatus.detectedRatio < 0.9) {
    result.motionData.detectionConfidence = {
      ratio: keypointStatus.detectedRatio,
      message: "일부 신체 부위가 정확히 감지되지 않아 분석 정확도가 떨어질 수 있습니다."
    };
  }
  
  // 확률적 점수 계산을 위한 가중치 설정
  result.score = calculateProbabilisticScore(result, strokeType, cameraPosition);
  
  return result;
}

/**
 * 테니스 동작 분석을 위한 캘린더 필터 클래스
 * 노이즈를 줄이고 키포인트 움직임을 부드럽게 만듭니다.
 */
class KalmanFilter {
  constructor() {
    // 칼만 필터 상태 초기화
    this.x = 0; // 상태 (위치)
    this.P = 1; // 불확실성
    this.Q = 0.01; // 프로세스 노이즈
    this.R = 0.1; // 측정 노이즈
  }
  
  /**
   * 칼만 필터를 사용해 측정값 필터링
   * @param {number} z - 필터링할 측정값
   * @param {number} r - 선택적 측정 노이즈 (기본값: this.R)
   * @returns {number} 필터링된 값
   */
  filter(z, r = this.R) {
    // 예측 단계
    const P_pred = this.P + this.Q;
    
    // 업데이트 단계
    const K = P_pred / (P_pred + r);
    this.x = this.x + K * (z - this.x);
    this.P = (1 - K) * P_pred;
    
    return this.x;
  }
  
  /**
   * 칼만 필터 상태 재설정
   * @param {number} x - 초기 위치 값
   */
  reset(x = 0) {
    this.x = x;
    this.P = 1;
  }
}

// 칼만 필터 인스턴스 저장
const kalmanFilters = {
  x: {},
  y: {}
};

/**
 * 키포인트에 칼만 필터 적용
 * @param {Array} keypoints - 필터링할 키포인트 배열
 * @param {Object} filters - 각 키포인트에 대한 필터 객체
 * @returns {Array} 필터링된 키포인트 배열
 */
function applyKalmanFilter(keypoints, filters) {
  if (!keypoints) return keypoints;
  
  // 필터 객체가 없으면 초기화
  if (!filters.x || !filters.y) {
    filters.x = {};
    filters.y = {};
    
    // 각 키포인트에 대한 필터 생성
    for (let i = 0; i < keypoints.length; i++) {
      filters.x[i] = new KalmanFilter();
      filters.y[i] = new KalmanFilter();
    }
  }
  
  // 필터링된 키포인트 생성
  const filteredKeypoints = [];
  
  for (let i = 0; i < keypoints.length; i++) {
    const keypoint = keypoints[i];
    
    if (!keypoint || keypoint.score < 0.1) {
      filteredKeypoints[i] = keypoint;
      continue;
    }
    
    // 필터가 없으면 생성
    if (!filters.x[i]) filters.x[i] = new KalmanFilter();
    if (!filters.y[i]) filters.y[i] = new KalmanFilter();
    
    // 노이즈 레벨을 신뢰도에 따라 동적으로 조정 (낮은 신뢰도 = 높은 측정 노이즈)
    const noiseLevel = keypoint.score < 0.3 ? 0.5 : 
                      keypoint.score < 0.6 ? 0.3 : 0.1;
    
    // 위치 필터링
    const filteredX = filters.x[i].filter(keypoint.x, noiseLevel);
    const filteredY = filters.y[i].filter(keypoint.y, noiseLevel);
    
    // 필터링된 값으로 키포인트 업데이트
    filteredKeypoints[i] = {
      ...keypoint,
      x: filteredX,
      y: filteredY,
      // 원본 값도 저장 (필요 시 분석에 사용)
      rawX: keypoint.x,
      rawY: keypoint.y
    };
  }
  
  return filteredKeypoints;
}

/**
 * 모션 히스토리를 업데이트하는 함수
 * @param {Object} pose - 감지된 포즈 데이터
 * @param {string} strokeType - 사용자가 선택한 스트로크 유형
 */
function updateMotionHistory(pose, strokeType) {
  // 포즈가 없는 경우 리턴
  if (!pose || !pose.keypoints || pose.keypoints.length === 0) return;
  
  // 모션 히스토리가 초기화되지 않은 경우 초기화
  if (!window.motionHistory) {
    window.motionHistory = {
      keypoints: [],   // 키포인트 배열
      timestamps: [],  // 타임스탬프 배열
      angles: [],      // 관절 각도 배열
      velocities: [],  // 속도 배열
      strokeType: strokeType,
      scores: {        // 동작 분석 점수
        balance: 0,
        timing: 0,
        form: 0,
        power: 0,
        overall: 0
      }
    };
  }
  
  // 현재 타임스탬프
  const now = Date.now();
  
  // 이전 타임스탬프 (없으면 현재 시간)
  const prevTimestamp = window.motionHistory.timestamps.length > 0 ? 
                       window.motionHistory.timestamps[window.motionHistory.timestamps.length - 1] : 
                       now;
  
  // 프레임 간 시간 간격 (초 단위)
  const timeDelta = (now - prevTimestamp) / 1000;
  
  // 중요한 키포인트만 추출
  const importantKeypoints = [
    RIGHT_WRIST, LEFT_WRIST, 
    RIGHT_ELBOW, LEFT_ELBOW,
    RIGHT_SHOULDER, LEFT_SHOULDER,
    RIGHT_HIP, LEFT_HIP,
    RIGHT_KNEE, LEFT_KNEE,
    NOSE
  ];
  
  // 칼만 필터 적용
  const filteredKeypoints = applyKalmanFilter(pose.keypoints, kalmanFilters);
  
  // 필수 키포인트만 저장
  const keypointsToStore = {};
  
  for (const idx of importantKeypoints) {
    if (filteredKeypoints[idx] && filteredKeypoints[idx].score >= 0.2) {
      keypointsToStore[idx] = {
        x: filteredKeypoints[idx].x,
        y: filteredKeypoints[idx].y,
        score: filteredKeypoints[idx].score
      };
    }
  }
  
  // 키포인트 속도 계산 (충분한 시간 간격이 있을 때만)
  const velocities = {};
  if (timeDelta > 0.016) { // 약 60fps 이상일 때
    if (window.motionHistory.keypoints.length > 0) {
      const prevKeypoints = window.motionHistory.keypoints[window.motionHistory.keypoints.length - 1];
      
      // 각 중요 키포인트에 대해 속도 계산
      for (const idx of importantKeypoints) {
        if (keypointsToStore[idx] && prevKeypoints[idx]) {
          const dx = keypointsToStore[idx].x - prevKeypoints[idx].x;
          const dy = keypointsToStore[idx].y - prevKeypoints[idx].y;
          
          // 속도 (픽셀/초)
          const speed = Math.sqrt(dx*dx + dy*dy) / timeDelta;
          
          // 방향 (라디안)
          const direction = Math.atan2(dy, dx);
          
          velocities[idx] = { speed, direction };
        }
      }
    }
  }
  
  // 관절 각도 계산
  const angles = {};
  
  // 오른쪽 팔꿈치 각도
  if (keypointsToStore[RIGHT_SHOULDER] && keypointsToStore[RIGHT_ELBOW] && keypointsToStore[RIGHT_WRIST]) {
    angles.rightElbow = calculateAngle(
      keypointsToStore[RIGHT_SHOULDER], 
      keypointsToStore[RIGHT_ELBOW], 
      keypointsToStore[RIGHT_WRIST]
    );
  }
  
  // 왼쪽 팔꿈치 각도
  if (keypointsToStore[LEFT_SHOULDER] && keypointsToStore[LEFT_ELBOW] && keypointsToStore[LEFT_WRIST]) {
    angles.leftElbow = calculateAngle(
      keypointsToStore[LEFT_SHOULDER], 
      keypointsToStore[LEFT_ELBOW], 
      keypointsToStore[LEFT_WRIST]
    );
  }
  
  // 어깨 정렬 (어깨 라인의 수평에서 벗어난 각도)
  if (keypointsToStore[LEFT_SHOULDER] && keypointsToStore[RIGHT_SHOULDER]) {
    const dx = keypointsToStore[RIGHT_SHOULDER].x - keypointsToStore[LEFT_SHOULDER].x;
    const dy = keypointsToStore[RIGHT_SHOULDER].y - keypointsToStore[LEFT_SHOULDER].y;
    angles.shoulderAlignment = Math.atan2(dy, dx) * (180 / Math.PI);
  }
  
  // 히스토리 업데이트
  window.motionHistory.keypoints.push(keypointsToStore);
  window.motionHistory.timestamps.push(now);
  window.motionHistory.angles.push(angles);
  window.motionHistory.velocities.push(velocities);
  
  // 히스토리 길이 제한 (최대 60프레임, 약 2초)
  const maxHistoryLength = 60;
  if (window.motionHistory.keypoints.length > maxHistoryLength) {
    window.motionHistory.keypoints.shift();
    window.motionHistory.timestamps.shift();
    window.motionHistory.angles.shift();
    window.motionHistory.velocities.shift();
  }
  
  // 스트로크 패턴 감지
  detectStrokePattern(window.motionHistory, strokeType);
}

/**
 * 스트로크 패턴 감지 함수
 * @param {Object} history - 모션 히스토리 데이터
 * @param {string} currentStrokeType - 현재 선택된 스트로크 유형
 * @returns {Object} 감지된 스트로크 패턴 정보
 */
function detectStrokePattern(history, currentStrokeType) {
  if (!history || history.keypoints.length < 10) return null;
  
  // 결과 객체
  const result = {
    detectedStroke: 'unknown',
    confidence: 0,
    phase: 'unknown'
  };
  
  // 최근 N 프레임의 손목 위치 추출
  const wristPositions = [];
  const frames = Math.min(20, history.keypoints.length);
  
  for (let i = history.keypoints.length - frames; i < history.keypoints.length; i++) {
    const frame = history.keypoints[i];
    // 오른손/왼손 선택 (스트로크 유형에 따라)
    const wristIdx = currentStrokeType === 'backhand' ? LEFT_WRIST : RIGHT_WRIST;
    const wrist = frame[wristIdx];
    
    if (wrist) {
      wristPositions.push({
        x: wrist.x,
        y: wrist.y,
        timestamp: history.timestamps[i]
      });
    }
  }
  
  if (wristPositions.length < 5) return result;
  
  // 손목 움직임 방향 분석
  let horizontalMovement = 0;
  let verticalMovement = 0;
  
  for (let i = 1; i < wristPositions.length; i++) {
    const dx = wristPositions[i].x - wristPositions[i-1].x;
    const dy = wristPositions[i].y - wristPositions[i-1].y;
    
    horizontalMovement += dx;
    verticalMovement += dy;
  }
  
  // 수평, 수직 움직임 크기
  const horizontalMag = Math.abs(horizontalMovement);
  const verticalMag = Math.abs(verticalMovement);
  
  // 움직임 방향에 따른 스트로크 감지
  if (horizontalMag > verticalMag * 1.5) {
    // 주로 수평 움직임
    if (horizontalMovement > 0) {
      // 오른쪽으로 움직임 (포핸드 또는 백핸드)
      result.detectedStroke = currentStrokeType === 'backhand' ? 'backhand' : 'forehand';
      result.confidence = 0.7;
    } else {
      // 왼쪽으로 움직임
      result.detectedStroke = currentStrokeType === 'backhand' ? 'forehand' : 'backhand';
      result.confidence = 0.6;
    }
  } else if (verticalMag > horizontalMag * 1.5) {
    // 주로 수직 움직임
    if (verticalMovement < 0) {
      // 위로 움직임 (서브 또는 오버헤드)
      result.detectedStroke = 'serve';
      result.confidence = 0.8;
    } else {
      // 아래로 움직임
      result.detectedStroke = 'volley';
      result.confidence = 0.6;
    }
  } else {
    // 대각선 움직임 or 복합 움직임
    if (Math.abs(horizontalMovement) > 50 && Math.abs(verticalMovement) > 50) {
      if (verticalMovement < 0 && horizontalMovement > 0) {
        // 우상향 대각선 (서브 또는 포핸드)
        result.detectedStroke = 'serve';
        result.confidence = 0.6;
      } else if (verticalMovement < 0 && horizontalMovement < 0) {
        // 좌상향 대각선 (백핸드 또는 서브)
        result.detectedStroke = 'backhand';
        result.confidence = 0.6;
      } else {
        // 기타 대각선
        result.detectedStroke = currentStrokeType;
        result.confidence = 0.4;
      }
    }
  }
  
  // 동작 단계 감지 (준비, 타격, 팔로우스루)
  const recentVelocities = history.velocities.slice(-5);
  let avgWristSpeed = 0;
  let count = 0;
  
  for (const vel of recentVelocities) {
    const wristIdx = currentStrokeType === 'backhand' ? LEFT_WRIST : RIGHT_WRIST;
    if (vel[wristIdx]) {
      avgWristSpeed += vel[wristIdx].speed;
      count++;
    }
  }
  
  if (count > 0) {
    avgWristSpeed /= count;
    
    if (avgWristSpeed < 50) {
      result.phase = 'preparation';
    } else if (avgWristSpeed > 300) {
      result.phase = 'impact';
    } else {
      result.phase = 'follow-through';
    }
  }
  
  return result;
}

/**
 * 테니스 스트로크 패턴 감지 (모션 히스토리에서 패턴 분석)
 */
function detectStrokePattern() {
  if (motionHistory.keypoints.length < 10) return; // 충분한 데이터 없음
  
  const recentKeypoints = motionHistory.keypoints.slice(-10);
  const wristPositions = {
    right: recentKeypoints.map(frame => frame[RIGHT_WRIST]).filter(kp => kp && kp.score > 0.3),
    left: recentKeypoints.map(frame => frame[LEFT_WRIST]).filter(kp => kp && kp.score > 0.3)
  };
  
  // 손목 궤적이 충분하지 않으면 리턴
  if (wristPositions.right.length < 5 && wristPositions.left.length < 5) return;
  
  // 주요 손목 결정 (오른손/왼손)
  const primaryWrist = wristPositions.right.length > wristPositions.left.length ? 
                      wristPositions.right : wristPositions.left;
  
  // 궤적 분석
  if (primaryWrist.length < 5) return;
  
  // 수평 및 수직 움직임 계산
  const xMove = Math.abs(primaryWrist[primaryWrist.length-1].x - primaryWrist[0].x);
  const yMove = Math.abs(primaryWrist[primaryWrist.length-1].y - primaryWrist[0].y);
  
  // 스트로크 방향성 파악
  const isHorizontalMove = xMove > yMove;
  const isUpwardMove = primaryWrist[primaryWrist.length-1].y < primaryWrist[0].y;
  
  // 패턴 분석 결과 기록
  window.lastDetectedPattern = {
    isHorizontalMove,
    isUpwardMove,
    xMove,
    yMove,
    timestamp: Date.now()
  };
}

/**
 * 키포인트 속도 계산
 * @param {Object} currentPos - 현재 키포인트 위치
 * @param {Object} prevPos - 이전 키포인트 위치
 * @param {number} timeInterval - 시간 간격 (초)
 * @returns {number} 속도 (픽셀/초)
 */
function calculateVelocity(currentPos, prevPos, timeInterval) {
  if (!currentPos || !prevPos || !timeInterval) return 0;
  
  const distance = calculateDistance(currentPos, prevPos);
  return distance / timeInterval;
}

/**
 * 가우시안 분포 기반 점수 계산
 * @param {number} value - 측정값
 * @param {number} idealMean - 이상적인 평균값
 * @param {number} standardDev - 표준편차
 * @returns {number} 0-100 사이의 점수
 */
function gaussianScore(value, idealMean, standardDev) {
  if (value === null || value === undefined) return 0;
  
  const score = 100 * Math.exp(-Math.pow(value - idealMean, 2) / (2 * Math.pow(standardDev, 2)));
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * 복합 점수 계산 - 여러 요소의 가중 평균
 * @param {Object} scores - 항목별 점수 객체
 * @returns {number} 최종 점수
 */
function calculateCompoundScore(scores) {
  const weights = {
    posture: 0.35,     // 자세 정확도 (가장 중요)
    stability: 0.15,   // 안정성
    movement: 0.25,    // 동작 흐름
    timing: 0.15,      // 타이밍
    acceleration: 0.1  // 가속도 패턴
  };
  
  let weightedSum = 0;
  let weightSum = 0;
  
  for (const [category, score] of Object.entries(scores)) {
    if (score > 0) {  // 점수가 계산된 항목만 포함
      weightedSum += score * weights[category];
      weightSum += weights[category];
    }
  }
  
  // 가중치 총합이 0이면 기본값 50 반환
  if (weightSum === 0) return 50;
  
  // 가중 평균 계산 및 반올림
  return Math.round(weightedSum / weightSum);
}

/**
 * 포핸드 스트로크 분석 - 신체 움직임 데이터 중심
 * @param {Array} keypoints - 키포인트 배열
 * @param {Object} analysis - 초기 분석 객체
 * @param {string} cameraPosition - 카메라 위치
 * @returns {Object} 업데이트된 분석 결과
 */
function analyzeForhandStroke(keypoints, analysis, cameraPosition = 'rear-elevated') {
  analysis.motionData = {}; // 신체 움직임 데이터 객체
  
  // 후방 시점 분석 (코트 뒤 상단에서 촬영)
  if (cameraPosition === 'rear-elevated') {
    // 1. 팔 준비 위치 분석 (뒤에서 볼 때)
    const shoulderToElbowAngle = calculateAngle(
      keypoints[RIGHT_HIP],
      keypoints[RIGHT_SHOULDER], 
      keypoints[RIGHT_ELBOW]
    );
    
    analysis.motionData.shoulderToElbowAngle = shoulderToElbowAngle;
    // 각도가 null이나 NaN이면 중간 점수 부여
    const shoulderToElbowScore = shoulderToElbowAngle !== null && !isNaN(shoulderToElbowAngle) ? 
      gaussianScore(
        shoulderToElbowAngle, 
        IDEAL_ANGLES.forehand.shoulderToElbowAngle.mean, 
        IDEAL_ANGLES.forehand.shoulderToElbowAngle.stdDev
      ) : 50;
    
    // 2. 어깨 회전 분석 (후방 시점)
    const shoulderAlignment = calculateInclination(
      keypoints[LEFT_SHOULDER], 
      keypoints[RIGHT_SHOULDER]
    );
    
    analysis.motionData.shoulderAlignment = shoulderAlignment;
    // 각도가 null이나 NaN이면 중간 점수 부여
    const shoulderAlignmentScore = shoulderAlignment !== null && !isNaN(shoulderAlignment) ? 
      gaussianScore(
        shoulderAlignment, 
        IDEAL_ANGLES.forehand.shoulderAlignment.mean, 
        IDEAL_ANGLES.forehand.shoulderAlignment.stdDev
      ) : 50;
    
    // 3. 무게 중심 및 자세 분석
    const hipToAnkleDistance = calculateDistance(
      keypoints[RIGHT_HIP],
      keypoints[RIGHT_ANKLE]
    );
    
    const kneeToAnkleDistance = calculateDistance(
      keypoints[RIGHT_KNEE],
      keypoints[RIGHT_ANKLE]
    );
    
    // 무릎 굽힘 비율 계산 (값이 작을수록 더 굽힘)
    const kneeFlexionRatio = kneeToAnkleDistance / hipToAnkleDistance;
    
    analysis.motionData.kneeFlexionRatio = kneeFlexionRatio;
    const kneeFlexionScore = gaussianScore(
      kneeFlexionRatio, 
      IDEAL_ANGLES.forehand.kneeFlexionRatio.mean, 
      IDEAL_ANGLES.forehand.kneeFlexionRatio.stdDev
    );
    
    // 4. 팔꿈치-손목 관계 분석
    const elbowToWristAngle = calculateAngle(
      keypoints[RIGHT_SHOULDER],
      keypoints[RIGHT_ELBOW],
      keypoints[RIGHT_WRIST]
    );
    
    analysis.motionData.elbowToWristAngle = elbowToWristAngle;
    const elbowToWristScore = gaussianScore(
      elbowToWristAngle, 
      IDEAL_ANGLES.forehand.elbowToWristAngle.mean, 
      IDEAL_ANGLES.forehand.elbowToWristAngle.stdDev
    );
    
    // 5. 동작 안정성 분석 (최근 프레임의 손목 움직임 일관성)
    const stabilityScore = calculateStabilityScore(RIGHT_WRIST);
    
    // 6. 동작 흐름 분석 (백스윙-임팩트-팔로우스루 연속성)
    const movementScore = calculateMovementFlowScore(RIGHT_WRIST, RIGHT_ELBOW);
    
    // 7. 손목 속도 분석
    const velocityScore = calculateVelocityScore(RIGHT_WRIST);
    
    // 8. 가속도 패턴 분석
    const accelerationScore = calculateAccelerationScore(RIGHT_WRIST);
    
    // 각 요소별 점수 설정
    analysis.scores = {
      posture: Math.round((shoulderToElbowScore + shoulderAlignmentScore + kneeFlexionScore + elbowToWristScore) / 4),
      stability: stabilityScore,
      movement: movementScore,
      timing: velocityScore,
      acceleration: accelerationScore
    };
  } else {
    // 정면 시점 분석
    // 1. 팔꿈치 각도 분석
    const elbowAngle = calculateAngle(
      keypoints[RIGHT_SHOULDER], 
      keypoints[RIGHT_ELBOW], 
      keypoints[RIGHT_WRIST]
    );
    
    analysis.motionData.elbowAngle = elbowAngle;
    // 각도가 null이나 NaN이면 중간 점수 부여
    const elbowAngleScore = elbowAngle !== null && !isNaN(elbowAngle) ? 
      gaussianScore(
        elbowAngle, 
        IDEAL_ANGLES.forehand.elbowToWristAngle.mean, 
        IDEAL_ANGLES.forehand.elbowToWristAngle.stdDev
      ) : 50;
    
    // 2. 무게 중심 분석
    const hipKneeAngle = calculateAngle(
      keypoints[RIGHT_HIP], 
      keypoints[RIGHT_KNEE], 
      keypoints[RIGHT_ANKLE]
    );
    
    analysis.motionData.hipKneeAngle = hipKneeAngle;
    // 각도가 null이나 NaN이면 중간 점수 부여
    const hipKneeAngleScore = hipKneeAngle !== null && !isNaN(hipKneeAngle) ? 
      gaussianScore(
        hipKneeAngle, 
        IDEAL_ANGLES.forehand.hipKneeAngle.mean, 
        IDEAL_ANGLES.forehand.hipKneeAngle.stdDev
      ) : 50;
    
    // 3. 몸통 회전 분석
    const shoulderHipAlignment = Math.abs(
      (keypoints[RIGHT_SHOULDER].x - keypoints[LEFT_SHOULDER].x) - 
      (keypoints[RIGHT_HIP].x - keypoints[LEFT_HIP].x)
    );
    
    analysis.motionData.shoulderHipAlignment = shoulderHipAlignment;
    const shoulderHipAlignmentScore = gaussianScore(
      shoulderHipAlignment, 
      IDEAL_ANGLES.forehand.shoulderHipAlignment.mean, 
      IDEAL_ANGLES.forehand.shoulderHipAlignment.stdDev
    );
    
    // 4. 무게 중심 측면 이동
    const centerShift = keypoints[RIGHT_HIP].x - keypoints[LEFT_HIP].x;
    analysis.motionData.centerShift = centerShift;
    const centerShiftScore = 70; // 간단한 예시값
    
    // 5. 안정성 분석
    const stabilityScore = calculateStabilityScore(RIGHT_WRIST);
    
    // 6. 동작 흐름 분석
    const movementScore = calculateMovementFlowScore(RIGHT_WRIST, RIGHT_ELBOW);
    
    // 각 요소별 점수 설정
    analysis.scores = {
      posture: Math.round((elbowAngleScore + hipKneeAngleScore + shoulderHipAlignmentScore + centerShiftScore) / 4),
      stability: stabilityScore,
      movement: movementScore,
      timing: 0,
      acceleration: 0
    };
  }
  
  // 복합 점수 계산
  analysis.score = calculateCompoundScore(analysis.scores);
  return analysis;
}

/**
 * 안정성 점수 계산 (일정 시간 동안의 키포인트 움직임 일관성)
 * @param {number} keypointIndex - 분석할 키포인트 인덱스
 * @returns {number} 안정성 점수 (0-100)
 */
function calculateStabilityScore(keypointIndex) {
  if (motionHistory.keypoints.length < 5) return 50; // 데이터가 충분하지 않으면 기본값
  
  // 최근 5프레임의 키포인트 위치 변동성 계산
  const recentKeypoints = motionHistory.keypoints.slice(-5).map(frame => frame[keypointIndex]);
  
  // 유효한 키포인트만 필터링
  const validKeypoints = recentKeypoints.filter(kp => kp && kp.score > CONFIDENCE_THRESHOLD);
  if (validKeypoints.length < 3) return 50;
  
  // 위치 변동성 측정 (표준편차)
  const xPositions = validKeypoints.map(kp => kp.x);
  const yPositions = validKeypoints.map(kp => kp.y);
  
  const xVariability = calculateStandardDeviation(xPositions);
  const yVariability = calculateStandardDeviation(yPositions);
  
  // 변동성의 크기에 따라 점수 계산 (적절한 이동은 좋지만 너무 불안정한 것은 좋지 않음)
  const totalVariability = Math.sqrt(xVariability * xVariability + yVariability * yVariability);
  
  // 스윙 동작에서는 적절한 변동성이 필요함 (너무 적거나 너무 많은 것은 좋지 않음)
  // 적정 변동성: 10-80픽셀 정도로 가정
  if (totalVariability < 10) {
    return 40; // 너무 적은 움직임 (동작이 없음)
  } else if (totalVariability > 120) {
    return 30; // 너무 불안정한 움직임
  } else if (totalVariability >= 10 && totalVariability <= 80) {
    // 최적 범위 내의 변동성
    return 90;
  } else {
    // 80-120 사이의 변동성 (조금 높지만 허용 가능)
    return 70;
  }
}

/**
 * 배열의 표준편차 계산
 * @param {Array} values - 숫자 배열
 * @returns {number} 표준편차
 */
function calculateStandardDeviation(values) {
  const n = values.length;
  if (n === 0) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  
  return Math.sqrt(variance);
}

/**
 * 동작 흐름 점수 계산 (스윙의 부드러움과 연속성)
 * @param {number} wristIndex - 손목 키포인트 인덱스
 * @param {number} elbowIndex - 팔꿈치 키포인트 인덱스
 * @returns {number} 동작 흐름 점수 (0-100)
 */
function calculateMovementFlowScore(wristIndex, elbowIndex) {
  if (motionHistory.keypoints.length < 10) return 50; // 데이터가 충분하지 않으면 기본값

  // 최근 10프레임의 손목 위치 변화 분석
  const recentWristPositions = motionHistory.keypoints.slice(-10).map(frame => frame[wristIndex]);
  const recentElbowPositions = motionHistory.keypoints.slice(-10).map(frame => frame[elbowIndex]);
  
  // 유효한 키포인트만 필터링
  const validWristPos = recentWristPositions.filter(kp => kp && kp.score > CONFIDENCE_THRESHOLD);
  const validElbowPos = recentElbowPositions.filter(kp => kp && kp.score > CONFIDENCE_THRESHOLD);
  
  if (validWristPos.length < 5 || validElbowPos.length < 5) return 50;
  
  // 움직임의 부드러움 계산 (손목-팔꿈치 상대 속도의 일관성)
  let totalJerk = 0;
  let count = 0;
  
  for (let i = 2; i < validWristPos.length; i++) {
    // 손목 위치 변화의 가속도 계산
    const wristDist1 = calculateDistance(validWristPos[i], validWristPos[i-1]);
    const wristDist2 = calculateDistance(validWristPos[i-1], validWristPos[i-2]);
    const wristAccChange = Math.abs(wristDist1 - wristDist2);
    
    // 팔꿈치 위치 변화의 가속도 계산
    const elbowDist1 = calculateDistance(validElbowPos[i], validElbowPos[i-1]);
    const elbowDist2 = calculateDistance(validElbowPos[i-1], validElbowPos[i-2]);
    const elbowAccChange = Math.abs(elbowDist1 - elbowDist2);
    
    // 손목과 팔꿈치의 jerk (가속도 변화율) 계산
    const jerk = wristAccChange + elbowAccChange;
    totalJerk += jerk;
    count++;
  }
  
  if (count === 0) return 50;
  
  const avgJerk = totalJerk / count;
  
  // jerk가 적을수록 동작이 부드러움
  if (avgJerk < 5) {
    return 90; // 매우 부드러운 동작
  } else if (avgJerk < 15) {
    return 75; // 부드러운 동작
  } else if (avgJerk < 30) {
    return 60; // 보통 수준의 동작
  } else {
    return 40; // 불규칙한 동작
  }
}

/**
 * 속도 점수 계산 (특정 키포인트의 속도 분석)
 * @param {number} keypointIndex - 분석할 키포인트 인덱스
 * @returns {number} 속도 점수 (0-100)
 */
function calculateVelocityScore(keypointIndex) {
  // 최근 5프레임의 속도 데이터 가져오기
  const recentTimestamps = motionHistory.timestamps.slice(-5);
  
  if (recentTimestamps.length < 2) return 50;
  
  // 최근 속도 값들 추출
  const velocities = recentTimestamps.map(ts => {
    const velData = motionHistory.velocities[ts];
    if (!velData) return null;
    
    // 키포인트에 따라 적절한 속도 데이터 선택
    switch (keypointIndex) {
      case RIGHT_WRIST:
        return velData.rightWrist;
      case LEFT_WRIST:
        return velData.leftWrist;
      case RIGHT_ELBOW:
        return velData.rightElbow;
      case LEFT_ELBOW:
        return velData.leftElbow;
      default:
        return null;
    }
  }).filter(v => v !== null);
  
  if (velocities.length === 0) return 50;
  
  // 최대 속도 찾기
  const maxVelocity = Math.max(...velocities);
  
  // 포핸드의 경우, 적절한 손목 속도 범위는 약 5~20 픽셀/초로 가정
  if (maxVelocity < 5) {
    return 30; // 너무 느린 동작
  } else if (maxVelocity < 10) {
    return 70; // 조금 느린 동작
  } else if (maxVelocity < 20) {
    return 90; // 최적 속도 범위
  } else if (maxVelocity < 30) {
    return 80; // 조금 빠른 동작
  } else {
    return 60; // 너무 빠른 동작
  }
}

/**
 * 가속도 패턴 점수 계산
 * @param {number} keypointIndex - 분석할 키포인트 인덱스
 * @returns {number} 가속도 패턴 점수 (0-100)
 */
function calculateAccelerationScore(keypointIndex) {
  // 현재는 기본값 반환 (향후 구현 예정)
  return 70;
}

/**
 * 확률 기반 정확도 점수 계산
 * @param {Object} analysis - 분석 결과 객체
 * @param {string} strokeType - 스트로크 유형
 * @param {string} cameraPosition - 카메라 위치
 * @returns {number} 개선된 정확도 점수 (0-100)
 */
function calculateProbabilisticScore(analysis, strokeType, cameraPosition) {
  // 기본 점수 설정
  let baseScore = 50;
  let scoreComponents = [];
  let totalWeight = 0;
  
  // 스트로크 유형별 이상적 값 (전문가 기준)
  const idealValues = {
    forehand: {
      shoulderToElbowAngle: { value: 60, weight: 1.5, range: 20 },
      shoulderAlignment: { value: 30, weight: 1.2, range: 15 },
      kneeFlexionRatio: { value: 0.55, weight: 1.0, range: 0.15 },
      elbowToWristAngle: { value: 140, weight: 1.3, range: 25 },
      elbowAngle: { value: 120, weight: 1.3, range: 20 },
      hipKneeAngle: { value: 150, weight: 1.0, range: 20 },
      shoulderHipAlignment: { value: 40, weight: 0.8, range: 15 },
      centerShift: { value: 25, weight: 0.7, range: 15 }
    },
    backhand: {
      leftShoulderToElbowAngle: { value: 65, weight: 1.5, range: 20 },
      shoulderAlignment: { value: -30, weight: 1.2, range: 15 },
      kneeAngleLeft: { value: 140, weight: 1.0, range: 20 },
      handsDistance: { value: 60, weight: 1.2, range: 30 }
    },
    serve: {
      armExtension: { value: 160, weight: 1.5, range: 20 },
      shoulderRotation: { value: 120, weight: 1.2, range: 30 },
      backArch: { value: 20, weight: 1.0, range: 10 },
      kneeAngle: { value: 140, weight: 0.8, range: 20 }
    },
    volley: {
      shoulderToWristDistance: { value: 100, weight: 1.2, range: 25 },
      avgKneeAngle: { value: 145, weight: 1.0, range: 20 },
      shoulderAlignment: { value: 5, weight: 0.8, range: 10 },
      elbowHeight: { value: 10, weight: 0.9, range: 15 }
    }
  };
  
  // 동작 데이터가 없으면 기본 점수 반환
  if (!analysis.motionData) return baseScore;
  
  // 스트로크별 주요 측정값에 확률 기반 점수 적용
  for (const [key, value] of Object.entries(analysis.motionData)) {
    if (value === null || value === undefined) continue;
    
    // 해당 스트로크의 이상적 값 찾기
    const idealConfig = idealValues[strokeType][key];
    if (!idealConfig) continue;
    
    // 가우시안 확률 분포를 이용한 점수 계산
    const deviation = Math.abs(value - idealConfig.value);
    const normalizedDeviation = deviation / idealConfig.range;
    const componentScore = 100 * Math.exp(-Math.pow(normalizedDeviation, 2));
    
    // 가중치 적용하여 점수 누적
    scoreComponents.push(componentScore * idealConfig.weight);
    totalWeight += idealConfig.weight;
  }
  
  // 구성 요소가 없으면 기본 점수 반환
  if (scoreComponents.length === 0) return baseScore;
  
  // 가중 평균 계산
  const weightedScore = scoreComponents.reduce((sum, score) => sum + score, 0) / totalWeight;
  
  // 점수 보정 (더 직관적인 점수 분포를 위해)
  let finalScore = weightedScore;
  
  // 낮은 점수는 더 낮게, 높은 점수는 더 높게 조정 (S-커브 효과)
  if (finalScore < 50) {
    finalScore = 50 * (finalScore / 50) ** 1.2;
  } else {
    finalScore = 50 + 50 * ((finalScore - 50) / 50) ** 0.8;
  }
  
  // 점수 범위 제한 및 반올림
  return Math.round(Math.max(0, Math.min(100, finalScore)));
}

/**
 * 키포인트 감지 상태 계산
 * @param {Array} keypoints - 감지된 키포인트 배열
 * @param {Array} requiredPoints - 필요한 키포인트 인덱스 배열
 * @returns {Object} 감지 상태 정보
 */
function calculateKeypointDetectionStatus(keypoints, requiredPoints) {
  // 감지된 키포인트 수
  const detectedCount = requiredPoints.filter(index => 
    isValidKeypoint(keypoints[index])
  ).length;
  
  // 감지 비율
  const detectedRatio = detectedCount / requiredPoints.length;
  
  // 필요한 최소 키포인트 비율
  const requiredRatio = 0.6;
  
  // 누락된 주요 신체 부위 목록
  const missingParts = [];
  
  // 주요 신체 부위 그룹 및 이름 정의
  const bodyPartGroups = {
    [RIGHT_SHOULDER]: '오른쪽 어깨',
    [LEFT_SHOULDER]: '왼쪽 어깨',
    [RIGHT_ELBOW]: '오른쪽 팔꿈치',
    [LEFT_ELBOW]: '왼쪽 팔꿈치',
    [RIGHT_WRIST]: '오른쪽 손목',
    [LEFT_WRIST]: '왼쪽 손목',
    [RIGHT_HIP]: '오른쪽 엉덩이',
    [LEFT_HIP]: '왼쪽 엉덩이',
    [RIGHT_KNEE]: '오른쪽 무릎',
    [LEFT_KNEE]: '왼쪽 무릎',
    [RIGHT_ANKLE]: '오른쪽 발목',
    [LEFT_ANKLE]: '왼쪽 발목'
  };
  
  // 필요하지만 감지되지 않은 부위 찾기
  for (const keypointIndex of requiredPoints) {
    if (!isValidKeypoint(keypoints[keypointIndex]) && bodyPartGroups[keypointIndex]) {
      missingParts.push(bodyPartGroups[keypointIndex]);
    }
  }
  
  return {
    detectedRatio,
    requiredRatio,
    missingParts
  };
}

/**
 * 개별 키포인트의 기본 데이터 추가
 * @param {Array} keypoints - 키포인트 배열
 * @param {number} index - 키포인트 인덱스
 * @param {Object} motionData - 추가할 모션 데이터 객체
 */
function addBasicKeypointData(keypoints, index, motionData) {
  // 몸통 관련 각도 데이터
  if (index === RIGHT_SHOULDER || index === LEFT_SHOULDER) {
    // 어깨 정렬 (양쪽 어깨가 모두 감지된 경우)
    if (isValidKeypoint(keypoints[RIGHT_SHOULDER]) && isValidKeypoint(keypoints[LEFT_SHOULDER])) {
      motionData.shoulderAlignment = calculateInclination(
        keypoints[LEFT_SHOULDER], 
        keypoints[RIGHT_SHOULDER]
      );
    }
  }
  
  // 팔 관련 각도 데이터
  if ((index === RIGHT_ELBOW || index === RIGHT_WRIST) && 
      isValidKeypoint(keypoints[RIGHT_SHOULDER]) && 
      isValidKeypoint(keypoints[RIGHT_ELBOW]) && 
      isValidKeypoint(keypoints[RIGHT_WRIST])) {
    
    motionData.rightArmAngle = calculateAngle(
      keypoints[RIGHT_SHOULDER], 
      keypoints[RIGHT_ELBOW], 
      keypoints[RIGHT_WRIST]
    );
  }
  
  if ((index === LEFT_ELBOW || index === LEFT_WRIST) && 
      isValidKeypoint(keypoints[LEFT_SHOULDER]) && 
      isValidKeypoint(keypoints[LEFT_ELBOW]) && 
      isValidKeypoint(keypoints[LEFT_WRIST])) {
    
    motionData.leftArmAngle = calculateAngle(
      keypoints[LEFT_SHOULDER], 
      keypoints[LEFT_ELBOW], 
      keypoints[LEFT_WRIST]
    );
  }
  
  // 다리 관련 각도 데이터
  if ((index === RIGHT_KNEE || index === RIGHT_ANKLE) && 
      isValidKeypoint(keypoints[RIGHT_HIP]) && 
      isValidKeypoint(keypoints[RIGHT_KNEE]) && 
      isValidKeypoint(keypoints[RIGHT_ANKLE])) {
    
    motionData.rightLegAngle = calculateAngle(
      keypoints[RIGHT_HIP], 
      keypoints[RIGHT_KNEE], 
      keypoints[RIGHT_ANKLE]
    );
  }
  
  if ((index === LEFT_KNEE || index === LEFT_ANKLE) && 
      isValidKeypoint(keypoints[LEFT_HIP]) && 
      isValidKeypoint(keypoints[LEFT_KNEE]) && 
      isValidKeypoint(keypoints[LEFT_ANKLE])) {
    
    motionData.leftLegAngle = calculateAngle(
      keypoints[LEFT_HIP], 
      keypoints[LEFT_KNEE], 
      keypoints[LEFT_ANKLE]
    );
  }
}
