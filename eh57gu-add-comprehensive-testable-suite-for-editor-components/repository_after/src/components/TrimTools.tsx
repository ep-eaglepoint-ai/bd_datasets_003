import React from 'react'

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
  audioRef: React.RefObject<HTMLAudioElement | null>
  startTrim: number
  endTrim: number
  setStartTrim: (v: number) => void
  setEndTrim: (v: number) => void
  videoDuration: number
  audioDuration: number
  isDragging: any
  setIsDragging: any
  tooltipPosition: any
  setTooltipPosition: any
  tooltipTime: string
  setTooltipTime: any
  trimMode: any
  setTrimMode: any
}

export default function TrimTools(_p: Props) {
  const { videoDuration, startTrim, endTrim } = _p
  return (
    <div style={{ marginTop: 12 }}>
      <div>Trim Tools (simple stub)</div>
      <div>Video duration: {videoDuration.toFixed(2)}</div>
      <div>Start: {startTrim}%, End: {endTrim}%</div>
    </div>
  )
}
