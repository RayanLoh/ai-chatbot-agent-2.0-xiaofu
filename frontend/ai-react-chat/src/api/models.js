import { buildApiUrl, endpoints } from './config';

export const getModels = async () => {
  const response = await fetch(buildApiUrl(endpoints.models));
  if (!response.ok) throw new Error('Unable to load available models');
  const data = await response.json();
  if (!Array.isArray(data.models) || data.models.some((model) => typeof model !== 'string')) {
    throw new Error('Invalid model list');
  }
  const details = Array.isArray(data.model_options) ? data.model_options : [];
  return [...new Set(data.models)].map((value) => {
    const detail = details.find((item) => item && item.value === value);
    return {
      value,
      label: typeof detail?.label === 'string' ? detail.label : value,
      compactLabel: typeof detail?.compactLabel === 'string' ? detail.compactLabel : value,
      group: typeof detail?.group === 'string' ? detail.group : '其他模型',
      imageGeneration: detail?.imageGeneration === true,
      ...(['free', 'pro'].includes(detail?.access) ? { access: detail.access } : {}),
      ...(typeof detail?.available === 'boolean' ? { available: detail.available,
        unavailableReason: detail.unavailable_reason || null } : {}),
    };
  });
};
