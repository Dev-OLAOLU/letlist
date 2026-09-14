-- Groups stay idle until the desk connects WhatsApp and starts watching them.
update listing_groups
set watching = false
where exists (
  select 1 from whatsapp_connection
  where id = 'desk' and connected = false
);
