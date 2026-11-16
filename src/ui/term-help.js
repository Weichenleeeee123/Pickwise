// One floating explanation per page: no glossary block and no report re-render.
export function mountTermHelp(root) {
  const doc=root.ownerDocument, win=doc.defaultView;
  let active=null,tip=null,pinned=false;
  const match=target=>target?.closest?.('abbr.term-help');
  function close() {
    if(active){active.setAttribute('title',active.dataset.termExplanation ?? '');active.setAttribute('aria-expanded','false');active.removeAttribute('aria-describedby');}
    tip?.remove();active=null;tip=null;pinned=false;
  }
  function show(term) {
    if(active===term)return;
    close();
    const explanation=term.getAttribute('title') || term.dataset.termExplanation;
    if(!explanation)return;
    active=term;term.dataset.termExplanation=explanation;term.removeAttribute('title');term.setAttribute('aria-expanded','true');term.setAttribute('aria-describedby','inline-term-tooltip');
    tip=doc.createElement('div');tip.id='inline-term-tooltip';tip.className='inline-term-tooltip';tip.setAttribute('role','tooltip');tip.textContent=explanation;
    const width=Math.min(300,win.innerWidth-24);tip.style.width=width+'px';doc.body.append(tip);
    const rect=term.getBoundingClientRect(),height=tip.getBoundingClientRect().height;
    tip.style.left=Math.max(12,Math.min(win.innerWidth-width-12,rect.left+rect.width/2-width/2))+'px';
    tip.style.top=Math.max(8,Math.min(win.innerHeight-height-8,rect.bottom+height+18<win.innerHeight?rect.bottom+9:rect.top-height-9))+'px';
  }
  root.addEventListener('mouseover',event=>{const term=match(event.target);if(term)show(term);});
  root.addEventListener('mouseout',event=>{if(!pinned && active && !active.contains(event.relatedTarget))close();});
  root.addEventListener('focusin',event=>{const term=match(event.target);if(term)show(term);});
  root.addEventListener('focusout',()=>{if(!pinned)close();});
  root.addEventListener('click',event=>{const term=match(event.target);if(!term){close();return;}if(active===term&&pinned)close();else{show(term);pinned=true;}});
  root.addEventListener('keydown',event=>{
    const term=match(event.target);
    if(event.key==='Escape'&&active){event.preventDefault();event.stopImmediatePropagation();close();return;}
    if(term&&['Enter',' '].includes(event.key)){event.preventDefault();if(active===term&&pinned)close();else{show(term);pinned=true;}}
  },true);
  doc.addEventListener('pointerdown',event=>{if(active&&!match(event.target))close();});
  win.addEventListener('scroll',close,true);win.addEventListener('resize',close);
  return {close};
}
