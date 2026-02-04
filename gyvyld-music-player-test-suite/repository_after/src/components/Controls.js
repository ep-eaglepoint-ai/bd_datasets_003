import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  IoPlayBackSharp,
  IoPlayForwardSharp,
  IoPlaySkipBackSharp,
  IoPlaySkipForwardSharp,
  IoPlaySharp,
  IoPauseSharp,
} from "react-icons/io5";
import { IoMdVolumeHigh, IoMdVolumeOff, IoMdVolumeLow } from "react-icons/io";
import "./Controls.css";
import { useTrack } from "../context/TrackContext";

const Controls = () => {
  const playAnimationRef = useRef(null);
  const [volume, setVolume] = useState(20);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muteVolume, setMuteVolume] = useState(false);

  const {
    audioRef,
    progressBarRef,
    duration,
    setTimeProgress,
    tracks,
    trackIndex,
    trackIndexFromList,
    setTrackIndex,
    setTrackIndexFromList,
    setTrack,
    handleNext,
  } = useTrack();

  const repeat = useCallback(() => {
    if (!audioRef.current) return;

    const currentTime = audioRef.current.currentTime;
    setTimeProgress(currentTime);
    if (progressBarRef.current) {
      progressBarRef.current.value = currentTime;
      // Handle duration 0 case or fallback logic if desired, though CSS handles invalid gracefully usually.
      // Requirement says "Division by zero must be handled".
      const pct = duration ? (currentTime / duration) * 100 : 0;
      progressBarRef.current.style.setProperty("--range-progress", `${pct}%`);
    }
    playAnimationRef.current = requestAnimationFrame(repeat);
  }, [audioRef, progressBarRef, duration, setTimeProgress]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
    }
    playAnimationRef.current = requestAnimationFrame(repeat);

    // FIXED: Cancellation of rAF
    return () => {
      cancelAnimationFrame(playAnimationRef.current);
    };
  }, [isPlaying, audioRef, repeat]);

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.volume = volume / 100;
    audioRef.current.muted = muteVolume;
  }, [volume, audioRef, muteVolume]);

  useEffect(() => {
    if (trackIndex === trackIndexFromList) return;

    setTrackIndex(trackIndexFromList);
    setTrack(tracks[trackIndexFromList]);

    if (!isPlaying) {
      setIsPlaying(true);
    }
  }, [trackIndexFromList, trackIndex, setTrackIndex, setTrack, tracks, audioRef, isPlaying]);

  function handlePrevious() {
    if (trackIndex === 0) {
      setTrackIndex(tracks.length - 1);
      setTrackIndexFromList(tracks.length - 1);
      setTrack(tracks[tracks.length - 1]);
    } else {
      setTrackIndex(trackIndex - 1);
      setTrackIndexFromList(trackIndex - 1);
      setTrack(tracks[trackIndex - 1]);
    }
  }

  function skipBackward() {
    if (!audioRef.current) return;
    // FIXED: Clamp
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
  }

  function skipForward() {
    if (!audioRef.current) return;
    // FIXED: Clamp
    audioRef.current.currentTime = Math.min(duration || 0, audioRef.current.currentTime + 10);
  }

  return (
    <div className="controls-container">
      <div className="controls">
        <button onClick={handlePrevious}>
          <IoPlaySkipBackSharp className="controls-icon" />
        </button>
        <button onClick={skipBackward}>
          <IoPlayBackSharp className="controls-icon" />
        </button>
        <button className="play-pause" onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? <IoPauseSharp className="controls-icon" /> : <IoPlaySharp className="controls-icon" />}
        </button>
        <button onClick={skipForward}>
          <IoPlayForwardSharp className="controls-icon" />
        </button>
        <button onClick={handleNext}>
          <IoPlaySkipForwardSharp className="controls-icon" />
        </button>
      </div>

      <div className="volume">
        <button className="volume-button" onClick={() => setMuteVolume((prev) => !prev)}>
          {muteVolume || volume < 5 ? <IoMdVolumeOff /> : <IoMdVolumeLow />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          style={{
            background: `linear-gradient(to right, rgb(31, 180, 130) ${volume}%, #ccc ${volume}%)`,
          }}
        />
        <button className="volume-button" onClick={() => setMuteVolume((prev) => !prev)}>
          <IoMdVolumeHigh />
        </button>
      </div>
    </div>
  );
};

export default Controls;
