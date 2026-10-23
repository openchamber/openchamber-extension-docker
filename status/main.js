(()=>{var m="openchamber.sdk",x=1;var Ye=`
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [data-oc-scrolling] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [data-oc-scrolling] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [data-oc-scrolling]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [data-oc-scrolling] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;function to(e){let o=e.documentElement;if(o.hasAttribute("data-oc-scrollbar-activity"))return;o.setAttribute("data-oc-scrollbar-activity","");let n=new WeakMap;e.addEventListener("scroll",(a)=>{let s=a.target===e?o:a.target;if(!(s instanceof Element))return;if(!s.hasAttribute("data-oc-scrolling"))s.setAttribute("data-oc-scrolling","");let E=n.get(s);if(E!==void 0)clearTimeout(E);n.set(s,setTimeout(()=>{n.delete(s),s.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var pr=`(${to.toString()})(document);`;var Qe=128,Ze=65536;var Te=128;var be=65536;var so=/^[a-z][a-z0-9-]{0,39}$/;var oo=(e)=>Object(e)===e&&!Array.isArray(e),qe=(e,o)=>Object.keys(e).every((n)=>o.includes(n)),ro=(e)=>String(e)===e&&e.length>=1&&e.length<=60,no=(e)=>String(e)===e&&e.length>=1&&e.length<=80,io=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let o=new Set;for(let n of e){if(!oo(n)||!so.test(n.id)||!ro(n.label))return!1;if(n.disabled!==void 0&&n.disabled!==!0&&n.disabled!==!1)return!1;if(o.has(n.id))return!1;if(o.add(n.id),n.kind==="button"){if(!qe(n,["kind","id","label","disabled"]))return!1;continue}if(n.kind!=="select"||!qe(n,["kind","id","label","value","options","disabled"]))return!1;if(!no(n.value)||!Array.isArray(n.options)||n.options.length<1||n.options.length>16)return!1;let a=new Set;for(let s of n.options){if(!oo(s)||!qe(s,["value","label"])||!no(s.value)||!ro(s.label)||a.has(s.value))return!1;a.add(s.value)}if(!a.has(n.value))return!1}return!0};var ke=20000000,ve=256;var et=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,ao=(e,o)=>{if(e.path!==o.path||e.readOnly!==o.readOnly)return!1;if(e.encoding==="text"||o.encoding==="text")return e.encoding==="text"&&o.encoding==="text"&&e.content===o.content;if(e.bytes.byteLength!==o.bytes.byteLength)return!1;for(let n=0;n<e.bytes.byteLength;n+=1)if(e.bytes[n]!==o.bytes[n])return!1;return!0};var co=/^[A-Za-z0-9_-]{1,80}$/;var lo=["left","right","top","bottom"];var po=(e,o=0,n={remaining:16000})=>{if(--n.remaining<0||o>=32)return!1;if(e===null)return!0;let a=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let s of a)if(!po(s,o+1,n))return!1;return!0},tt=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((o)=>/^(0|[1-9]\d*)$/.test(o)&&Number(o)<e.length)&&e.every(tt);if(Object(e)===e){let o=Object.getPrototypeOf(e);return(o===null||o===Object.prototype)&&Object.values(e).every(tt)}return String(e)===e||Number.isFinite(e)},ot=(e)=>{try{if(String(e.id)!==e.id||!co.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!lo.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!po(e.data)||!tt(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var fo=["file","directory","other","missing"],nt=(e)=>Boolean(e&&"sessionId"in e),st=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var mo=/^[0-9a-f]{7,64}$/i,it=(e)=>mo.test(e),Ae=500,ye=32000,xo=16000,Eo=128,go=200,ho=2000,_o=16000,So=80,To=200,bo=16000;var ko=2000;var at=20000,we=1024,Oe=2000000;var Re=64000,Ue=8000,ct=4000;var dt=960000;var vo=999,Ao=1e4,ue=500,yo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],wo=["stopped","starting","ready","failed"],ur=new Set(yo),Oo=(e)=>ur.has(e),Ro=(e)=>e&&Oo(e)?e:"HOST_REJECTED",q=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(q);if(Object(e)===e)return Object.values(e).every(q);return!1},Uo=(e)=>q(e)&&JSON.stringify(e).length<=bo,uo=(e)=>e?.trim().slice(0,To)??"",ee=(e)=>{let o=e.id.trim().slice(0,Eo),n=e.title.trim().slice(0,go),a=e.url.trim().slice(0,ho),s=e.text?.trim().slice(0,_o),E=e.author?.trim().slice(0,So),p=e.kind==="pull"?"pull":"issue",g={providerId:e.providerId.trim(),id:o,title:n||o,url:a,kind:p};if(s)g.text=s;if(E)g.author=E;if(p==="pull"){let P=uo(e.branches?.head),D=uo(e.branches?.base);if(P&&D)g.branches={head:P,base:D}}if(Uo(e.data))g.data=e.data;return g},lt=(e)=>{let o=ee(e);if(e.projectId)o.projectId=e.projectId;if(e.navigation)o.navigation=e.navigation;if(e.worktree)o.worktree=e.worktree;return o},pt=(e)=>{let o={text:e.text.trim().slice(0,xo)};if(e.send)o.send=!0;return o},ut=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(vo,Math.max(0,Math.round(e)))},ft=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(Ao,Math.max(0,Math.ceil(e)))};var te=(e)=>e.length>0&&e.length<=we&&!e.includes("\x00")&&!e.includes("\\");var Ce=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>ko)return!1;return!e.split("/").some((n)=>n==="."||n==="..")},fr=new Set(wo),mt=(e)=>Boolean(e&&"status"in e&&fr.has(String(e.status))&&!("body"in e)),Ie=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),xt=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),Et=(e)=>Boolean(e&&"written"in e&&e.written===!0),gt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),mr=new Set(fo),ht=(e)=>Boolean(e&&"kind"in e&&"size"in e&&mr.has(String(e.kind))&&Number.isFinite(e.size)),_t=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),xr=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),Er=(e)=>Object(e)===e?e:null,rt=(e)=>String(e)===e&&e.length>0,gr=(e)=>{if(!rt(e.id))return null;if(e.ok===!0){let o={channel:m,v:x,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)o.payload=e.payload;return o}if(e.ok===!1&&rt(e.error))return{channel:m,v:x,type:"result",id:e.id,ok:!1,error:e.error,code:Ro(rt(e.code)?e.code:void 0)};return null},St=(e)=>{let o=Er(e);if(!o||o.channel!==m||o.v!==x)return null;if(o.type==="result")return gr(o);if(!xr.has(String(o.type))||Object(o.payload)!==o.payload)return null;return o};var Co=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),hr=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class d extends Error{code;constructor(e,o){super(o);this.name="HostRequestError",this.code=e}}var Io=()=>Promise.reject(new d("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Le=()=>Promise.reject(new d("BAD_PATH",`File path must be 1 to ${we} characters without NUL or backslash.`)),Me=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new d("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},f=(e)=>(e.value+=1,`oc-${e.value}`),Tt=(e={})=>{let o=e.target??("window"in globalThis?window:null);if(!o)throw new d("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let n=e.acceptSource??((t)=>t===o.parent),a=e.requestTimeoutMs??at,s=new Set,E=new Set,p=new Set,g=new Set,P=new Set,D=new Set,se=new Set,me=new Set,xe=new Set,W=new Set,Ve=[],ie=null,ae=null,Ee=new Set,ge=new Set,ce=null,de=null,je=!1,Y=new Map,Q=new Map,Z=new Map,H=!1,u={value:0},l=null,X=null,le=!1,pe=!1,Bt=null,zt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},L=(t)=>{o.parent.postMessage(t,"*")},Vt=()=>{if(H||o.parent===o||W.size===0||l?.features?.lateGenerateResults!==!0)return;L({channel:m,v:x,type:"generate-late-listen"})},b=(t,r)=>{for(let i of t)try{i(r)}catch(c){console.error(c)}},jt=(t)=>{if(!(t instanceof MessageEvent))return;if(!n(t.source))return;let r=St(t.data);if(!r)return;if(r.type==="workspace"){let c=Q.get(r.payload.subscriptionId);if(c)b([c],r.payload.snapshot);return}if(r.type==="shells"){let c=Z.get(r.payload.subscriptionId);if(c)b([c],r.payload.snapshot);return}if(r.type==="ready"){if(l=r.payload,X=zt(r.payload.session),b(s,r.payload),b(E,r.payload.directory),b(p,r.payload.session),X)b(g,X);b(P,r.payload.connection),b(D,r.payload.settings),b(se,r.payload.item),Vt();return}if(r.type==="generate-late"){if(W.size===0)Ve.push(r.payload);else b(W,r.payload);return}if(r.type==="directory"){if(l)l={...l,directory:r.payload.directory};b(E,r.payload.directory);return}if(r.type==="session"){if(l)l={...l,session:r.payload.session};if(!r.payload.session)X=null;else if(X?.sessionId!==r.payload.session.id)X=zt(r.payload.session);b(p,r.payload.session);return}if(r.type==="session-lifecycle"){X=r.payload,b(g,r.payload);return}if(r.type==="connection"){if(l)l={...l,connection:r.payload.connection};b(P,r.payload.connection);return}if(r.type==="settings"){if(l)l={...l,settings:r.payload.settings};b(D,r.payload.settings);return}if(r.type==="item"){if(l)l={...l,item:r.payload.item};b(se,r.payload.item);return}if(r.type==="status-control-event"){b(me,r.payload);return}if(r.type==="popover-closed"){b(xe,r.payload);return}if(r.type==="action"){let c=(h)=>{if(!H)L({channel:m,v:x,type:"action-result",id:r.id,payload:h})},_=ae;if(!_){c({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>_(r.payload)).then(()=>c({ok:!0}),(h)=>{let y=(h instanceof Error?h.message:String(h)).trim();c({ok:!1,error:(y||"Action failed.").slice(0,ue)})});return}if(r.type==="file-open"){let c=r.payload;if(de&&ao(de,c))return;de=c,b(Ee,r.payload);return}if(r.type==="file-saved"){b(ge,r.payload.version);return}if(r.type==="file-snapshot"){let c=(y)=>{if(!H)L({channel:m,v:x,type:"file-snapshot-result",id:r.id,payload:y})},_=(y)=>c({error:(y.trim()||"Could not read the edited file.").slice(0,ue)}),h=ce;if(!h){_("This extension does not edit files.");return}Promise.resolve().then(()=>h(r.payload.purpose)).then((y)=>{if(et(y)>ke){_(`The file is over ${ke} ${"bytes"in y?"bytes":"characters"}.`);return}if(y.version.length>ve){_(`The snapshot version is over ${ve} characters.`);return}c({snapshot:"bytes"in y?{bytes:y.bytes,version:y.version}:{content:y.content,version:y.version}})},(y)=>_(y instanceof Error?y.message:String(y)));return}if(r.type==="resolve"){let c=(h)=>{L({channel:m,v:x,type:"resolve-result",id:r.id,payload:h})},_=ie;if(!_){c({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>_(r.payload)).then((h)=>c({item:h?ee(h):null}),(h)=>{let y=(h instanceof Error?h.message:String(h)).trim();c({error:(y||"Command failed.").slice(0,ue)})});return}let i=Y.get(r.id);if(!i)return;if(clearTimeout(i.timer),Y.delete(r.id),r.ok){i.resolve(r.payload);return}i.reject(new d(r.code,r.error))};o.addEventListener("message",jt),L({channel:m,v:x,type:"hello"});let O=(t,r=a)=>{if(H||o.parent===o)return Promise.reject(new d("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((i,c)=>{let _=setTimeout(()=>{Y.delete(t.id),c(new d("HOST_TIMEOUT","Host did not answer in time."))},r);Y.set(t.id,{resolve:i,reject:c,timer:_}),L(t)})},v=(t)=>O(t).then(()=>{return}),A={channel:m,v:x},Ke=(t)=>{if(!H&&o.parent!==o)L(t)},Kt=()=>Ke({...A,type:"file-save"}),Jt=(t)=>{if(!Co(t)||!hr(t))return;t.preventDefault(),Kt()},Wt=(t)=>{if(!Co(t)||t.key!=="Escape"||l?.surface!=="popover"||!l.popover)return;t.preventDefault(),qt(l.popover.id,"escape").catch(()=>{return})},he=()=>{let t=l?.surface==="popover"?l.popover:void 0;if(!t)return;let r=le||pe;if(Bt===r)return;Bt=r,eo(t.id,r).catch(()=>{return})},_e=()=>{if(l?.surface!=="popover"||le)return;le=!0,he()},Yt=(t)=>{if(l?.surface!=="popover"||t.relatedTarget!==null||!le)return;le=!1,he()},Qt=()=>{if(l?.surface!=="popover"||pe)return;pe=!0,he()},Zt=()=>{if(l?.surface!=="popover"||!pe)return;pe=!1,he()},G=(t,r=1024)=>{if(!t.trim()||t.length>r)throw new d("HOST_REJECTED",`Identity must contain 1 to ${r} characters.`)},Je=async(t)=>{if(t.kind!=="projects")G(t.projectId);let r=await O({...A,type:"workspace-read",id:f(u),payload:t});if(!r||!("kind"in r)||!("state"in r)||r.kind!==t.kind)throw new d("HOST_REJECTED","Host did not return workspace data.");return r},We=async(t,r)=>{if(t.kind!=="projects")G(t.projectId);let i=f(u);Q.set(i,r);try{await v({...A,type:"workspace-subscribe",id:f(u),payload:{subscriptionId:i,query:t}})}catch(c){if(Q.delete(i),!H)L({...A,type:"workspace-unsubscribe",id:f(u),payload:{subscriptionId:i}});throw c}return()=>{if(!Q.delete(i)||H)return;L({...A,type:"workspace-unsubscribe",id:f(u),payload:{subscriptionId:i}})}},lr=async(t,r)=>{if(t.kind==="session")G(t.sessionId);if(t.kind==="project")G(t.projectId);let i=f(u);Z.set(i,r);try{await v({...A,type:"shells-subscribe",id:f(u),payload:{subscriptionId:i,scope:t}})}catch(c){if(Z.delete(i),!H)L({...A,type:"shells-unsubscribe",id:f(u),payload:{subscriptionId:i}});throw c}return()=>{if(!Z.delete(i)||H)return;L({...A,type:"shells-unsubscribe",id:f(u),payload:{subscriptionId:i}})}},Se=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>Qe))throw new d("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!q(t.value))throw new d("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>Ze)throw new d("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&l?.features?.deviceStorage!==!0)throw new d("UNSUPPORTED","This host does not support device storage.");let r=await O({...A,type:"storage",id:f(u),payload:t});if(!r||!("storage"in r)||r.op!==t.op)throw new d("HOST_REJECTED","Host did not return storage data.");return r},qt=(t,r)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new d("UNSUPPORTED","This host does not support popovers.")):v({...A,type:"popover-close",id:f(u),payload:r?{id:t,reason:r}:{id:t}}),eo=(t,r)=>l?.features?.popovers!==!0&&!(l?.surface==="popover"&&l.popover?.id===t)?Promise.reject(new d("UNSUPPORTED","This host does not support popovers.")):v({...A,type:"popover-anchor",id:f(u),payload:{id:t,active:r}});return o.addEventListener("keydown",Wt,!0),o.addEventListener("pointerover",_e),o.addEventListener("pointermove",_e),o.addEventListener("pointerout",Yt),o.addEventListener("focus",Qt),o.addEventListener("blur",Zt),{onAction:(t)=>(ae=t,()=>{if(ae===t)ae=null}),listProjects:async()=>{let t=await Je({kind:"projects"});if(t.kind!=="projects")throw new d("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let r=await Je({kind:"worktrees",projectId:t});if(r.kind!=="worktrees")throw new d("HOST_REJECTED","Expected worktrees.");return r},listSessions:async(t)=>{let r=await Je({kind:"sessions",projectId:t});if(r.kind!=="sessions")throw new d("HOST_REJECTED","Expected sessions.");return r},onProjects:(t)=>We({kind:"projects"},(r)=>{if(r.kind==="projects")t(r)}),onWorktrees:(t,r)=>We({kind:"worktrees",projectId:t},(i)=>{if(i.kind==="worktrees")r(i)}),onSessions:(t,r)=>We({kind:"sessions",projectId:t},(i)=>{if(i.kind==="sessions")r(i)}),onRunningShells:(t,r)=>lr(t,r),readShellOutput:async(t,r)=>{G(t,Te);let i=r?.cursor;if(i!==void 0&&(!Number.isInteger(i)||i<0))throw new d("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let c=r?.tailBytes;if(c!==void 0&&(!Number.isInteger(c)||c<1||c>be))throw new d("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${be}.`);let h=await O({...A,type:"shell-output",id:f(u),payload:{shellId:t,cursor:i,tailBytes:c}});if(!h||typeof h.output!=="string"||!Number.isFinite(h.cursor))throw new d("HOST_REJECTED","Host did not return shell output.");return h},stopShell:async(t)=>{if(G(t,Te),(await O({...A,type:"shell-stop",id:f(u),payload:{shellId:t}}))?.stopped!==!0)throw new d("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{G(t),await v({...A,type:"open-session",id:f(u),payload:{sessionId:t}})},storage:{get:async(t,r)=>{let i=Me(r),c={op:"get",key:t};if(i)c.scope=i;let _=await Se(c);return _.op==="get"&&_.found?_.value:void 0},set:async(t,r,i)=>{let c=Me(i),_={op:"set",key:t,value:r};if(c)_.scope=c;await Se(_)},delete:async(t,r)=>{let i=Me(r),c={op:"delete",key:t};if(i)c.scope=i;await Se(c)},keys:async(t)=>{let r=Me(t),i={op:"keys"};if(r)i.scope=r;let c=await Se(i);if(c.op!=="keys")throw new d("HOST_REJECTED","Expected storage keys.");return c.keys}},onReady:(t)=>{if(s.add(t),l)t(l);return()=>{s.delete(t)}},onDirectory:(t)=>{if(E.add(t),l)t(l.directory);return()=>{E.delete(t)}},onSession:(t)=>{if(p.add(t),l)t(l.session);return()=>{p.delete(t)}},onSessionLifecycle:(t)=>{if(g.add(t),X)t(X);return()=>{g.delete(t)}},onConnection:(t)=>{if(P.add(t),l)t(l.connection);return()=>{P.delete(t)}},onSettings:(t)=>{if(D.add(t),l)t(l.settings);return()=>{D.delete(t)}},onItem:(t)=>{if(se.add(t),l)t(l.item);return()=>{se.delete(t)}},onStatusControl:(t)=>(me.add(t),()=>{me.delete(t)}),onPopoverClosed:(t)=>(xe.add(t),()=>{xe.delete(t)}),setStatusControls:(t)=>{if(l?.features?.statusControls!==!0)return Promise.reject(new d("UNSUPPORTED","This host does not support status controls."));if(!io(t))return Promise.reject(new d("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return v({...A,type:"status-controls",id:f(u),payload:{controls:t}})},openPopover:(t)=>{if(l?.features?.popovers!==!0)return Promise.reject(new d("UNSUPPORTED","This host does not support popovers."));if(!ot(t))return Promise.reject(new d("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return v({...A,type:"popover-open",id:f(u),payload:t})},closePopover:qt,setPopoverAnchorActive:eo,onResolve:(t)=>(ie=t,()=>{if(ie===t)ie=null}),toast:(t)=>{let r=t.message.trim();if(!r||r.length>Ae)return Promise.reject(new d("HOST_REJECTED",`Toast message must contain 1 to ${Ae} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>ye))return Promise.reject(new d("HOST_REJECTED",`Toast copy text must contain 1 to ${ye} characters.`));return v({channel:m,v:x,type:"toast",id:f(u),payload:{...t,message:r}})},openUrl:(t)=>v({channel:m,v:x,type:"open-url",id:f(u),payload:{url:t}}),openCommit:(t)=>it(t)?v({channel:m,v:x,type:"open-commit",id:f(u),payload:{sha:t}}):Promise.reject(new d("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),openSurface:(t)=>v({channel:m,v:x,type:"open-surface",id:f(u),payload:{surfaceId:t}}),writeClipboard:(t)=>v({channel:m,v:x,type:"clipboard-write",id:f(u),payload:{text:t}}),compose:(t)=>v({channel:m,v:x,type:"compose",id:f(u),payload:t}),attach:(t)=>v({channel:m,v:x,type:"attach",id:f(u),payload:ee(t)}),startSession:async(t)=>{if(t.projectId!==void 0)G(t.projectId);let r=t.worktree;if(r&&r!==!0)if(r.kind==="existing")G(r.directory);else{if(r.name!==void 0)G(r.name,200);if(r.baseBranch!==void 0)G(r.baseBranch,200)}let i=await O({channel:m,v:x,type:"start-session",id:f(u),payload:lt(t)},e.requestTimeoutMs??180000);if(!nt(i))throw new d("HOST_REJECTED","Host did not return a session.");return i},prompt:(t)=>O({channel:m,v:x,type:"prompt",id:f(u),payload:pt(t)}).then((r)=>{if(!st(r))throw new d("HOST_REJECTED","Host did not return a prompt result.");return r}),sessionLink:(t)=>v({channel:m,v:x,type:"session-link",id:f(u),payload:ee(t)}),close:()=>v({channel:m,v:x,type:"close",id:f(u)}),oauthStart:()=>v({channel:m,v:x,type:"oauth-start",id:f(u)}),oauthDisconnect:()=>v({channel:m,v:x,type:"oauth-disconnect",id:f(u)}),request:(t)=>(Ce(t.path)?O({channel:m,v:x,type:"request",id:f(u),payload:t}):Io()).then((r)=>{if(!Ie(r))throw new d("HOST_REJECTED","Host request result was empty.");return r}),serviceRequest:(t)=>(Ce(t.path)?O({channel:m,v:x,type:"service-request",id:f(u),payload:t}):Io()).then((r)=>{if(!Ie(r))throw new d("HOST_REJECTED","Host service request result was empty.");return r}),serviceStatus:()=>O({channel:m,v:x,type:"service-status",id:f(u)}).then((t)=>{if(!mt(t))throw new d("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(te(t)?O({channel:m,v:x,type:"file-read",id:f(u),payload:{path:t}}):Le()).then((r)=>{if(!xt(r))throw new d("HOST_REJECTED","Host did not return file content.");return r}),writeFile:(t,r)=>{if(!te(t))return Le();if(r.length>Oe)return Promise.reject(new d("FILE_TOO_LARGE",`Content is over ${Oe} characters.`));return O({channel:m,v:x,type:"file-write",id:f(u),payload:{path:t,content:r}}).then((i)=>{if(!Et(i))throw new d("HOST_REJECTED","Host did not confirm the write.");return i})},listDir:(t)=>(te(t)?O({channel:m,v:x,type:"file-list",id:f(u),payload:{path:t}}):Le()).then((r)=>{if(!gt(r))throw new d("HOST_REJECTED","Host did not return directory entries.");return r}),stat:(t)=>(te(t)?O({channel:m,v:x,type:"file-stat",id:f(u),payload:{path:t}}):Le()).then((r)=>{if(!ht(r))throw new d("HOST_REJECTED","Host did not return file status.");return r}),generate:(t)=>{let r=t.prompt.trim(),i=t.system?.trim();if(r.length===0||r.length>Re)return Promise.reject(new d("HOST_REJECTED",`Prompt must be 1 to ${Re} characters.`));if(i!==void 0&&(i.length===0||i.length>Ue))return Promise.reject(new d("HOST_REJECTED",`System prompt must be 1 to ${Ue} characters.`));let c=t.maxOutputTokens===void 0?void 0:Math.min(ct,Math.max(1,Math.floor(t.maxOutputTokens)));if(c!==void 0&&!Number.isFinite(c))return Promise.reject(new d("HOST_REJECTED","maxOutputTokens must be a number."));let _={prompt:r};if(i!==void 0)_.system=i;if(c!==void 0)_.maxOutputTokens=c;return O({channel:m,v:x,type:"generate",id:f(u),payload:_},e.requestTimeoutMs??dt).then((h)=>{if(!_t(h))throw new d("HOST_REJECTED","Host did not return generated text.");return h})},onLateGenerateResult:(t)=>{W.add(t);for(let r of Ve.splice(0))b([t],r);return Vt(),()=>{W.delete(t)}},setBadge:(t)=>v({channel:m,v:x,type:"badge",id:f(u),payload:{count:ut(t)}}),setHeight:(t)=>v({channel:m,v:x,type:"resize",id:f(u),payload:{height:ft(t)}}),onFileOpen:(t)=>{if(Ee.add(t),!je)je=!0,o.addEventListener("keydown",Jt,!0);if(de)t(de);return()=>{Ee.delete(t)}},onFileSnapshot:(t)=>(ce=t,()=>{if(ce===t)ce=null}),onFileSaved:(t)=>(ge.add(t),()=>{ge.delete(t)}),reportFileChange:(t)=>Ke({...A,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Kt,reportFileUnsupported:()=>Ke({...A,type:"file-unsupported"}),dispose:()=>{for(let t of Q.keys())L({...A,type:"workspace-unsubscribe",id:f(u),payload:{subscriptionId:t}});Q.clear();for(let t of Z.keys())L({...A,type:"shells-unsubscribe",id:f(u),payload:{subscriptionId:t}});if(Z.clear(),H=!0,ie=null,ae=null,ce=null,Ee.clear(),ge.clear(),je)o.removeEventListener("keydown",Jt,!0);o.removeEventListener("message",jt),o.removeEventListener("keydown",Wt,!0),o.removeEventListener("pointerover",_e),o.removeEventListener("pointermove",_e),o.removeEventListener("pointerout",Yt),o.removeEventListener("focus",Qt),o.removeEventListener("blur",Zt);for(let t of Y.values())clearTimeout(t.timer),t.reject(new d("HOST_UNAVAILABLE","Host client was disposed."));Y.clear(),s.clear(),E.clear(),p.clear(),g.clear(),P.clear(),D.clear(),se.clear(),me.clear(),xe.clear(),W.clear(),Ve.length=0}}};var Lo=["browser.open","browser.snapshot","browser.click","browser.type","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var pn=new Set(Lo);var Mo=["none","agent","user"];var fn=new Set(Mo);var _r=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Sr=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Go=(e,o)=>{o.style.colorScheme=e.mode;for(let[n,a]of _r)o.style.setProperty(n,e.tokens[a]);for(let[n,a,s]of Sr){let E=e.tokens[s]??"";o.style.setProperty(n,E),o.style.setProperty(a,E)}o.style.setProperty("font-family",e.tokens.font),o.style.setProperty("font-size","0.875rem"),o.style.setProperty("line-height","1.45"),o.style.setProperty("color",e.tokens.foreground)},bt=(e,o)=>{if(Go(e.theme,o),o.dataset)o.dataset.ocSurface=e.surface,o.dataset.ocTheme=e.theme.mode};var Tr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},T=(e,o)=>`var(--${e}, var(--oc-${Tr[e]}, ${o}))`,z=T("surface-background","transparent"),Ne=T("surface-elevated","transparent"),oe=T("surface-elevated-foreground","inherit"),M=T("surface-foreground","inherit"),S=T("surface-muted-foreground","gray"),br=T("surface-muted","transparent"),j=T("interactive-border","currentColor"),R=T("interactive-hover","transparent"),J=T("interactive-active","transparent"),kt=T("interactive-selection","transparent"),vt=T("interactive-selection-foreground","inherit"),B=T("primary","currentColor"),At=T("primary-text","inherit"),yt=T("error-text","inherit"),kr=T("font-sans","inherit"),wt=T("font-mono","monospace"),Ho=T("radius","9px"),Ot=`calc(${Ho} - 2px)`,No=`calc(${Ho} - 4px)`,k=(e,o,n="transparent")=>`color-mix(in srgb, ${e} ${o}%, ${n})`,Po=`background-image: linear-gradient(${R}, ${R});`,Rt=(e)=>`box-shadow: inset 0 0 0 1px ${e}, var(--oc-sdk-field-lift);`,Ut="box-shadow: inset 0 0 0 1px var(--oc-sdk-edge), var(--oc-sdk-raised-lift);",Do="box-shadow: var(--oc-sdk-lit);",$o=`inset 0 1px 0 0 ${k(M,1.5)}, 0 1px 1px 0 rgb(0 0 0 / 0.28), 0 2px 3px -2px rgb(0 0 0 / 0.2)`,vr=`
:root {
  --oc-sdk-edge: ${k(M,10)};
  --oc-sdk-field-bg: ${Ne};
  --oc-sdk-raised-bg: ${z};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 2px 0 rgb(0 0 0 / 0.06);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.45), 0 1px 2px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.8), inset 0 0 0 1px rgb(0 0 0 / 0.04), 0 0 0 1px rgb(0 0 0 / 0.1), 0 1px 2px -0.5px rgb(0 0 0 / 0.08), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.08);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${k(M,6)};
  --oc-sdk-field-bg: ${k(z,50,Ne)};
  --oc-sdk-raised-bg: ${Ne};
  --oc-sdk-field-lift: ${$o};
  --oc-sdk-raised-lift: ${$o};
  --oc-sdk-lit: inset 0 1px 0 0 ${k(M,1.5)}, 0 1px 1px 0 rgb(0 0 0 / 0.28), 0 2px 3px -2px rgb(0 0 0 / 0.2);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.06), inset 0 0 0 1px rgb(255 255 255 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.36), 0 1px 1px -0.5px rgb(0 0 0 / 0.22), 0 3px 3px -1.5px rgb(0 0 0 / 0.2), 0 6px 6px -3px rgb(0 0 0 / 0.16);
}`,Ge=(e)=>{let o=T(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${o}; --oc-sdk-tone-text: ${T(`${e}-text`,"inherit")}; }`},Ar=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: 6px; height: 28px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: 4px; height: 24px; padding: 0 8px; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 32px; padding: 0 10px; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: 8px 10px; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 28px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: 14px; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; }
`,Fo=`${vr}
.oc-sdk { color: ${M}; font-family: ${kr}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Po} }
.oc-sdk-mono { font-family: ${wt}; }
.oc-sdk-muted { color: ${S}; }
${Ge("success")}${Ge("warning")}${Ge("error")}${Ge("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${B}; --oc-sdk-tone-text: ${At}; }

.oc-sdk-btn { border-radius: ${Ot}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${No}; }
.oc-sdk-btn[data-variant="default"] { color: ${At}; background: ${k(B,10,z)}; border-color: ${k(B,12)}; ${Do} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${k(B,16,z)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${k(B,22,z)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${br}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${R}, ${R}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${J}, ${J}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${oe}; border-color: transparent; ${Ut} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${R}, ${R}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${J}, ${J}); box-shadow: inset 0 0 0 1px var(--oc-sdk-edge); }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${R}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${J}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${T("status-error","red")}; color: ${yt}; background: ${k("var(--oc-sdk-tone)",7,z)}; border-color: ${k("var(--oc-sdk-tone)",12)}; ${Do} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${k("var(--oc-sdk-tone)",9,z)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${k("var(--oc-sdk-tone)",11,z)}; box-shadow: none; }

.oc-sdk-field-note { color: ${S}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${yt}; }
.oc-sdk-input { border-radius: ${Ot}; background: var(--oc-sdk-field-bg); color: ${oe}; ${Rt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${S}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${R}, ${R}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Rt(k(M,26))} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Rt(T("status-error","red"))} }
.oc-sdk-input[data-mono="true"] { font-family: ${wt}; }

.oc-sdk-search-icon { color: ${S}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${B}; }
.oc-sdk-search-clear { border-radius: ${No}; color: ${S}; }
.oc-sdk-search-clear:hover { background: ${R}; color: ${M}; }

.oc-sdk-trigger { border-color: transparent; border-radius: ${Ot}; background: var(--oc-sdk-raised-bg); color: ${oe}; ${Ut} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${R}, ${R}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${J}, ${J}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${S}; }
.oc-sdk-trigger-chevron { color: ${S}; }
/* The app's dropdown light: lit top, hairline rings and a layered shadow, no border. */
.oc-sdk-popup { --surface-foreground: ${oe}; border-color: transparent; border-radius: 12px; background: ${Ne}; color: ${oe}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${R}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${kt}; color: ${vt}; }
.oc-sdk-option-check { color: ${M}; }
.oc-sdk-option[data-destructive="true"] { color: ${yt}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${k(T("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${S}; }
.oc-sdk-popup-empty { color: ${S}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${j}; border-radius: 4px; color: ${M}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${k(M,60,j)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${j}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${z}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${B}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Po} }
.oc-sdk-check-desc { color: ${S}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${k(M,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${S}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${M}; }
.oc-sdk-tab[aria-selected="true"] { color: ${vt}; background: ${kt}; border-color: ${j}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${oe}; background: var(--oc-sdk-raised-bg); border-color: transparent; ${Ut} }
.oc-sdk-tab-count { color: ${S}; }

.oc-sdk-badge { border-radius: 9999px; background: ${R}; color: ${S}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${k("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${R}; }
.oc-sdk-row[aria-selected="true"] { background: ${kt}; color: ${vt}; }
.oc-sdk-row-lead { font-family: ${wt}; color: ${S}; }
.oc-sdk-row-sub { color: ${S}; }
.oc-sdk-row-meta { color: ${S}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${S}; }

.oc-sdk-empty-body { color: ${S}; }

.oc-sdk-spinner { color: ${S}; }
.oc-sdk-spinner-ring { border-color: ${j}; border-top-color: ${B}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${k("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${S}; }

.oc-sdk-separator { color: ${S}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${k(j,40)}; }

.oc-sdk-progress-label { color: ${S}; }
.oc-sdk-progress-track { border-radius: 9999px; background: ${j}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${B}); }

.oc-sdk-text a { color: ${At}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${k(j,60)}; }
`,U=`
${Ye}
${Ar}
${Fo}`;var Lt={"needs-approval":"Allow the local service for Docker in Settings → Extensions.",paused:"Docker is paused in Settings → Extensions.","service-failed":"The Docker service stopped. It starts again on the next refresh.",unreachable:"Could not reach the Docker service."},Mt=(e)=>{if(!(e instanceof d))return"unreachable";if(e.code==="NO_SERVICE"||e.code==="NOT_GRANTED")return"needs-approval";if(e.code==="DISABLED")return"paused";if(e.code==="SERVICE_FAILED")return"service-failed";return"unreachable"};class Fe extends Error{status;constructor(e,o){super(o);this.status=e}}var Xo=async(e,o,n,a,s)=>{let E=await e.serviceRequest({method:o,path:n,query:a,body:s===void 0?void 0:JSON.stringify(s)}),p=null;try{p=JSON.parse(E.body)}catch{}if(E.status!==200){let g=typeof p==="object"&&p!==null&&typeof p.error==="string"?p.error:`The Docker service answered ${E.status}.`;throw new Fe(E.status,g)}if(p===null)throw new Fe(502,"The Docker service answered with something unexpected.");return p},Ur=(e,o,n)=>Xo(e,"GET",o,n),Gt=async(e,o,n={})=>(await Xo(e,"POST",o,void 0,n)).job;var Bo=(e)=>{if(e instanceof Fe)return e.message;if(e instanceof d)return Lt[Mt(e)];return e instanceof Error?e.message:"Something went wrong."},zo=(e,o,n)=>{let a={};if(o)a.directory=o;if(n)a.stats="1";return Ur(e,"/snapshot",a)},Xe=(e)=>!document.hidden&&e.getBoundingClientRect().width>0,Vo=(e,o)=>{let n=Xe(e),a=()=>{let s=Xe(e);if(s&&!n)o();n=s};document.addEventListener("visibilitychange",a),new ResizeObserver(a).observe(document.documentElement)};var F=(e,o="",n="",a=[])=>{let s=document.createElement(e);if(o)s.className=o;if(n)s.textContent=n;if(a.length>0)s.append(...a);return s};var Nt="en",jo=(e)=>{try{Nt=Intl.NumberFormat.supportedLocalesOf(e)[0]??"en"}catch{Nt="en"}},Cr=(e,o)=>new Intl.NumberFormat(Nt,{minimumFractionDigits:o,maximumFractionDigits:o}).format(e),Ko=(e)=>{if(e===null)return"–";let o=["B","KB","MB","GB","TB"],n=Math.max(0,e),a=0;while(n>=1024&&a<o.length-1)n/=1024,a+=1;let s=a>=3&&n<100?1:0;return`${Cr(n,s)} ${o[a]}`};var Jo=(e)=>{let o=Math.floor(e/60000);if(o<1)return"seconds";if(o<60)return`${o} min`;let n=Math.floor(o/60);if(n<48)return`${n} h`;return`${Math.floor(n/24)} days`},Wo=(e,o=Date.now())=>{let n=e?Date.parse(e):Number.NaN;if(!Number.isFinite(n))return"";let a=Jo(o-n);return a==="seconds"?"just now":`${a} ago`},Yo=(e,o=Date.now())=>{let n=e?Date.parse(e):Number.NaN;return Number.isFinite(n)?Jo(o-n):""};var Ir=(e,o)=>e===o||e.startsWith(`${o.replace(/\/+$/,"")}/`),Lr=(e,o)=>{if(!o)return!1;if(e.workingDir)return Ir(e.workingDir,o.directory);return e.project===o.name},Qo=(e,o)=>Be(e).localeCompare(Be(o)),Zo=(e,o)=>{let n=new Map,a=[];for(let p of e){if(!p.compose){a.push(p);continue}let g=n.get(p.compose.project);if(!g)g={project:p.compose.project,workingDir:p.compose.workingDir,configFiles:p.compose.configFiles,containers:[],running:0,isProject:!1},n.set(p.compose.project,g);if(g.containers.push(p),p.state==="running")g.running+=1}let s=[...n.values()];for(let p of s)p.containers.sort(Qo),p.isProject=Lr(p,o);let E=s.filter((p)=>p.isProject);if(E.length===0&&o?.composeFile)E.push({project:o.name,workingDir:o.directory,configFiles:[`${o.directory.replace(/\/+$/,"")}/${o.composeFile}`],containers:[],running:0,isProject:!0});return{project:E,stacks:s.filter((p)=>!p.isProject).sort((p,g)=>g.running-p.running||p.project.localeCompare(g.project)),standalone:a.sort((p,g)=>Number(g.state==="running")-Number(p.state==="running")||Qo(p,g))}},qo=(e,o)=>{let n=e.configFiles[0]?.split("/").pop()||"compose file";return o?`${n} · not running`:`${n} · not running · install Docker Compose to start it`},Be=(e)=>e.compose?.service||e.name,Mr=new Set([0,130,137,143]),Gr=(e)=>(e.state==="exited"||e.state==="dead")&&(e.oomKilled||e.exitCode!==null&&!Mr.has(e.exitCode)),Nr=(e)=>Gr(e)||e.state==="restarting"||e.health==="unhealthy",er=(e)=>{if(Nr(e))return"bad";if(e.state==="running")return e.health==="starting"?"warn":"ok";if(e.state==="paused")return"warn";return"off"},tr=(e,o=Date.now())=>{switch(e.state){case"running":{let n=Yo(e.startedAt,o);if(n==="seconds")return"just started";return n?`up ${n}`:"running"}case"restarting":return e.restartCount>0?`restarting · ${e.restartCount} restarts`:"restarting";case"paused":return"paused";case"created":return"created, never started";case"removing":return"being removed";default:{let n=Wo(e.finishedAt,o),a=e.oomKilled?"out of memory":`exited (${e.exitCode??"?"})`;return n?`${a} ${n}`:a}}},Pt=(e)=>`http://${e.hostIp==="0.0.0.0"||e.hostIp==="::"||e.hostIp===""?"localhost":e.hostIp.includes(":")?`[${e.hostIp}]`:e.hostIp}:${e.hostPort}`;var or=`
  html, body { margin: 0; background: transparent; color: var(--oc-fg); font: 12px/1.4 var(--oc-font); }
  * { box-sizing: border-box; }
  button { font: inherit; color: inherit; }
  .num { font-variant-numeric: tabular-nums; }
  .muted { color: var(--oc-muted); }
  .mono { font-family: var(--oc-mono); }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--oc-muted); opacity: .55; }
  .dot[data-tone="ok"] { background: var(--oc-success); opacity: 1; }
  .dot[data-tone="warn"] { background: var(--oc-warning); opacity: 1; }
  .dot[data-tone="bad"] { background: var(--oc-error); opacity: 1; }
  .dot.busy { animation: pulse 1s ease-in-out infinite; opacity: 1; background: var(--oc-primary); }
  @keyframes pulse { 50% { opacity: .3; } }
  .port { display: inline-flex; align-items: center; height: 17px; padding: 0 5px; border-radius: 4px; border: 0; cursor: pointer;
    font: 10.5px var(--oc-mono); white-space: nowrap; flex: none;
    background: color-mix(in srgb, var(--oc-primary) 14%, transparent); color: var(--oc-primary-text, var(--oc-primary)); }
  .port:hover { background: color-mix(in srgb, var(--oc-primary) 24%, transparent); }
  .port.plain { cursor: default; }
  /* Text buttons: no fill, they only change colour. */
  .tb { flex: none; padding: 0 2px; border: 0; background: none; font-size: 11px; color: var(--oc-muted); cursor: pointer; white-space: nowrap; }
  .tb:hover, .tb:focus-visible { color: var(--oc-fg); outline: none; }
  .tb.primary { color: var(--oc-primary-text, var(--oc-primary)); }
  .tb.danger:hover, .tb.danger:focus-visible { color: var(--oc-error-text, var(--oc-error)); }
  .tb.armed { color: var(--oc-error-text, var(--oc-error)); font-weight: 600; }
  .tb:disabled { cursor: default; opacity: .55; }
  [hidden] { display: none !important; }
`;var rr=`
  html, body { overflow: hidden; }
  #root { display: flex; flex-direction: column; gap: 3px; padding: 2px 0 4px; }
  .sline { display: grid; grid-template-columns: 8px minmax(0, 88px) minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 19px; }
  .sline .sname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sline .sdetail { color: var(--oc-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; gap: 4px; min-width: 0; }
  .sline .sdetail.bad { color: var(--oc-error-text, var(--oc-error)); }
  .sline .value { text-align: right; white-space: nowrap; color: var(--oc-muted); }
  .note { color: var(--oc-muted); }
  .note.error { color: var(--oc-error-text, var(--oc-fg)); }
  .more { color: var(--oc-muted); font-size: 11px; }
`;var Pr=3000,Dt=6,N=Tt(),K=document.querySelector("#root");if(!K)throw Error("Missing #root");var cr=document.createElement("style");cr.textContent=or+rr;document.head.append(cr);var ze=null,w=null,Ht=!1,dr=new Set,nr=new Set,Xt=()=>w?Zo(w.containers,w.project).project[0]??null:null,Dr=(e,o)=>({action:o,project:e.project,workingDir:e.workingDir,configFiles:e.configFiles}),sr=(e)=>{e().then((o)=>{dr.add(o.id),fe()},(o)=>{N.toast({kind:"error",message:Bo(o),copy:!0})})},Ft="",$r=()=>{if(!Ht)return;let e=[];if(w&&!w.engine.running&&w.engine.start?.canRun&&!w.engine.starting)e.push({kind:"button",id:"start-engine",label:`Start ${w.engine.name}`});let o=w?.engine.running?Xt():null,n=o?w?.jobs.some((s)=>s.kind==="stack"&&s.target===o.project&&s.state==="running"):!1;if(o&&w){let s=Boolean(w.compose);if(o.running===0){if(s||o.containers.length>0)e.push({kind:"button",id:"up",label:"Up",disabled:n})}else e.push({kind:"button",id:"restart",label:"Restart",disabled:n}),e.push({kind:"button",id:s?"down":"stop",label:s?"Down":"Stop",disabled:n})}let a=JSON.stringify(e);if(a===Ft)return;Ft=a,N.setStatusControls(e).catch(()=>{Ht=!1})};N.onStatusControl((e)=>{if(e.id==="start-engine"){sr(()=>Gt(N,"/engine/start"));return}let o=Xt();if(o)sr(()=>Gt(N,"/stacks",Dr(o,e.id)))});var Hr=(e,o,n,a,s=!1)=>{let E=F("span","dot");E.dataset.tone=e;let p=typeof n==="string"?F("span",s?"sdetail bad":"sdetail",n):n;return F("div","sline","",[E,F("span","sname",o),p,F("span","value num",a)])},Fr=(e)=>{let o=F("button","port",`:${e.hostPort}`);return o.type="button",o.title=`Open ${Pt(e)}`,o.addEventListener("click",()=>{N.openUrl(Pt(e)).catch(()=>{return})}),o},ne=(e,o=!1)=>F("div",o?"note error":"note",e),Xr=()=>{if(!w)return;let{engine:e}=w,o=[];if(!e.running)o.push(ne(e.starting?`Starting ${e.name}…`:e.cliMissing?"Docker isn't installed.":`${e.name} isn't running.`));else{let n=Xt(),a=n?w.jobs.find((s)=>s.kind==="stack"&&s.target===n.project&&s.state==="running"):void 0;if(!n)o.push(ne("No Compose file or containers for this project."));else if(n.containers.length===0)o.push(ne(a?`${a.label}…`:qo(n,Boolean(w.compose))));else{if(a)o.push(ne(`${a.label}…`));for(let s of n.containers.slice(0,Dt)){let E=er(s),p=s.state==="running",g=s.ports.filter((D)=>D.protocol==="tcp").slice(0,3),P=p&&g.length>0?F("span","sdetail","",g.map(Fr)):tr(s);o.push(Hr(E,Be(s),P,p?Ko(s.memory):"",E==="bad"))}if(n.containers.length>Dt)o.push(F("div","more",`+${n.containers.length-Dt} more in the Docker panel`))}}K.replaceChildren(...o),$r()},Br=(e)=>{for(let o of e){if(o.state==="running"||nr.has(o.id))continue;if(nr.add(o.id),!dr.delete(o.id))continue;if(o.state==="failed"){let n=o.output.split(`
`).map((a)=>a.trim()).filter(Boolean).pop()??"It failed.";N.toast({kind:"error",message:`${o.label} failed: ${n}`,copy:o.output?{text:o.output}:!1,dismiss:!0})}}},$t=!1,fe=async()=>{if($t||!Xe(K))return;$t=!0;try{w=await zo(N,ze,!0),Br(w.jobs),Xr()}catch(e){K.replaceChildren(ne(Lt[Mt(e)],!0))}finally{$t=!1}},ir=-1;new ResizeObserver(()=>{let e=Math.ceil(K.getBoundingClientRect().height);if(e===ir)return;ir=e,N.setHeight(e).catch(()=>{return})}).observe(K);N.onDirectory((e)=>{if(e===ze)return;ze=e,Ft="",fe()});var ar=!1;N.onReady((e)=>{if(bt(e,document.documentElement),jo(e.locale),Ht=e.features?.statusControls===!0,ze=e.directory,ar)return;ar=!0,K.replaceChildren(ne("Reading…")),fe(),setInterval(()=>void fe(),Pr),Vo(K,()=>void fe())});})();
