// Собирает web/ в один app/src/main/assets/index.html (+ шрифты) для Android WebView.
const fs=require('fs'), path=require('path');
const postcss=require('postcss'), cp=require('postcss-custom-properties');
const root=path.resolve(__dirname,'..'), out=path.join(root,'app/src/main/assets');
(async()=>{
  const css=(await postcss([cp({preserve:true})]).process(fs.readFileSync(path.join(root,'web/style.css'),'utf8'),{from:undefined})).css;
  const js=fs.readFileSync(path.join(root,'web/app.js'),'utf8'); // уже ES5
  const body=fs.readFileSync(path.join(root,'web/body.html'),'utf8');
  const html=`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Садхана</title>
<style>
${css}</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`;
  fs.mkdirSync(path.join(out,'fonts'),{recursive:true});
  fs.writeFileSync(path.join(out,'index.html'),html);
  const fonts=[['manrope',['400','600','700']],['jetbrains-mono',['500','700']],['yeseva-one',['400']]];
  for(const [f,ws] of fonts) for(const w of ws) for(const sub of ['cyrillic','latin']){
    const n=`${f}-${sub}-${w}-normal.woff2`;
    fs.copyFileSync(path.join(__dirname,'node_modules/@fontsource',f,'files',n), path.join(out,'fonts',n));
  }
  console.log('ok', html.length);
})();
