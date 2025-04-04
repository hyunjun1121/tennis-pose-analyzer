/**
 * 포즈 시각화 모듈
 */

// 키포인트 연결선 정의
const POSE_CONNECTIONS = [
    [NOSE, LEFT_EYE], [LEFT_EYE, LEFT_EAR], [NOSE, RIGHT_EYE], [RIGHT_EYE, RIGHT_EAR],
    [LEFT_SHOULDER, RIGHT_SHOULDER], [LEFT_SHOULDER, LEFT_ELBOW], [LEFT_ELBOW, LEFT_WRIST],
    [RIGHT_SHOULDER, RIGHT_ELBOW], [RIGHT_ELBOW, RIGHT_WRIST],
    [LEFT_SHOULDER, LEFT_HIP], [RIGHT_SHOULDER, RIGHT_HIP], [LEFT_HIP, RIGHT_HIP],
    [LEFT_HIP, LEFT_KNEE], [LEFT_KNEE, LEFT_ANKLE], [RIGHT_HIP, RIGHT_KNEE], [RIGHT_KNEE, RIGHT_ANKLE]
  ];

// 스트로크별 강조할 신체 부위 연결선
const STROKE_HIGHLIGHT_CONNECTIONS = {
  'forehand': [
    [RIGHT_SHOULDER, RIGHT_ELBOW], [RIGHT_ELBOW, RIGHT_WRIST],
    [RIGHT_HIP, RIGHT_KNEE], [RIGHT_KNEE, RIGHT_ANKLE]
  ],
  'backhand': [
    [LEFT_SHOULDER, LEFT_ELBOW], [LEFT_ELBOW, LEFT_WRIST],
    [LEFT_HIP, LEFT_KNEE], [LEFT_KNEE, LEFT_ANKLE]
  ],
  'serve': [
    [RIGHT_SHOULDER, RIGHT_ELBOW], [RIGHT_ELBOW, RIGHT_WRIST],
    [LEFT_HIP, LEFT_KNEE], [LEFT_KNEE, LEFT_ANKLE],
    [RIGHT_HIP, RIGHT_KNEE], [RIGHT_KNEE, RIGHT_ANKLE]
  ],
  'volley': [
    [LEFT_SHOULDER, RIGHT_SHOULDER],
    [LEFT_SHOULDER, LEFT_ELBOW], [LEFT_ELBOW, LEFT_WRIST],
    [RIGHT_SHOULDER, RIGHT_ELBOW], [RIGHT_ELBOW, RIGHT_WRIST]
  ]
};
  
/**
 * 감지된 포즈를 캔버스에 그리는 함수
 * @param {Object} pose - 감지된 포즈 객체
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 */
function drawPose(pose, ctx) {
  if (!pose || !pose.keypoints) return;
  
  // 캔버스 크기 가져오기
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  
  // 성능 개선: 렌더링 최적화 설정
  ctx.imageSmoothingEnabled = false;
  
  // 시각화 스타일 한 번만 가져오기
  const style = getVisualizationStyleForCamera('rear-elevated');
  const selectedStroke = document.getElementById('stroke-type')?.value || 'forehand';
  
  // 동작 궤적 그리기 (움직임 시각화)
  drawMotionTrajectory(pose.keypoints, ctx, selectedStroke);
  
  // 골격선 그리기 최적화: 모든 연결선을 한 번에 그리기
  drawSkeleton(pose.keypoints, pose.id, ctx, style, selectedStroke);
  
  // 키포인트 그리기 (임계값에 따라 크기 조정하여 신뢰도 표시)
  drawKeypointsWithConfidence(pose.keypoints, ctx, style);
  
  // 중요한 관절 각도만 선택적으로 표시
  drawImportantAngles(pose.keypoints, ctx, 'rear-elevated', selectedStroke);
  
  // 동작 인식 신뢰도 표시
  drawPoseConfidence(pose, ctx);
}

/**
 * 신뢰도를 시각적으로 표현하는 키포인트 그리기
 * @param {Array} keypoints - 키포인트 배열
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {Object} style - 시각화 스타일
 */
function drawKeypointsWithConfidence(keypoints, ctx, style) {
  // 중요 키포인트 미리 정의
  const importantKeypoints = [
    RIGHT_WRIST, LEFT_WRIST, 
    RIGHT_ELBOW, LEFT_ELBOW,
    RIGHT_SHOULDER, LEFT_SHOULDER,
    RIGHT_KNEE, LEFT_KNEE
  ];
  
  // 중요 키포인트와 일반 키포인트 분리하여 그리기
  const primaryKeypoints = [];
  const secondaryKeypoints = [];
  
  for (let i = 0; i < keypoints.length; i++) {
    const keypoint = keypoints[i];
    if (keypoint && keypoint.score > 0.1) { // 낮은 임계값으로 더 많은 키포인트 표시
      if (importantKeypoints.includes(i)) {
        primaryKeypoints.push({
          x: keypoint.x, 
          y: keypoint.y, 
          score: keypoint.score,
          index: i  // 인덱스 추가
        });
      } else {
        secondaryKeypoints.push({
          x: keypoint.x, 
          y: keypoint.y, 
          score: keypoint.score
        });
      }
    }
  }
  
  // 일반 키포인트 그리기 (작은 크기)
  if (secondaryKeypoints.length > 0) {
    ctx.fillStyle = style.secondaryKeypointColor;
    
    for (const point of secondaryKeypoints) {
      // 신뢰도에 따라 반경 조정 (낮은 신뢰도는 작게)
      const radius = style.smallKeypointRadius * Math.max(0.5, point.score);
      
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  
  // 중요 키포인트 그리기 (큰 크기)
  for (const point of primaryKeypoints) {
    // 신뢰도에 따라 투명도와 반경 조정
    const alpha = Math.max(0.4, point.score);
    const radius = style.largeKeypointRadius * Math.max(0.7, point.score);
    
    // 신뢰도에 따른 색상 (낮을수록 빨간색, 높을수록 녹색)
    const color = getConfidenceColor(point.score);
    
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    
    // 키포인트 라벨 표시 (선택적)
    if (point.score > 0.5 && window.showKeypointLabels) {
      drawKeypointLabel(ctx, point.x, point.y, getKeypointLabel(point.index));
    }
    
    ctx.globalAlpha = 1.0;
  }
}

/**
 * 신뢰도에 따른 색상 계산
 * @param {number} score - 키포인트 신뢰도 (0-1)
 * @returns {string} - RGBA 색상 문자열
 */
function getConfidenceColor(score) {
  // 신뢰도 범위에 따른 색상 보간
  if (score < 0.3) {
    // 낮은 신뢰도: 빨간색
    return 'rgba(255, 0, 0, 0.7)';
  } else if (score < 0.6) {
    // 중간 신뢰도: 노란색
    return 'rgba(255, 255, 0, 0.8)';
  } else {
    // 높은 신뢰도: 녹색
    return 'rgba(0, 255, 0, 0.9)';
  }
}

/**
 * 키포인트 인덱스에 해당하는 라벨 가져오기
 * @param {number} index - 키포인트 인덱스
 * @returns {string} - 키포인트 라벨
 */
function getKeypointLabel(index) {
  const labels = {
    [RIGHT_SHOULDER]: 'RS',
    [LEFT_SHOULDER]: 'LS',
    [RIGHT_ELBOW]: 'RE',
    [LEFT_ELBOW]: 'LE',
    [RIGHT_WRIST]: 'RW',
    [LEFT_WRIST]: 'LW',
    [RIGHT_HIP]: 'RH',
    [LEFT_HIP]: 'LH',
    [RIGHT_KNEE]: 'RK',
    [LEFT_KNEE]: 'LK',
    [RIGHT_ANKLE]: 'RA',
    [LEFT_ANKLE]: 'LA'
  };
  
  return labels[index] || `K${index}`;
}

/**
 * 키포인트 라벨 그리기
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {number} x - x 좌표
 * @param {number} y - y 좌표
 * @param {string} label - 표시할 라벨
 */
function drawKeypointLabel(ctx, x, y, label) {
  ctx.font = '12px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - 10);
}

/**
 * 포즈 인식 신뢰도 표시
 * @param {Object} pose - 감지된 포즈
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 */
function drawPoseConfidence(pose, ctx) {
  if (!pose || !pose.score) return;
  
  const canvas = ctx.canvas;
  const confidenceText = `인식 신뢰도: ${Math.round(pose.score * 100)}%`;
  
  ctx.font = '16px Arial';
  ctx.fillStyle = getConfidenceColor(pose.score);
  ctx.textAlign = 'left';
  ctx.fillText(confidenceText, 10, 30);
}

/**
 * 키포인트 그리기
 * @param {Array} keypoints - 키포인트 배열
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {Object} style - 시각화 스타일
 */
function drawKeypoints(keypoints, ctx, style) {
  // 중요 키포인트 미리 정의
  const importantKeypoints = [
    RIGHT_WRIST, LEFT_WRIST, 
    RIGHT_ELBOW, LEFT_ELBOW,
    RIGHT_SHOULDER, LEFT_SHOULDER,
    RIGHT_KNEE, LEFT_KNEE
  ];
  
  // 중요 키포인트와 일반 키포인트 분리하여 그리기
  const primaryKeypoints = [];
  const secondaryKeypoints = [];
  
  for (let i = 0; i < keypoints.length; i++) {
    const keypoint = keypoints[i];
    if (keypoint && keypoint.score > CONFIDENCE_THRESHOLD) {
      if (importantKeypoints.includes(i)) {
        primaryKeypoints.push({x: keypoint.x, y: keypoint.y});
      } else {
        secondaryKeypoints.push({x: keypoint.x, y: keypoint.y});
      }
    }
  }
  
  // 일반 키포인트 그리기 (작은 크기)
  if (secondaryKeypoints.length > 0) {
    ctx.fillStyle = style.secondaryKeypointColor;
    ctx.beginPath();
    
    for (const point of secondaryKeypoints) {
      ctx.moveTo(point.x, point.y);
      ctx.arc(point.x, point.y, style.smallKeypointRadius, 0, 2 * Math.PI);
    }
    
    ctx.fill();
  }
  
  // 중요 키포인트 그리기 (큰 크기)
  if (primaryKeypoints.length > 0) {
    ctx.fillStyle = style.primaryKeypointColor;
    ctx.beginPath();
    
    for (const point of primaryKeypoints) {
      ctx.moveTo(point.x, point.y);
      ctx.arc(point.x, point.y, style.largeKeypointRadius, 0, 2 * Math.PI);
    }
    
    ctx.fill();
  }
}

/**
 * 골격선 그리기
 * @param {Array} keypoints - 키포인트 배열
 * @param {number} poseId - 포즈 ID
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {Object} style - 시각화 스타일
 * @param {string} selectedStroke - 선택된 스트로크 유형
 */
function drawSkeleton(keypoints, poseId, ctx, style, selectedStroke) {
  // 모든 연결선 그리기 (기본 스타일)
  ctx.lineWidth = style.thinLineWidth;
  ctx.strokeStyle = style.secondaryLineColor;
  
  // 좌표 배열 미리 생성
  let lines = [];
  
  for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
    const connection = POSE_CONNECTIONS[i];
    const pointA = keypoints[connection[0]];
    const pointB = keypoints[connection[1]];
    
    if (pointA && pointB && pointA.score > CONFIDENCE_THRESHOLD && 
        pointB.score > CONFIDENCE_THRESHOLD) {
      lines.push({
        x1: pointA.x, y1: pointA.y,
        x2: pointB.x, y2: pointB.y
      });
    }
  }
  
  // 일반 연결선 한번에 그리기
  if (lines.length > 0) {
    ctx.beginPath();
    for (const line of lines) {
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
    }
    ctx.stroke();
  }
  
  // 스트로크별 중요 연결선 강조 그리기
  const highlightConnections = STROKE_HIGHLIGHT_CONNECTIONS[selectedStroke] || [];
  
  if (highlightConnections.length > 0) {
    ctx.lineWidth = style.boldLineWidth;
    ctx.strokeStyle = style.primaryLineColor;
    
    lines = [];
    
    for (let i = 0; i < highlightConnections.length; i++) {
      const connection = highlightConnections[i];
      const pointA = keypoints[connection[0]];
      const pointB = keypoints[connection[1]];
      
      if (pointA && pointB && pointA.score > CONFIDENCE_THRESHOLD && 
          pointB.score > CONFIDENCE_THRESHOLD) {
        lines.push({
          x1: pointA.x, y1: pointA.y,
          x2: pointB.x, y2: pointB.y
        });
      }
    }
    
    // 강조 연결선 한번에 그리기
    if (lines.length > 0) {
      ctx.beginPath();
      for (const line of lines) {
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
      }
      ctx.stroke();
    }
  }
}

/**
 * 주요 관절 각도 표시
 * @param {Array} keypoints - 키포인트 배열 
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 */
function drawJointAngles(keypoints, ctx) {
  const style = getVisualizationStyleForCamera('rear-elevated');
  const selectedStroke = document.getElementById('stroke-type')?.value || 'forehand';
  
  let displayedAngles = 0;
  
  // 선택된 스트로크에 따라 적절한 각도 표시
  switch (selectedStroke) {
    case 'forehand':
      // 오른쪽 팔꿈치 각도
      if (isValidKeypoint(keypoints[RIGHT_SHOULDER]) && 
          isValidKeypoint(keypoints[RIGHT_ELBOW]) && 
          isValidKeypoint(keypoints[RIGHT_WRIST])) {
        
        const elbowAngle = calculateAngle(
          keypoints[RIGHT_SHOULDER],
          keypoints[RIGHT_ELBOW],
          keypoints[RIGHT_WRIST]
        );
        
        drawAngle(
          ctx, 
          keypoints[RIGHT_SHOULDER], 
          keypoints[RIGHT_ELBOW], 
          keypoints[RIGHT_WRIST], 
          `${Math.round(elbowAngle)}°`,
          style.primaryAngleColor
        );
        displayedAngles++;
      }
      break;
      
    case 'backhand':
      // 왼쪽 팔꿈치 각도
      if (isValidKeypoint(keypoints[LEFT_SHOULDER]) && 
          isValidKeypoint(keypoints[LEFT_ELBOW]) && 
          isValidKeypoint(keypoints[LEFT_WRIST])) {
        
        const elbowAngle = calculateAngle(
          keypoints[LEFT_SHOULDER],
          keypoints[LEFT_ELBOW],
          keypoints[LEFT_WRIST]
        );
        
        drawAngle(
          ctx, 
          keypoints[LEFT_SHOULDER], 
          keypoints[LEFT_ELBOW], 
          keypoints[LEFT_WRIST], 
          `${Math.round(elbowAngle)}°`,
          style.primaryAngleColor
        );
        displayedAngles++;
      }
      break;
      
    case 'serve':
      // 어깨-팔꿈치-손목 각도 (서빙 팔)
      if (isValidKeypoint(keypoints[RIGHT_SHOULDER]) && 
          isValidKeypoint(keypoints[RIGHT_ELBOW]) && 
          isValidKeypoint(keypoints[RIGHT_WRIST])) {
        
        const elbowAngle = calculateAngle(
          keypoints[RIGHT_SHOULDER],
          keypoints[RIGHT_ELBOW],
          keypoints[RIGHT_WRIST]
        );
        
        drawAngle(
          ctx, 
          keypoints[RIGHT_SHOULDER], 
          keypoints[RIGHT_ELBOW], 
          keypoints[RIGHT_WRIST], 
          `${Math.round(elbowAngle)}°`,
          style.primaryAngleColor
        );
        displayedAngles++;
      }
      break;
  }
  
  // 무릎 각도 (모든 스트로크에서 중요)
  if (isValidKeypoint(keypoints[RIGHT_HIP]) && 
      isValidKeypoint(keypoints[RIGHT_KNEE]) && 
      isValidKeypoint(keypoints[RIGHT_ANKLE])) {
    
    const kneeAngle = calculateAngle(
      keypoints[RIGHT_HIP],
      keypoints[RIGHT_KNEE],
      keypoints[RIGHT_ANKLE]
    );
    
    drawAngle(
      ctx, 
      keypoints[RIGHT_HIP], 
      keypoints[RIGHT_KNEE], 
      keypoints[RIGHT_ANKLE], 
      `${Math.round(kneeAngle)}°`,
      style.secondaryAngleColor
    );
    displayedAngles++;
  }
}

/**
 * 중요한 각도를 시각적으로 표시
 * @param {Array} keypoints - 키포인트 배열
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {string} cameraPosition - 카메라 위치
 * @param {string} strokeType - 스트로크 유형
 */
function drawImportantAngles(keypoints, ctx, cameraPosition = 'rear-elevated', strokeType = 'forehand') {
  // 카메라 위치에 따른 시각화 스타일 설정
  const visualStyle = getVisualizationStyleForCamera(cameraPosition);
  
  ctx.fillStyle = visualStyle.textColor;
  ctx.font = visualStyle.textFont;
  
  // 관절 각도 표시 항상 최소 2개 표시
  let displayedAngles = 0;
  
  // 카메라 위치에 따라 다른 각도 표시
  if (cameraPosition === 'rear-elevated') {
    // 후방 시점에서 표시할 중요 각도
    switch (strokeType) {
      case 'forehand':
        // 어깨-팔꿈치 각도 (테이크백) - 더 낮은 임계값 적용
        if ((keypoints[RIGHT_HIP] && keypoints[RIGHT_HIP].score > 0.1) && 
            (keypoints[RIGHT_SHOULDER] && keypoints[RIGHT_SHOULDER].score > 0.1) && 
            (keypoints[RIGHT_ELBOW] && keypoints[RIGHT_ELBOW].score > 0.1)) {
          
          const shoulderToElbowAngle = calculateAngle(
            keypoints[RIGHT_HIP],
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW]
          );
          
          // 각도 표시 크기 증가 및 색상 강화
          drawAngle(
            ctx, 
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            shoulderToElbowAngle !== null ? `${shoulderToElbowAngle}°` : '계산 중...',
            'rgba(255, 220, 50, 0.9)', // 더 밝고 굵은 색상
            40, // 반경 증가
            4 // 선 굵기 증가
          );
          displayedAngles++;
        }
        
        // 팔꿈치-손목 각도
        if ((keypoints[RIGHT_SHOULDER] && keypoints[RIGHT_SHOULDER].score > 0.1) && 
            (keypoints[RIGHT_ELBOW] && keypoints[RIGHT_ELBOW].score > 0.1) && 
            (keypoints[RIGHT_WRIST] && keypoints[RIGHT_WRIST].score > 0.1)) {
          
          const elbowToWristAngle = calculateAngle(
            keypoints[RIGHT_SHOULDER],
            keypoints[RIGHT_ELBOW],
            keypoints[RIGHT_WRIST]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            keypoints[RIGHT_WRIST], 
            elbowToWristAngle !== null ? `${elbowToWristAngle}°` : '계산 중...',
            'rgba(50, 220, 255, 0.9)', // 더 밝은 색상
            35, // 반경 설정
            3 // 선 굵기
          );
          displayedAngles++;
        }
        
        // 무릎 각도
        if (displayedAngles < 2 && 
            isValidKeypoint(keypoints[RIGHT_HIP]) && 
            isValidKeypoint(keypoints[RIGHT_KNEE]) && 
            isValidKeypoint(keypoints[RIGHT_ANKLE])) {
          
          const kneeAngle = calculateAngle(
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_KNEE], 
            keypoints[RIGHT_ANKLE]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_KNEE], 
            keypoints[RIGHT_ANKLE], 
            `${Math.round(kneeAngle)}°`,
            visualStyle.tertiaryAngleColor
          );
        }
        break;
        
      case 'backhand':
        // 왼쪽 어깨-팔꿈치 각도
        if ((keypoints[LEFT_HIP] && keypoints[LEFT_HIP].score > 0.1) && 
            (keypoints[LEFT_SHOULDER] && keypoints[LEFT_SHOULDER].score > 0.1) && 
            (keypoints[LEFT_ELBOW] && keypoints[LEFT_ELBOW].score > 0.1)) {
          
          const shoulderToElbowAngle = calculateAngle(
            keypoints[LEFT_HIP],
            keypoints[LEFT_SHOULDER], 
            keypoints[LEFT_ELBOW]
          );
          
          drawAngle(
            ctx, 
            keypoints[LEFT_HIP], 
            keypoints[LEFT_SHOULDER], 
            keypoints[LEFT_ELBOW], 
            shoulderToElbowAngle !== null ? `${shoulderToElbowAngle}°` : '계산 중...',
            'rgba(255, 220, 50, 0.9)',
            40,
            4
          );
          displayedAngles++;
        }
        
        // 팔꿈치-손목 각도
        if ((keypoints[LEFT_SHOULDER] && keypoints[LEFT_SHOULDER].score > 0.1) && 
            (keypoints[LEFT_ELBOW] && keypoints[LEFT_ELBOW].score > 0.1) && 
            (keypoints[LEFT_WRIST] && keypoints[LEFT_WRIST].score > 0.1)) {
          
          const elbowToWristAngle = calculateAngle(
            keypoints[LEFT_SHOULDER],
            keypoints[LEFT_ELBOW],
            keypoints[LEFT_WRIST]
          );
          
          drawAngle(
            ctx, 
            keypoints[LEFT_SHOULDER], 
            keypoints[LEFT_ELBOW], 
            keypoints[LEFT_WRIST], 
            elbowToWristAngle !== null ? `${elbowToWristAngle}°` : '계산 중...',
            'rgba(50, 220, 255, 0.9)',
            35,
            3
          );
          displayedAngles++;
        }
        
        // 무릎 각도
        if (displayedAngles < 2 && 
            isValidKeypoint(keypoints[LEFT_HIP]) && 
            isValidKeypoint(keypoints[LEFT_KNEE]) && 
            isValidKeypoint(keypoints[LEFT_ANKLE])) {
          
          const kneeAngle = calculateAngle(
            keypoints[LEFT_HIP], 
            keypoints[LEFT_KNEE], 
            keypoints[LEFT_ANKLE]
          );
          
          drawAngle(
            ctx, 
            keypoints[LEFT_HIP], 
            keypoints[LEFT_KNEE], 
            keypoints[LEFT_ANKLE], 
            `${Math.round(kneeAngle)}°`,
            visualStyle.tertiaryAngleColor
          );
        }
        break;
        
      case 'serve':
        // 오른쪽 어깨-팔꿈치 각도
        if ((keypoints[RIGHT_HIP] && keypoints[RIGHT_HIP].score > 0.1) && 
            (keypoints[RIGHT_SHOULDER] && keypoints[RIGHT_SHOULDER].score > 0.1) && 
            (keypoints[RIGHT_ELBOW] && keypoints[RIGHT_ELBOW].score > 0.1)) {
          
          const shoulderToElbowAngle = calculateAngle(
            keypoints[RIGHT_HIP],
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            shoulderToElbowAngle !== null ? `${shoulderToElbowAngle}°` : '계산 중...',
            'rgba(255, 220, 50, 0.9)',
            40,
            4
          );
          displayedAngles++;
        }
        
        // 팔꿈치-손목 각도
        if ((keypoints[RIGHT_SHOULDER] && keypoints[RIGHT_SHOULDER].score > 0.1) && 
            (keypoints[RIGHT_ELBOW] && keypoints[RIGHT_ELBOW].score > 0.1) && 
            (keypoints[RIGHT_WRIST] && keypoints[RIGHT_WRIST].score > 0.1)) {
          
          const elbowToWristAngle = calculateAngle(
            keypoints[RIGHT_SHOULDER],
            keypoints[RIGHT_ELBOW],
            keypoints[RIGHT_WRIST]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            keypoints[RIGHT_WRIST], 
            elbowToWristAngle !== null ? `${elbowToWristAngle}°` : '계산 중...',
            'rgba(50, 220, 255, 0.9)',
            35,
            3
          );
          displayedAngles++;
        }
        
        // 무릎 각도
        if (displayedAngles < 2 && 
            (keypoints[RIGHT_HIP] && keypoints[RIGHT_HIP].score > 0.1) && 
            (keypoints[RIGHT_KNEE] && keypoints[RIGHT_KNEE].score > 0.1) && 
            (keypoints[RIGHT_ANKLE] && keypoints[RIGHT_ANKLE].score > 0.1)) {
          
          const kneeAngle = calculateAngle(
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_KNEE], 
            keypoints[RIGHT_ANKLE]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_KNEE], 
            keypoints[RIGHT_ANKLE], 
            `${Math.round(kneeAngle)}°`,
            visualStyle.tertiaryAngleColor,
            30,
            3
          );
          displayedAngles++;
        }
        break;
        
      case 'volley':
        // 무릎 각도
        if ((keypoints[RIGHT_HIP] && keypoints[RIGHT_HIP].score > 0.1) && 
            (keypoints[RIGHT_KNEE] && keypoints[RIGHT_KNEE].score > 0.1) && 
            (keypoints[RIGHT_ANKLE] && keypoints[RIGHT_ANKLE].score > 0.1)) {
          
          const kneeAngle = calculateAngle(
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_KNEE], 
            keypoints[RIGHT_ANKLE]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_KNEE], 
            keypoints[RIGHT_ANKLE], 
            `${Math.round(kneeAngle)}°`,
            'rgba(255, 220, 50, 0.9)',
            35,
            4
          );
          displayedAngles++;
        }
        
        // 볼리에서는 오른쪽 어깨-팔꿈치-손목 각도 추가
        if ((keypoints[RIGHT_SHOULDER] && keypoints[RIGHT_SHOULDER].score > 0.1) && 
            (keypoints[RIGHT_ELBOW] && keypoints[RIGHT_ELBOW].score > 0.1) && 
            (keypoints[RIGHT_WRIST] && keypoints[RIGHT_WRIST].score > 0.1)) {
          
          const elbowAngle = calculateAngle(
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            keypoints[RIGHT_WRIST]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            keypoints[RIGHT_WRIST], 
            elbowAngle !== null ? `${elbowAngle}°` : '계산 중...',
            'rgba(50, 220, 255, 0.9)',
            35,
            3
          );
          displayedAngles++;
        }
        break;
    }
  } else {
    // 기존 정면 시점 각도 표시 로직
    switch (strokeType) {
      case 'forehand':
        if (isValidKeypoint(keypoints[RIGHT_SHOULDER]) && 
            isValidKeypoint(keypoints[RIGHT_ELBOW]) && 
            isValidKeypoint(keypoints[RIGHT_WRIST])) {
          
          const elbowAngle = calculateAngle(
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            keypoints[RIGHT_WRIST]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            keypoints[RIGHT_WRIST], 
            `${Math.round(elbowAngle)}°`,
            visualStyle.primaryAngleColor
          );
          displayedAngles++;
        }
        break;
        
      case 'backhand':
        if (isValidKeypoint(keypoints[LEFT_SHOULDER]) && 
            isValidKeypoint(keypoints[LEFT_ELBOW]) && 
            isValidKeypoint(keypoints[LEFT_WRIST])) {
          
          const elbowAngle = calculateAngle(
            keypoints[LEFT_SHOULDER], 
            keypoints[LEFT_ELBOW], 
            keypoints[LEFT_WRIST]
          );
          
          drawAngle(
            ctx, 
            keypoints[LEFT_SHOULDER], 
            keypoints[LEFT_ELBOW], 
            keypoints[LEFT_WRIST], 
            `${Math.round(elbowAngle)}°`,
            visualStyle.primaryAngleColor
          );
          displayedAngles++;
        }
        break;
        
      case 'serve':
        if (isValidKeypoint(keypoints[RIGHT_SHOULDER]) && 
            isValidKeypoint(keypoints[RIGHT_ELBOW]) && 
            isValidKeypoint(keypoints[RIGHT_WRIST])) {
          
          const armExtension = calculateAngle(
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            keypoints[RIGHT_WRIST]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_SHOULDER], 
            keypoints[RIGHT_ELBOW], 
            keypoints[RIGHT_WRIST], 
            `${Math.round(armExtension)}°`,
            visualStyle.primaryAngleColor
          );
          displayedAngles++;
        }
        break;
        
      case 'volley':
        if (isValidKeypoint(keypoints[RIGHT_HIP]) && 
            isValidKeypoint(keypoints[RIGHT_KNEE]) && 
            isValidKeypoint(keypoints[RIGHT_ANKLE])) {
          
          const kneeAngle = calculateAngle(
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_KNEE], 
            keypoints[RIGHT_ANKLE]
          );
          
          drawAngle(
            ctx, 
            keypoints[RIGHT_HIP], 
            keypoints[RIGHT_KNEE], 
            keypoints[RIGHT_ANKLE], 
            `${Math.round(kneeAngle)}°`,
            visualStyle.primaryAngleColor
          );
          displayedAngles++;
        }
        break;
    }
  }
}

/**
 * 각도를 시각적으로 표현하는 함수
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {Object} pointA - 첫 번째 점
 * @param {Object} pointB - 중심점 (각도 꼭지점)
 * @param {Object} pointC - 마지막 점
 * @param {string} text - 표시할 텍스트
 * @param {string} color - 각도 표시 색상
 * @param {number} radius - 호의 반지름
 * @param {number} lineWidth - 선의 굵기
 */
function drawAngle(ctx, pointA, pointB, pointC, text, color = 'rgba(255, 255, 0, 0.7)', radius = 30, lineWidth = 3) {
  // 두 점 중 하나라도 유효하지 않으면 그리지 않음
  if (!pointA || !pointB || !pointC) return;
  
  // 텍스트에서 NaN 체크 및 처리
  const displayText = text.includes('NaN') || text.includes('null') ? '계산 중...' : text;
  
  try {
    // 좌표 유효성 검사
    if (typeof pointA.x !== 'number' || typeof pointA.y !== 'number' ||
        typeof pointB.x !== 'number' || typeof pointB.y !== 'number' ||
        typeof pointC.x !== 'number' || typeof pointC.y !== 'number') {
      // 각도를 그리지 않고 에러 상태만 표시
      drawErrorAngle(ctx, pointB, displayText, color);
      return;
    }
    
    // NaN, Infinity 값 확인
    if (isNaN(pointA.x) || isNaN(pointA.y) || 
        isNaN(pointB.x) || isNaN(pointB.y) || 
        isNaN(pointC.x) || isNaN(pointC.y) ||
        !isFinite(pointA.x) || !isFinite(pointA.y) ||
        !isFinite(pointB.x) || !isFinite(pointB.y) ||
        !isFinite(pointC.x) || !isFinite(pointC.y)) {
      // 각도를 그리지 않고 에러 상태만 표시
      drawErrorAngle(ctx, pointB, displayText, color);
      return;
    }
    
    // 두 벡터의 각도를 계산
    const angle1 = Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x);
    const angle2 = Math.atan2(pointC.y - pointB.y, pointC.x - pointB.x);
    
    if (isNaN(angle1) || isNaN(angle2)) {
      drawErrorAngle(ctx, pointB, displayText, color);
      return;
    }
    
    const angle = angle2 - angle1;
    
    // 각도를 0-2π 범위로 정규화
    const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;
    
    if (isNaN(normalizedAngle)) {
      drawErrorAngle(ctx, pointB, displayText, color);
      return;
    }
    
    // 호 그리기
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.arc(pointB.x, pointB.y, radius, angle1, angle2, normalizedAngle > Math.PI);
    ctx.stroke();
    
    // 텍스트를 위한 위치 계산 (호의 중간)
    const textAngle = angle1 + normalizedAngle / 2;
    const textX = pointB.x + (radius + 15) * Math.cos(textAngle);
    const textY = pointB.y + (radius + 15) * Math.sin(textAngle);
    
    // 텍스트 배경 (더 큰 배경)
    const textWidth = ctx.measureText(displayText).width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(textX - textWidth / 2 - 6, textY - 16, textWidth + 12, 24);
    
    // 텍스트 그리기 (더 큰 폰트)
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, textX, textY);
  } catch (error) {
    console.error('각도 시각화 중 오류 발생:', error);
    // 에러 발생 시 그냥 텍스트만 표시
    drawErrorAngle(ctx, pointB, displayText, color);
  }
}

/**
 * 오류 발생 시 간단한 표시를 위한 함수
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {Object} point - 표시할 중심점
 * @param {string} text - 표시할 텍스트
 * @param {string} color - 각도 표시 색상
 */
function drawErrorAngle(ctx, point, text, color) {
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return;
  
  try {
    // 임시 표시 (점선 원)
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.arc(point.x, point.y, 20, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 텍스트 표시
    const textX = point.x;
    const textY = point.y - 25;
    
    // 텍스트 배경
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(textX - textWidth / 2 - 6, textY - 16, textWidth + 12, 24);
    
    // 텍스트 그리기
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, textX, textY);
  } catch (error) {
    console.error('각도 오류 표시 중 오류 발생:', error);
  }
}

/**
 * 움직임 궤적 그리기
 * @param {Array} keypoints - 현재 프레임 키포인트
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {string} strokeType - 스트로크 유형
 */
function drawMotionTrajectory(keypoints, ctx, strokeType) {
  // 모션 히스토리가 없으면 리턴
  if (!motionHistory || !motionHistory.keypoints || motionHistory.keypoints.length < 2) return;
  
  // 주요 관심 키포인트 설정 (스트로크 유형에 따라 다름)
  const targetKeypoints = [];
  switch (strokeType) {
    case 'forehand':
      targetKeypoints.push(RIGHT_WRIST, RIGHT_ELBOW);
      break;
    case 'backhand':
      targetKeypoints.push(LEFT_WRIST, LEFT_ELBOW, RIGHT_WRIST);
      break;
    case 'serve':
      targetKeypoints.push(RIGHT_WRIST, RIGHT_ELBOW, RIGHT_SHOULDER);
      break;
    case 'volley':
      targetKeypoints.push(RIGHT_WRIST, LEFT_WRIST);
      break;
    default:
      targetKeypoints.push(RIGHT_WRIST, LEFT_WRIST);
  }
  
  // 각 타겟 키포인트에 대해 궤적 그리기
  for (const keypointIdx of targetKeypoints) {
    const history = motionHistory.keypoints.slice(-10); // 최근 10프레임만 사용
    const positions = [];
    
    // 유효한 키포인트 위치만 필터링
    for (const frame of history) {
      const kp = frame[keypointIdx];
      if (kp && kp.score > 0.3) {
        positions.push(kp);
      }
    }
    
    if (positions.length < 2) continue;
    
    // 궤적 그리기
    ctx.beginPath();
    ctx.moveTo(positions[0].x, positions[0].y);
    
    for (let i = 1; i < positions.length; i++) {
      ctx.lineTo(positions[i].x, positions[i].y);
    }
    
    // 키포인트에 따라 다른 색상 선택
    let strokeColor = 'rgba(255, 255, 255, 0.5)';
    if (keypointIdx === RIGHT_WRIST || keypointIdx === LEFT_WRIST) {
      strokeColor = strokeType === 'forehand' ? 
                   'rgba(255, 165, 0, 0.7)' : // 포핸드는 주황색
                   'rgba(0, 191, 255, 0.7)';  // 그 외는 하늘색
    } else if (keypointIdx === RIGHT_ELBOW || keypointIdx === LEFT_ELBOW) {
      strokeColor = 'rgba(0, 255, 0, 0.6)';  // 팔꿈치는 녹색
    }
    
    // 그라데이션 효과로 시간 방향성 표시
    const gradient = ctx.createLinearGradient(
      positions[0].x, positions[0].y,
      positions[positions.length-1].x, positions[positions.length-1].y
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, strokeColor);
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // 현재 위치에 점 표시
    const current = positions[positions.length - 1];
    ctx.beginPath();
    ctx.arc(current.x, current.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = strokeColor.replace('0.7', '0.9');
    ctx.fill();
  }
}

// 카메라 위치에 따른 시각화 스타일 설정
function getVisualizationStyleForCamera(cameraPosition) {
  // 기본 스타일
  const defaultStyle = {
    thinLineWidth: 2,
    boldLineWidth: 4,
    smallKeypointRadius: 4,
    largeKeypointRadius: 7, // 키포인트 크기 증가
    secondaryLineColor: 'rgba(100, 100, 255, 0.6)',
    primaryLineColor: 'rgba(255, 100, 100, 0.9)',
    secondaryKeypointColor: 'rgba(100, 255, 100, 0.6)',
    primaryKeypointColor: 'rgba(255, 255, 0, 0.9)',
    primaryAngleColor: 'rgba(255, 220, 50, 0.9)', // 더 밝은 색상
    secondaryAngleColor: 'rgba(50, 220, 255, 0.9)', // 더 밝은 색상
    tertiaryAngleColor: 'rgba(220, 50, 255, 0.9)', // 더 밝은 색상
    textColor: 'white',
    textFont: 'bold 16px Arial' // 폰트 볼드 처리
  };
  
  // 카메라 위치별 스타일 조정
  switch (cameraPosition) {
    case 'side':
      return {
        ...defaultStyle,
        boldLineWidth: 5,
        largeKeypointRadius: 7
      };
    case 'front':
      return {
        ...defaultStyle,
        primaryLineColor: 'rgba(255, 150, 50, 0.9)'
      };
    case 'rear-elevated':
    default:
      return defaultStyle;
  }
}

/**
 * 키포인트가 유효한지 확인
 */
function isValidKeypoint(keypoint) {
  return keypoint && keypoint.score > 0.15; // 임계값 낮춤
}
  