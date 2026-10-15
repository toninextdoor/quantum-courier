const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
export function cropGeometry(width,height,settings={},size=256){
 if(!(width>0&&height>0))throw Error('Invalid image dimensions');
 const quarter=((Math.round(settings.quarter||0)%4)+4)%4,rotatedWidth=quarter%2?height:width,rotatedHeight=quarter%2?width:height;
 const zoom=clamp(settings.zoom??1,1,3),scale=Math.max(size/rotatedWidth,size/rotatedHeight)*zoom;
 const overflowX=Math.max(0,(rotatedWidth*scale-size)/2),overflowY=Math.max(0,(rotatedHeight*scale-size)/2);
 return {quarter,scale,overflowX,overflowY,x:clamp(settings.x,-1,1)*overflowX,y:clamp(settings.y,-1,1)*overflowY,flip:!!settings.flip};
}
export function drawCrop(canvas,image,settings){
 const size=canvas.width,g=cropGeometry(image.naturalWidth||image.width,image.naturalHeight||image.height,settings,size),ctx=canvas.getContext('2d');
 ctx.save();ctx.fillStyle='#101b24';ctx.fillRect(0,0,size,size);ctx.translate(size/2+g.x,size/2+g.y);ctx.rotate(g.quarter*Math.PI/2);ctx.scale(g.scale*(g.flip?-1:1),g.scale);ctx.drawImage(image,-(image.naturalWidth||image.width)/2,-(image.naturalHeight||image.height)/2);ctx.restore();return g;
}
