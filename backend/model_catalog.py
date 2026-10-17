"""Gemini generateContent models, checked against official docs on 2026-10-17.

Source: https://ai.google.dev/gemini-api/docs/models
Availability and billing still depend on the configured Google account.
"""

MODEL_CATALOG = {
    'gemini-3.8-flash': ('Gemini 3.8 Flash', '3.8 Flash', '通用聊天', False),
    'gemini-3.5-flash-lite': ('Gemini 3.5 Flash-Lite', '3.5 Lite', '通用聊天', False),
    'gemini-4-argon': ('Gemini 4 Argon', '4 Argon', '推理与编程', False),
    'gemini-3.1-pro-preview': ('Gemini 3.1 Pro · 预览版', '3.1 Pro · 预览', '推理与编程', False),
    'gemini-nano-banana-2.1': ('Nano Banana 2.1', 'Banana 2.1', '图片生成', True),
    'gemini-3.1-flash-image': ('Nano Banana 2 · Gemini 3.1 Flash Image', 'Banana 2', '图片生成', True),
    'gemini-3-pro-image': ('Nano Banana Pro · Gemini 3 Pro Image', 'Banana Pro', '图片生成', True),
}
DEFAULT_MODELS = tuple(MODEL_CATALOG)


def is_image_model(model: str) -> bool:
    model = model.removeprefix('models/')
    entry = MODEL_CATALOG.get(model)
    return entry[3] if entry else 'image' in model


def model_options(allowed_models):
    options = []
    for model in allowed_models:
        label, compact, group, image = MODEL_CATALOG.get(
            model, (model, model, '其他模型', is_image_model(model)),
        )
        options.append({
            'value': model, 'label': label, 'compactLabel': compact,
            'group': group, 'imageGeneration': image,
        })
    return options
