// Only read requests may be retried. A timed-out write may already have committed.
export async function fetchText(url,options,{label,timeoutMs,retryRead=false,fetcher=fetch}) {
  const attempts=retryRead&&(options.method||'GET')==='GET'?2:1;
  for(let attempt=0;attempt<attempts;attempt++) {
    const signal=AbortSignal.timeout(timeoutMs);
    try {
      const response=await fetcher(url,{...options,signal});
      const text=await response.text();
      return {response,text};
    } catch(error) {
      const timeout=signal.aborted||error?.name==='TimeoutError'||error?.name==='AbortError';
      const network=error instanceof TypeError;
      if((timeout||network)&&attempt+1<attempts)continue;
      const message=timeout?`${label}: ${timeoutMs/1000} saniyelik süre sınırı aşıldı.`:network?`${label}: bağlantı kurulamadı veya yanıt tamamlanamadı.`:`${label}: yanıt alınamadı.`;
      const e=new Error(message);e.code=timeout?'UPSTREAM_TIMEOUT':'UPSTREAM_CONNECTION';throw e;
    }
  }
}
