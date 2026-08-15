const flat = String.raw`let [h, b:block (y:term , _t:aeq y y) |- AE[.., b.1, b.2]] = ref' tr1 in [h |- ae_l \x. \w. AE]`;
const m = /\blet\b([^=]*?)=([^]*?)\bin\b/g.exec(flat);
console.log('pat  =', JSON.stringify(m && m[1]));
const box = /\[([^\]]*?)\|-([^\]]*)\]/.exec(m[1]);
console.log('box2 =', JSON.stringify(box && box[2]));
const mv = (box[2].match(/[A-Z][\w']*/) || [])[0];
console.log('mv   =', mv);
console.log('regex source =', new RegExp('\\[^.]*\.[^\n]*\b' + mv + '\b').source);
console.log('underLam =', new RegExp('\\[^.]*\.[^\n]*\b' + mv + '\b').test(flat));
