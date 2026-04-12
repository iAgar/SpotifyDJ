import { useCallback, useEffect, useRef, useState } from 'react';

const SAMPLE_INTERVAL_MS = 500;
const ROLLING_WINDOW = 5;

// Compare two RGBA pixel arrays and return a normalised diff score 0.0–1.0.
// We sample every 4th pixel (one per RGBA group) using just the luma
// approximation (0.299R + 0.587G + 0.114B) to keep it cheap.
function computeDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let totalDiff = 0;
  const pixelCount = a.length / 4;

  for (let i = 0; i < a.length; i += 4) {
    const lumaA = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    const lumaB = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
    totalDiff += Math.abs(lumaA - lumaB);
  }

  // Max possible diff per pixel is 255; normalise to 0–1.
  // Empirically, real crowd motion rarely exceeds ~30% average pixel change,
  // so we cap at 60 (not 255) to spread the useful range across 0–1.
  const avgDiff = totalDiff / pixelCount;
  return Math.min(avgDiff / 60, 1.0);
}

function rollingAverage(window: number[]): number {
  if (window.length === 0) return 0;
  return window.reduce((s, v) => s + v, 0) / window.length;
}

export interface UseMotionDetectorResult {
  energyScore: number;
  isActive: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

export function useMotionDetector(): UseMotionDetectorResult {
  const [energyScore, setEnergyScore] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const rollingRef = useRef<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lazily create the off-screen canvas once.
  function getCanvas(): HTMLCanvasElement {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 160;
      canvasRef.current.height = 120;
    }
    return canvasRef.current;
  }

  const sampleFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < video.HAVE_CURRENT_DATA) return;

    const canvas = getCanvas();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    if (prevFrameRef.current) {
      const raw = computeDiff(prevFrameRef.current, frame);

      const window = rollingRef.current;
      window.push(raw);
      if (window.length > ROLLING_WINDOW) window.shift();

      setEnergyScore(rollingAverage(window));
    }

    prevFrameRef.current = new Uint8ClampedArray(frame);
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return; // already running

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 160, height: 120, facingMode: 'user' },
      audio: false,
    });

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    prevFrameRef.current = null;
    rollingRef.current = [];
    setEnergyScore(0);
    setIsActive(true);

    intervalRef.current = setInterval(sampleFrame, SAMPLE_INTERVAL_MS);
  }, [sampleFrame]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    prevFrameRef.current = null;
    rollingRef.current = [];
    setEnergyScore(0);
    setIsActive(false);
  }, []);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { energyScore, isActive, videoRef, startCamera, stopCamera };
}
