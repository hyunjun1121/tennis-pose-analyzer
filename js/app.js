/**
 * Tennis Pose Analysis Application Main File
 */

// Global variables
let isModelLoaded = false;
let detector = null;
let videoSource = null;
let animationFrameId = null;
let isVisualizationEnabled = true; // Visualization display flag

// Variables for storing last analysis result and update time
let lastAnalysisResult = null;
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 500; // Movement data update interval (0.5 sec)

// Stroke auto-detection variables
let currentDetectedStroke = "None";
let strokeConfidence = 0;
const MIN_CONFIDENCE_THRESHOLD = 0.7;

// DOM elements
const videoUpload = document.getElementById('video-upload');
const video = document.getElementById('video');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const analysisResult = document.getElementById('analysis-result');
const strokeType = document.getElementById('stroke-type');
const loadingElement = document.getElementById('loading');
const scoreDisplay = document.getElementById('score-display');
const scoreBar = document.getElementById('score-bar');
const scoreValue = document.getElementById('score-value');
const toggleVisualizationBtn = document.getElementById('toggle-visualization');
const currentStrokeDisplay = document.getElementById('current-stroke-display');
const currentStrokeValue = document.getElementById('current-stroke-value');

// Video control elements
const videoControls = document.getElementById('video-controls');
const timelineSlider = document.getElementById('timeline-slider');
const currentTimeDisplay = document.getElementById('current-time');
const totalTimeDisplay = document.getElementById('total-time');
const playPauseBtn = document.getElementById('play-pause-btn');
const rewindBtn = document.getElementById('rewind-btn');
const forwardBtn = document.getElementById('forward-btn');
const playbackSpeed = document.getElementById('playback-speed');
const volumeSlider = document.getElementById('volume-slider');
const muteBtn = document.getElementById('mute-btn');
const speedBtn = document.getElementById('speed-btn');
const videoContainer = document.querySelector('.video-container');

// Video controller initial state setup
function setupVideoControls() {
  // Only display controllers for video files, not webcam
  if (!videoSource && video.src) {
    videoControls.classList.remove('hidden');
    
    // Timeline slider range setup
    timelineSlider.min = 0;
    timelineSlider.max = video.duration;
    timelineSlider.value = 0;
    
    // Total time display setup
    const totalMinutes = Math.floor(video.duration / 60);
    const totalSeconds = Math.floor(video.duration % 60);
    totalTimeDisplay.textContent = `${totalMinutes}:${totalSeconds < 10 ? '0' : ''}${totalSeconds}`;
    
    // Default playback speed setup
    video.playbackRate = 1.0;
    playbackSpeed.value = '1';
    
    // Default volume setup
    video.volume = 1.0;
    volumeSlider.value = 1.0;
    updateVolumeIcon(video.volume);
    
    // Initial icon setup
    updatePlayPauseIcon();
  } else {
    videoControls.classList.add('hidden');
  }
}

// Update volume
function updateVolume() {
  video.volume = volumeSlider.value;
  video.muted = (video.volume === 0);
  updateVolumeIcon(video.volume);
}

// Toggle mute
function toggleMute() {
  video.muted = !video.muted;
  
  if (video.muted) {
    volumeSlider.setAttribute('data-volume', volumeSlider.value);
    volumeSlider.value = 0;
  } else {
    volumeSlider.value = volumeSlider.getAttribute('data-volume') || 1;
  }
  
  updateVolumeIcon(video.muted ? 0 : volumeSlider.value);
}

// Update volume icon
function updateVolumeIcon(volume) {
  if (volume === 0 || video.muted) {
    muteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
  } else if (volume < 0.5) {
    muteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 9v6h4l5 5V4l-5 5H7z"/><path d="M11.28 9.74c.4-.41.72-.89.94-1.44v6.22c-.25-.56-.57-1.08-.94-1.5-2.79.63-3.8 2.96-4 3.98h-1.28v-6h2c.55-.56 1.9-1.74 3.28-1.26z"/></svg>';
  } else {
    muteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
  }
}

// Toggle play/pause
function togglePlayPause() {
  if (video.paused) {
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.error('Video playback failed:', error);
      });
    }
  } else {
    video.pause();
  }
  
  updatePlayPauseIcon();
}

// Update play/pause icon
function updatePlayPauseIcon() {
  if (video.paused) {
    playPauseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  } else {
    playPauseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
  }
}

// Update time display
function updateTimeDisplay() {
  // Calculate current time
  const currentMinutes = Math.floor(video.currentTime / 60);
  const currentSeconds = Math.floor(video.currentTime % 60);
  currentTimeDisplay.textContent = `${currentMinutes}:${currentSeconds < 10 ? '0' : ''}${currentSeconds}`;
  
  // Update timeline slider (only when not dragging)
  if (!timelineSlider.matches(':active')) {
    timelineSlider.value = video.currentTime;
  }
}

// Update video time (when timeline slider is manipulated)
function updateVideoTime() {
  video.currentTime = timelineSlider.value;
  
  // Update frame display even when paused
  if (video.paused && detector) {
    detectAndAnalyze();
  }
}

// Skip time (forward/backward)
function skipTime(seconds) {
  const newTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  video.currentTime = newTime;
  
  // Update frame display even when paused
  if (video.paused && detector) {
    detectAndAnalyze();
  }
}

// Update playback speed
function updatePlaybackSpeed() {
  video.playbackRate = parseFloat(playbackSpeed.value);
}

/**
 * Application initialization - progressive loading version
 */
async function initialize() {
  canvas.width = 640;
  canvas.height = 480;
  
  // Enable initial UI (available before model loading)
  enableLimitedUI();
  
  showLoading(true, 'Preparing model...');
  
  try {
    // Load pose detection model (using function implemented in poseDetector.js)
    detector = await loadPoseDetectionModel();
    isModelLoaded = true;
    console.log('Model loaded successfully');
    
    // Enable all UI elements
    enableFullUI();
  } catch (error) {
    console.error('Model loading failed:', error);
    showModelLoadError(error);
  }
  
  showLoading(false);
  
  // Toggle visualization button event listener setup
  toggleVisualizationBtn.addEventListener('click', toggleVisualization);
}

/**
 * Toggle visualization on/off
 */
function toggleVisualization() {
  isVisualizationEnabled = !isVisualizationEnabled;
  
  if (isVisualizationEnabled) {
    canvas.style.display = 'block';
    toggleVisualizationBtn.classList.add('active');
  } else {
    canvas.style.display = 'none';
    toggleVisualizationBtn.classList.remove('active');
  }
}

/**
 * Enable limited UI (before model loading)
 */
function enableLimitedUI() {
  // File upload button is always enabled
  videoUpload.disabled = false;
  
  // Toggle visualization button is disabled
  toggleVisualizationBtn.disabled = true;
  
  // Display message
  analysisResult.innerHTML = `
    <div class="feedback-item info">
      <h3>Loading model...</h3>
      <p>Please wait while the pose detection model is being loaded.</p>
      <p>All features will be available once the model is loaded.</p>
    </div>
  `;
}

/**
 * Enable full UI (after model loading)
 */
function enableFullUI() {
  // Enable all controls
  toggleVisualizationBtn.disabled = false;
  
  // Display message
  analysisResult.innerHTML = `
    <div class="feedback-item success">
      <h3>Ready</h3>
      <p>Please upload a video to analyze your tennis form.</p>
    </div>
  `;
}

/**
 * Display model loading error
 */
function showModelLoadError(error) {
  analysisResult.innerHTML = `
    <div class="feedback-item error">
      <h3>Model loading failed</h3>
      <p>Please try the following:</p>
      <ul>
        <li>Refresh the page and try again</li>
        <li>Use a different browser (Chrome recommended)</li>
        <li>Check your internet connection</li>
      </ul>
      <details>
        <summary>Technical error details</summary>
        <code>${error.message || 'Unknown error'}</code>
      </details>
    </div>
  `;
}

/**
 * Handle video file upload
 */
function handleVideoUpload(event) {
  if (!isModelLoaded) {
    alert('Model is not loaded yet. Please try again later.');
    event.target.value = ''; // Reset file selection
    return;
  }

  const file = event.target.files[0];
  if (!file) return;
  
  // Stop previous analysis
  stopAnalysis();
  
  showLoading(true, 'Processing video...');
  
  // Set new video source
  const videoURL = URL.createObjectURL(file);
  video.srcObject = null;
  video.src = videoURL;
  
  video.onloadedmetadata = () => {
    showLoading(false);
    
    // Initialize video controls for uploaded video
    setupVideoControls();
    
    // Adjust video position to maintain aspect ratio and center within container
    adjustVideoPosition();
    
    // Play video with promise to handle errors
    const playPromise = video.play();
    
    // Handle play promise (if supported)
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          startAnalysis();
          updatePlayPauseIcon();
        })
        .catch(error => {
          console.error('Video playback failed:', error);
          analysisResult.innerHTML = `
            <div class="feedback-item warning">
              <h3>Video playback error</h3>
              <p>Failed to play video. Please try again.</p>
            </div>
          `;
        });
    } else {
      // Fallback for older browsers
      startAnalysis();
      updatePlayPauseIcon();
    }
  };
  
  // Handle video loading error
  video.onerror = () => {
    showLoading(false);
    analysisResult.innerHTML = `
      <div class="feedback-item error">
        <h3>Video error</h3>
        <p>Failed to process video file. Please try a different format.</p>
      </div>
    `;
  };
}

// Handle video resize event
video.addEventListener('resize', adjustVideoPosition);

// Handle window resize event
window.addEventListener('resize', () => {
  if (video.videoWidth && video.videoHeight) {
    adjustVideoPosition();
  }
});

/**
 * Start analysis
 */
function startAnalysis() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  lastUpdateTime = 0;
  detectAndAnalyze();
}

/**
 * Detect and analyze pose
 */
async function detectAndAnalyze() {
  try {
    if (!detector || !video.videoWidth || !video.videoHeight) {
      animationFrameId = requestAnimationFrame(detectAndAnalyze);
      return;
    }
    
    // Optimize: only update canvas size when video size changes
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // Adjust video position to maintain aspect ratio and center within container
      adjustVideoPosition();
    }
    
    // Calculate current time for update interval
    const now = Date.now();
    const needsUpdate = now - lastUpdateTime > UPDATE_INTERVAL;
    
    // Set pose detection options
    const estimationConfig = {
      flipHorizontal: false, // Disable horizontal flip
      maxDetections: 1, // Detect only one person
      enableSmoothing: true, // Enable smoothing
      scoreThreshold: 0.3 // Set score threshold
    };
    
    // Detect pose
    const poses = await detector.estimatePoses(video, estimationConfig);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (poses && poses.length > 0) {
      const pose = poses[0]; // Process only the first person's pose
      
      // Improve motion detection: use previous frame if current frame has low confidence
      const validKeypoints = pose.keypoints.filter(kp => kp.score > 0.2).length;
      const minRequiredKeypoints = 6; // Require at least 6 valid keypoints
      
      // Use previous analysis result if current frame has low confidence
      if (validKeypoints < minRequiredKeypoints && lastAnalysisResult) {
        // Visualize pose but do not update analysis
        if (isVisualizationEnabled) {
          drawPose(pose, ctx);
        }
        
        // Request next frame
        animationFrameId = requestAnimationFrame(detectAndAnalyze);
        return;
      }
      
      // Visualize pose (if visualization is enabled)
      if (isVisualizationEnabled) {
        drawPose(pose, ctx);
      }
      
      // Update analysis at regular intervals
      if (needsUpdate) {
        // Auto-detect stroke type (only in auto mode)
        if (strokeType.value === 'auto') {
          const detectedStrokeInfo = detectStrokeType(pose);
          currentDetectedStroke = detectedStrokeInfo.type;
          strokeConfidence = detectedStrokeInfo.confidence;
          
          // Display detected stroke type
          updateDetectedStroke(currentDetectedStroke, strokeConfidence);
        }
        
        // Determine stroke type (auto or manual selection)
        const selectedStroke = strokeType.value === 'auto' ? currentDetectedStroke : strokeType.value;
        
        // Analyze tennis form - assume camera position is "rear-elevated"
        lastAnalysisResult = analyzeTennisForm(pose, selectedStroke, 'rear-elevated');
        
        // Display analysis result
        displayMotionData(lastAnalysisResult);
        
        // Update score
        updateScore(lastAnalysisResult.score);
        
        lastUpdateTime = now;
      }
    }
  } catch (error) {
    console.error('Pose detection error:', error);
  } finally {
    // Request next frame
    animationFrameId = requestAnimationFrame(detectAndAnalyze);
  }
}

/**
 * Adjust video position to maintain aspect ratio and center within container
 */
function adjustVideoPosition() {
  // Calculate video aspect ratio
  const videoRatio = video.videoWidth / video.videoHeight;
  
  // Calculate container height (dynamically set based on video aspect ratio)
  const containerHeight = videoContainer.clientWidth / videoRatio;
  
  // Set container height (with maximum height limit)
  const maxHeight = window.innerHeight * 0.8; // 80% of window height
  videoContainer.style.height = `${Math.min(containerHeight, maxHeight)}px`;
  
  // Adjust video and canvas size
  if (containerHeight > maxHeight) {
    // If height exceeds maximum height
    const videoDisplayHeight = maxHeight;
    const videoDisplayWidth = videoDisplayHeight * videoRatio;
    
    const marginLeft = (videoContainer.clientWidth - videoDisplayWidth) / 2;
    
    video.style.width = `${videoDisplayWidth}px`;
    video.style.height = `${videoDisplayHeight}px`;
    video.style.marginTop = '0';
    video.style.marginLeft = `${marginLeft}px`;
    
    canvas.style.width = `${videoDisplayWidth}px`;
    canvas.style.height = `${videoDisplayHeight}px`;
    canvas.style.marginTop = '0';
    canvas.style.marginLeft = `${marginLeft}px`;
    
    // Adjust video controls position
    if (videoControls) {
      videoControls.style.width = `${videoDisplayWidth}px`;
      videoControls.style.bottom = '0';
      videoControls.style.left = `${marginLeft}px`;
    }
  } else {
    // If video fits within container
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.marginTop = '0';
    video.style.marginLeft = '0';
    
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.marginTop = '0';
    canvas.style.marginLeft = '0';
    
    // Adjust video controls position
    if (videoControls) {
      videoControls.style.width = '100%';
      videoControls.style.bottom = '0';
      videoControls.style.left = '0';
    }
  }
}

/**
 * Stop analysis
 */
function stopAnalysis() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Clean up video resources
  if (video.src) {
    video.pause();
    updatePlayPauseIcon();
  }
  
  scoreDisplay.classList.add('hidden');
  currentStrokeDisplay.classList.add('hidden');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  analysisResult.innerHTML = '<p class="placeholder">Please upload a video to analyze your tennis form.</p>';
  
  // Hide control UI
  videoControls.classList.add('hidden');
}

/**
 * Update analysis based on selected stroke type
 */
function updateAnalysis() {
  if (animationFrameId) {
    // Update immediately if analysis is in progress
    analysisResult.innerHTML = '<p>Analyzing your tennis form...</p>';
    
    // Hide current stroke display if not in auto mode
    if (strokeType.value !== 'auto') {
      currentStrokeDisplay.classList.add('hidden');
    } else {
      currentStrokeDisplay.classList.remove('hidden');
    }
  }
}

/**
 * Update score display
 */
function updateScore(score) {
  // Normalize score to 0-100 range
  const normalizedScore = Math.min(100, Math.max(0, score));
  scoreBar.style.width = `${normalizedScore}%`;
  scoreValue.textContent = Math.round(normalizedScore);
  
  // Update score label and color based on score
  let scoreLabel = "";
  if (normalizedScore < 30) {
    scoreBar.style.backgroundColor = '#e74c3c'; // Red (low)
    scoreLabel = "Needs improvement";
  } else if (normalizedScore < 50) {
    scoreBar.style.backgroundColor = '#e67e22'; // Orange (basic)
    scoreLabel = "Basic";
  } else if (normalizedScore < 70) {
    scoreBar.style.backgroundColor = '#f39c12'; // Yellow (intermediate)
    scoreLabel = "Intermediate";
  } else if (normalizedScore < 85) {
    scoreBar.style.backgroundColor = '#27ae60'; // Green (good)
    scoreLabel = "Good";
  } else {
    scoreBar.style.backgroundColor = '#2ecc71'; // Bright green (excellent)
    scoreLabel = "Excellent";
  }
  
  // Display score label
  const scoreLabel_el = document.getElementById('score-label');
  if (scoreLabel_el) {
    scoreLabel_el.textContent = scoreLabel;
  } else {
    const labelSpan = document.createElement('span');
    labelSpan.id = 'score-label';
    labelSpan.textContent = scoreLabel;
    labelSpan.style.marginLeft = '10px';
    labelSpan.style.fontWeight = 'bold';
    scoreValue.parentNode.appendChild(labelSpan);
  }
}

/**
 * Display motion data
 */
function displayMotionData(analysis) {
  if (!analysis || !analysis.motionData) {
    analysisResult.innerHTML = '<p class="placeholder">No motion data available. Please try again.</p>';
    return;
  }
  
  // Create table for motion data
  let tableHTML = '<div class="motion-data-table">';
  
  // Display warning message if body parts are not fully detected
  if (analysis.motionData.visibilityIssue) {
    const visibilityData = analysis.motionData.visibilityIssue;
    const detectionRatio = Math.round(visibilityData.detected * 100);
    
    let warningMessage = `<div class="motion-warning">`;
    
    // Display missing body parts
    if (visibilityData.missingParts && visibilityData.missingParts.length > 0) {
      const missingPartsList = visibilityData.missingParts.slice(0, 3).join(', ');
      const extraParts = visibilityData.missingParts.length > 3 ? ` and ${visibilityData.missingParts.length - 3} more` : '';
      
      warningMessage += `
        <p><strong>Detection accuracy: ${detectionRatio}%</strong></p>
        <p>Missing body parts: ${missingPartsList}${extraParts}</p>
        <p>Analysis is limited due to incomplete data.</p>
      `;
    } else {
      warningMessage += `
        <p><strong>Detection accuracy: ${detectionRatio}%</strong></p>
        <p>Some body parts are not fully detected, which may affect analysis accuracy.</p>
      `;
    }
    
    warningMessage += `
      <p class="motion-tips">
        <strong>Improvement tips:</strong><br>
        - Ensure the entire body is visible in the video<br>
        - Record in a well-lit environment<br>
        - Wear fitted clothing for better detection
      </p>
    </div>`;
    
    // Add warning message to analysis result
    tableHTML = warningMessage + tableHTML;
  } else if (analysis.motionData.detectionConfidence) {
    // Display confidence message if detection confidence is low
    const confidence = analysis.motionData.detectionConfidence;
    const confidenceRatio = Math.round(confidence.ratio * 100);
    
    tableHTML = `
      <div class="motion-notice">
        <p><strong>Detection confidence: ${confidenceRatio}%</strong> - ${confidence.message}</p>
      </div>
    ` + tableHTML;
  }
  
  // Filter out unnecessary keys from motion data
  const excludeKeys = ['visibilityIssue', 'detectionConfidence'];
  const motionData = Object.entries(analysis.motionData).filter(([key]) => !excludeKeys.includes(key));
  
  // Display motion data if available
  if (motionData.length > 0) {
    // Display motion data
    motionData.forEach(([key, value]) => {
      // Only display numeric values
      if (typeof value === 'number') {
        // Get readable label and formatted value
        const readableLabel = getReadableLabel(key);
        const formattedValue = key.includes('Angle') || key.includes('Rotation') ? `${Math.round(value)}°` : Math.round(value * 100) / 100;
        
        // Calculate visualization width based on value
        const visWidth = getVisualizationWidth(key, value);
        
        tableHTML += `
          <div class="data-row">
            <div class="data-label">${readableLabel}</div>
            <div class="data-value">${formattedValue}</div>
            <div class="data-visualization">
              <div class="vis-bar" style="width: ${visWidth}%"></div>
            </div>
          </div>
        `;
      }
    });
    
    tableHTML += '</div>';
    
    // Calculate overall score
    updateScore(analysis.score);
    
    // Display analysis result
    analysisResult.innerHTML = tableHTML;
    
    // Show score display
    if (scoreDisplay) {
      scoreDisplay.classList.remove('hidden');
    }
  } else {
    // Display message if no motion data is available
    analysisResult.innerHTML = `
      <div class="motion-warning">
        <p>No motion data available.</p>
        <p class="motion-tips">
          <strong>Improvement tips:</strong><br>
          - Ensure the entire body is visible in the video<br>
          - Record in a well-lit environment<br>
          - Perform tennis movements clearly and smoothly
        </p>
      </div>
    `;
    
    // Hide score display
    if (scoreDisplay) {
      scoreDisplay.classList.add('hidden');
    }
  }
}

/**
 * Show/hide loading indicator
 * @param {boolean} show - Whether to show or hide
 * @param {string} message - Message to display (optional)
 */
function showLoading(show, message = 'Loading model...') {
  if (show) {
    loadingElement.classList.remove('hidden');
    const messageEl = loadingElement.querySelector('p');
    if (messageEl) {
      messageEl.textContent = message;
    }
  } else {
    loadingElement.classList.add('hidden');
  }
}

/**
 * Get readable label for motion data key
 */
function getReadableLabel(key) {
  const labels = {
    // Existing labels
    shoulderToElbowAngle: 'Shoulder to Elbow Angle',
    shoulderAlignment: 'Shoulder Alignment',
    kneeFlexionRatio: 'Knee Flexion Ratio',
    elbowToWristAngle: 'Elbow to Wrist Angle',
    elbowAngle: 'Elbow Angle',
    hipKneeAngle: 'Hip Knee Angle',
    shoulderHipAlignment: 'Shoulder Hip Alignment',
    centerShift: 'Center Shift',
    
    // New basic keypoints data
    rightArmAngle: 'Right Arm Angle',
    leftArmAngle: 'Left Arm Angle',
    rightLegAngle: 'Right Leg Angle',
    leftLegAngle: 'Left Leg Angle',
    
    // Additional measurements
    shoulderToWristDistance: 'Shoulder to Wrist Distance',
    handsDistance: 'Hands Distance',
    armExtension: 'Arm Extension',
    shoulderRotation: 'Shoulder Rotation',
    backArch: 'Back Arch',
    kneeAngle: 'Knee Angle',
    avgKneeAngle: 'Average Knee Angle',
    elbowHeight: 'Elbow Height',
    wristSpeed: 'Wrist Speed',
    hipRotation: 'Hip Rotation',
    detectionConfidence: 'Detection Confidence'
  };
  
  return labels[key] || key.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Calculate visualization width based on data type and value
 */
function getVisualizationWidth(key, value) {
  // Define optimal ranges for each data type
  const ranges = {
    shoulderToElbowAngle: { min: 0, max: 120, optimal: [30, 90] },
    shoulderAlignment: { min: -90, max: 90, optimal: [10, 45] },
    kneeFlexionRatio: { min: 0, max: 1, optimal: [0.4, 0.7] },
    elbowToWristAngle: { min: 90, max: 180, optimal: [110, 170] },
    elbowAngle: { min: 0, max: 180, optimal: [90, 150] },
    hipKneeAngle: { min: 90, max: 180, optimal: [130, 170] },
    shoulderHipAlignment: { min: 0, max: 50, optimal: [30, 50] },
    centerShift: { min: -50, max: 50, optimal: [15, 50] }
  };
  
  // Default range
  const defaultRange = { min: 0, max: 100, optimal: [40, 60] };
  const range = ranges[key] || defaultRange;
  
  // Normalize value to 0-100 range
  const normalized = ((value - range.min) / (range.max - range.min)) * 100;
  
  // Limit to 0-100 range
  return Math.max(0, Math.min(100, normalized));
}

/**
 * Auto-detect stroke type
 */
function detectStrokeType(pose) {
  // This section needs to be implemented with actual stroke detection algorithm
  // For now, a simple example is provided
  
  // Determine stroke type based on keypoints and joint angles
  const keypoints = pose.keypoints;
  
  // Extract necessary keypoints
  const rightWrist = findKeypoint(keypoints, 'right_wrist');
  const leftWrist = findKeypoint(keypoints, 'left_wrist');
  const rightShoulder = findKeypoint(keypoints, 'right_shoulder');
  const leftShoulder = findKeypoint(keypoints, 'left_shoulder');
  const rightElbow = findKeypoint(keypoints, 'right_elbow');
  const leftElbow = findKeypoint(keypoints, 'left_elbow');
  
  // Keypoints are not fully detected
  if (!rightWrist || !leftWrist || !rightShoulder || !leftShoulder || !rightElbow || !leftElbow) {
    return { type: 'Detecting...', confidence: 0 };
  }
  
  // Determine stroke type based on wrist position
  const rightWristY = rightWrist.y;
  const leftWristY = leftWrist.y;
  const rightWristX = rightWrist.x;
  const leftWristX = leftWrist.x;
  
  // Calculate right elbow angle
  const rightElbowAngle = calculateAngle(
    [rightShoulder.x, rightShoulder.y],
    [rightElbow.x, rightElbow.y],
    [rightWrist.x, rightWrist.y]
  );
  
  // Calculate left elbow angle
  const leftElbowAngle = calculateAngle(
    [leftShoulder.x, leftShoulder.y],
    [leftElbow.x, leftElbow.y],
    [leftWrist.x, leftWrist.y]
  );
  
  // Determine stroke type
  let strokeType = 'Detecting...';
  let confidence = 0.5;
  
  // Serve detection - both hands above head
  if (rightWristY < rightShoulder.y && leftWristY < leftShoulder.y) {
    strokeType = 'Serve';
    confidence = 0.8;
  }
  // Forehand detection - right hand to the right of right shoulder and elbow bent
  else if (rightWristX > rightShoulder.x && rightElbowAngle < 160) {
    strokeType = 'Forehand';
    confidence = 0.75;
  }
  // Backhand detection - left hand to the right of left shoulder and elbow bent
  else if (leftWristX < leftShoulder.x && leftElbowAngle < 160) {
    strokeType = 'Backhand';
    confidence = 0.75;
  }
  // Volley detection - hands forward and elbows not fully bent
  else if ((rightElbowAngle > 160 || leftElbowAngle > 160) && 
          (rightWristY < rightElbow.y || leftWristY < leftElbow.y)) {
    strokeType = 'Volley';
    confidence = 0.7;
  }
  
  return { type: strokeType, confidence: confidence };
}

/**
 * Find keypoint by name
 */
function findKeypoint(keypoints, name) {
  if (!keypoints || !name) return null;
  
  for (const keypoint of keypoints) {
    if (keypoint.name === name && keypoint.score > 0.2) {
      return keypoint;
    }
  }
  
  return null;
}

/**
 * Calculate angle between three points
 */
function calculateAngle(p1, p2, p3) {
  const radians = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]) - 
                 Math.atan2(p1[1] - p2[1], p1[0] - p2[0]);
  let angle = Math.abs(radians * 180.0 / Math.PI);
  
  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  
  return angle;
}

/**
 * Update detected stroke display
 */
function updateDetectedStroke(strokeType, confidence) {
  // Display "Detecting..." if confidence is below threshold
  if (confidence < MIN_CONFIDENCE_THRESHOLD) {
    currentStrokeValue.textContent = 'Detecting...';
    return;
  }
  
  // Convert stroke type to display name
  let strokeName;
  switch(strokeType) {
    case 'Forehand':
      strokeName = 'Forehand';
      break;
    case 'Backhand':
      strokeName = 'Backhand';
      break;
    case 'Serve':
      strokeName = 'Serve';
      break;
    case 'Volley':
      strokeName = 'Volley';
      break;
    default:
      strokeName = strokeType;
  }
  
  currentStrokeValue.textContent = strokeName;
  currentStrokeDisplay.classList.remove('hidden');
}

// Handle video end event
function handleVideoEnd() {
  video.pause();
  updatePlayPauseIcon();
}

// Set up event listeners
document.addEventListener('DOMContentLoaded', initialize);
videoUpload.addEventListener('change', handleVideoUpload);
strokeType.addEventListener('change', updateAnalysis);

// Set up video control event listeners
if (videoControls) {
  // Play/pause button event listener
  playPauseBtn.addEventListener('click', togglePlayPause);
  
  // Timeline slider event listener
  timelineSlider.addEventListener('input', updateVideoTime);
  
  // Rewind/fast-forward button event listeners
  rewindBtn.addEventListener('click', () => skipTime(-5));
  forwardBtn.addEventListener('click', () => skipTime(5));
  
  // Playback speed event listener
  playbackSpeed.addEventListener('change', updatePlaybackSpeed);
  
  // Volume control event listeners
  volumeSlider.addEventListener('input', updateVolume);
  
  // Mute button event listener
  muteBtn.addEventListener('click', toggleMute);
  
  // Video time update event listener
  video.addEventListener('timeupdate', updateTimeDisplay);
  
  // Video metadata loaded event listener
  video.addEventListener('loadedmetadata', setupVideoControls);
  
  // Video end event listener
  video.addEventListener('ended', handleVideoEnd);
}
