// The video URL is assigned only after a deliberate click, then released on close.
export function bindTrailer({dialog,video,button,buttons=[button],closeButton,status,canOpen=()=>true,isMuted=()=>false,onOpen=()=>{},onClose=()=>{}}){
 let returnFocus=null,restoreFocus=true,generation=0,active=false;
 const defaultStatus=status.textContent;
 function close({restoreFocus:focus=true}={}){if(!dialog.open)return;restoreFocus=focus;dialog.close();cleanup();}
 function open(event){
  if(dialog.open||!canOpen())return;
  returnFocus=event?.currentTarget||document.activeElement;restoreFocus=true;status.textContent=defaultStatus;
  dialog.showModal();active=true;onOpen();closeButton.focus({preventScroll:true});
  video.muted=isMuted();video.poster=video.dataset.poster;video.src=video.dataset.src;video.load();
  const current=++generation;
  const playback=video.play();playback?.catch(()=>{if(dialog.open&&generation===current)status.textContent='Press play to start the trailer.';});
 }
 for(const trigger of buttons)trigger.addEventListener('click',open);closeButton.addEventListener('click',()=>close());
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{if(!dialog.open)cleanup();});
 function cleanup(){
  if(!active)return;active=false;generation++;video.pause();
  if(document.fullscreenElement&&dialog.contains(document.fullscreenElement))document.exitFullscreen?.().catch(()=>{});
  try{video.webkitExitFullscreen?.();}catch{}
  video.removeAttribute('src');video.removeAttribute('poster');video.load();onClose();
  const menu=returnFocus?.closest('details'),target=menu&&!menu.open?menu.querySelector('summary'):returnFocus;
  if(restoreFocus&&target?.isConnected){const token=generation;target.focus({preventScroll:true});requestAnimationFrame(()=>{if(!dialog.open&&generation===token)target.focus({preventScroll:true});});}
 }
 video.addEventListener('error',()=>{if(dialog.open)status.textContent='The trailer could not load. Close and try again.';});
 video.addEventListener('ended',()=>{status.textContent='Trailer finished.';});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&dialog.open){video.pause();status.textContent='Paused while this tab is hidden. Press play when you return.';}});
 return {open,close};
}
