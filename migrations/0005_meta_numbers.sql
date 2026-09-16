alter table whatsapp_connection
  add column if not exists agent_phone text not null default '2348098765432';
