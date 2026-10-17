from pydantic import BaseModel, Field


class ConversationCreateRequest(BaseModel):
    title: str = Field(default='New Conversation', min_length=1, max_length=200)


class ConversationUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
