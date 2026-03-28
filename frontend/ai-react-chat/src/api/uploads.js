import { buildApiUrl, endpoints } from './config';
import { requestForm } from './http';

const toAbsoluteUrl = (value) => {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  if (value.startsWith('/')) {
    return buildApiUrl(value);
  }

  return buildApiUrl(`/${value}`);
};

const extractUploadUrl = (payload) => {
  if (!payload) return null;

  // Common backend patterns
  const directCandidates = [
    payload.url,
    payload.image_url,
    payload.imageUrl,
    payload.file_url,
    payload.fileUrl,
    payload.public_url,
    payload.publicUrl,
    payload.location,
    payload.path,
  ];

  const nested = payload.data || payload.result || payload.payload || null;
  if (nested) {
    directCandidates.push(
      nested.url,
      nested.image_url,
      nested.imageUrl,
      nested.file_url,
      nested.fileUrl,
      nested.public_url,
      nested.publicUrl,
      nested.location,
      nested.path,
    );
  }

  if (Array.isArray(payload.urls) && payload.urls.length > 0) {
    directCandidates.push(payload.urls[0]);
  }
  if (nested && Array.isArray(nested.urls) && nested.urls.length > 0) {
    directCandidates.push(nested.urls[0]);
  }

  for (const candidate of directCandidates) {
    const absolute = toAbsoluteUrl(candidate);
    if (absolute) return absolute;
  }

  return null;
};

export const uploadImage = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const payload = await requestForm(endpoints.upload, formData);
  const url = extractUploadUrl(payload);

  if (!url) {
    const keys = payload && typeof payload === 'object' ? Object.keys(payload).join(', ') : 'non-object response';
    throw new Error(`Upload succeeded but no image URL found in response. Keys: ${keys}`);
  }

  return { ...payload, url };
};