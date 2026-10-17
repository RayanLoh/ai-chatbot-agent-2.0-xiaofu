import { useLanguage } from '../i18n/LanguageProvider';
import { useEffect, useRef, useState } from 'react';
import { X, LoaderCircle, Check } from 'lucide-react';
import avatar from '../assets/樱桃少女漫画版014.png';
import { createPortal } from 'react-dom';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import '../styles/LoginModal.css';

export default function LoginModal({ onClose, onLoginSuccess, enabled }) {
  const { t, language } = useLanguage();
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const provider = useRef(null);
  const transitionTimer = useRef(null);
  const closeButton = useRef(null);
  useEffect(() => () => clearTimeout(transitionTimer.current), []);
  useEffect(() => {
    if (!enabled) return;
    setPhase('loading');
    setError('');
    let revealTimer;
    const observed = new Set();
    const loaded = () => {
      clearTimeout(revealTimer);
      // Let Google's account personalization settle before fading in the button.
      revealTimer = setTimeout(() => setPhase((current) => current === 'loading' ? 'ready' : current), 650);
    };
    const observeFrames = () => {
      provider.current?.querySelectorAll('iframe').forEach((frame) => {
        if (observed.has(frame)) return;
        observed.add(frame);
        frame.addEventListener('load', loaded);
      });
    };
    const observer = new MutationObserver(observeFrames);
    observer.observe(provider.current, { childList: true, subtree: true });
    observeFrames();
    const timeout = setTimeout(() => {
      clearTimeout(revealTimer);
      setPhase((current) => current === 'loading' ? 'unavailable' : current);
    }, 12000);
    return () => {
      observer.disconnect();
      clearTimeout(revealTimer);
      clearTimeout(timeout);
      observed.forEach((frame) => frame.removeEventListener('load', loaded));
    };
  }, [enabled, language, attempt]);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    const escape = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); previous?.focus(); };
  }, [onClose]);
  return createPortal(
    <div className="xiaofu-login-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="xiaofu-login-dialog" role="dialog" aria-modal="true" aria-labelledby="xiaofu-login-title">
        <button ref={closeButton} className="xiaofu-login-dismiss" onClick={onClose} aria-label={t('Close')}><X size={18} /></button>
        <img className="xiaofu-login-avatar" src={avatar} alt="" />
        <span className="xiaofu-login-wordmark">XIAOFU</span>
        <h3 id="xiaofu-login-title">{t("登录小芙")}</h3>
        <p className="xiaofu-login-intro">{t("和小芙，继续聊下去。")}</p>
        <div ref={provider} className={`xiaofu-login-provider ${enabled ? `is-${phase}` : ''}`}>
        {enabled && phase !== 'ready' && <div className="xiaofu-login-feedback" role="status" aria-live="polite">
          {phase === 'entering' ? <Check size={18} /> : phase === 'loading' ? <LoaderCircle className="login-spinner" size={18} /> : null}
          <span>{t(phase === 'entering' ? 'Opening your chat…' : phase === 'loading' ? 'Loading sign-in options…' : 'Sign-in is taking longer than expected.')}</span>
        </div>}
        {enabled ? <div className="xiaofu-google-button" inert={phase !== 'ready'} aria-hidden={phase !== 'ready'}><GoogleLogin key={`${language}-${attempt}`} locale={language === 'zh' ? 'zh_CN' : language === 'ms' ? 'ms' : 'en'}
          theme="filled_black" shape="pill" size="large" width="280" text="continue_with" auto_select={false}
          onSuccess={(response) => {
            try {
              const decoded = jwtDecode(response.credential);
              setError('');
              setPhase('entering');
              transitionTimer.current = setTimeout(() => {
                try { onLoginSuccess(decoded, response.credential); }
                catch { setPhase('ready'); setError('登录失败，请再试一次。'); }
              }, 650);
            } catch { setError('登录失败，请再试一次。'); }
          }}
          onError={() => setError('登录失败，请再试一次。')}
          useOneTap={false}
        /></div> : <p>{t("Google 登录暂未配置，你仍可以先体验游客聊天。")}</p>}
        </div>
        {enabled && phase === 'unavailable' && <button className="xiaofu-login-retry" onClick={() => setAttempt((value) => value + 1)}>{t('Try again')}</button>}
        {error && <p className="xiaofu-login-error" role="alert">{t(error)}</p>}
        <button className="xiaofu-login-guest" onClick={onClose}>{t("先随便逛逛")}</button>
      </div>
    </div>, document.body,
  );
}
