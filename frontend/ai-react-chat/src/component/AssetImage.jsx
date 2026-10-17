import { useEffect, useState } from 'react';
import { fetchPrivateImage } from '../api/uploads';
import { useLanguage } from '../i18n/LanguageProvider';

export default function AssetImage({ src, scope, alt, ...props }) {
  const [resource, setResource] = useState(null);
  const [failed, setFailed] = useState(false);
  const { t } = useLanguage();
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setResource(null);
    setFailed(false);
    // Legacy public links must be explicitly migrated; never leak a direct URL.
    if (!src?.startsWith('/assets/')) {
      setFailed(true);
      return () => controller.abort();
    }
    fetchPrivateImage(src, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setResource({ src, scope, objectUrl });
    }).catch((error) => { if (!controller.signal.aborted && error.name !== 'AbortError') setFailed(true); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, scope]);
  if (failed) return <span role="status">{t('Image unavailable. Please upload again.')}</span>;
  if (!resource || resource.src !== src || resource.scope !== scope) return null;
  return <img {...props} src={resource.objectUrl} alt={alt} />;
}
