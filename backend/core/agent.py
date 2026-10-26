import asyncio
from fastapi import HTTPException
from google import genai
from google.genai import types
from model_catalog import is_image_model
from config import Config
from decimal import Decimal, InvalidOperation, ROUND_CEILING


def maximum_cost(model, input_tokens):
    try:
        rates = Config.MODEL_BUDGETS[model]
        input_rate, output_rate = Decimal(str(rates['input'])), Decimal(str(rates['output']))
        image_cost = Decimal(str(rates['image_micro_usd'])) if is_image_model(model) else Decimal(0)
        if not all(value.is_finite() and value >= 0 for value in (input_rate, output_rate, image_cost)):
            raise ValueError()
        cost = input_rate * input_tokens + output_rate * Config.MAX_OUTPUT_TOKENS + image_cost
        if cost <= 0:
            raise ValueError()
        return int(cost.to_integral_value(rounding=ROUND_CEILING))
    except (KeyError, TypeError, ValueError, InvalidOperation):
        raise HTTPException(503, 'Model budget is not configured') from None


class XiaofuAgent:
    def __init__(self, api_key: str | None, system_prompt: str):
        self.api_key = api_key
        self.system_prompt = system_prompt

    async def get_response(self, history: list[dict], model_name: str, storage_service, reserve_budget) -> dict:
        if not self.api_key:
            raise HTTPException(503, 'AI service is not configured')
        maximum_cost(model_name, 0)  # Fail closed before provider or storage IO.
        if is_image_model(model_name) and (not Config.R2_PRIVATE_BUCKET_CONFIRMED or not getattr(
            getattr(storage_service, 'storage', storage_service), 's3_client', None)):
            raise HTTPException(503, 'Private image storage is not configured')
        contents = []
        # Database is the source of truth on every request and every instance.
        # Cap context to recent messages to bound upstream payload size.
        recent = history[-40:]
        image_cache = {}
        warnings = set()
        # Keep at most the most recent four images across the entire context.
        selected_images = set()
        for message_index in range(len(recent) - 1, -1, -1):
            for image_index in range(len(recent[message_index].get('images') or []) - 1, -1, -1):
                if len(selected_images) < 4:
                    selected_images.add((message_index, image_index))
        for message_index, message in enumerate(recent):
            parts = []
            if message.get('text'):
                parts.append(types.Part.from_text(text=message['text']))
            for image_index, url in enumerate(message.get('images') or []):
                if (message_index, image_index) in selected_images:
                    if url not in image_cache:
                        try:
                            image_cache[url] = await storage_service.fetch_image(url)
                        except HTTPException as error:
                            # Legacy public URLs and missing historical private
                            # assets are never fetched remotely or trusted anew.
                            # A newly attached image must still fail explicitly.
                            if message_index < len(recent)-1 and error.status_code in (400,404,409):
                                warnings.add('HISTORY_IMAGES_UNAVAILABLE')
                                continue
                            raise
                    data, mime = image_cache[url]
                    parts.append(types.Part.from_bytes(data=data, mime_type=mime))
            if parts:
                contents.append(types.Content(role='model' if message.get('sender') == 'bot' else 'user', parts=parts))
        config = types.GenerateContentConfig(
            candidate_count=1,
            system_instruction=self.system_prompt,
            max_output_tokens=Config.MAX_OUTPUT_TOKENS,
            response_modalities=['TEXT', 'IMAGE'] if is_image_model(model_name) else ['TEXT'],
        )
        async with genai.Client(api_key=self.api_key, http_options=types.HttpOptions(timeout=90000)).aio as client:
            # Developer API count_tokens does not accept system_instruction in
            # config. Count it as extra content and add a framing safety margin.
            counted = await client.models.count_tokens(model=model_name, contents=[
                types.Content(role='user', parts=[types.Part.from_text(text=self.system_prompt)]), *contents])
            tokens = counted.total_tokens
            if not isinstance(tokens, int) or tokens < 1:
                raise HTTPException(502, 'Unable to determine request token usage')
            tokens += 128
            if tokens > Config.MAX_INPUT_TOKENS:
                raise HTTPException(413, 'Conversation exceeds the input token limit. Start a new conversation.')
            await reserve_budget(maximum_cost(model_name, tokens))
            response = await client.models.generate_content(model=model_name, contents=contents, config=config)
        blocked = {'SAFETY', 'IMAGE_SAFETY', 'PROHIBITED_CONTENT', 'IMAGE_PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'}
        feedback = response.prompt_feedback
        block_reason = getattr(feedback, 'block_reason', None)
        finish_reasons = {getattr(candidate.finish_reason, 'value', candidate.finish_reason)
                          for candidate in (response.candidates or [])[:1]}
        if getattr(block_reason, 'value', block_reason) in blocked or finish_reasons & blocked:
            raise HTTPException(422, {'code': 'CONTENT_BLOCKED',
                'detail': 'The AI provider blocked this request for safety reasons. Please use a different prompt.'})
        text, images = [], []
        for candidate in (response.candidates or [])[:1]:
            for part in candidate.content.parts if candidate.content else []:
                if part.thought:
                    continue
                if part.text:
                    text.append(part.text)
                if part.inline_data and part.inline_data.data:
                    url = await storage_service.upload_image(part.inline_data.data, part.inline_data.mime_type)
                    if not url:
                        raise HTTPException(503, 'Generated image could not be saved')
                    images.append(url)
        if not text and not images:
            if 'MAX_TOKENS' in finish_reasons:
                raise HTTPException(502, 'The model reached its output limit without returning content. Try a simpler request.')
            if 'NO_IMAGE' in finish_reasons or 'IMAGE_OTHER' in finish_reasons:
                raise HTTPException(502, 'The image model could not produce an image. Try a different prompt or image model.')
            raise HTTPException(502, 'The model returned no content. Please retry or choose another model.')
        usage = response.usage_metadata
        return {'text': ''.join(text).strip(), 'images': images, 'warnings': sorted(warnings),
                'usage': usage.model_dump(exclude_none=True) if usage else {}}
