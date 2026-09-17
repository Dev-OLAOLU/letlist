alter table whatsapp_connection add column if not exists meta_phone_number_id text;
alter table whatsapp_connection add column if not exists meta_verified_name text;
alter table whatsapp_connection add column if not exists meta_display_phone text;
alter table whatsapp_connection add column if not exists meta_waba_id text;
alter table whatsapp_connection add column if not exists last_pull_at timestamptz;
alter table whatsapp_connection add column if not exists meta_error text;
