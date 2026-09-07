import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-michaeljohndiopenes-Judges-User-Interface/23197318-34ff-469a-ae10-2998d1acaa66/scratchpad';
const B='http://localhost:5173'; const errs=[];
const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await br.newContext({viewport:{width:1280,height:900}});
const p=await ctx.newPage();
p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});

await p.goto(B+'/sign-in',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1500);
await p.fill('#username','booth1'); await p.fill('#pin','5011');
await p.click('button[type=submit]');
await p.waitForURL(/\/judge/,{timeout:15000});
await p.evaluate(()=>{const k='judges:v1:lgu-booth-contest-2026';
  const s=JSON.parse(localStorage.getItem(k)||'{}');
  s.segmentStatus={...(s.segmentStatus||{}),walkthrough:'OPEN'};
  s.submissions={};
  localStorage.setItem(k,JSON.stringify(s));});
await p.goto(B+'/judge/lgu-booth-contest-2026/walkthrough',{waitUntil:'networkidle'});
await p.waitForSelector('.criterion input',{timeout:20000});

const probe = async (label) => {
  const r = await p.evaluate(()=>{
    const ins=[...document.querySelectorAll('.criterion input')];
    return { total:ins.length, disabled:ins.filter(i=>i.disabled).length,
      first:ins[0]?.value };
  });
  console.log(`${label}: inputs ${r.disabled}/${r.total} disabled | first="${r.first}"`);
  return r;
};

// fill + submit
const all=await p.locator('.criterion input').all();
for(const i of all){const m=Number(await i.getAttribute('max')); await i.fill(String(Math.round(m*0.8)));}
await p.waitForTimeout(800);
await probe('before submit ');

await p.locator('.submit-bar .button--primary').click();
await p.waitForSelector('.modal',{timeout:10000});
await p.locator('.modal__actions .button--primary').click();
await p.waitForSelector('.submitted-state',{timeout:10000});
await p.getByRole('button',{name:/review this sheet/i}).click();
await p.waitForSelector('.criterion input',{timeout:10000});
const sub = await probe('AFTER submit  ');

// try to type into a locked field, and check storage did not change
const before = await p.evaluate(()=>localStorage.getItem('judges:v1:lgu-booth-contest-2026'));
await p.locator('.criterion input').first().fill('7',{force:true}).catch(()=>{});
await p.waitForTimeout(600);
const after = await p.evaluate(()=>localStorage.getItem('judges:v1:lgu-booth-contest-2026'));
console.log('storage unchanged by forced typing:', before===after);
await probe('after force   ');

// reopen -> unlock
await p.locator('.submit-bar .button').click();
await p.waitForTimeout(800);
await probe('AFTER reopen  ');
const val = await p.locator('.criterion input').first().inputValue();
await p.locator('.criterion input').first().fill('9');
await p.waitForTimeout(500);
console.log('editable after reopen:', await p.locator('.criterion input').first().inputValue()==='9', `(was ${val})`);

console.log('ERRORS:', errs.length?JSON.stringify(errs.slice(0,3),null,2):'none');
await br.close();
