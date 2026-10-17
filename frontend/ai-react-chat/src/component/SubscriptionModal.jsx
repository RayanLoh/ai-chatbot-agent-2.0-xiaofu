import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, RefreshCw } from 'lucide-react';
import { requestJson } from '../api/http';
import { buildApiUrl } from '../api/config';
import { useLanguage } from '../i18n/LanguageProvider';
import '../styles/SubscriptionModal.css';

const TEMPLATE_PLANS = { free_limit: 20, free_period: 'lifetime', pro_limit: 100,
  price: '4.99', currency: 'USD', template_only: true, checkout_available: false };

export default function SubscriptionModal({ onClose, onSignIn, isLoggedIn }) {
  const { t, language } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const controls = [...document.querySelectorAll('.subscription-dialog button:not(:disabled), .subscription-dialog a[href]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    const load = async () => {
      return Promise.allSettled([
      requestJson('/billing/status', { signal: controller.signal }),
      fetch(buildApiUrl('/billing/plans'), { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error('Plan catalog unavailable');
        return response.json();
      }),
      ]);
    };
    load().then(([status, catalog]) => {
      if (controller.signal.aborted) return;
      if (status.status === 'fulfilled') setData(status.value);
      else {
        setData(catalog.status === 'fulfilled' ? catalog.value : TEMPLATE_PLANS);
        setError(true);
      }
    });
    return () => controller.abort();
  }, [attempt, isLoggedIn]);
  return <div className="subscription-backdrop" onClick={onClose}>
    <section className="subscription-dialog" role="dialog" aria-modal="true" aria-labelledby="subscription-title" onClick={(e) => e.stopPropagation()}>
      <button ref={close} className="subscription-close" onClick={onClose} aria-label={t('Close plans')}><X size={20} /></button>
      <div className="subscription-symbol"><Sparkles size={24} /></div>
      <h2 id="subscription-title">{t('A little more room to explore.')}</h2>
      <p className="subscription-intro">{t('Start free. Upgrade when you need more.')}</p>
      {error && <div role="alert"><p>{t('Unable to load your plan. Please retry.')}</p><button className="subscription-action" onClick={() => setAttempt((n) => n + 1)}><RefreshCw size={15} /> {t('Retry')}</button></div>}
      {!data ? !error && <p role="status">{t('Loading your plan…')}</p>
        : <>
          {data.plan && <div className="subscription-usage" role="status">
            <strong>{data.plan === 'pro' ? 'Pro' : data.plan === 'guest' ? t('Guest trial') : t('Free')}</strong>
            <span>{t('{remaining} of {limit} messages left', { remaining: data.remaining, limit: data.limit })}</span>
            <progress max={Math.max(1, data.limit)} value={Math.min(data.limit, data.used)} aria-label={t('Messages used')} />
            {data.resets_at && <small>{t('Resets at {time}', { time: new Date(data.resets_at).toLocaleString(language) })}</small>}
          </div>}
          <button className="subscription-secondary" onClick={() => setAttempt((n) => n + 1)}><RefreshCw size={14} />{t('Refresh subscription status')}</button>
          <div className="subscription-plans">
            <article><span className="subscription-plan-label">{t('Free')}</span><h3>{t('A first spark')}</h3>
              <p>{t(data.free_period === 'lifetime' ? '{count} trial messages' : '{count} messages per day', { count: data.free_limit })}</p>
              <p>{t('Selected chat models')}</p>
              <button className="subscription-secondary" onClick={!isLoggedIn ? onSignIn : onClose}>{t(!isLoggedIn ? 'Sign in to try free' : 'Keep exploring')}</button>
            </article>
            <article className="subscription-pro"><span className="subscription-plan-label">Pro</span><h3>{t('Keep the ideas flowing')}</h3>
              <p className="subscription-price">{data.currency} {data.price} <small>{t('/ month')}</small></p>
              <p>{t('{count} messages per day', { count: data.pro_limit })}</p><p>{t('More models, including image generation')}</p>
              <button className="subscription-action" disabled>{t('Subscriptions coming soon')}</button>
            </article>
          </div>
          <p className="subscription-footnote">{t('Template preview only. Payments and subscription activation are not available yet.')}</p>
          <p className="subscription-footnote">{t('Usage and service capacity limits apply.')}</p>
        </>}
    </section>
  </div>;
}
