from bootstrap import load_app_environment
load_app_environment()

from config import Config
from services.supabase_db import ConversationManager
from services.r2_storage import R2Service
from core.agent import XiaofuAgent

SYSTEM_PROMPT = "Your name is Xiaofu (灏忚姍), an AI companion developed by Rayan. You have a cheerful personality and like to say 'Eh-Hei'."
db = ConversationManager()
storage = R2Service()
bot = XiaofuAgent(api_key=Config.GEMINI_API_KEY, system_prompt=SYSTEM_PROMPT)
