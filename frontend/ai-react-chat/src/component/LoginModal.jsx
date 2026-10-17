import { useLanguage } from '../i18n/LanguageProvider';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import '../styles/LoginModal.css';

export default function LoginModal({ onClose, onLoginSuccess, enabled }) {
  const { t, language } = useLanguage();
  const [error, setError] = useState('');
  return createPortal(
    <div className="modal-backdrop">
      <div className="login-modal" role="dialog" aria-modal="true" aria-label={t("登录小芙")}>
        <h3>{t("和小芙，继续聊下去。")}</h3>
        {enabled ? <GoogleLogin key={language} locale={language === 'zh' ? 'zh_CN' : language === 'ms' ? 'ms' : 'en'}
          onSuccess={(response) => {
            try {
              const decoded = jwtDecode(response.credential);
              onLoginSuccess(decoded, response.credential);
            } catch { setError('登录失败，请再试一次。'); }
          }}
          onError={() => setError('登录失败，请再试一次。')}
          useOneTap={false}
        /> : <p>{t("Google 登录暂未配置，你仍可以先体验游客聊天。")}</p>}
        {error && <p role="alert">{t(error)}</p>}
        <button className="close-btn" onClick={onClose}>{t("先随便逛逛")}</button>
      </div>
    </div>, document.body,
  );
}
