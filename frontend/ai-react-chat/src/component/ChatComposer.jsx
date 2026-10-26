import { ArrowUp, Image, ShieldCheck, Square, X } from 'lucide-react';
import AssetImage from './AssetImage';
import ModelPicker from './ModelPicker';
import { useLanguage } from '../i18n/LanguageProvider';

export default function ChatComposer({
  chat,
  modelOptions,
  modelError,
  isLoadingMessages,
  isLoggedIn,
  scope,
  hasDraft,
  setHasDraft,
  autoResizeTextarea,
  resetTextareaHeight,
  claimError,
  onRetryClaim,
  onSubscribe,
  onPreview,
}) {
  const { t } = useLanguage();
  const {
    aiModel,
    setAiModel,
    inputRef,
    fileInputRef,
    isGenerating,
    uploadedImageUrls,
    isUploading,
    handleImageUpload,
    removeUploadedImage,
    stopGenerating,
    sendMessage,
    pendingRecovery,
    resumePendingGeneration,
    restorePendingDraft,
  } = chat;
  return (
    <div className="composer-shell">
      {claimError && (
        <div className="composer-caption" role="status">
          <span>{t('Guest history could not be transferred yet.')}</span>
          <button type="button" onClick={onRetryClaim}>
            {t('Retry')}
          </button>
        </div>
      )}
      {pendingRecovery && !isGenerating && (
        <div className="composer-caption" role="status">
          <span>{t('A reply may still be pending.')}</span>
          <div className="recovery-actions">
            <button type="button" onClick={resumePendingGeneration}>
              {t('Recover reply')}
            </button>
            <button type="button" onClick={restorePendingDraft}>
              {t('Restore draft')}
            </button>
          </div>
        </div>
      )}
      <div className="input-box">
        <div className="input-main-row">
          <textarea
            ref={inputRef}
            aria-label={t('发送给小芙的消息')}
            placeholder={t('有个想法？和小芙聊聊…')}
            rows="1"
            className="chat-textarea"
            onInput={(event) => {
              autoResizeTextarea(event.target);
              setHasDraft(Boolean(event.target.value.trim()));
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !isGenerating &&
                !isLoadingMessages
              ) {
                event.preventDefault();
                sendMessage();
                setHasDraft(Boolean(inputRef.current?.value.trim()));
                resetTextareaHeight(event.target);
              }
            }}
          />
          <div className="composer-toolbar">
            <div className="composer-left">
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={handleImageUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isGenerating}
                className="upload-btn"
                title={t('添加参考图片')}
                aria-label={isUploading ? t('图片上传中') : t('添加图片')}
              >
                <Image size={18} />
              </button>
              <span className="toolbar-divider" />
              <ModelPicker
                options={modelOptions}
                value={aiModel}
                onChange={setAiModel}
                disabled={isGenerating || isUploading}
                error={modelError}
              />
            </div>
            <div className="input-actions">
              <span className="composer-keyboard">
                <kbd>Enter</kbd> {t('发送')} · <kbd>Shift + Enter</kbd>{' '}
                {t('换行')}
              </span>
              {isGenerating ? (
                <button
                  onClick={stopGenerating}
                  className="stop-btn"
                  aria-label={t('停止生成')}
                  title={t('停止生成')}
                >
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    sendMessage();
                    setHasDraft(Boolean(inputRef.current?.value.trim()));
                    resetTextareaHeight(inputRef.current);
                  }}
                  disabled={
                    !hasDraft ||
                    isLoadingMessages ||
                    isUploading ||
                    !modelOptions.some(
                      (option) => option.available !== false,
                    ) ||
                    Boolean(pendingRecovery)
                  }
                  className="send-btn"
                  aria-label={t('发送消息')}
                  title={t('发送消息')}
                >
                  <ArrowUp size={19} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="composer-caption">
        <span>
          <ShieldCheck size={11} />
          {isLoggedIn
            ? t('你的想法，值得被认真对待')
            : t('先随便聊聊，登录后继续探索')}
        </span>
        <button
          className="subscription-secondary"
          style={{ margin: 0, padding: '3px 9px' }}
          onClick={() => onSubscribe()}
        >
          {t('Usage & plans')}
        </button>
      </div>
      {uploadedImageUrls.length > 0 && (
        <div className="uploaded-images-preview">
          <p className="uploaded-images-title">
            {t('Uploaded')} ({uploadedImageUrls.length}):
          </p>
          <div className="images-grid">
            {uploadedImageUrls.map((url, index) => (
              <div key={index} className="uploaded-image-item">
                <AssetImage
                  scope={scope}
                  src={url}
                  alt={t('Reference image {count}', { count: index + 1 })}
                  onClick={() => onPreview(url)}
                />
                <button
                  className="remove-image-btn"
                  onClick={() => removeUploadedImage(index)}
                  title={t('移除图片')}
                  aria-label={t('移除图片')}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
