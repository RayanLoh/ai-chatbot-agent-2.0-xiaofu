from uuid import UUID
from pydantic import BaseModel, Field, field_validator
from config import Config


class ChatRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=20000)
    conversation_id: str | None = Field(default=None, min_length=1, max_length=64)
    request_id: UUID
    model_name: str = Field(default_factory=lambda: Config.DEFAULT_MODEL, validate_default=True)
    image_urls: list[str] = Field(default_factory=list, max_length=4)

    @field_validator('prompt')
    @classmethod
    def validate_prompt(cls, value):
        if not value.strip():
            raise ValueError('Prompt cannot be empty')
        return value.strip()

    @field_validator('model_name')
    @classmethod
    def validate_model(cls, value):
        value = value.removeprefix('models/')
        if value not in Config.ALLOWED_MODELS:
            raise ValueError('Unsupported model')
        return value


class StopRequest(BaseModel):
    request_id: UUID
