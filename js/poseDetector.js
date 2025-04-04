/**
 * 포즈 감지 관련 기능을 담당하는 모듈
 */

// 블레이즈포즈 키포인트 인덱스
const NOSE = 0;
const LEFT_EYE = 1;
const RIGHT_EYE = 2;
const LEFT_EAR = 3;
const RIGHT_EAR = 4;
const LEFT_SHOULDER = 5;
const RIGHT_SHOULDER = 6;
const LEFT_ELBOW = 7;
const RIGHT_ELBOW = 8;
const LEFT_WRIST = 9;
const RIGHT_WRIST = 10;
const LEFT_HIP = 11;
const RIGHT_HIP = 12;
const LEFT_KNEE = 13;
const RIGHT_KNEE = 14;
const LEFT_ANKLE = 15;
const RIGHT_ANKLE = 16;

/**
 * 키포인트 신뢰도 기준치
 * 이 값보다 낮은 신뢰도를 가진 키포인트는 무시
 */
const CONFIDENCE_THRESHOLD = 0.15;

// 키포인트 필터링을 위한 시간 가중치 계수
const TEMPORAL_FILTERING_ALPHA = 0.8;
// 이전 프레임 키포인트 저장 변수
let previousKeypoints = null;

// 전역 변수로 모델 캐시
let cachedModel = null;
let modelLoadingProgress = 0;

/**
 * 포즈 감지 모델 로드
 * @param {boolean} forceReload - 강제 재로드 여부 
 * @returns {Promise<PoseDetector>} 로드된 포즈 감지 모델
 */
async function loadPoseDetectionModel(forceReload = false) {
  // 이미 로드된 모델이 있고 강제 재로드가 아니면 캐시된 모델 반환
  if (cachedModel && !forceReload) {
    console.log('캐시된 모델 사용');
    return cachedModel;
  }
  
  console.log('모델 새로 로드 시작...');
  modelLoadingProgress = 0;
  
  // 로딩 UI 표시 (app.js의 showLoading 함수 호출 가정)
  if (typeof showLoading === 'function') {
    showLoading(true);
  }
  
  // MoveNet 모델 설정
  const detectorConfig = {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    enableSmoothing: true,
    minPoseScore: 0.25
  };
  
  try {
    // WebGL 백엔드 사용 및 최적화 설정
    if (tf && tf.getBackend() !== 'webgl') {
      await tf.setBackend('webgl');
      console.log('WebGL 백엔드 초기화 완료');
      
      // GPU 메모리 관리 및 성능 최적화
      if (tf.ENV.features['WEBGL_VERSION'] >= 2) {
        console.log('WebGL 2.0 지원 확인됨');
      }
      
      // 타입 최적화
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
      // 최적화 추가 설정
      tf.env().set('WEBGL_PACK', true);
      tf.env().set('WEBGL_FLUSH_THRESHOLD', 1);
      tf.env().set('CHECK_COMPUTATION_FOR_ERRORS', false);
    }
    
    // 모델 생성 (최대 3번 재시도)
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        // 진행률 업데이트
        updateLoadingProgress(0.3 * (attempts + 1));
        
        cachedModel = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet, 
          detectorConfig
        );
        
        console.log('모델 로드 완료!');
        updateLoadingProgress(1.0);
        
        // 모델 워밍업 (첫 추론은 느릴 수 있으므로)
        if (tf && tf.browser && tf.browser.fromPixels) {
          // 올바른 차원의 더미 이미지 생성 (3차원 - 높이, 너비, 채널)
          const dummyCanvas = document.createElement('canvas');
          dummyCanvas.width = 192;
          dummyCanvas.height = 192;
          const ctx = dummyCanvas.getContext('2d');
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 192, 192);
          
          // 캔버스에서 이미지 데이터 가져오기
          const dummyImageData = ctx.getImageData(0, 0, 192, 192);
          const dummyTensor = tf.browser.fromPixels(dummyImageData);
          
          try {
            // 모델 워밍업
            await cachedModel.estimatePoses(dummyTensor);
          } catch (e) {
            console.warn('워밍업 중 오류 발생 (무시됨):', e.message);
          } finally {
            // 텐서 해제
            dummyTensor.dispose();
          }
        }
        
        break; // 성공하면 루프 종료
      } catch (e) {
        attempts++;
        console.warn(`모델 로드 시도 ${attempts}/${maxAttempts} 실패: ${e.message}`);
        
        if (attempts >= maxAttempts) {
          throw e; // 최대 시도 횟수 초과 시 에러 전파
        }
        
        // 잠시 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return cachedModel;
  } catch (error) {
    console.error('모델 로드 실패:', error);
    throw error;
  } finally {
    if (typeof showLoading === 'function') {
      showLoading(false);
    }
  }
}

/**
 * 모델 로딩 진행률 업데이트
 * @param {number} progress - 0.0 ~ 1.0 사이의 진행률
 */
function updateLoadingProgress(progress) {
  modelLoadingProgress = progress;
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    const progressText = Math.round(progress * 100);
    loadingEl.querySelector('p').textContent = `모델 로딩 중... ${progressText}%`;
    
    // 진행률 바 업데이트
    const progressBar = document.getElementById('loading-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${progressText}%`;
    }
    
    // 지연되는 경우 경고 스타일 적용
    if (progress > 0.7 && progress < 0.9) {
      loadingEl.classList.add('loading-warning');
      loadingEl.classList.add('pulse-animation');
    } else {
      loadingEl.classList.remove('loading-warning');
      loadingEl.classList.remove('pulse-animation');
    }
  }
}

/**
 * 모델 사전 로딩 시작
 * 페이지 로드 즉시 백그라운드에서 모델 로딩 시작
 */
function preloadModel() {
  // 페이지 로드 완료 후 잠시 대기
  window.addEventListener('load', () => {
    // 주요 리소스 로드 후 1초 후에 모델 로딩 시작
    setTimeout(() => {
      console.log('모델 사전 로딩 시작...');
      // TensorFlow.js 초기화 확인
      if (!tf || !tf.ready) {
        console.warn('TensorFlow.js가 준비되지 않았습니다. 모델 사전 로딩을 건너뜁니다.');
        return;
      }
      
      // 백엔드 초기화 보장
      tf.ready().then(() => {
        loadPoseDetectionModel()
          .then(() => console.log('모델 사전 로딩 완료'))
          .catch(err => {
            console.warn('모델 사전 로딩 실패:', err);
            // 오류 표시 UI 업데이트 (선택사항)
            const errorEl = document.getElementById('model-error');
            if (errorEl) {
              errorEl.textContent = '모델 로드 중 오류가 발생했습니다. 다시 시도해 주세요.';
              errorEl.style.display = 'block';
            }
          });
      });
    }, 1000);
  });
}

// 모델 사전 로딩 시작
preloadModel();

/**
 * 지정된 키포인트가 충분한 신뢰도를 가지는지 확인
 * @param {Object} keypoint - 확인할 키포인트
 * @returns {boolean} 유효한 키포인트인지 여부
 */
function isValidKeypoint(keypoint) {
  return keypoint && keypoint.score > CONFIDENCE_THRESHOLD;
}

/**
 * 필요한 모든 키포인트가 감지되었는지 확인
 * @param {Array} keypoints - 키포인트 배열
 * @param {Array} requiredIndices - 필요한 키포인트의 인덱스 배열
 * @returns {boolean} 분석 진행 가능 여부
 */
function hasRequiredKeypoints(keypoints, requiredIndices) {
  // 감지된 필수 키포인트 수 계산
  const validKeypointsCount = requiredIndices.filter(index => 
    isValidKeypoint(keypoints[index])
  ).length;
  
  // 최소 필요 키포인트 비율 (필수 키포인트 중 최소 50% 이상 감지되어야 함)
  const minimumRequiredRatio = 0.5;
  const validRatio = validKeypointsCount / requiredIndices.length;
  
  // 주요 키포인트 (어깨, 팔꿈치, 손목) 감지 여부 확인
  // 이 부위들은 테니스 동작 분석에 가장 중요
  const coreKeypoints = [
    RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, 
    LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST
  ];
  
  // 필요한 키포인트 중 주요 키포인트 목록 추출
  const requiredCoreKeypoints = requiredIndices.filter(index => coreKeypoints.includes(index));
  
  // 주요 키포인트가 최소 40% 이상 감지되어야 함
  const validCoreKeypointsCount = requiredCoreKeypoints.filter(index => 
    isValidKeypoint(keypoints[index])
  ).length;
  const validCoreRatio = requiredCoreKeypoints.length > 0 ? 
                         validCoreKeypointsCount / requiredCoreKeypoints.length : 0;
  
  // 최소 기준: 전체 필수 키포인트의 50% 이상 OR 주요 키포인트의 40% 이상
  return validRatio >= minimumRequiredRatio || validCoreRatio >= 0.4;
}

/**
 * 특정 부위의 각도 계산
 * @param {Object} pointA - 시작점
 * @param {Object} pointB - 중심점
 * @param {Object} pointC - 끝점
 * @returns {number} 계산된 각도 (도)
 */
function calculateAngle(pointA, pointB, pointC) {
  // 포인트가 없거나 x, y 속성이 없는 경우 처리
  if (!pointA || !pointB || !pointC) return null;
  if (typeof pointA.x !== 'number' || typeof pointA.y !== 'number' ||
      typeof pointB.x !== 'number' || typeof pointB.y !== 'number' ||
      typeof pointC.x !== 'number' || typeof pointC.y !== 'number') {
    return null;
  }
  
  // NaN, Infinity 값 확인
  if (isNaN(pointA.x) || isNaN(pointA.y) || 
      isNaN(pointB.x) || isNaN(pointB.y) || 
      isNaN(pointC.x) || isNaN(pointC.y) ||
      !isFinite(pointA.x) || !isFinite(pointA.y) ||
      !isFinite(pointB.x) || !isFinite(pointB.y) ||
      !isFinite(pointC.x) || !isFinite(pointC.y)) {
    return null;
  }
  
  try {
    // 벡터 중복 확인 (두 점이 같은 위치에 있으면 각도 계산 불가)
    if ((pointA.x === pointB.x && pointA.y === pointB.y) || 
        (pointC.x === pointB.x && pointC.y === pointB.y)) {
      return null;
    }
    
    const angleRadians = Math.atan2(
      pointC.y - pointB.y, 
      pointC.x - pointB.x
    ) - Math.atan2(
      pointA.y - pointB.y, 
      pointA.x - pointB.x
    );
    
    // 결과가 NaN인지 확인
    if (isNaN(angleRadians)) {
      return null;
    }
    
    let angleDegrees = angleRadians * 180 / Math.PI;
    if (angleDegrees < 0) angleDegrees += 360;
    
    // 최종 결과 확인
    return isNaN(angleDegrees) ? null : Math.round(angleDegrees);
  } catch (error) {
    console.error('각도 계산 중 오류 발생:', error);
    return null;
  }
}

/**
 * 두 점 사이의 거리 계산
 * @param {Object} pointA - 첫 번째 점
 * @param {Object} pointB - 두 번째 점
 * @returns {number} 두 점 사이의 거리
 */
function calculateDistance(pointA, pointB) {
  if (!pointA || !pointB) return null;
  
  const deltaX = pointB.x - pointA.x;
  const deltaY = pointB.y - pointA.y;
  
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/**
 * 신체의 기울기 계산 (수직선에서의 편차)
 * @param {Object} upperPoint - 상단 점
 * @param {Object} lowerPoint - 하단 점
 * @returns {number} 기울기 각도 (도)
 */
function calculateInclination(upperPoint, lowerPoint) {
  if (!upperPoint || !lowerPoint) return null;
  
  const deltaX = lowerPoint.x - upperPoint.x;
  const deltaY = lowerPoint.y - upperPoint.y;
  
  const angleRadians = Math.atan2(deltaX, deltaY);
  let angleDegrees = angleRadians * 180 / Math.PI;
  
  return angleDegrees;
}

/**
 * 시간적 필터링을 적용하여 키포인트 평활화
 * @param {Array} currentKeypoints - 현재 프레임 키포인트
 * @returns {Array} 필터링된 키포인트
 */
function applyTemporalFiltering(currentKeypoints) {
  if (!currentKeypoints || !previousKeypoints) {
    previousKeypoints = [...currentKeypoints];
    return currentKeypoints;
  }
  
  const smoothedKeypoints = [...currentKeypoints];
  
  // 각 키포인트에 대해 시간적 필터링 적용
  for (let i = 0; i < currentKeypoints.length; i++) {
    const current = currentKeypoints[i];
    const prev = previousKeypoints[i];
    
    // 두 프레임 모두 키포인트가 유효하면 평활화 적용
    if (current && prev && current.score > 0.1 && prev.score > 0.1) {
      smoothedKeypoints[i] = {
        x: TEMPORAL_FILTERING_ALPHA * current.x + (1 - TEMPORAL_FILTERING_ALPHA) * prev.x,
        y: TEMPORAL_FILTERING_ALPHA * current.y + (1 - TEMPORAL_FILTERING_ALPHA) * prev.y,
        score: Math.max(current.score, prev.score * 0.95) // 이전 점수를 약간 감쇠
      };
    }
  }
  
  // 현재 키포인트를 이전 키포인트로 저장
  previousKeypoints = [...smoothedKeypoints];
  return smoothedKeypoints;
}

/**
 * 카메라 위치/각도에 따른 포즈 좌표 보정
 * @param {Object} pose - 감지된 원본 포즈 데이터
 * @param {string} cameraPosition - 카메라 위치 설정
 * @returns {Object} 보정된 포즈 데이터
 */
function adjustPoseForCameraPosition(pose, cameraPosition) {
  if (!pose || !pose.keypoints) return pose;
  
  // 시간적 필터링 적용
  const smoothedKeypoints = applyTemporalFiltering(pose.keypoints);
  
  // 자세 보정 전에 누락된 키포인트 추정 시도
  const enhancedKeypoints = estimateMissingKeypoints(smoothedKeypoints);
  
  const keypoints = [...enhancedKeypoints]; // 최종 처리된 키포인트 복사
  
  // 카메라 위치가 자동일 경우 위치 추정
  if (cameraPosition === 'auto') {
    cameraPosition = estimateCameraPosition(keypoints);
  }
  
  switch (cameraPosition) {
    case 'rear-elevated': 
      // 코트 뒤 상단에서 촬영한 경우 (기본 케이스)
      return applyRearElevatedCorrection({...pose, keypoints});
      
    case 'side':
      // 측면에서 촬영한 경우 
      return applySideViewCorrection({...pose, keypoints});
      
    case 'front':
      // 정면에서 촬영한 경우
      return {...pose, keypoints}; // 기존 알고리즘은 정면 기준으로 설계됨
      
    default:
      return {...pose, keypoints};
  }
}

/**
 * 키포인트 패턴을 분석하여 카메라 위치 자동 추정
 * @param {Array} keypoints - 키포인트 배열
 * @returns {string} 추정된 카메라 위치
 */
function estimateCameraPosition(keypoints) {
  // 1. 어깨 폭과 엉덩이 폭의 비율 확인
  const shoulderWidth = calculateDistance(keypoints[LEFT_SHOULDER], keypoints[RIGHT_SHOULDER]);
  const hipWidth = calculateDistance(keypoints[LEFT_HIP], keypoints[RIGHT_HIP]);
  
  if (!shoulderWidth || !hipWidth) return 'rear-elevated'; // 기본값
  
  const widthRatio = shoulderWidth / hipWidth;
  
  // 2. 얼굴 키포인트 점수 확인 (정면일수록 점수가 높음)
  const faceKeypointsScore = (
    (keypoints[NOSE]?.score || 0) +
    (keypoints[LEFT_EYE]?.score || 0) +
    (keypoints[RIGHT_EYE]?.score || 0)
  ) / 3;
  
  // 3. 키포인트 배치 패턴 분석
  if (faceKeypointsScore < 0.2) {
    // 얼굴 키포인트가 거의 감지되지 않으면 후방 시점
    return 'rear-elevated';
  } else if (faceKeypointsScore > 0.7 && widthRatio > 0.8 && widthRatio < 1.2) {
    // 얼굴이 잘 보이고 어깨와 엉덩이 폭이 비슷하면 정면
    return 'front';
  } else if (Math.abs(keypoints[LEFT_SHOULDER].x - keypoints[RIGHT_SHOULDER].x) < 30) {
    // 어깨가 거의 수직선 상에 있으면 측면
    return 'side';
  }
  
  // 기본값은 가장 일반적인 케이스인 후방 상단으로 설정
  return 'rear-elevated';
}

/**
 * 뒤쪽 높은 각도에서 촬영된 포즈 보정
 * @param {Object} pose - 원본 포즈 데이터
 * @returns {Object} 보정된 포즈 데이터
 */
function applyRearElevatedCorrection(pose) {
  const correctedPose = {
    ...pose,
    keypoints: [...pose.keypoints]
  };
  
  // 1. 수직 높이 보정 (원근감으로 인해 상단부가 더 작게 보이는 현상 보정)
  const topY = Math.min(
    ...[NOSE, LEFT_EYE, RIGHT_EYE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER]
      .map(idx => pose.keypoints[idx]?.y || Infinity)
  );
  
  const bottomY = Math.max(
    ...[LEFT_ANKLE, RIGHT_ANKLE]
      .map(idx => pose.keypoints[idx]?.y || 0)
  );
  
  if (topY < Infinity && bottomY > 0) {
    const heightRange = bottomY - topY;
    
    // 상단 키포인트일수록 더 많은 수직 보정 적용
    correctedPose.keypoints.forEach((keypoint, index) => {
      if (!keypoint) return;
      
      // 높이에 따른 보정 계수 (상단일수록 크게 보정)
      const verticalFactor = 1 + 0.15 * ((bottomY - keypoint.y) / heightRange);
      
      // 키포인트 유형에 따른 특별 보정
      if ([LEFT_SHOULDER, RIGHT_SHOULDER].includes(index)) {
        // 어깨 폭 보정 (약간 넓게)
        const direction = index === LEFT_SHOULDER ? -1 : 1;
        keypoint.x += direction * 10;
      }
    });
  }

  return correctedPose;
}

/**
 * 측면에서 촬영된 포즈 보정
 * @param {Object} pose - 원본 포즈 데이터
 * @returns {Object} 보정된 포즈 데이터
 */
function applySideViewCorrection(pose) {
  const correctedPose = {
    ...pose,
    keypoints: [...pose.keypoints]
  };
  
  // 측면 시점은 깊이 정보 손실이 심하므로 간단한 보정만 적용
  correctedPose.keypoints.forEach((keypoint, index) => {
    if (!keypoint) return;
    
    // 측면에서는 어깨, 엉덩이의 앞/뒤 구분이 중요
    if ([LEFT_SHOULDER, LEFT_HIP].includes(index) || 
        [RIGHT_SHOULDER, RIGHT_HIP].includes(index)) {
      
      // 몸 중심과의 거리를 강조하여 앞/뒤 구분을 명확하게
      // 여기서는 x축 위치를 약간 조정
      const shoulderMidpoint = (
        (pose.keypoints[LEFT_SHOULDER]?.x || 0) + 
        (pose.keypoints[RIGHT_SHOULDER]?.x || 0)
      ) / 2;
      
      // 앞쪽 관절은 더 눈에 띄게, 뒤쪽 관절은 덜 눈에 띄게 조정
      const distanceFromMid = keypoint.x - shoulderMidpoint;
      keypoint.x += distanceFromMid * 0.1; // 차이를 10% 강조
    }
  });
  
  return correctedPose;
}

/**
 * 카메라 위치와 스트로크 유형에 따라 필요한 키포인트 결정
 * @param {string} strokeType - 스트로크 유형
 * @param {string} cameraPosition - 카메라 위치
 * @returns {Array} 필요한 키포인트 인덱스 배열
 */
function getRequiredKeypointsForPosition(strokeType, cameraPosition) {
  // 후방 시점에서는 얼굴 키포인트를 필수조건에서 제외
  if (cameraPosition === 'rear-elevated') {
    switch (strokeType) {
      case 'forehand':
        return [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE];
      case 'backhand':
        return [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, LEFT_WRIST, LEFT_HIP, LEFT_KNEE];
      case 'serve':
        return [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP];
      case 'volley':
        return [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, LEFT_KNEE, RIGHT_KNEE];
      default:
        return [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE];
    }
  } else if (cameraPosition === 'side') {
    // 측면 시점에서는 다른 키포인트 세트가 필요
    switch (strokeType) {
      case 'forehand':
        return [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP, RIGHT_KNEE];
      case 'backhand':
        return [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, LEFT_WRIST, LEFT_HIP, LEFT_KNEE];
      case 'serve':
        return [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP, RIGHT_KNEE];
      case 'volley':
        return [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE];
      default:
        return [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP, RIGHT_KNEE];
    }
  }
  
  // 정면이나 기타 위치의 경우 기본 키포인트 세트 사용
  const REQUIRED_KEYPOINTS = {
    forehand: [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE],
    backhand: [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, LEFT_WRIST, LEFT_HIP, LEFT_KNEE],
    serve: [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP],
    volley: [LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST, LEFT_KNEE, RIGHT_KNEE]
  };
  
  return REQUIRED_KEYPOINTS[strokeType] || REQUIRED_KEYPOINTS.forehand;
}

/**
 * 카메라 위치에 따른 시각화 스타일 조정
 * @param {string} cameraPosition - 카메라 위치
 * @returns {Object} 시각화 스타일 설정
 */
function getVisualizationStyleForCamera(cameraPosition) {
  const defaultStyle = {
    keypointRadius: 6,
    keypointColor: '#ff0000',
    lineWidth: 4,
    lineColor: '#00ff00',
    textColor: 'rgba(255, 255, 0, 0.7)',
    textFont: '16px Arial'
  };
  
  switch (cameraPosition) {
    case 'rear-elevated':
      // 후방 시점에서는 키포인트를 더 크게 표시
      return {
        ...defaultStyle,
        keypointRadius: 8,
        lineWidth: 5
      };
      
    case 'side':
      // 측면 시점에서는 다른 색상 사용
      return {
        ...defaultStyle,
        keypointColor: '#ff9900',
        lineColor: '#0099ff'
      };
      
    default:
      return defaultStyle;
  }
}

/**
 * 분석 결과에 카메라 위치 정보 추가
 * @param {Object} analysis - 기존 분석 결과
 * @param {string} cameraPosition - 카메라 위치
 * @returns {Object} 업데이트된 분석 결과
 */
function addCameraContextToAnalysis(analysis, cameraPosition) {
  if (!analysis) return analysis;
  
  // 추가적인 컨텍스트 정보 추가
  let additionalContext = '';
  switch (cameraPosition) {
    case 'rear-elevated':
      additionalContext = '(후방 상단 시점 기준)';
      break;
    case 'side':
      additionalContext = '(측면 시점 기준)';
      break;
    case 'front':
      additionalContext = '(정면 시점 기준)';
      break;
    case 'auto':
      additionalContext = '(자동 감지된 시점 기준)';
      break;
  }
  
  // 피드백 메시지에 컨텍스트 추가
  if (analysis.feedback && analysis.feedback.length > 0) {
    analysis.contextInfo = `분석은 ${additionalContext} 수행되었습니다.`;
  }
  
  return analysis;
}

/**
 * 누락된 키포인트 추정 함수
 * @param {Array} keypoints - 원본 키포인트 배열
 * @returns {Array} 추정이 적용된 키포인트 배열
 */
function estimateMissingKeypoints(keypoints) {
  const result = [...keypoints];
  
  // 키포인트 인덱스 맵
  const keypointIndices = {};
  keypoints.forEach((kp, index) => {
    if (kp && kp.name) {
      keypointIndices[kp.name] = index;
    }
  });
  
  // 어깨 키포인트가 누락된 경우 추정
  if (keypointIndices.hasOwnProperty('left_shoulder') && 
      keypointIndices.hasOwnProperty('right_shoulder')) {
    
    const leftShoulder = keypoints[keypointIndices['left_shoulder']];
    const rightShoulder = keypoints[keypointIndices['right_shoulder']];
    
    // 두 어깨 중 하나라도 감지된 경우
    if ((leftShoulder && leftShoulder.score >= CONFIDENCE_THRESHOLD) || 
        (rightShoulder && rightShoulder.score >= CONFIDENCE_THRESHOLD)) {
      
      // 왼쪽 어깨가 감지되지 않은 경우
      if (!leftShoulder || leftShoulder.score < CONFIDENCE_THRESHOLD) {
        if (rightShoulder && rightShoulder.score >= CONFIDENCE_THRESHOLD) {
          // 오른쪽 어깨를 기준으로 왼쪽 어깨 추정
          result[keypointIndices['left_shoulder']] = {
            x: rightShoulder.x - 100, // 왼쪽으로 일정 거리
            y: rightShoulder.y,
            score: rightShoulder.score * 0.8,
            name: 'left_shoulder'
          };
        }
      }
      
      // 오른쪽 어깨가 감지되지 않은 경우
      if (!rightShoulder || rightShoulder.score < CONFIDENCE_THRESHOLD) {
        if (leftShoulder && leftShoulder.score >= CONFIDENCE_THRESHOLD) {
          // 왼쪽 어깨를 기준으로 오른쪽 어깨 추정
          result[keypointIndices['right_shoulder']] = {
            x: leftShoulder.x + 100, // 오른쪽으로 일정 거리
            y: leftShoulder.y,
            score: leftShoulder.score * 0.8,
            name: 'right_shoulder'
          };
        }
      }
      
      // 왼쪽 팔꿈치가 누락된 경우
      if (keypointIndices.hasOwnProperty('left_elbow') && 
          (!keypoints[keypointIndices['left_elbow']] || 
           keypoints[keypointIndices['left_elbow']].score < CONFIDENCE_THRESHOLD)) {
        
        const leftShoulderPoint = result[keypointIndices['left_shoulder']];
        const leftWristIdx = keypointIndices['left_wrist'];
        
        // 손목이 감지된 경우 어깨와 손목 사이 중간에 팔꿈치 추정
        if (leftWristIdx && keypoints[leftWristIdx] && keypoints[leftWristIdx].score >= CONFIDENCE_THRESHOLD) {
          result[keypointIndices['left_elbow']] = {
            x: (leftShoulderPoint.x + keypoints[leftWristIdx].x) / 2,
            y: (leftShoulderPoint.y + keypoints[leftWristIdx].y) / 2,
            score: Math.min(leftShoulderPoint.score, keypoints[leftWristIdx].score) * 0.9,
            name: 'left_elbow'
          };
        } else {
          // 손목이 없으면 어깨 아래쪽에 팔꿈치 추정
          result[keypointIndices['left_elbow']] = {
            x: leftShoulderPoint.x,
            y: leftShoulderPoint.y + 60,
            score: leftShoulderPoint.score * 0.7,
            name: 'left_elbow'
          };
        }
      }
      
      // 오른쪽 팔꿈치가 누락된 경우
      if (keypointIndices.hasOwnProperty('right_elbow') && 
          (!keypoints[keypointIndices['right_elbow']] || 
           keypoints[keypointIndices['right_elbow']].score < CONFIDENCE_THRESHOLD)) {
        
        const rightShoulderPoint = result[keypointIndices['right_shoulder']];
        const rightWristIdx = keypointIndices['right_wrist'];
        
        // 손목이 감지된 경우 어깨와 손목 사이 중간에 팔꿈치 추정
        if (rightWristIdx && keypoints[rightWristIdx] && keypoints[rightWristIdx].score >= CONFIDENCE_THRESHOLD) {
          result[keypointIndices['right_elbow']] = {
            x: (rightShoulderPoint.x + keypoints[rightWristIdx].x) / 2,
            y: (rightShoulderPoint.y + keypoints[rightWristIdx].y) / 2,
            score: Math.min(rightShoulderPoint.score, keypoints[rightWristIdx].score) * 0.9,
            name: 'right_elbow'
          };
        } else {
          // 손목이 없으면 어깨 아래쪽에 팔꿈치 추정
          result[keypointIndices['right_elbow']] = {
            x: rightShoulderPoint.x,
            y: rightShoulderPoint.y + 60,
            score: rightShoulderPoint.score * 0.7,
            name: 'right_elbow'
          };
        }
      }
      
      // 히프(엉덩이) 추정
      const noseIdx = keypointIndices['nose'];
      if (noseIdx && keypoints[noseIdx] && keypoints[noseIdx].score >= CONFIDENCE_THRESHOLD) {
        const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
        const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        
        // 왼쪽 히프 추정
        if (keypointIndices.hasOwnProperty('left_hip') && 
            keypoints[keypointIndices['left_hip']].score < CONFIDENCE_THRESHOLD) {
          const leftHipX = midShoulderX - (rightShoulder.x - leftShoulder.x) / 2;
          const leftHipY = midShoulderY + (midShoulderY - keypoints[noseIdx].y);
          
          result[keypointIndices['left_hip']] = {
            x: leftHipX,
            y: leftHipY,
            score: leftShoulder.score * 0.7,
            name: 'left_hip'
          };
        }
        
        // 오른쪽 히프 추정
        if (keypointIndices.hasOwnProperty('right_hip') && 
            keypoints[keypointIndices['right_hip']].score < CONFIDENCE_THRESHOLD) {
          const rightHipX = midShoulderX + (rightShoulder.x - leftShoulder.x) / 2;
          const rightHipY = midShoulderY + (midShoulderY - keypoints[noseIdx].y);
          
          result[keypointIndices['right_hip']] = {
            x: rightHipX,
            y: rightHipY,
            score: rightShoulder.score * 0.7,
            name: 'right_hip'
          };
        }
      }
    }
  }
  
  return result;
}
