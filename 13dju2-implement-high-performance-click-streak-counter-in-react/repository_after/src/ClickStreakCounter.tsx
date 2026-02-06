import { useState, useRef, useCallback, useEffect } from 'react';

interface ClickStreakCounterProps {
  onStreakEnd?: (streak: number) => void;
  resetDelay?: number;
}

export function ClickStreakCounter({
  onStreakEnd,
  resetDelay = 1000
}: ClickStreakCounterProps = {}) {
  const [currentCount, setCurrentCount] = useState(0);
  const [highestStreak, setHighestStreak] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentCountRef = useRef(0);
  const highestStreakRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStreakEnd = useCallback(() => {
    const finalCount = currentCountRef.current;

    if (finalCount > highestStreakRef.current) {
      highestStreakRef.current = finalCount;
      setHighestStreak(finalCount);
    }

    currentCountRef.current = 0;
    setCurrentCount(0);

    if (onStreakEnd) {
      onStreakEnd(finalCount);
    }
  }, [onStreakEnd]);

  const handleClick = useCallback(() => {
    clearTimer();

    currentCountRef.current += 1;
    setCurrentCount(currentCountRef.current);

    timerRef.current = setTimeout(handleStreakEnd, resetDelay);
  }, [clearTimer, handleStreakEnd, resetDelay]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return (
    <div className="click-streak-counter" data-testid="click-streak-counter">
      <button
        onClick={handleClick}
        data-testid="click-button"
        type="button"
      >
        Click Me!
      </button>
      <div className="stats">
        <p data-testid="current-count">
          Current Streak: <span>{currentCount}</span>
        </p>
        <p data-testid="highest-streak">
          Highest Streak: <span>{highestStreak}</span>
        </p>
      </div>
    </div>
  );
}

export default ClickStreakCounter;
