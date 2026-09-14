const timestamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
function validTime(value){return typeof value==='string'&&timestamp.test(value)&&Number.isFinite(Date.parse(value));}
function decodeCursor(value){
  if(typeof value!=='string'||value.length>1024)throw Error('Geçersiz geçmiş sayfası.');
  // Previous clients sent the database timestamp directly, including +00:00.
  if(validTime(value))return {time:value};
  try {
    if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error();
    const cursor=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(!validTime(cursor.time)||typeof cursor.id!=='string'||!/^[-A-Za-z0-9_:]{1,200}$/.test(cursor.id))throw Error();
    return cursor;
  }catch{throw Error('Geçersiz geçmiş sayfası.');}
}
export function historyQuery(uid,before){
  const q=new URLSearchParams({user_id:`eq.${uid}`,kind:'eq.CLOSE',select:'event_id,created_at,payload',order:'created_at.desc,event_id.desc',limit:'51'});
  if(before!==undefined){
    const c=decodeCursor(before);
    if(c.id)q.set('or',`(created_at.lt.${c.time},and(created_at.eq.${c.time},event_id.lt.${c.id}))`);
    else q.set('created_at',`lt.${c.time}`);
  }
  return q.toString();
}
export function historyPage(records){
  const rows=records.slice(0,50),hasMore=records.length>50,last=rows.at(-1);
  const nextCursor=hasMore?Buffer.from(JSON.stringify({time:last.created_at,id:last.event_id})).toString('base64url'):null;
  return {rows,hasMore,nextCursor};
}
