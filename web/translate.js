/* Standalone contribution page: catalogue text and community wording stay text. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ui = {lang:$('trLanguage'),search:$('trSearch'),filter:$('trFilter'),area:$('trArea'),rows:$('trRows'),notice:$('trNotice'),status:$('trStatus'),count:$('trCount'),page:$('trPage'),prev:$('trPrev'),next:$('trNext')};
  if(!ui.rows) return;
  const size = 40, drafts = new Map(), details = new Map(), reads = new Map(), pending = new Set(), errors = new Map();
  let lang = '', entries = [], community = {}, open = null, openMode = 'edit', page = 0, sequence = 0, interaction = 0, loading = false, catalogueFailed = false, summaryFailed = false, deepKey = null;
  const node = (tag, cls, text) => { const n = document.createElement(tag); if(cls) n.className=cls; if(text !== undefined) n.textContent=text; return n; };
  const button = (text, cls, action, focus) => {const b=node('button',cls,text);b.type='button';b.onclick=action;if(focus)b.dataset.focus=focus;return b;};
  const visibleText = value => String(value || '').replace(/<\/?[a-z][^>]*>/gi,'');
  const fold = value => visibleText(value).normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase();
  const normalize = value => fold(value).replace(/[^\p{L}\p{N}{}]+/gu,' ').trim().replace(/\s+/g,' ');
  const draftKey = e => lang + ':' + e.key;
  const entryKey = e => draftKey(e) + ':' + e.sourceVersion;
  const data = e => details.get(entryKey(e)) || (community[e.key]?.sourceVersion === e.sourceVersion ? community[e.key] : null);
  const selected = e => {const d=data(e), c=d?.candidates?.find(c=>c.id===d.selectedId);return c || {id:'bundled',text:e.text ?? e.en,votes:0,voted:false};};
  const hasText = e => selected(e).id !== 'bundled' || typeof e.text === 'string';
  const label = () => ui.lang.selectedOptions[0]?.textContent || lang;
  const setStatus = text => {ui.status.textContent=text;};
  const formatNumber = n => new Intl.NumberFormat(document.documentElement.lang || 'en').format(n);
  function urlFor(key) {
    const url=new URL(location.href);url.searchParams.set('lang',lang);
    if(ui.search.value.trim())url.searchParams.set('q',ui.search.value.trim());else url.searchParams.delete('q');
    if(key)url.searchParams.set('key',key);else url.searchParams.delete('key');
    return url;
  }
  function updateUrl(key) {history.replaceState(null,'',urlFor(key));}
  function renderedMatch(text, query) {
    const parts=visibleText(text).split(/(\{\w+(?::[^{}]+)?\}|⟦[^⟧]+⟧)/g);
    // A literal anchors the phrase, including :00 or $. Placeholder-only
    // templates such as {name} must not match every pasted sentence.
    if(parts.length===1||!parts.some((p,i)=>i%2===0&&p.trim()))return false;
    const number='[+−-]?\\p{N}+(?:[.,\u066b\u066c\u2019\x27\\s]\\p{N}+)*';
    const pattern=parts.map((p,i)=>{
      if(i%2===0)return fold(p).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*');
      const field=/^\{(\w+)(?::([^{}]+))?\}$/.exec(p),name=field?.[1],spec=field?.[2]||'';
      if(spec==='day')return '[\\p{L}.]+(?:\\s+[\\p{L}.]+)*';
      if(spec==='$'||spec==='$c')return '[+−-]?\\$\\s*'+number+(spec==='$c'?'[mk]?':'');
      if(spec===','||/^,?\.\df$/.test(spec)||!spec&&['n','h'].includes(name))return number;
      return '.+?';
    }).join('\\s*');
    try{return new RegExp('^'+pattern+'$','u').test(query);}catch(e){return false;}
  }
  function rank(e, query, renderedQuery) {
    if(!query&&!renderedQuery)return 1;
    const candidates=[e.en,e.text,selected(e).text,...(data(e)?.candidates || []).map(c=>c.text)];
    let score=0;
    for(const text of candidates){
      if(typeof text!=='string')continue;
      const n=normalize(text);
      if(query?n===query:fold(text).trim()===renderedQuery)score=Math.max(score,100);
      else if(renderedMatch(text,renderedQuery))score=Math.max(score,90);
      else if(query?n.includes(query):fold(text).includes(renderedQuery))score=Math.max(score,70);
      else if(query&&query.split(' ').every(w=>n.includes(w)))score=Math.max(score,40);
    }
    if(query&&normalize(e.key).includes(query))score=Math.max(score,20);
    return score;
  }
  function filtered() {
    const query=normalize(ui.search.value),renderedQuery=fold(ui.search.value).trim();
    return entries.map((e,i)=>({e,i,score:rank(e,query,renderedQuery)})).filter(({e,score})=>
      (!deepKey||e.key===deepKey)&&(deepKey||score)&&(!ui.area.value||e.area===ui.area.value)&&
      (ui.filter.value==='all'||ui.filter.value==='missing'&&!hasText(e)||ui.filter.value==='draft'&&hasText(e)&&e.drafted&&selected(e).id==='bundled'||ui.filter.value==='community'&&selected(e).id!=='bundled'))
      .sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.e);
  }
  async function request(path, body) {
    if(!navigator.onLine)throw Object.assign(new Error(),{code:'offline'});
    const response=await fetch('/api/translations'+path,{cache:'no-store',credentials:'same-origin',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(),{code:result.error,status:response.status});
    return result;
  }
  function errorText(error,reading=false) {
    if(error?.code==='validation')return error.text;
    if(error?.code==='offline')return tt('comm.tr.offline','You are offline. Reconnect and try again.');
    if(error?.code==='stale_source')return tt('comm.tr.stale','This phrase changed. Reload the page before submitting.');
    if(error?.code==='candidate_limit')return tt('comm.tr.candidateLimit','This phrase has enough alternatives. Vote for an existing version.');
    if(error?.code==='unknown_candidate')return tt('comm.tr.candidateUnavailable','This version is no longer available. Reload the page and choose another version.');
    if(error?.status===429)return tt('comm.tr.rateLimit','Too many requests. Try again shortly.');
    if(reading)return tt('comm.tr.alternativesError','Could not load alternatives.');
    return tt('comm.tr.saveError','Could not save. Your draft is kept; try again.');
  }
  function renderNotice() {
    ui.notice.replaceChildren();
    if(!navigator.onLine)ui.notice.append(node('span','',tt('comm.tr.offline','You are offline. Reconnect and try again.')));
    else if(summaryFailed){ui.notice.append(node('span','',tt('comm.tr.communityUnavailable','Community wording could not load. Bundled translations are shown.')),button(tt('comm.tr.retry','Retry'),'',$retrySummary));}
  }
  async function $retrySummary() { await loadSummary(sequence); }
  function restoreFocus(focus, selection) {
    if(!focus)return;
    const n=[...ui.rows.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===focus);
    if(n){n.focus({preventScroll:true});if(selection&&n.setSelectionRange)n.setSelectionRange(...selection);}
  }
  function voteButton(e,c, suffix) {
    const b=button(c.voted?tt('comm.tr.yourVote','Your vote'):tt('comm.tr.voteThis','Vote for this'),'tr-vote',()=>mutate(e,'vote',{candidateId:c.id}),e.key+':vote:'+suffix);
    b.append(node('span','tr-vote-count',formatNumber(c.votes || 0)));
    b.setAttribute('aria-label',c.voted
      ?tt('comm.tr.yourVoteForCount',{one:'Your vote: {text} · {n} vote',other:'Your vote: {text} · {n} votes'},{text:c.text,n:c.votes||0})
      :tt('comm.tr.voteForCount',{one:'Vote for {text} · {n} vote',other:'Vote for {text} · {n} votes'},{text:c.text,n:c.votes||0}));
    b.setAttribute('aria-pressed',String(!!c.voted));b.disabled=pending.has(entryKey(e));return b;
  }
  function row(e) {
    const c=selected(e), expanded=open===e.key, key=entryKey(e);
    const group=node('article','tr-group'+(expanded?' tr-open':''));group.dataset.key=e.key;
    const main=node('div','tr-row'), en=node('div','tr-en',visibleText(e.en));
    en.lang='en';en.append(node('div','tr-area',e.context || e.area));
    const target=node('div','tr-target');
    if(hasText(e)){const text=node('span','',c.id==='bundled'?visibleText(c.text):c.text);text.lang=lang;target.append(text);
      const status=c.id!=='bundled'?tt('comm.tr.community','Community'):e.drafted?tt('comm.tr.draft','Draft'):tt('comm.tr.bundled','Bundled');
      target.append(node('small',c.votes?'tr-checked':'',status));
    }else target.append(node('span','tr-missing',tt('comm.tr.notTranslated','Not translated')));
    const edit=button(hasText(e)?tt('comm.tr.suggestChange','Suggest a change'):tt('comm.tr.translate','Translate'),'tr-edit',()=>toggle(e,'edit'),e.key+':edit');
    edit.setAttribute('aria-expanded',String(expanded&&openMode==='edit'));edit.disabled=pending.has(key);
    const rowActions=node('div','tr-row-actions');rowActions.append(edit);
    const candidates=data(e)?.candidates;
    const count=candidates?.filter(alt=>alt.id!==c.id).length;
    const alternatives=button(count===undefined?tt('comm.tr.viewAlternatives','View alternatives'):tt('comm.tr.viewAlternativesCount','View alternatives ({n})',{n:count}),'tr-alternatives',()=>toggle(e,'alternatives'),e.key+':alternatives');
    alternatives.setAttribute('aria-expanded',String(expanded&&openMode==='alternatives'));alternatives.disabled=pending.has(key);rowActions.append(alternatives);
    main.append(en,target,hasText(e)?voteButton(e,c,c.id):node('span'),rowActions);group.append(main);
    if(expanded){
      const editor=node('div','tr-editor'),context=node('div','tr-context',e.context || e.area);
      context.append(node('code','tr-key',e.key),button(tt('comm.tr.copyLink','Copy link'),'',()=>copyLink(e),e.key+':copy'));
      const form=node('form','tr-form');form.onsubmit=event=>{event.preventDefault();submit(e);};
      const d=details.get(key);
      if(!d){const p=node('p','tr-help',errors.has(key)?errorText(errors.get(key),true):tt('comm.tr.loadingAlternatives','Loading alternatives…'));p.setAttribute('role',errors.has(key)?'alert':'status');form.append(p);
        if(errors.has(key))form.append(button(tt('comm.tr.retry','Retry'),'',()=>loadEntry(e),e.key+':retry'));
      }else{
        if(openMode==='alternatives'&&!d.candidates?.some(alt=>alt.id!==d.selectedId))form.append(node('p','tr-help',tt('comm.tr.noAlternatives','No alternatives yet. You can suggest new wording.')));
        for(const alt of d.candidates || []){
          if(alt.id===d.selectedId)continue;
          const alternative=node('div','tr-alt'),text=node('span','',alt.id==='bundled'?visibleText(alt.text):alt.text);text.lang=lang;
          if(alt.id==='bundled')text.append(node('small','',tt('comm.tr.bundled','Bundled')));
          alternative.append(text,voteButton(e,alt,alt.id));form.append(alternative);
        }
      }
      if(openMode==='edit'){
        const inputId='trText-'+entries.indexOf(e),l=node('label','',tt('comm.tr.wording','{language} wording',{language:label()}));l.htmlFor=inputId;
        const input=node('textarea');input.id=inputId;input.lang=lang;input.dataset.focus=e.key+':text';input.maxLength=(e.validation?.maxLength || 2000)*2;
        input.value=drafts.has(draftKey(e))?drafts.get(draftKey(e)):hasText(e)?(c.id==='bundled'?visibleText(c.text):c.text):'';
        input.disabled=pending.has(key);input.oninput=()=>{drafts.set(draftKey(e),input.value);errors.delete(key);const alert=form.querySelector('.tr-error');if(alert)alert.remove();};
        input.onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();submit(e);}};
        form.append(l,input);
        const tokens=e.validation?.required || [];
        if(tokens.length){form.append(node('p','tr-help',tt('comm.tr.keepPlaceholders','Keep these placeholders: {tokens}',{tokens:tokens.map(group=>group.map(t=>'{'+t.replace(/:$/,'')+'}').join(' / ')).join(', ')})));}
        if(errors.has(key)&&d){const p=node('p','tr-error',errorText(errors.get(key)));p.setAttribute('role','alert');form.append(p);}
        const actions=node('div','tr-actions'),send=button(pending.has(key)?tt('comm.tr.saving','Saving…'):tt('comm.tr.submit','Submit'),'tr-primary',()=>submit(e),e.key+':submit');send.disabled=pending.has(key)||!d;
        const cancel=button(tt('comm.tr.cancel','Cancel'),'',()=>close(e,true),e.key+':cancel');cancel.disabled=pending.has(key);actions.append(send,cancel);form.append(actions);
      }else if(errors.has(key)&&d){const p=node('p','tr-error',errorText(errors.get(key)));p.setAttribute('role','alert');form.append(p);}
      editor.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();close(e,false);}};
      editor.append(context,form);group.append(editor);
    }else if(errors.has(key)){const p=node('p','tr-error',errorText(errors.get(key)));p.setAttribute('role','alert');p.style.margin='0 18px 14px';group.append(p);}
    return group;
  }
  function render(focus) {
    const active=document.activeElement, focusKey=focus || active?.dataset.focus;
    const selection=active?.tagName==='TEXTAREA'?[active.selectionStart,active.selectionEnd]:null;
    ui.rows.replaceChildren();ui.rows.setAttribute('aria-busy',String(loading));
    if(loading)ui.rows.append(node('div','tr-empty',tt('comm.tr.loading','Loading phrases…')));
    else if(catalogueFailed){const empty=node('div','tr-empty',tt('comm.tr.loadError','Could not load phrases.'));empty.setAttribute('role','alert');empty.append(button(tt('comm.tr.retry','Retry'),'',()=>loadLanguage(lang)));ui.rows.append(empty);}
    const matches=filtered(),pages=Math.max(1,Math.ceil(matches.length/size));page=Math.min(page,pages-1);
    if(!loading&&!catalogueFailed){for(const e of matches.slice(page*size,(page+1)*size))ui.rows.append(row(e));if(!matches.length)ui.rows.append(node('div','tr-empty',tt('comm.tr.noMatches','No matching phrases.')));}
    ui.count.textContent=tt('comm.tr.phraseCount',{one:'{n} phrase',other:'{n} phrases'},{n:matches.length});
    ui.page.textContent=loading||catalogueFailed?'':tt('comm.tr.pageCount','{page} / {pages}',{page:page+1,pages});
    ui.prev.disabled=loading||page===0;ui.next.disabled=loading||page>=pages-1;
    $('trTargetHeading').textContent=label();renderNotice();restoreFocus(focusKey,selection);
  }
  async function loadEntry(e) {
    const key=entryKey(e),seq=sequence,token={};reads.set(key,token);errors.delete(key);render();
    try{const d=await request('/entry?'+new URLSearchParams({lang,key:e.key,sourceVersion:e.sourceVersion}));if(seq!==sequence||reads.get(key)!==token)return;details.set(key,d);render();}
    catch(error){if(seq!==sequence||reads.get(key)!==token)return;errors.set(key,error);render();}
  }
  function toggle(e,mode='edit') {
    if(open===e.key&&openMode===mode){close(e,false);return;}
    interaction++;open=e.key;openMode=mode;updateUrl(e.key);render(e.key+(mode==='edit'?':text':':alternatives'));if(!details.has(entryKey(e)))loadEntry(e);
  }
  function close(e, discard) {interaction++;if(discard)drafts.delete(draftKey(e));open=null;errors.delete(entryKey(e));updateUrl(deepKey);render(e.key+(openMode==='edit'?':edit':':alternatives'));}
  function validate(e,text) {
    if(/[<>\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(text)||/&(?:#(?:x[\da-f]+|\d+);?|[a-z][a-z\d]+;)/i.test(text))return tt('comm.tr.plainText','Use plain text without HTML or encoded markup.');
    if(!text.trim())return tt('comm.tr.enterText','Enter a translation.');
    if([...text].length>(e.validation?.maxLength||2000))return tt('comm.tr.tooLong','Translation is too long.');
    const found=[...text.matchAll(/\{(\w+)(?::([^{}]+))?\}/g)].map(m=>m[1]+':'+(m[2]||''));
    const valid=e.validation;
    if(valid&&found.some(t=>!valid.allowed.includes(t)))return tt('comm.tr.invalidPlaceholder','Remove the extra or changed placeholder.');
    if(valid&&valid.required.some(group=>!group.some(t=>found.includes(t))))return tt('comm.tr.missingPlaceholder','Keep the required placeholders shown above.');
    if(text.replace(/\{\w+(?::[^{}]+)?\}/g,'').match(/[{}]/))return tt('comm.tr.invalidPlaceholder','Remove the extra or changed placeholder.');
    return '';
  }
  function submit(e) {
    const current=selected(e);
    const value=drafts.has(draftKey(e))?drafts.get(draftKey(e)):hasText(e)?(current.id==='bundled'?visibleText(current.text):current.text):'';
    const error=validate(e,value.trim());
    if(error){errors.set(entryKey(e),{code:'validation',text:error});render(e.key+':text');return;}
    mutate(e,'suggest',{text:value.trim()});
  }
  async function mutate(e,kind,body) {
    const key=entryKey(e),wantedLang=lang,seq=sequence,focus=document.activeElement?.dataset.focus,heldDraft=drafts.get(draftKey(e));
    if(pending.has(key))return;
    reads.delete(key);pending.add(key);errors.delete(key);render();
    try{
      const d=await request('/'+kind,{lang,key:e.key,sourceVersion:e.sourceVersion,...body});
      if(kind==='suggest'&&drafts.get(wantedLang+':'+e.key)===heldDraft)drafts.delete(wantedLang+':'+e.key);
      if(seq===sequence){reads.delete(key);details.set(key,d);community[e.key]=d;}
      else if(lang===wantedLang){
        // A write keeps running across navigation. On returning to its language,
        // read current state rather than installing a response from an old visit.
        const current=entries.find(row=>row.key===e.key&&row.sourceVersion===e.sourceVersion);
        if(current)await loadEntry(current);
      }
      if(lang===wantedLang){setStatus(kind==='suggest'?tt('comm.tr.suggestionSaved','Suggestion saved with your vote.'):tt('comm.tr.voteSaved','Vote saved.'));}
    }catch(error){errors.set(key,error);}
    finally{pending.delete(key);if(lang===wantedLang)render(seq===sequence?(kind==='suggest'?e.key+':text':focus):undefined);}
  }
  async function copyLink(e) {
    const url=urlFor(e.key).href;
    try{await navigator.clipboard.writeText(url);setStatus(tt('comm.tr.linkCopied','Link copied.'));}
    catch(error){ui.status.replaceChildren(node('span','',tt('comm.tr.shareLink','Share this link: ')));const link=node('a','',url);link.href=url;ui.status.append(link);}
  }
  async function loadSummary(seq, autoOpenAt=null) {
    if(seq!==sequence)return;
    const target=lang,result={},seen=new Set();let cursor=null;
    try{
      do{
        const params=new URLSearchParams({lang:target});if(cursor)params.set('cursor',cursor);
        const got=await request('?'+params);if(seq!==sequence)return;
        Object.assign(result,got.entries || {});cursor=got.nextCursor || null;
        if(cursor&&seen.has(cursor))throw Error();if(cursor)seen.add(cursor);
      }while(cursor);
      community=result;summaryFailed=false;
    }catch(error){if(seq!==sequence)return;summaryFailed=true;}
    if(seq===sequence){
      const matches=filtered();
      if(autoOpenAt!==null&&autoOpenAt===interaction&&!open&&ui.search.value.trim()&&matches.length===1){open=matches[0].key;openMode='edit';render();loadEntry(matches[0]);}
      else render();
    }
  }
  async function loadLanguage(target) {
    // Details include per-connection choices and must be fetched anew on a new
    // visit. Drafts and in-flight writes survive, but previous read tokens do not.
    for(const cache of [details,errors,reads])for(const key of cache.keys())if(key.startsWith(target+':'))cache.delete(key);
    const seq=++sequence,autoOpenAt=interaction;lang=target;ui.lang.value=target;entries=[];community={};page=0;open=null;openMode='edit';loading=true;catalogueFailed=false;summaryFailed=false;setStatus('');updateUrl(deepKey);render();
    try{
      const response=await fetch('/translations/'+encodeURIComponent(target)+'.json?v='+encodeURIComponent(window.LEDGER_BUILD || ''),{cache:'no-cache'});
      if(!response.ok)throw Error();const catalogue=await response.json();
      if(seq!==sequence)return;
      if(!Array.isArray(catalogue.entries))throw Error();
      entries=catalogue.entries;loading=false;
      const areas=[...new Set(entries.map(e=>e.area).filter(Boolean))].sort();ui.area.replaceChildren();
      const all=node('option','',tt('comm.tr.allAreas','All areas'));all.value='';ui.area.append(all);
      for(const a of areas){const option=node('option','',entries.find(e=>e.area===a)?.context || a);option.value=a;ui.area.append(option);}
      if(deepKey&&!entries.some(e=>e.key===deepKey)){deepKey=null;setStatus(tt('comm.tr.linkMissing','This phrase is no longer in the catalogue.'));}
      if(autoOpenAt===interaction){
        const matches=filtered();if(deepKey)open=deepKey;else if(ui.search.value.trim()&&matches.length===1)open=matches[0]?.key || null;
      }
      render();if(open){const e=entries.find(e=>e.key===open);await loadEntry(e);}
      await loadSummary(seq,autoOpenAt);
    }catch(error){if(seq!==sequence)return;loading=false;catalogueFailed=true;render();}
  }
  function readUrl() {
    const params=new URLSearchParams(location.search),target=params.get('lang');
    ui.search.value=params.get('q') || '';deepKey=params.get('key');ui.filter.value='all';ui.area.value='';
    const known=[...ui.lang.options].map(o=>o.value);
    return known.includes(target)?target:known.includes('it')?'it':known[0];
  }
  ui.search.oninput=()=>{interaction++;deepKey=null;open=null;page=0;updateUrl(null);render();};
  ui.filter.onchange=ui.area.onchange=()=>{interaction++;deepKey=null;open=null;page=0;updateUrl(null);render();};
  ui.lang.onchange=()=>loadLanguage(ui.lang.value);
  ui.prev.onclick=()=>{interaction++;page--;render();(ui.prev.disabled?ui.next:ui.prev).focus();};ui.next.onclick=()=>{interaction++;page++;render();(ui.next.disabled?ui.prev:ui.next).focus();};
  window.addEventListener('beforeunload',event=>{if(drafts.size||pending.size){event.preventDefault();event.returnValue='';}});
  window.addEventListener('popstate',()=>loadLanguage(readUrl()));
  window.addEventListener('offline',renderNotice);
  window.addEventListener('online',()=>{renderNotice();if(summaryFailed)loadSummary(sequence);});
  if(typeof ttOnChange==='function')ttOnChange(()=>render());
  loadLanguage(readUrl());
})();
