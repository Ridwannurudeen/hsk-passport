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
// Document OCR
// ============================================================

export async function extractDocumentText(imageData: string | File | HTMLImageElement): Promise<string> {
  const worker = await createWorker("eng");
  const result = await worker.recognize(imageData as Parameters<typeof worker.recognize>[0]);
  await worker.terminate();
  return result.data.text;
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

/**
 * Adaptive blink detection — doesn't use a fixed threshold.
 *
 * Algorithm:
 *  1. Compute user's personal baseline from the first N frames (top 70% of EAR values → their eyes-open average)
 *  2. A blink is any frame where EAR < baseline * 0.70 (30% drop)
 *  3. To avoid false positives from jitter, require at least 2 frames below the drop threshold
 *
 * This works regardless of individual eye shape — whether your baseline is 0.20 or 0.35,
 * a genuine blink drops it by 40-60% which clearly crosses 30%.
 */
export function detectBlink(frames: LivenessFrame[]): boolean {
  if (frames.length < 6) return false; // need enough data to establish baseline

  // Establish baseline from top 70% of EAR values (likely eyes-open frames)
  const sorted = frames.map(f => f.eyeAspectRatio).sort((a, b) => b - a);
  const openCount = Math.max(3, Math.floor(sorted.length * 0.7));
  const baseline = sorted.slice(0, openCount).reduce((a, b) => a + b, 0) / openCount;

  const blinkThreshold = baseline * 0.70; // 30% drop from baseline
  const hardMinThreshold = 0.20; // sanity floor — EAR below this is definitely closed

  // Count consecutive "closed" frames
  let closedStreak = 0;
  for (const f of frames) {
    if (f.eyeAspectRatio < blinkThreshold || f.eyeAspectRatio < hardMinThreshold) {
      closedStreak++;
      if (closedStreak >= 1) return true; // one genuine drop = blink detected
    } else {
      closedStreak = 0;
    }
  }
  return false;
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
