-- Two access levels: Read only and Full control. The old third level (paperclip:admin) is folded into Full control,
-- which now covers every tool. Existing grants keep working; this only tidies the stored scope lists.
update bridge.grants
   set scopes = array(select distinct s from unnest(array_replace(scopes, 'paperclip:admin', 'paperclip:control')) as s order by s desc)
 where 'paperclip:admin' = any(scopes);
