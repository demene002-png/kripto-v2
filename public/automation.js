// Shared by page and server. Dates persist in Supabase account state.
export const CHECK_INTERVAL_MS=60000;
export function retryDelay(failures) {return Math.min(15*60000,60000*2**Math.min(4,Math.max(1,failures)));}
export function nextCheckAt(state) {
  if(!state)return Infinity;
  const scanDue=Math.max((state.lastRun||0)+CHECK_INTERVAL_MS,state.nextScanAt||0);
  // Entry backoff must not postpone attempts to protect an open position.
  return state.positions?.length?Math.min(scanDue,(state.lastProtectionAt||state.lastRun||0)+CHECK_INTERVAL_MS):scanDue;
}
export function shouldCheck(state,now=Date.now()){return now>=nextCheckAt(state);}
export function pageMayCheck({state,now=Date.now(),authenticated,preview,visible,busy,lastAttempt=0}) {
  return !!authenticated&&!preview&&visible&&!busy&&now-lastAttempt>=CHECK_INTERVAL_MS&&shouldCheck(state,now);
}
export function scheduleSuccess(state,now=Date.now()){state.scanFailures=0;state.nextScanAt=now+CHECK_INTERVAL_MS;}
export function scheduleFailure(state,now=Date.now()){state.scanFailures=(state.scanFailures||0)+1;state.nextScanAt=now+retryDelay(state.scanFailures);}
