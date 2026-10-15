'use strict';
const sharp=require('sharp');
let busy=0;
async function normalizePhoto(data){
 if(typeof data!=='string'||data.length>220000||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data))throw Error('Use a JPEG, PNG or WebP image under 160 KB after cropping.');
 if(busy>=2)throw Error('Photo processing is busy. Try again shortly.');
 const raw=Buffer.from(data.split(',')[1],'base64');if(raw.length>160000)throw Error('Photo is too large. Choose a smaller image.');
 busy++;try{const image=sharp(raw,{limitInputPixels:16000000,animated:false,failOn:'warning'}),meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)>1)throw Error('Unsupported image.');const output=await image.rotate().resize(256,256,{fit:'cover'}).jpeg({quality:82}).toBuffer();return 'data:image/jpeg;base64,'+output.toString('base64');}catch{throw Error('This image could not be read. Use a still JPEG, PNG or WebP.');}finally{busy--;}
}
module.exports={normalizePhoto};
