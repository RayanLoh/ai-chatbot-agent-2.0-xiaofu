import os
# Never import production .env secrets into the test process.
for key in ('GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
            'R2_ENDPOINT_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
            'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_PLAN_ID', 'PAYPAL_WEBHOOK_ID', 'APP_BASE_URL'):
    os.environ[key] = ''
os.environ['GOOGLE_CLIENT_ID'] = 'test-client'
os.environ['GUEST_SIGNING_SECRET'] = 'test-signing-secret-with-at-least-32-characters'
os.environ['R2_PUBLIC_URL'] = 'https://images.example.com'

os.environ.pop('ALLOWED_MODELS', None)
os.environ['ALLOWED_MODELS'] = 'gemini-3.8-flash,gemini-3.5-flash-lite,gemini-4-argon,gemini-3.1-pro-preview,gemini-nano-banana-2.1,gemini-3.1-flash-image,gemini-3-pro-image'
