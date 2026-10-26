import { useEffect, useState } from 'react';
import { requestJson } from '../api/http';

export function useGuestHistoryClaim({ enabled, owner, onClaimed }) {
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState(null);
  useEffect(() => {
    if (!enabled || !owner) return;
    const guestToken = localStorage.getItem('guest_token');
    if (!guestToken) return;
    const controller = new AbortController();
    let timer;
    let retries = 0;
    setFailure(null);
    const claim = async () => {
      try {
        await requestJson('/conversations/claim-guest', {
          method: 'POST', signal: controller.signal,
          body: JSON.stringify({ guest_token: guestToken }),
        });
        if (controller.signal.aborted) return;
        if (localStorage.getItem('guest_token') === guestToken) localStorage.removeItem('guest_token');
        await onClaimed();
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error.code === 'GUEST_CLAIM_BUSY' && retries++ < 20) {
          timer = setTimeout(claim, 3000);
        } else setFailure(owner);
      }
    };
    void claim();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [enabled, owner, attempt, onClaimed]);
  return { claimError: failure === owner, retryClaim: () => setAttempt((value) => value + 1) };
}
