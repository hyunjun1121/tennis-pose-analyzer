# Tennis Pose Analyzer

A real-time tennis body movement visualization web application using TensorFlow.js and pose estimation models.

## Features

- Real-time body movement visualization through webcam
- Analysis via video upload
- Tracking of various tennis stroke motions (forehand, backhand, serve, volley)
- Collection and visualization of movement data by body part
- Motion accuracy measurement

## Visualization Features

- Body part connection lines and keypoint visualization
- Real-time display of major joint angles
- Emphasis of important body parts by stroke type
- Body movement trajectory tracking
- Quantification and visual representation of motion data

## Getting Started

### Requirements

- Latest version of Chrome, Firefox, Edge or Safari browser
- Webcam (for real-time analysis)
- Internet connection (for loading TensorFlow.js models)

### Installation and Execution

1. Clone the repository:
   ```bash
   git clone https://github.com/hyunjun1121/tennis-pose-analyzer.git
   cd tennis-pose-analyzer
   ```

2. Run web server:
   You can run the project using a simple local server.
   If Python is installed:
   ```bash
   # Python 3
   python -m http.server
   # Python 2
   python -m SimpleHTTPServer
   ```

3. Access in browser:
   ```
   http://localhost:8000
   ```

## How to Use

1. Click the 'Start Webcam' button to begin real-time analysis, or click the 'Upload Video' button to analyze saved tennis videos.
2. Select the type of tennis stroke to analyze from the dropdown menu (forehand, backhand, serve, volley).
3. Check the movement data and accuracy score displayed on the right side of the screen.
4. Visually understand tennis movements through the body part movements and trajectories displayed on the screen.

## How It Works

1. Loads the MoveNet pose estimation model using TensorFlow.js.
2. Extracts body keypoints in real-time from webcam or uploaded video.
3. Collects important movement data for each tennis stroke based on the extracted keypoints.
4. Visually represents the collected data and tracks movement trajectories.

## Project Structure

- `index.html`: Main HTML file
- `css/`: Stylesheet files
- `js/`: JavaScript files
  - `app.js`: Application entry point
  - `poseDetector.js`: Pose detection module
  - `tennisAnalyzer.js`: Tennis pose movement data collection module
  - `visualizer.js`: Visualization module
  - `utils.js`: Utility functions

## Future Improvements

- Add more tennis stroke types
- Add movement data storage and recording functionality
- Mobile device optimization
- Add 3D visualization functionality
- Offline mode support


## Contact

If you have any questions or suggestions, please register an issue or contact me at [email](mnb9227@gmail.com).
