export class TradeHistory {
  constructor(){this.rows=[];this.cursor=null;this.loaded=false;this.attempted=false;this.loading=false;this.hasMore=true;this.error='';}
  merge(rows){
    this.rows=[...new Map([...this.rows,...rows].filter(t=>t&&typeof t.id==='string').map(t=>[t.id,t])).values()]
      .sort((a,b)=>b.closedAt-a.closedAt||b.id.localeCompare(a.id));
  }
  async load(request){
    if(this.loading||(this.loaded&&!this.hasMore))return;
    this.loading=true;this.attempted=true;this.error='';
    try {
      const page=await request('/api/v2-app?history=1'+(this.cursor?'&before='+encodeURIComponent(this.cursor):''));
      if(!Array.isArray(page.rows)||typeof page.hasMore!=='boolean'||(page.hasMore&&typeof page.nextCursor!=='string'))throw Error('İşlem geçmişi yanıtı geçersiz. Sayfayı yenileyin.');
      this.merge(page.rows.map(x=>x.payload?.trade));
      this.cursor=page.nextCursor;this.hasMore=page.hasMore;this.loaded=true;
    }catch(e){this.error=e.message||'İşlem geçmişi yüklenemedi.';}
    finally{this.loading=false;}
  }
}
