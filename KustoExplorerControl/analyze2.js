const fs=require('fs');
const b=fs.readFileSync('./out/controls/KustoExplorer/bundle.js','utf8');
console.log('size MB:', (b.length/1048576).toFixed(2));
console.log('codicon hit:', b.indexOf('codicon'));
console.log('StandaloneCodeEditor:', (b.match(/StandaloneCodeEditor/g)||[]).length);
console.log('monarch:', b.indexOf('monarch'));
console.log('react-dom internals (e.g. ReactCurrentDispatcher):', b.indexOf('ReactCurrentDispatcher'));
console.log('production min react:', b.indexOf('react.production.min'));
// look for big embedded base64 or large strings:
const matches = b.match(/"[^"]{2000,}"/g) || [];
console.log('huge strings:', matches.length, matches.slice(0,2).map(s=>s.length));
