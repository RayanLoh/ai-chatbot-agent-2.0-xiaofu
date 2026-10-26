import { lazy, memo, Suspense } from 'react';
import { Download, Maximize2, Sparkles } from 'lucide-react';
import AssetImage from './AssetImage';
import { downloadImage } from '../api';
import { useLanguage } from '../i18n/LanguageProvider';
import { normalizeBotMarkdown } from '../utils/markdown';

const MarkdownMessage = lazy(() => import('./MarkdownMessage'));

function ChatMessage({ message, scope, onPreview }) {
  const { t, language } = useLanguage();
  return (
    <div
      className={`msg ${message.sender} ${message.isLoading ? 'loading' : ''} ${message.isStreaming ? 'streaming' : ''} ${message.isError ? 'error' : ''}`}
    >
      {message.sender === 'bot' ? (
        <>
          <div className="message-author">
            <Sparkles size={15} />
            {language === 'zh' ? '小芙' : 'Xiaofu'} <span>· XIAOFU</span>
          </div>
          {message.isLoading ? (
            <div className="thinking-indicator" role="status">
              <i />
              <i />
              <i />
              <span>{t('小芙正在想一想…')}</span>
            </div>
          ) : (
            message.text &&
            (message.isStreaming ? (
              <pre>{normalizeBotMarkdown(message.text)}</pre>
            ) : (
              <Suspense
                fallback={<pre>{normalizeBotMarkdown(message.text)}</pre>}
              >
                <MarkdownMessage text={message.text} />
              </Suspense>
            ))
          )}

          {message.warnings?.includes('HISTORY_IMAGES_UNAVAILABLE') && (
            <p className="message-notice" role="note">
              {t(
                'Some older images are unavailable. Re-upload them if needed.',
              )}
            </p>
          )}
          {message.images &&
            message.images.map((imgUrl, index) => (
              <div key={index} className="image-result-container">
                <AssetImage
                  scope={scope}
                  src={imgUrl}
                  alt={t('Generated image {count}', { count: index + 1 })}
                  className="generated-image"
                  loading="lazy"
                />
                <div className="image-overlay">
                  <div className="overlay-actions">
                    <button
                      className="icon-btn"
                      onClick={() => onPreview(imgUrl)}
                      title={t('Preview (Enlarge)')}
                    >
                      <Maximize2 size={24} />
                    </button>
                    <a
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        downloadImage(imgUrl).catch((error) =>
                          alert(error.message),
                        );
                      }}
                      className="icon-btn"
                      title={t('Download Image')}
                    >
                      <Download size={24} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
        </>
      ) : (
        <>
          <pre>{message.text}</pre>
          {message.images && message.images.length > 0 && (
            <div className="user-images-container">
              {message.images.map((imgUrl, index) => (
                <div key={index} className="user-uploaded-image">
                  <AssetImage
                    scope={scope}
                    src={imgUrl}
                    alt={t('Reference image {count}', { count: index + 1 })}
                    className="user-image"
                    loading="lazy"
                    onClick={() => onPreview(imgUrl)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(ChatMessage);
