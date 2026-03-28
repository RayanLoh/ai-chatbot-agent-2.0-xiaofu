import { useEffect, useRef, useState } from 'react';
import { BellRing } from 'lucide-react';

import '../styles/DynamicIsland.css';

const EVENT_NAME = 'xiaofu:dynamic-island';

function DynamicIsland() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [animationState, setAnimationState] = useState('idle');
  const [isBreathing, setIsBreathing] = useState(false);
  const [breathingDuration, setBreathingDuration] = useState(3400);
  const [payload, setPayload] = useState(null);
  const settleTimerRef = useRef(null);
  const exitTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const breathingIntervalRef = useRef(null);
  const breathingTimeoutRef = useRef(null);

  useEffect(() => {
    const clearBreathingTimers = () => {
      if (breathingIntervalRef.current) {
        window.clearTimeout(breathingIntervalRef.current);
      }

      if (breathingTimeoutRef.current) {
        window.clearTimeout(breathingTimeoutRef.current);
      }
    };

    if (animationState !== 'idle') {
      clearBreathingTimers();
      setIsBreathing(false);
      return () => clearBreathingTimers();
    }

    const scheduleBreathing = () => {
      const nextDelay = 5400 + Math.random() * 5800;

      breathingIntervalRef.current = window.setTimeout(() => {
        const nextDuration = Math.round(2600 + Math.random() * 2200);
        setBreathingDuration(nextDuration);
        setIsBreathing(true);

        breathingTimeoutRef.current = window.setTimeout(() => {
          setIsBreathing(false);
          scheduleBreathing();
        }, nextDuration);
      }, nextDelay);
    };

    scheduleBreathing();

    return () => {
      clearBreathingTimers();
    };
  }, [animationState]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncSettings = () => {
      setIsEnabled(window.localStorage.getItem('settings.notifications.island') !== 'false');
    };

    const clearTimers = () => {
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
      }

      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }

      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };

    const showNotification = (event) => {
      syncSettings();
      if (window.localStorage.getItem('settings.notifications.island') === 'false') {
        return;
      }

      clearTimers();
      setPayload(event.detail || null);
      setAnimationState('active');

      settleTimerRef.current = window.setTimeout(() => {
        setAnimationState('settled');
      }, 540);

      exitTimerRef.current = window.setTimeout(() => {
        setAnimationState('exit');
      }, 3300);

      hideTimerRef.current = window.setTimeout(() => {
        setAnimationState('idle');
        setPayload(null);
      }, 3680);
    };

    syncSettings();
    window.addEventListener('storage', syncSettings);
    window.addEventListener(EVENT_NAME, showNotification);

    return () => {
      clearTimers();
      window.removeEventListener('storage', syncSettings);
      window.removeEventListener(EVENT_NAME, showNotification);
    };
  }, []);

  return (
    <div
      className={`dynamic-island-root ${animationState} ${isEnabled ? 'enabled' : 'disabled'} ${
        isBreathing ? 'breathing' : ''
      }`}
      style={{
        '--dynamic-island-breath-duration': `${breathingDuration}ms`,
        '--dynamic-island-breath-tail-delay': `${Math.max(Math.round(breathingDuration * 0.09), 120)}ms`,
      }}
      aria-live="polite"
    >
      <div className="dynamic-island-camera-cutout" />
      <div className="dynamic-island-frame">
        <div className="dynamic-island-idle-shell">
          <span className="dynamic-island-chase-orbit dynamic-island-chase-orbit-primary" />
          <span className="dynamic-island-chase-orbit dynamic-island-chase-orbit-secondary" />
          <span className="dynamic-island-idle-border" />
          <span className="dynamic-island-idle-text">notification</span>
        </div>
        <div className="dynamic-island-expanded-panel">
          <div className="dynamic-island-icon">
            <BellRing size={18} />
          </div>
          <div className="dynamic-island-content">
            <span className="dynamic-island-label">{payload?.subtitle || 'Live message'}</span>
            <strong>{payload?.title || 'XiaoFu Agent'}</strong>
            <p>{payload?.message || 'Notifications will appear here.'}</p>
          </div>
          <span className="dynamic-island-timestamp">{payload?.time || ''}</span>
        </div>
      </div>
    </div>
  );
}

export default DynamicIsland;