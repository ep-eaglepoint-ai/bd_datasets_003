"use client";

import { useState, useRef, useEffect, CSSProperties } from "react";

import {
  ScissorsIcon,
  DocumentTextIcon,
  MusicalNoteIcon,
  SparklesIcon,
  PlayIcon,
  VideoCameraIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Header from "./Header";
import { formatTime } from "../utils/formatTime";
import TrimTools from "./TrimTools";
import TextEditorModal from "./TextEditorModal";
import { ClipLoader } from "react-spinners";

import { DndContext, DragEndEvent, useDraggable } from "@dnd-kit/core";
import { Rnd } from "react-rnd";

interface EditPageProps {
  videoUrl: string | null;
}

interface TextOverlay {
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  startTime: number;
  endTime: number;
  id: string;
  visible?: boolean; // ✅ new
}


function DraggableTextOverlay({
  id,
  text,
  x,
  y,
  color,
  fontSize,
  onDragEnd,
    visible,
}: TextOverlay & { onDragEnd: (id: string, x: number, y: number) => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
  });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    position: "absolute",

    left: x,
    top: y,
    color,
    fontSize: `${fontSize}px`,
    cursor: "move",
  };

  return (
  <div
    ref={setNodeRef}
    style={{ ...style, display: visible ? "block" : "none" }} // ✅ visibility
    {...listeners}
    {...attributes}
  >
    {text}
  </div>
);

}

export default function EditPage({ videoUrl }: EditPageProps) {
  const [video, setVideo] = useState<string | null>(videoUrl);
  const [showTrimTools, setShowTrimTools] = useState(false);
  const [startTrim, setStartTrim] = useState(0);
  const [endTrim, setEndTrim] = useState(100);
  const [videoDuration, setVideoDuration] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isDragging, setIsDragging] = useState<"start" | "end" | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [tooltipTime, setTooltipTime] = useState<string>("");
  const [isTrimmed, setIsTrimmed] = useState(false);
  const [processedBlobUrl, setProcessedBlobUrl] = useState<string | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<
    "video" | "audio" | "text" | null
  >(null);
  const [zoomLevel, setZoomLevel] = useState(2);
  const [videos, setVideos] = useState<string[]>([]);
  const [audios, setAudios] = useState<string[]>([]);
  const [texts, setTexts] = useState<string[]>([]);
  const [addedComponents, setAddedComponents] = useState<
    { type: "video" | "audio" | "text"; src: string; id: string }[]
  >([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [trimMode, setTrimMode] = useState<"both" | "video" | "audio">("video");
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
const previewCanvasRef = useRef<HTMLCanvasElement>(null);
const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [zoomBox, setZoomBox] = useState({
    x: 100,
    y: 100,
    width: 200,
    height: 200,
  });

  const [zoomStartTime, setZoomStartTime] = useState(2); // in seconds
  const [zoomEndTime, setZoomEndTime] = useState(6); // in seconds
  const [targetZoomLevel, setTargetZoomLevel] = useState(4); // 2x zoom
  const [videoWidth, setVideoWidth] = useState(960);
  const [videoHeight, setVideoHeight] = useState(540);
  const [showZoomTool, setShowZoomTool] = useState(false);
  const videoUploadRef = useRef<HTMLInputElement>(null);
  const audioUploadRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const t = video.currentTime;
      if (t >= zoomStartTime && t <= zoomEndTime) {
        const progress = (t - zoomStartTime) / (zoomEndTime - zoomStartTime);
        const eased = easeInOutCubic(progress);
        setZoomLevel(1 + (2 - 1) * eased); // zoom to 2x smoothly
      } else {
        setZoomLevel(1);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [zoomStartTime, zoomEndTime]);

  // Handle mouse wheel event for zooming
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        const delta = event.deltaY;
        const zoomFactor = 0.1;

        setZoomLevel((prevZoom) => {
          let newZoom = prevZoom - delta * zoomFactor * 0.01;
          newZoom = Math.max(0.5, Math.min(3, newZoom));
          return newZoom;
        });
      }
    };

    const videoContainer = videoContainerRef.current;
    if (videoContainer) {
      videoContainer.addEventListener("wheel", handleWheel, { passive: false });
    }

    return () => {
      if (videoContainer) {
        videoContainer.removeEventListener("wheel", handleWheel);
      }
    };
  }, []);
  const handleApplyTextToVideo = async () => {
  if (!videoRef.current) return;

  setIsLoading(true);

  const startTime = (startTrim / 100) * videoDuration;
  const endTime = (endTrim / 100) * videoDuration;

  const video = document.createElement("video");
  video.src = videoRef.current.src;
  video.currentTime = startTime;
  video.muted = true;
  document.body.appendChild(video);

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject("Video failed to load");
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm; codecs=vp9",
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start(100);

  const draw = () => {
    if (video.currentTime >= endTime) {
      recorder.stop();
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const currentTime = video.currentTime;

    textOverlays.forEach((overlay) => {
      if (currentTime >= overlay.startTime && currentTime <= overlay.endTime) {
        ctx.fillStyle = overlay.color;
        ctx.font = `${overlay.fontSize}px Arial`;
        ctx.textBaseline = "top";
        ctx.fillText(overlay.text, overlay.x, overlay.y);
      }
    });

    requestAnimationFrame(draw);
  };

  video.onplay = () => requestAnimationFrame(draw);
  video.play();

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const blob = new Blob(chunks, { type: "video/webm" });
  const newUrl = URL.createObjectURL(blob);
  setVideo(newUrl); // Update preview video
  setTextOverlays([]); // Clear overlays after applying

  document.body.removeChild(video);
  setIsLoading(false);
};
useEffect(() => {
  const video = videoRef.current;
  if (!video) return;

  const updateVisibility = () => {
    const currentTime = video.currentTime;

    setTextOverlays((prevOverlays) =>
      prevOverlays.map((overlay) => ({
        ...overlay,
        visible:
          currentTime >= overlay.startTime &&
          currentTime <= overlay.endTime,
      }))
    );
  };

  video.addEventListener("timeupdate", updateVisibility);

  return () => {
    video.removeEventListener("timeupdate", updateVisibility);
  };
}, [videoRef.current]);


const startZoomPreview = () => {
  const canvas = previewCanvasRef.current;
  const videoEl = videoRef.current;
  if (!canvas || !videoEl) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const draw = () => {
    if (videoEl.paused || videoEl.ended) return;

    const currentTime = videoEl.currentTime;

let zoomScale = 1;
const zoomInDuration = 300; // ms (1 second)

if (currentTime >= zoomStartTime && currentTime <= zoomEndTime) {
  zoomScale = targetZoomLevel;
} else {
  zoomScale = 1;
}




    const zoomCenterX = zoomBox.x + zoomBox.width / 2;
    const zoomCenterY = zoomBox.y + zoomBox.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoomScale, zoomScale);
    ctx.translate(-zoomCenterX, -zoomCenterY);

    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
};

  const handleAddTextOverlay = (
    text: string,
    style: CSSProperties,
    x: number,
    y: number
  ) => {
    const newTextOverlay: TextOverlay = {
      text,
      x,
      y,
      color: style.color || "black",
      fontSize: parseInt(style.fontSize?.toString() || "16", 10),
      startTime: videoRef.current?.currentTime || 0,

      endTime: (videoRef.current?.currentTime || 0) + 5,

      id: Math.random().toString(36).substring(7),
    };
    setTextOverlays([...textOverlays, newTextOverlay]);
    setIsOpen(false);
  };

  // Handle video upload
  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setVideos([...videos, reader.result]);
          setVideo(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle audio upload
  const handleAudioUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setAudios([...audios, reader.result]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle adding text
  const handleAddText = () => {
    setIsOpen(true);
  };

  // Handle adding components
  const handleAddComponent = (
    type: "video" | "audio" | "text",
    src: string
  ) => {
    const newComponent = {
      type,
      src,
      id: Math.random().toString(36).substring(7),
    };
    setAddedComponents([...addedComponents, newComponent]);

    if (type === "video") {
      setVideo(src);
    }
  };

  // Handle removing components
  const handleRemoveComponent = (id: string) => {
    setAddedComponents(addedComponents.filter((comp) => comp.id !== id));
  };

  // Handle trimming
  const handleDone = () => {
    if (videoRef.current) {
      setIsTrimmed(true);
      const startTime = (startTrim / 100) * videoDuration;
      const endTime = (endTrim / 100) * videoDuration;

      videoRef.current.currentTime = startTime;

      videoRef.current.onplay = () => {
        if (videoRef.current) {
          videoRef.current.currentTime = startTime;
        }
      };

      videoRef.current.ontimeupdate = () => {
        if (videoRef.current && videoRef.current.currentTime >= endTime) {
          videoRef.current.currentTime = startTime;
        }
      };
    }
  };

  // Sharpen image using convolution
  const sharpenImage = (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
  ) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const output = new Uint8ClampedArray(data.length);
    const width = imageData.width;
    const height = imageData.height;

    const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let r = 0,
          g = 0,
          b = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const px = x + kx;
            const py = y + ky;
            const index = (py * width + px) * 4;
            const k = kernel[(ky + 1) * 3 + (kx + 1)];
            r += data[index] * k;
            g += data[index + 1] * k;
            b += data[index + 2] * k;
          }
        }

        const i = (y * width + x) * 4;
        output[i] = Math.min(Math.max(r, 0), 255);
        output[i + 1] = Math.min(Math.max(g, 0), 255);
        output[i + 2] = Math.min(Math.max(b, 0), 255);
        output[i + 3] = data[i + 3];
      }
    }

    ctx.putImageData(new ImageData(output, width, height), 0, 0);
  };
  function easeInOutCubic(t: number) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
const handleApplyZoom = async () => {
  setIsLoading(true);
  try {
    await processZoomToVideo();
  } catch (err) {
    console.error("Zoom processing failed:", err);
    alert("Failed to apply zoom effect.");
  } finally {
    setIsLoading(false);
  }
};



  // Handle downloading trimmed video with all effects
  const handleDownload = async () => {
    if (processedBlobUrl) {
    // ✅ Skip processing, just download
    const a = document.createElement("a");
    a.href = processedBlobUrl;
    a.download = `edited-video-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(processedBlobUrl); // Clean up
      setProcessedBlobUrl(null);             // Optionally reset
    }, 100);
    return;
  }
    if (!videoRef.current) {
      console.error("Video reference not found");
      return;
    }

    setIsLoading(true);
    console.log("Starting video processing...");

    try {
      const startTime = (startTrim / 100) * videoDuration;
      const endTime = (endTrim / 100) * videoDuration;
      console.log(`Trimming from ${startTime}s to ${endTime}s`);

      // Create temporary video element
      const video = document.createElement("video");
      video.src = videoRef.current.src;
      video.currentTime = startTime;
      video.muted = true; // Ensure video plays without audio issues
      document.body.appendChild(video); // Required for some browsers

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Video loading timed out"));
        }, 5000);

        video.onloadeddata = () => {
          clearTimeout(timeout);
          resolve();
        };

        video.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Video loading failed"));
        };
      });

      // Create canvas
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      // Set canvas dimensions (accounting for zoom)
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      console.log(`Canvas size: ${canvas.width}x${canvas.height}`);

      // Setup media recorder
      const stream = canvas.captureStream(30); // 30 FPS
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm; codecs=vp9",
      });

      const chunks: Blob[] = [];
      let recordingFailed = false;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        recordingFailed = true;
        mediaRecorder.stop();
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms

      // Frame rendering function
     let zoomStartTimestamp: number | null = null; 
const drawFrame = () => {
  if (video.currentTime >= endTime || recordingFailed) {
    console.log("Stopping recording");
    mediaRecorder.stop();
    return;
  }

  try {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentTime = video.currentTime;

    const videoElement = videoRef.current;
    const containerElement = videoContainerRef.current;
    if (!videoElement || !containerElement) return;

    const videoRect = videoElement.getBoundingClientRect();
    const containerRect = containerElement.getBoundingClientRect();

    const naturalWidth = video.videoWidth;
    const naturalHeight = video.videoHeight;

    const videoDisplayWidth = videoRect.width;
    const videoDisplayHeight = videoRect.height;

    const scaleX = naturalWidth / videoDisplayWidth;
    const scaleY = naturalHeight / videoDisplayHeight;

    const zoomBoxCenterX = (zoomBox.x + zoomBox.width / 2) - (videoRect.left - containerRect.left);
    const zoomBoxCenterY = (zoomBox.y + zoomBox.height / 2) - (videoRect.top - containerRect.top);
    const zoomCenterX = zoomBoxCenterX * scaleX;
    const zoomCenterY = zoomBoxCenterY * scaleY;

    // Compute max zoom based on box size
    const zoomScaleX = naturalWidth / (zoomBox.width * scaleX);
    const zoomScaleY = naturalHeight / (zoomBox.height * scaleY);
    const maxZoom = Math.min(zoomScaleX, zoomScaleY);

    let zoomScale = 1;

    // 🔁 Transition duration (speed of zoom in/out)
    const transitionDuration = 2; // seconds (faster)

    // Zoom in phase
    if (
      currentTime >= zoomStartTime &&
      currentTime < zoomStartTime + transitionDuration
    ) {
      const t = (currentTime - zoomStartTime) / transitionDuration;
      zoomScale = 1 + (maxZoom - 1) * easeInOutCubic(t);
    }

    // Fully zoomed-in phase
    else if (
      currentTime >= zoomStartTime + transitionDuration &&
      currentTime <= zoomEndTime - transitionDuration
    ) {
      zoomScale = maxZoom;
    }

    // Zoom out phase
    else if (
      currentTime > zoomEndTime - transitionDuration &&
      currentTime <= zoomEndTime
    ) {
      const t = (zoomEndTime - currentTime) / transitionDuration;
      zoomScale = 1 + (maxZoom - 1) * easeInOutCubic(t);
    }

    // Else: zoomScale = 1 (no zoom)

    // Apply zoom transform
    ctx.save();
    const scaleOffsetX = zoomCenterX * (zoomScale - 1);
    const scaleOffsetY = zoomCenterY * (zoomScale - 1);
    ctx.translate(-scaleOffsetX, -scaleOffsetY);
    ctx.scale(zoomScale, zoomScale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // ✅ Sharpen only when fully zoomed in
    const fullyZoomed =
      currentTime >= zoomStartTime + transitionDuration &&
      currentTime <= zoomEndTime - transitionDuration;

    if (fullyZoomed) {
      sharpenImage(canvas, ctx, naturalWidth, naturalHeight);
    }

    // Draw overlays with zoom adjustments
    textOverlays.forEach((overlay) => {
      if (currentTime >= overlay.startTime && currentTime <= overlay.endTime) {
        const overlayX = overlay.x * scaleX;
        const overlayY = overlay.y * scaleY;

        const adjustedX = (overlayX - zoomCenterX) * zoomScale + canvas.width / 2;
        const adjustedY = (overlayY - zoomCenterY) * zoomScale + canvas.height / 2;

        ctx.fillStyle = overlay.color;
        ctx.font = `${overlay.fontSize * zoomScale}px Arial`;
        ctx.textBaseline = "top";
        ctx.fillText(overlay.text, adjustedX, adjustedY);
      }
    });

    requestAnimationFrame(drawFrame);
  } catch (frameError) {
    console.error("Frame rendering error:", frameError);
    recordingFailed = true;
    mediaRecorder.stop();
  }
};



// Sharpen image using convolution
// Sharpen image using convolution with dynamic strength based on video resolution
const sharpenImage = (
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  videoWidth: number,
  videoHeight: number
) => {
  // Calculate video resolution (width x height)
  const resolution = videoWidth * videoHeight;
  
  // Skip sharpening for high-quality videos (Full HD or higher)
  if (resolution >= 1920 * 1080) {
    console.log("High quality video, no sharpening applied.");
    return;
  }
  console.log(`sharpning resolutiob`, resolution)
  // Dynamically adjust sharpening strength based on resolution for lower quality videos
  let sharpeningStrength = 1.5; // Default value for lower resolution videos
  if (resolution >= 1280 * 720) {
   return;
  } else if (resolution >= 640 * 360) {
    sharpeningStrength = 1.8; // Slightly stronger sharpening for 480p videos
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const output = new Uint8ClampedArray(data.length);
  const width = imageData.width;
  const height = imageData.height;

  const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1];

  // Apply the sharpening filter
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let r = 0,
        g = 0,
        b = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = x + kx;
          const py = y + ky;
          const index = (py * width + px) * 4;
          const k = kernel[(ky + 1) * 3 + (kx + 1)];
          r += data[index] * k;
          g += data[index + 1] * k;
          b += data[index + 2] * k;
        }
      }

      const i = (y * width + x) * 4;
      output[i] = Math.min(Math.max(r * sharpeningStrength, 0), 255);
      output[i + 1] = Math.min(Math.max(g * sharpeningStrength, 0), 255);
      output[i + 2] = Math.min(Math.max(b * sharpeningStrength, 0), 255);
      output[i + 3] = data[i + 3]; // Alpha
    }
  }

  ctx.putImageData(new ImageData(output, width, height), 0, 0);
};


function separableGaussianBlur(
  imageData: ImageData,
  width: number,
  height: number,
  radius: number
): ImageData {
  const sigma = radius;
  const kernelSize = Math.max(3, Math.ceil(sigma * 3) * 2 + 1);
  const half = Math.floor(kernelSize / 2);

  const kernel = new Float32Array(kernelSize);
  const twoSigmaSq = 2 * sigma * sigma;
  let kernelSum = 0;

  for (let i = -half; i <= half; i++) {
    const weight = Math.exp(-(i * i) / twoSigmaSq);
    kernel[i + half] = weight;
    kernelSum += weight;
  }

  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }

  const temp = new Float32Array(width * height * 4);
  const result = new Uint8ClampedArray(width * height * 4);
  const src = imageData.data;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let k = -half; k <= half; k++) {
          const px = Math.min(width - 1, Math.max(0, x + k));
          const idx = (y * width + px) * 4 + c;
          acc += src[idx] * kernel[k + half];
        }
        temp[(y * width + x) * 4 + c] = acc;
      }
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let k = -half; k <= half; k++) {
          const py = Math.min(height - 1, Math.max(0, y + k));
          const idx = (py * width + x) * 4 + c;
          acc += temp[idx] * kernel[k + half];
        }
        result[(y * width + x) * 4 + c] = Math.round(acc);
      }
    }
  }

  return new ImageData(result, width, height);
}


// Simple Gaussian blur (3x3 kernel)
function gaussianBlur(imageData: ImageData, width: number, height: number, radius: number): ImageData {
  const kernel = [
    1, 2, 1,
    2, 4, 2,
    1, 2, 1
  ];
  const kernelSum = 16;
  const src = imageData.data;
  const dst = new Uint8ClampedArray(src.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const px = x + kx;
            const py = y + ky;
            const i = (py * width + px) * 4 + c;
            const k = kernel[(ky + 1) * 3 + (kx + 1)];
            sum += src[i] * k;
          }
        }
        const index = (y * width + x) * 4 + c;
        dst[index] = sum / kernelSum;
      }
      // Preserve alpha channel
      dst[(y * width + x) * 4 + 3] = src[(y * width + x) * 4 + 3];
    }
  }

  return new ImageData(dst, width, height);
}






      // Start processing when video plays
      video.onplay = () => {
        console.log("Video playback started");
        drawFrame();
      };

      // Handle recording completion
      await new Promise<void>((resolve) => {
        mediaRecorder.onstop = () => {
          console.log("Recording stopped");
          resolve();
        };

        // Start playback
        video.play().catch((e) => {
          console.error("Video play failed:", e);
          recordingFailed = true;
          mediaRecorder.stop();
        });
      });

      // Final output
      if (!recordingFailed && chunks.length > 0) {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `edited-video-${new Date().getTime()}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        console.log("Download initiated");
      } else {
        throw new Error("Recording failed - no data available");
      }
    } catch (error) {
      console.error("Video processing failed:", error);
      alert(
        `Error processing video: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
      // Clean up temporary elements
      document.querySelectorAll("video").forEach((el) => {
        if (el !== videoRef.current) el.remove();
      });
    }
  };
  function getAspectRatioBox(videoWidth: number, videoHeight: number, maxBoxWidth: number) {
  const aspectRatio = videoWidth / videoHeight;
  const width = maxBoxWidth;
  const height = width / aspectRatio;
  return { width, height };
}
useEffect(() => {
  const maxBoxWidth = 200; // or some initial default
  const { width, height } = getAspectRatioBox(videoWidth, videoHeight, maxBoxWidth);
  setZoomBox({
    x: 100,
    y: 100,
    width,
    height,
  });
}, [videoWidth, videoHeight]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
    };
  }, []);
const processZoomToVideo = async () => {
  if (!videoRef.current) {
    console.error("Video reference not found");
    return;
  }

  setIsLoading(true);
  console.log("Starting zoom-only video processing...");

  try {
    const startTime = (startTrim / 100) * videoDuration;
    const endTime = (endTrim / 100) * videoDuration;
    console.log(`Trimming from ${startTime}s to ${endTime}s`);

    const video = document.createElement("video");
    video.src = videoRef.current.src;
    video.currentTime = startTime;
    video.muted = true;
    document.body.appendChild(video);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Video loading timed out")), 5000);
      video.onloadeddata = () => {
        clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Video loading failed"));
      };
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm; codecs=vp9",
    });

    const chunks: Blob[] = [];
    let recordingFailed = false;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onerror = (e) => {
      console.error("MediaRecorder error:", e);
      recordingFailed = true;
      mediaRecorder.stop();
    };

    mediaRecorder.start(100);

    const drawFrame = () => {
  if (video.currentTime >= endTime || recordingFailed) {
    console.log("Stopping recording");
    mediaRecorder.stop();
    return;
  }

  try {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentTime = video.currentTime;

    const videoElement = videoRef.current;
    const containerElement = videoContainerRef.current;
    if (!videoElement || !containerElement) return;

    const videoRect = videoElement.getBoundingClientRect();
    const containerRect = containerElement.getBoundingClientRect();

    const naturalWidth = video.videoWidth;
    const naturalHeight = video.videoHeight;

    const videoDisplayWidth = videoRect.width;
    const videoDisplayHeight = videoRect.height;

    const scaleX = naturalWidth / videoDisplayWidth;
    const scaleY = naturalHeight / videoDisplayHeight;

    const zoomBoxCenterX = (zoomBox.x + zoomBox.width / 2) - (videoRect.left - containerRect.left);
    const zoomBoxCenterY = (zoomBox.y + zoomBox.height / 2) - (videoRect.top - containerRect.top);
    const zoomCenterX = zoomBoxCenterX * scaleX;
    const zoomCenterY = zoomBoxCenterY * scaleY;

    // Compute max zoom based on box size
    const zoomScaleX = naturalWidth / (zoomBox.width * scaleX);
    const zoomScaleY = naturalHeight / (zoomBox.height * scaleY);
    const maxZoom = Math.min(zoomScaleX, zoomScaleY);

    let zoomScale = 1;

    // 🔁 Transition duration (speed of zoom in/out)
    const transitionDuration = 2; // seconds (faster)

    // Zoom in phase
    if (
      currentTime >= zoomStartTime &&
      currentTime < zoomStartTime + transitionDuration
    ) {
      const t = (currentTime - zoomStartTime) / transitionDuration;
      zoomScale = 1 + (maxZoom - 1) * easeInOutCubic(t);
    }

    // Fully zoomed-in phase
    else if (
      currentTime >= zoomStartTime + transitionDuration &&
      currentTime <= zoomEndTime - transitionDuration
    ) {
      zoomScale = maxZoom;
    }

    // Zoom out phase
    else if (
      currentTime > zoomEndTime - transitionDuration &&
      currentTime <= zoomEndTime
    ) {
      const t = (zoomEndTime - currentTime) / transitionDuration;
      zoomScale = 1 + (maxZoom - 1) * easeInOutCubic(t);
    }

    // Else: zoomScale = 1 (no zoom)

    // Apply zoom transform
    ctx.save();
    const scaleOffsetX = zoomCenterX * (zoomScale - 1);
    const scaleOffsetY = zoomCenterY * (zoomScale - 1);
    ctx.translate(-scaleOffsetX, -scaleOffsetY);
    ctx.scale(zoomScale, zoomScale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // ✅ Sharpen only when fully zoomed in
    const fullyZoomed =
      currentTime >= zoomStartTime + transitionDuration &&
      currentTime <= zoomEndTime - transitionDuration;

    if (fullyZoomed) {
      sharpenImage(canvas, ctx, naturalWidth, naturalHeight);
    }

    // Draw overlays with zoom adjustments
    textOverlays.forEach((overlay) => {
      if (currentTime >= overlay.startTime && currentTime <= overlay.endTime) {
        const overlayX = overlay.x * scaleX;
        const overlayY = overlay.y * scaleY;

        const adjustedX = (overlayX - zoomCenterX) * zoomScale + canvas.width / 2;
        const adjustedY = (overlayY - zoomCenterY) * zoomScale + canvas.height / 2;

        ctx.fillStyle = overlay.color;
        ctx.font = `${overlay.fontSize * zoomScale}px Arial`;
        ctx.textBaseline = "top";
        ctx.fillText(overlay.text, adjustedX, adjustedY);
      }
    });

    requestAnimationFrame(drawFrame);
  } catch (frameError) {
    console.error("Frame rendering error:", frameError);
    recordingFailed = true;
    mediaRecorder.stop();
  }
};

    video.onplay = () => {
      console.log("Zoom rendering started");
      requestAnimationFrame(drawFrame);
    };

    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => {
        console.log("Zoom render recording stopped");
        resolve();
      };

      video.play().catch((e) => {
        console.error("Playback failed:", e);
        recordingFailed = true;
        mediaRecorder.stop();
      });
    });

    if (!recordingFailed && chunks.length > 0) {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setVideo(url); // 🔁 Replaces current video with zoomed version
      setProcessedBlobUrl(url); 
    } else {
      throw new Error("Recording failed - no data available");
    }
  } catch (error) {
    console.error("Zoom processing failed:", error);
    alert(
      `Error applying zoom: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    setIsLoading(false);
    document.querySelectorAll("video").forEach((el) => {
      if (el !== videoRef.current) el.remove();
    });
  }
};



  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    const id = active.id as string;

    setTextOverlays((prev) =>
      prev.map((overlay) =>
        overlay.id === id
          ? { ...overlay, x: overlay.x + delta.x, y: overlay.y + delta.y }
          : overlay
      )
    );
  };
  const triggerVideoUpload = () => {
    if (videoUploadRef.current) {
      videoUploadRef.current.click();
    }
  };

  // Trigger audio upload
  const triggerAudioUpload = () => {
    if (audioUploadRef.current) {
      audioUploadRef.current.click();
    }
  };
  useEffect(() => {
  if (video && videoRef.current && previewCanvasRef.current) {
    // Wait for metadata, then play + start rendering
    const videoEl = videoRef.current;

    const handleLoaded = () => {
      setVideoDuration(videoEl.duration || 0);
      videoEl.play();
      startZoomPreview();
    };

    videoEl.addEventListener("loadedmetadata", handleLoaded);

    return () => {
      videoEl.removeEventListener("loadedmetadata", handleLoaded);
    };
  }
}, [video]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 font-[family-name:var(--font-geist-sans)]">
      <input
        type="file"
        className="hidden"
        id="video-upload"
        accept="video/*"
        ref={videoUploadRef}
        onChange={handleVideoUpload}
      />
      <input
        type="file"
        className="hidden"
        id="audio-upload"
        accept="audio/*"
        ref={audioUploadRef}
        onChange={handleAudioUpload}
      />
      <Header />

      <main className="sm:px-6 lg:px-2 py-2 h-[100%]">
        <div className="flex gap-2 h-auto">
          {/* Left Sidebar for Icons */}
          <div className="flex flex-1 h-auto">
            {/* Sidebar with buttons */}
            <div className="w-16 ml-0 h-auto">
              <div className="bg-white rounded-lg p-2 h-full flex flex-col">
                <div className="space-y-2">
                  <button
                    onClick={handleAddText}
                    className="flex items-center justify-center p-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                  >
                    <DocumentTextIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowZoomTool(!showZoomTool)}
                    className={`flex items-center justify-center p-2 bg-gradient-to-r ${
                      showZoomTool
                        ? "from-yellow-500 to-yellow-600"
                        : "from-gray-300 to-gray-400"
                    } text-white rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2`}>
                    <SparklesIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Vertical Line Separator */}

            {showZoomTool && (
  <div className="bg-white rounded-lg p-4 mt-4 w-[300px]">
    <h3 className="text-lg font-semibold text-gray-800 mb-2">
      Zoom Timing
    </h3>
    <div className="space-y-3">
      <div className="space-y-4">
  <div className="flex flex-col">
    <label className="text-sm font-semibold text-gray-800 mb-1">
      📍 Zoom Start Time <span className="text-gray-500">(seconds)</span>
    </label>
    <input
      type="number"
      value={zoomStartTime}
      onChange={(e) => setZoomStartTime(parseFloat(e.target.value))}
      className="w-full px-4 py-2 border border-yellow-400 rounded-xl shadow-inner bg-yellow-50 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition duration-200"
      placeholder="Enter start time"
      min="0"
      step="0.1"
    />
  </div>

  <div className="flex flex-col">
    <label className="text-sm font-semibold text-gray-800 mb-1">
      🎯 Zoom End Time <span className="text-gray-500">(seconds)</span>
    </label>
    <input
      type="number"
      value={zoomEndTime}
      onChange={(e) => setZoomEndTime(parseFloat(e.target.value))}
      className="w-full px-4 py-2 border border-yellow-400 rounded-xl shadow-inner bg-yellow-50 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition duration-200"
      placeholder="Enter end time"
      min="0"
      step="0.1"
    />
  </div>
</div>


      {/* ✅ APPLY ZOOM BUTTON */}
      {!isLoading ? (
  <button
    onClick={handleApplyZoom}
    className="mt-2 w-full flex items-center justify-center bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
  >
    Apply Zoom
  </button>
) : (
  <div className="mt-2 w-full flex items-center justify-center py-2">
    <svg
      className="animate-spin h-5 w-5 text-yellow-500 mr-2"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      ></path>
    </svg>
    <span className="text-sm text-gray-700 font-medium">Processing...</span>
  </div>
)}

    </div>
  </div>
)}

            {/* Active Sidebar Content */}
            {activeSidebar && (
              <div className="w-[300px] h-full">
                <div className="bg-white rounded-lg p-6 h-full overflow-y-auto">
                  {activeSidebar === "video" && (
                    <>
                      <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                        <VideoCameraIcon className="w-6 h-6 text-blue-600" />
                        <span>Video</span>
                      </h2>
                      <div className="space-y-4">
                        <input
                          type="file"
                          className="hidden"
                          id="video-upload"
                          accept="video/*"
                          onChange={handleVideoUpload}
                        />
                        <label
                          htmlFor="video-upload"
                          className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                          <span>Add Video</span>
                        </label>
                        {videos.map((video, index) => (
                          <div
                            key={index}
                            className="bg-gray-100 p-4 rounded-lg relative"
                          >
                            <video
                              ref={videoRef}
                              src={video}
                              controls
                              className="w-full h-auto"
                            />
                            <button
                              onClick={() => handleAddComponent("video", video)}
                              className="absolute bottom-2 right-2 bg-blue-600 text-white p-1 rounded-full hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                              <PlusIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {activeSidebar === "audio" && (
                    <>
                      <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                        <MusicalNoteIcon className="w-6 h-6 text-green-600" />
                        <span>Audio</span>
                      </h2>
                      <div className="space-y-4">
                        <input
                          type="file"
                          className="hidden"
                          id="audio-upload"
                          accept="audio/*"
                          onChange={handleAudioUpload}
                        />
                        <label
                          htmlFor="audio-upload"
                          className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-3 rounded-lg hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                        >
                          <span>Add Audio</span>
                        </label>
                        {audios.map((audio, index) => (
                          <div
                            key={index}
                            className="bg-gray-100 p-4 rounded-lg relative"
                          >
                            <audio
                              ref={index === 0 ? audioRef : null}
                              src={audio}
                              controls
                              className="w-full"
                            />
                            <button
                              onClick={() => handleAddComponent("audio", audio)}
                              className="absolute bottom-2 right-2 bg-green-600 text-white p-1 rounded-full hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                            >
                              <PlusIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {activeSidebar === "text" && (
                    <>
                      <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                        <DocumentTextIcon className="w-6 h-6 text-purple-600" />
                        <span>Text</span>
                      </h2>
                      <div className="space-y-4">
                        <button
                          onClick={handleAddText}
                          className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-3 rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                        >
                          <span>Add Text</span>
                        </button>
                        {textOverlays.map((text, index) => (
                          <div
                            key={index}
                            className="bg-gray-100 p-4 rounded-lg relative"
                          >
                            <p className="text-gray-700">{text.text}</p>
                            <button
                              onClick={() =>
                                handleAddComponent("text", text.text)
                              }
                              className="absolute bottom-2 right-2 bg-purple-600 text-white p-1 rounded-full hover:bg-purple-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                            >
                              <PlusIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-4 w-full">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <ScissorsIcon className="w-6 h-6 text-blue-600" />
                <span>Edit Your Video</span>
              </h2>
              <div
                ref={videoContainerRef}
                className="bg-gray-100 mt-10 rounded-lg p-6 flex flex-col items-center justify-center min-h-[300px] overflow-hidden relative"
              >
                {video ? (
                  <>
                    <div className="relative w-full h-full">
                      <div className="relative w-full max-w-[960px] mx-auto">
                        {/* Base full video (unchanged) */}
                        <div className="relative w-full max-w-[960px] mx-auto">
  {/* Canvas for zoom rendering preview */}
  <canvas
  ref={previewCanvasRef}
  width={videoWidth}
  height={videoHeight}
  className="hidden"
/>


  {/* Hidden video player (used to drive canvas frame updates) */}
<video
  ref={videoRef}
  src={video}
  muted
  autoPlay
  controls
  className="w-full h-auto rounded-md"
/>



</div>



                        {/* Zoom box (visual only) */}
                        

                        {/* Zoomed video (clipped to red box) */}
                        
                      </div>

                      {showZoomTool && (
                        <Rnd
  size={{ width: zoomBox.width, height: zoomBox.height }}
  position={{ x: zoomBox.x, y: zoomBox.y }}
  onDragStop={(e, d) =>
    setZoomBox((prev) => ({ ...prev, x: d.x, y: d.y }))
  }
  onResizeStop={(e, direction, ref, delta, position) => {
    const newWidth = parseInt(ref.style.width);
    const newHeight = newWidth / (videoWidth / videoHeight); // maintain aspect ratio
    setZoomBox({
      width: newWidth,
      height: newHeight,
      x: position.x,
      y: position.y,
    });
  }}
  lockAspectRatio={videoWidth / videoHeight}
  bounds="parent"
  style={{
    border: "2px dashed red",
    position: "absolute",
    zIndex: 20,
    pointerEvents: "auto",
  }}
/>

                      )}
                      <DndContext onDragEnd={handleDragEnd}>
                        {textOverlays.map((overlay) => (
                          <DraggableTextOverlay
                            key={overlay.id}
                            {...overlay}
                            onDragEnd={(id, x, y) => {
                              setTextOverlays((prev) =>
                                prev.map((o) =>
                                  o.id === id ? { ...o, x, y } : o
                                )
                              );
                            }}
                          />
                        ))}
                      </DndContext>
                    </div>

                    
                     {videoDuration > 0 && (
  <TrimTools
    videoRef={videoRef}
    audioRef={audioRef}
    startTrim={startTrim}
    endTrim={endTrim}
    setStartTrim={setStartTrim}
    setEndTrim={setEndTrim}
    videoDuration={videoDuration}
    audioDuration={audioDuration}
    isDragging={isDragging}
    setIsDragging={setIsDragging}
    tooltipPosition={tooltipPosition}
    setTooltipPosition={setTooltipPosition}
    tooltipTime={tooltipTime}
    setTooltipTime={setTooltipTime}
    trimMode={trimMode}
    setTrimMode={setTrimMode}
  />
)}

                   
                 
                      <>
                        <button
                          onClick={handleDone}
                          className="mt-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-105"
                        >
                          Done
                        </button>
                        <button
                          onClick={handleDownload}
                          className="mt-4 ml-4 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-2 rounded-lg hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <ClipLoader color="#ffffff" size={20} />
                          ) : (
                            "Download Edited Video"
                          )}
                        </button>
                         <button
      onClick={handleApplyTextToVideo}
      className="mt-4 ml-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all transform hover:scale-105"
    >
      Apply Text To Video
    </button>
                      </>
                   
                  </>
                ) : (
                  <div
  className="flex flex-col items-center justify-center border-4 border-dashed border-gray-300 bg-white rounded-lg p-8 cursor-pointer hover:border-blue-400 transition"
  onClick={triggerVideoUpload}
  onDragOver={(e) => e.preventDefault()}
  onDrop={(e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("video/")) {
      handleVideoUpload({ target: { files: [file] } });
    }
  }}
>
  <VideoCameraIcon className="w-12 h-12 text-blue-400 mb-4" />
  <p className="text-gray-700 font-semibold">Click or drag a video file here to upload</p>
  <p className="text-sm text-gray-500 mt-1">Supported formats: mp4, webm, mov, etc.</p>
</div>

                )}
              </div>

              {/* Display Added Components */}
              <div className="mt-6 space-y-4">
                {addedComponents.map((comp) => (
                  <div
                    key={comp.id}
                    className="bg-gray-100 p-4 rounded-lg relative"
                  >
                    {comp.type === "video" && (
                      <video
                        src={comp.src}
                        controls
                        className="w-full rounded-lg"
                      />
                    )}
                    {comp.type === "audio" && (
                      <div className="text-gray-700">Audio File</div>
                    )}
                    {comp.type === "text" && (
                      <p className="text-gray-700">{comp.src}</p>
                    )}
                    <button
                      onClick={() => handleRemoveComponent(comp.id)}
                      className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full hover:bg-red-700 transition-colors"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="bg-white shadow-sm mt-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center">
          <p className="text-gray-600">© 2025 VideoPro. All rights reserved.</p>
        </div>
      </footer>
      {isOpen && (
        <TextEditorModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onSave={(text, style, x, y) => {
            handleAddTextOverlay(text, style, x, y);
          }}
        />
      )}
    </div>
  );
}
