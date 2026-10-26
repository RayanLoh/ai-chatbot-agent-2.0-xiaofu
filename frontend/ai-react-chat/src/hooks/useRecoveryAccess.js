import { useEffect, useState } from 'react';
import { requestJson } from '../api/http';

export function useRecoveryAccess({ isLoggedIn, accountId, refreshKey }) {
  const [recoveryAccess, setRecoveryAccess] = useState(null);
  useEffect(() => {
    if (!isLoggedIn || !accountId) return;
    const controller = new AbortController();
    let expiryTimer;
    requestJson('/billing/status', { signal: controller.signal })
      .then((status) => {
        if (controller.signal.aborted) return;
        const remaining = new Date(status.valid_until).getTime() - Date.now();
        const enabled = status.plan === 'pro' && remaining > 0;
        setRecoveryAccess({ owner: accountId, enabled });
        if (enabled) {
          const expiresAt = new Date(status.valid_until).getTime();
          const expire = () => {
            const delay = expiresAt - Date.now();
            if (delay <= 0)
              setRecoveryAccess({ owner: accountId, enabled: false });
            else expiryTimer = setTimeout(expire, Math.min(delay, 2147483647));
          };
          expire();
        }
      })
      .catch(() => {
        // A billing outage must not erase a subscriber's saved recovery record.
        if (!controller.signal.aborted)
          setRecoveryAccess({ owner: accountId, enabled: null });
      });
    return () => {
      controller.abort();
      clearTimeout(expiryTimer);
    };
  }, [isLoggedIn, accountId, refreshKey]);
  return !isLoggedIn
    ? false
    : recoveryAccess?.owner === accountId
      ? recoveryAccess.enabled
      : null;
}
