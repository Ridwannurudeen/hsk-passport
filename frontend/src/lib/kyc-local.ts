"use client";

import { createWorker } from "tesseract.js";
import * as faceapi from "face-api.js";

export interface ExtractedDocumentData {
  rawText: string;
  possibleName: string | null;
  possibleDOB: string | null;
  possibleIDNumber: string | null;
  possibleCountry: string | null;
}

export interface FaceMatchResult {
  matched: boolean;
  confidence: number; // 0-1, higher is better (lower euclidean distance)
  distance: number;   // cosine-like distance between descriptors
}

let modelsLoaded = false;

export async function loadFaceApiModels(): Promise<void> {
  if (modelsLoaded) return;
  const MODEL_URL = "/face-models";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

// ============================================================
// Document OCR (with preprocessing)
// ============================================================

/**
 * Preprocess image to improve OCR accuracy:
 *  - Upscale small images (Tesseract works best at 300+ DPI equivalent)
 *  - Convert to grayscale
 *  - Boost contrast
 *  - Binarize (threshold at midpoint)
 */
async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    i.src = url;
  });

  // Upscale if image is small (targeting ~1600px on the long edge)
  const maxDim = Math.max(img.width, img.height);
  const scale = maxDim < 1600 ? 1600 / maxDim : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  // Grayscale + contrast boost + soft binarization
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Compute mean luminance for adaptive thresholding
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += gray;
  }
  const mean = sum / (data.length / 4);

  // Contrast stretching around the mean
  const CONTRAST = 1.6;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Center on mean, apply contrast, then clamp
    let v = (gray - mean) * CONTRAST + mean;
    v = Math.max(0, Math.min(255, v));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

export async function extractDocumentText(file: File): Promise<string> {
  // Preprocess for better OCR
  const canvas = await preprocessImage(file);

  const worker = await createWorker("eng", 1, {
    // Use the better quality LSTM engine
    logger: () => {},
  });

  // Tune Tesseract for document text (mixed printed text blocks)
  await worker.setParameters({
    tessedit_pageseg_mode: "6" as unknown as Parameters<typeof worker.setParameters>[0]["tessedit_pageseg_mode"], // Assume a single uniform block of text
    preserve_interword_spaces: "1",
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,'-/<>():",
  });

  const result = await worker.recognize(canvas);
  await worker.terminate();
  return result.data.text;
}

export async function extractDocumentTextWithPreview(file: File): Promise<{ text: string; preprocessedDataUrl: string }> {
  const canvas = await preprocessImage(file);

  const worker = await createWorker("eng", 1, { logger: () => {} });
  await worker.setParameters({
    tessedit_pageseg_mode: "6" as unknown as Parameters<typeof worker.setParameters>[0]["tessedit_pageseg_mode"],
    preserve_interword_spaces: "1",
  });

  const result = await worker.recognize(canvas);
  await worker.terminate();

  return {
    text: result.data.text,
    preprocessedDataUrl: canvas.toDataURL("image/png"),
  };
}

export function parseDocumentFields(rawText: string): ExtractedDocumentData {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Common patterns for ID/passport documents
  // Name: usually on a line by itself, all caps or mixed case, 2+ words
  // DOB: matches date patterns
  // ID number: alphanumeric strings of 6-15 chars
  // Country: 2-3 letter codes or recognizable names

  const dobPatterns = [
    /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/,
    /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/,
    /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{2,4}\b/i,
  ];

  const idPatterns = [
    /\b[A-Z]{1,3}\d{6,10}\b/,                     // e.g. AB1234567
    /\b\d{9,12}\b/,                                // 9-12 digit number
    /\b[A-Z0-9]{8,12}\b/,                          // 8-12 alphanumeric
  ];

  const countryCodes: Record<string, string> = {
    "HKG": "HK", "HONG KONG": "HK",
    "SGP": "SG", "SINGAPORE": "SG",
    "ARE": "AE", "UAE": "AE", "UNITED ARAB EMIRATES": "AE",
    "USA": "US", "UNITED STATES": "US",
    "GBR": "GB", "UNITED KINGDOM": "GB",
    "JPN": "JP", "JAPAN": "JP",
    "KOR": "KR", "KOREA": "KR",
    "CHN": "CN", "CHINA": "CN",
  };

  let possibleName: string | null = null;
  let possibleDOB: string | null = null;
  let possibleIDNumber: string | null = null;
  let possibleCountry: string | null = null;

  for (const line of lines) {
    // Name detection
    if (!possibleName) {
      const nameMatch = line.match(/^[A-Z][a-zA-Z\s'-]{2,40}\s[A-Z][a-zA-Z\s'-]{2,40}$/);
      if (nameMatch && !/\d/.test(line) && line.length < 50) {
        possibleName = line;
      } else if (/^[A-Z\s'-]{6,50}$/.test(line) && line.split(/\s+/).length >= 2 && line.split(/\s+/).length <= 5) {
        possibleName = line;
      }
    }

    if (!possibleDOB) {
      for (const pattern of dobPatterns) {
        const m = line.match(pattern);
        if (m) {
          possibleDOB = m[0];
          break;
        }
      }
    }

    if (!possibleIDNumber) {
      for (const pattern of idPatterns) {
        const m = line.match(pattern);
        if (m) {
          possibleIDNumber = m[0];
          break;
        }
      }
    }

    if (!possibleCountry) {
      const upperLine = line.toUpperCase();
      for (const [key, value] of Object.entries(countryCodes)) {
        if (upperLine.includes(key)) {
          possibleCountry = value;
          break;
        }
      }
    }
  }

  return {
    rawText,
    possibleName,
    possibleDOB,
    possibleIDNumber,
    possibleCountry,
  };
}

// ============================================================
// Face detection + matching
// ============================================================

export async function detectFaceDescriptor(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<Float32Array | null> {
  const detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection?.descriptor ?? null;
}

export function matchFaces(desc1: Float32Array, desc2: Float32Array): FaceMatchResult {
  const distance = faceapi.euclideanDistance(desc1, desc2);
  // face-api threshold for "same person": typically 0.6 (lower = stricter)
  const MATCH_THRESHOLD = 0.6;
  // Convert distance to 0-1 confidence (higher = better match)
  const confidence = Math.max(0, Math.min(1, 1 - distance / 1.0));
  return {
    matched: distance < MATCH_THRESHOLD,
    confidence,
    distance,
  };
}

// ============================================================
// Liveness check (simple blink detection via eye aspect ratio)
// ============================================================

export interface LivenessFrame {
  timestamp: number;
  eyeAspectRatio: number;
}

/// Computes eye aspect ratio from 6 landmark points
function eyeAspectRatio(points: { x: number; y: number }[]): number {
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  const vertical = (d(points[1], points[5]) + d(points[2], points[4])) / 2;
  const horizontal = d(points[0], points[3]);
  return vertical / horizontal;
}

export async function detectEyeAspectRatio(
  video: HTMLVideoElement
): Promise<number | null> {
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
    .withFaceLandmarks();
  if (!detection) return null;
  const leftEye = detection.landmarks.getLeftEye();
  const rightEye = detection.landmarks.getRightEye();
  return (eyeAspectRatio(leftEye) + eyeAspectRatio(rightEye)) / 2;
}

export interface BlinkDetectionResult {
  detected: boolean;
  baseline: number;
  threshold: number;
  minSeen: number;
  currentEAR: number;
  framesAnalyzed: number;
  debug: string;
}

/**
 * Adaptive blink detection with full debug info so UI can show what's happening.
 *
 * Algorithm:
 *  1. Need ≥5 frames to establish baseline
 *  2. Baseline = median of top 60% of EAR values (more robust to outliers than mean)
 *  3. Blink = ANY frame where EAR < baseline * 0.80 (20% drop — more forgiving)
 *     OR any frame where EAR < 0.22 (absolute threshold for definite closure)
 */
export function detectBlink(frames: LivenessFrame[]): BlinkDetectionResult {
  const currentEAR = frames.length > 0 ? frames[frames.length - 1].eyeAspectRatio : 0;

  if (frames.length < 5) {
    return {
      detected: false,
      baseline: 0,
      threshold: 0,
      minSeen: currentEAR,
      currentEAR,
      framesAnalyzed: frames.length,
      debug: `Calibrating... ${frames.length}/5 frames`,
    };
  }

  // Median of top 60% is a robust baseline (ignores outliers from blinks)
  const sorted = [...frames].map(f => f.eyeAspectRatio).sort((a, b) => b - a);
  const openCount = Math.max(3, Math.floor(sorted.length * 0.6));
  const top = sorted.slice(0, openCount);
  const baseline = top[Math.floor(top.length / 2)]; // median

  const blinkThreshold = Math.max(baseline * 0.80, 0.15); // 20% drop OR hard floor at 0.15
  const absoluteClosedThreshold = 0.22; // classic EAR threshold

  const minSeen = Math.min(...frames.map(f => f.eyeAspectRatio));

  // Detect: any frame below adaptive threshold, or below absolute threshold
  const detected = frames.some(
    f => f.eyeAspectRatio < blinkThreshold || f.eyeAspectRatio < absoluteClosedThreshold
  );

  return {
    detected,
    baseline,
    threshold: blinkThreshold,
    minSeen,
    currentEAR,
    framesAnalyzed: frames.length,
    debug: detected
      ? "Blink detected!"
      : `EAR: ${currentEAR.toFixed(3)} | baseline: ${baseline.toFixed(3)} | need < ${blinkThreshold.toFixed(3)} | min seen: ${minSeen.toFixed(3)}`,
  };
}

// ============================================================
// Hashing extracted data for on-chain commitment
// ============================================================

export async function hashExtractedData(data: ExtractedDocumentData): Promise<string> {
  const canonical = JSON.stringify({
    name: data.possibleName,
    dob: data.possibleDOB,
    idNumber: data.possibleIDNumber,
    country: data.possibleCountry,
  });
  const encoder = new TextEncoder();
  const bytes = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return "0x" + Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function videoFrameToCanvas(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(video, 0, 0);
  return canvas;
}
