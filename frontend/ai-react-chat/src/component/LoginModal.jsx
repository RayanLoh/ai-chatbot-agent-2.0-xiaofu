import { useLanguage } from '../i18n/LanguageProvider';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import avatar from '../assets/樱桃少女漫画版014.png';
import { createPortal } from 'react-dom';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import '../styles/LoginModal.css';

export default function LoginModal({ onClose, onLoginSuccess, enabled }) {
  const { t, language } = useLanguage();
  const [error, setError] = useState('');
  const closeButton = useRef(null);
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
        <div className="xiaofu-login-provider">
        {enabled ? <GoogleLogin key={language} locale={language === 'zh' ? 'zh_CN' : language === 'ms' ? 'ms' : 'en'}
          theme="filled_black" shape="pill" size="large" width="280" text="continue_with" auto_select={false}
          onSuccess={(response) => {
            try {
              const decoded = jwtDecode(response.credential);
              onLoginSuccess(decoded, response.credential);
            } catch { setError('登录失败，请再试一次。'); }
          }}
          onError={() => setError('登录失败，请再试一次。')}
          useOneTap={false}
        /> : <p>{t("Google 登录暂未配置，你仍可以先体验游客聊天。")}</p>}
        </div>
        {error && <p className="xiaofu-login-error" role="alert">{t(error)}</p>}
        <button className="xiaofu-login-guest" onClick={onClose}>{t("先随便逛逛")}</button>
      </div>
    </div>, document.body,
  );
}
