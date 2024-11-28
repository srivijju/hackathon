const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const axios = require('axios'); // Use axios instead of node-fetch

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Setup face-api.js
const MODEL_URL = path.join(__dirname, '/models'); // Assuming your models are in a 'models' folder
faceapi.env.monkeyPatch({ Canvas: canvas.Canvas, Image: canvas.Image, ImageData: canvas.ImageData });

// Function to download models
async function downloadModel(url, outputPath) {
    if (!fs.existsSync(outputPath)) {
        console.log(`Downloading: ${url}`);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, response.data);
        console.log(`Downloaded: ${outputPath}`);
    } else {
        console.log(`Model already exists: ${outputPath}`);
    }
}

async function downloadFaceApiModels() {
    const modelBaseUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    const modelFiles = [
        'ssd_mobilenetv1_model-weights_manifest.json',
        'ssd_mobilenetv1_model-shard1',
        'ssd_mobilenetv1_model-shard2',
        'ssd_mobilenetv1_model.bin', 
        'face_landmark_68_model.bin',
        'face_landmark_68_model-weights_manifest.json',
        'face_landmark_68_model-shard1',
        'face_expression_model-weights_manifest.json',
        'face_expression_model-shard1',
        'face_recognition_model-weights_manifest.json', 
        'face_recognition_model-shard1',
        'face_recognition_model.bin'
    ];

    if (!fs.existsSync(MODEL_URL)) {
        fs.mkdirSync(MODEL_URL, { recursive: true });
    }

    for (const file of modelFiles) {
        const url = `${modelBaseUrl}${file}`;
        const outputPath = path.join(MODEL_URL, file);
        await downloadModel(url, outputPath);
    }

    console.log('All models downloaded successfully!');
}

// Load models after downloading
async function loadModels() {
    try {
        await downloadFaceApiModels(); // Ensure models are downloaded first
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_URL);
        console.log('Models loaded');
    } catch (err) {
        console.error('Error loading models:', err);
    }
}

loadModels();

// Endpoint to classify an image
app.post('/classify', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log('File uploaded:', req.file);

    const imagePath = path.join(__dirname, req.file.path);

    try {
        // Load the uploaded image
        const uploadedImage = await canvas.loadImage(imagePath);

        // Detect faces in the uploaded image
        const detections = await faceapi.detectAllFaces(uploadedImage)
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (detections.length === 0) {
            return res.json({ result: 'No faces detected in the uploaded image' });
        }

        // Path to known faces folder
        const imageFolderPath = path.join(__dirname, 'known_faces');
        if (!fs.existsSync(imageFolderPath)) {
            return res.status(400).json({ error: 'Known faces directory not found' });
        }

        const knownFaceFiles = fs.readdirSync(imageFolderPath);
        if (knownFaceFiles.length === 0) {
            return res.status(400).json({ error: 'No known faces in the directory' });
        }

        let matchedImages = [];  // To store matched images

        // Compare each detected face with each known face in the folder
        for (const detection of detections) {
            // Loop through all known faces
            for (const file of knownFaceFiles) {
                const knownFacePath = path.join(imageFolderPath, file);
                const knownFaceImage = await canvas.loadImage(knownFacePath);
                const knownFaceDetection = await faceapi.detectAllFaces(knownFaceImage)
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                if (knownFaceDetection.length > 0) {
                    // Compare each known face descriptor with the uploaded face descriptor
                    for (const knownFace of knownFaceDetection) {
                        const distance = faceapi.euclideanDistance(detection.descriptor, knownFace.descriptor);

                        // If a match is found (below a certain threshold)
                        if (distance < 0.6) {
                            matchedImages.push(file); // Add the matched image filename to the result
                            break;
                        }
                    }
                }
            }
        }

        // Clean up the uploaded image
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

        if (matchedImages.length > 0) {
            return res.json({ result: `Match found in the following images: ${matchedImages.join(', ')}` });
        } else {
            return res.json({ result: 'No match found in the database' });
        }
    } catch (err) {
        console.error('Error processing image:', err);
        res.status(500).json({ error: 'Internal server error while processing image' });
    }
});

const PORT = 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
