import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const isMobile = () =>
  typeof window !== 'undefined' && window.innerWidth <= 768;
const MOBILE_TEXTAREA_MIN_HEIGHT = 48;
const DESKTOP_TEXTAREA_MIN_HEIGHT = 44;
const MOBILE_TEXTAREA_MAX_HEIGHT = 140;
const DESKTOP_TEXTAREA_MAX_HEIGHT = 84;
export const PULL_REFRESH_THRESHOLD = 72;
const PULL_REFRESH_MAX_DISTANCE = 104;

const isTouchDevice = () => {
  if (typeof window === 'undefined') return false;

  return Boolean(
    navigator.maxTouchPoints > 0 ||
      window.matchMedia?.('(pointer: coarse)').matches ||
      'ontouchstart' in window,
  );
};

export function useChatViewport({
  inputRef,
  conversationId,
  isLoadingMessages,
  messages,
  historyPrependVersion = 0,
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isMobile());
  const [isMobileViewport, setIsMobileViewport] = useState(() => isMobile());
  const [isDesktopNonTouch, setIsDesktopNonTouch] = useState(
    () => !isMobile() && !isTouchDevice(),
  );
  const [pullDistance, setPullDistance] = useState(0);

  const messagesContainerRef = useRef(null);
  const hasInitializedScrollRef = useRef(false);
  const scrollAnimationFrameRef = useRef(null);
  const imageScrollTimeoutRef = useRef(null);
  const pullStartYRef = useRef(null);
  const isPullingToRefreshRef = useRef(false);
  const historyAnchor = useRef(null);
  const skipNextScroll = useRef(false);

  const preserveHistoryPosition = () => {
    const container = messagesContainerRef.current;
    if (container) historyAnchor.current = { id: conversationId, top: container.scrollTop, height: container.scrollHeight };
  };
  const cancelHistoryPosition = () => { historyAnchor.current = null; };
  useLayoutEffect(() => {
    const anchor = historyAnchor.current;
    historyAnchor.current = null;
    const container = messagesContainerRef.current;
    if (anchor && anchor.id === conversationId && container) {
      container.scrollTop = anchor.top + container.scrollHeight - anchor.height;
      skipNextScroll.current = true;
    }
  }, [historyPrependVersion, conversationId]);

  const resetTextareaHeight = (textarea) => {
    if (!textarea) {
      return;
    }

    const minHeight = isMobileViewport
      ? MOBILE_TEXTAREA_MIN_HEIGHT
      : DESKTOP_TEXTAREA_MIN_HEIGHT;
    textarea.style.height = `${minHeight}px`;
    textarea.style.overflowY = 'hidden';
  };

  const autoResizeTextarea = (textarea) => {
    if (!textarea) {
      return;
    }

    const minHeight = isMobileViewport
      ? MOBILE_TEXTAREA_MIN_HEIGHT
      : DESKTOP_TEXTAREA_MIN_HEIGHT;
    const maxHeight = isMobileViewport
      ? MOBILE_TEXTAREA_MAX_HEIGHT
      : DESKTOP_TEXTAREA_MAX_HEIGHT;
    textarea.style.height = `${minHeight}px`;

    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(nextHeight, minHeight)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    const handleResize = () => {
      const mobileViewport = isMobile();
      setIsMobileViewport(mobileViewport);
      setIsDesktopNonTouch(!mobileViewport && !isTouchDevice());
      setIsSidebarOpen(!mobileViewport);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    autoResizeTextarea(inputRef.current);
  }, [isMobileViewport]);

  const scrollToBottom = (behavior = 'smooth') => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (scrollAnimationFrameRef.current) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    if (behavior === 'animated') {
      const startTop = container.scrollTop;
      const targetTop = Math.max(
        container.scrollHeight - container.clientHeight,
        0,
      );
      const distance = targetTop - startTop;

      if (Math.abs(distance) < 4) {
        container.scrollTop = targetTop;
        return;
      }

      const duration = 420;
      const startTime = performance.now();
      const easeOutCubic = (progress) => 1 - Math.pow(1 - progress, 3);

      const step = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        container.scrollTop = startTop + distance * easeOutCubic(progress);

        if (progress < 1) {
          scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
        } else {
          scrollAnimationFrameRef.current = null;
        }
      };

      scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
      return;
    }

    container.scrollTo({
      top: Math.max(container.scrollHeight - container.clientHeight, 0),
      behavior,
    });
  };

  useEffect(() => {
    if (skipNextScroll.current) { skipNextScroll.current = false; return; }
    if (historyAnchor.current) return;
    if (isLoadingMessages || messages.length === 0) {
      return undefined;
    }

    const behavior = hasInitializedScrollRef.current ? 'smooth' : 'animated';
    const frameId = window.requestAnimationFrame(() => {
      scrollToBottom(behavior);
      hasInitializedScrollRef.current = true;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [conversationId, isLoadingMessages, messages, historyPrependVersion]);

  useEffect(() => {
    if (isLoadingMessages) {
      hasInitializedScrollRef.current = false;
    }
  }, [isLoadingMessages]);

  useEffect(
    () => () => {
      if (scrollAnimationFrameRef.current) {
        window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      }

      if (imageScrollTimeoutRef.current) {
        window.clearTimeout(imageScrollTimeoutRef.current);
      }
    },
    [],
  );

  const handlePullRefreshStart = (event) => {
    if (!isMobileViewport) return;

    const container = messagesContainerRef.current;
    if (!container || container.scrollTop > 0) return;

    pullStartYRef.current = event.touches[0]?.clientY ?? null;
    isPullingToRefreshRef.current = pullStartYRef.current !== null;
  };

  const handlePullRefreshMove = (event) => {
    if (
      !isMobileViewport ||
      !isPullingToRefreshRef.current ||
      pullStartYRef.current === null
    ) {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container || container.scrollTop > 0) {
      isPullingToRefreshRef.current = false;
      pullStartYRef.current = null;
      setPullDistance(0);
      return;
    }

    const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
    const delta = currentY - pullStartYRef.current;

    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    setPullDistance(
      Math.min(Math.round(delta * 0.45), PULL_REFRESH_MAX_DISTANCE),
    );
  };

  const handlePullRefreshEnd = () => {
    if (!isPullingToRefreshRef.current) {
      setPullDistance(0);
      return;
    }

    const shouldRefresh = pullDistance >= PULL_REFRESH_THRESHOLD;
    isPullingToRefreshRef.current = false;
    pullStartYRef.current = null;
    setPullDistance(0);

    if (shouldRefresh) {
      window.location.reload();
    }
  };

  const onImageLoad = (event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    const container = messagesContainerRef.current;
    if (!container || historyAnchor.current || container.scrollHeight - container.clientHeight - container.scrollTop > 160) return;
    clearTimeout(imageScrollTimeoutRef.current);
    imageScrollTimeoutRef.current = setTimeout(
      () => scrollToBottom('smooth'),
      80,
    );
  };

  return {
    isSidebarOpen,
    setIsSidebarOpen,
    isMobileViewport,
    isDesktopNonTouch,
    pullDistance,
    messagesContainerRef,
    resetTextareaHeight,
    autoResizeTextarea,
    handlePullRefreshStart,
    handlePullRefreshMove,
    handlePullRefreshEnd,
    onImageLoad,
    preserveHistoryPosition,
    cancelHistoryPosition,
  };
}
