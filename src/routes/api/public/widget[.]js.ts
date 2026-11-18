import { createFileRoute } from "@tanstack/react-router";

// Script de embed do site do cliente: rastreia visitas (sem cookie de terceiros), mostra o chat
// flutuante e renderiza formulários em <div data-vinculo-form="ID">. Um <script> só:
// <script src="https://APP/api/public/widget.js" data-account="CONTA" data-chat="CANAL" async></script>
const WIDGET = String.raw`(function(){
  var s=document.currentScript; if(!s) return;
  var base=new URL(s.src).origin, account=s.getAttribute("data-account"), chat=s.getAttribute("data-chat");
  function vid(){try{var v=localStorage.getItem("nx_vid");if(!v){v=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2));localStorage.setItem("nx_vid",v)}return v}catch(e){return "anon-"+Math.random().toString(16).slice(2,12)}}
  var visitor=vid();
  // Cor vem do cadastro da conta e entra em style: só hex, para não virar injeção de CSS.
  function safeColor(c,d){return typeof c==="string"&&/^#[0-9a-fA-F]{3,8}$/.test(c)?c:d}
  function utm(){var p=new URLSearchParams(location.search),o={};["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid"].forEach(function(k){var v=p.get(k);if(v)o[k]=v});try{if(Object.keys(o).length)sessionStorage.setItem("nx_utm",JSON.stringify(o));else o=JSON.parse(sessionStorage.getItem("nx_utm")||"{}")}catch(e){}return o}
  var U=utm();
  function post(path,body){return fetch(base+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Falha");return j})})}
  if(account){post("/api/public/track",{accountId:account,visitorId:visitor,url:location.href,referrer:document.referrer,utm:U}).catch(function(){})}
  function el(t,a,c){var e=document.createElement(t);for(var k in a){if(k==="style")e.style.cssText=a[k];else if(k.indexOf("on")===0)e.addEventListener(k.slice(2),a[k]);else e.setAttribute(k,a[k])}(c||[]).forEach(function(x){e.appendChild(typeof x==="string"?document.createTextNode(x):x)});return e}
  // Ícone de balão (traço, cor do texto do botão) no lugar de emoji: igual em qualquer sistema.
  function chatIcon(){var ns="http://www.w3.org/2000/svg";var svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","26");svg.setAttribute("height","26");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","2");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");var path=document.createElementNS(ns,"path");path.setAttribute("d","M7.9 20A9 9 0 1 0 4 16.1L2 22Z");svg.appendChild(path);return svg}
  // ---------- formulários
  // Cloudflare Turnstile (opcional, quando a conta configurou): script carregado uma vez por página
  var tsP=null;function loadTs(){if(window.turnstile)return Promise.resolve(window.turnstile);if(tsP)return tsP;tsP=new Promise(function(ok,ko){var sc=document.createElement("script");sc.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";sc.async=true;sc.onload=function(){window.turnstile?ok(window.turnstile):ko(new Error("turnstile"))};sc.onerror=function(){tsP=null;ko(new Error("turnstile"))};document.head.appendChild(sc)});return tsP}
  document.querySelectorAll("[data-vinculo-form]").forEach(function(box){
    var id=box.getAttribute("data-vinculo-form"), started=Date.now();
    fetch(base+"/api/public/form?id="+id).then(function(r){return r.json()}).then(function(f){
      if(!f||!f.fields)return;
      var form=el("form",{style:"display:grid;gap:12px;font-family:inherit"});
      if(f.title)form.appendChild(el("h3",{style:"margin:0;font-size:20px"},[f.title]));
      if(f.description)form.appendChild(el("p",{style:"margin:0;opacity:.75"},[f.description]));
      f.fields.forEach(function(fd){
        if(fd.type==="hidden"){form.appendChild(el("input",{type:"hidden",name:fd.key,value:fd.default||U[fd.key]||""}));return}
        var input;
        if(fd.type==="textarea")input=el("textarea",{name:fd.key,rows:"3"});
        else if(fd.type==="select"){input=el("select",{name:fd.key});input.appendChild(el("option",{value:""},["Escolha"]));(fd.options||[]).forEach(function(o){input.appendChild(el("option",{value:o},[o]))})}
        else if(fd.type==="checkbox")input=el("input",{type:"checkbox",name:fd.key,value:"sim"});
        else input=el("input",{name:fd.key,type:fd.type==="phone"?"tel":fd.type==="number"?"text":fd.type,placeholder:fd.placeholder||""});
        if(fd.required)input.setAttribute("required","");
        if(fd.type!=="checkbox")input.style.cssText="padding:10px 12px;border:1px solid #d5dbe4;border-radius:10px;font:inherit";
        form.appendChild(el("label",{style:"display:grid;gap:6px;font-size:14px"},[fd.label+(fd.required?" *":""),input]));
      });
      var hp=el("input",{name:"nx_hp",tabindex:"-1",autocomplete:"off",style:"position:absolute;left:-9999px"});form.appendChild(hp);
      var consent=null;
      if(f.consent&&f.consent.enabled){consent=el("input",{type:"checkbox"});if(f.consent.required)consent.setAttribute("required","");form.appendChild(el("label",{style:"display:flex;gap:8px;font-size:12px;opacity:.8"},[consent,f.consent.text]))}
      var tsToken=null,tsId=null;
      if(f.turnstile_site_key){var tsBox=el("div",{style:"min-height:65px"});form.appendChild(tsBox);loadTs().then(function(ts){tsId=ts.render(tsBox,{sitekey:f.turnstile_site_key,language:"pt-br",callback:function(t){tsToken=t},"expired-callback":function(){tsToken=null},"error-callback":function(){tsToken=null}})}).catch(function(){})}
      function tsReset(){if(tsId!==null&&window.turnstile){tsToken=null;window.turnstile.reset(tsId)}}
      var msg=el("p",{style:"margin:0;font-size:13px"});
      var btn=el("button",{type:"submit",style:"padding:12px;border:0;border-radius:999px;background:"+safeColor(f.theme&&f.theme.accent,"#001F35")+";color:#fff;font:inherit;font-weight:600;cursor:pointer"},[f.submit_label||"Enviar"]);
      form.appendChild(btn);form.appendChild(msg);
      form.addEventListener("submit",function(ev){ev.preventDefault();if(f.turnstile_site_key&&!tsToken){msg.textContent="Aguarde a verificação anti-robô terminar e tente de novo.";return}btn.disabled=true;msg.textContent="Enviando…";
        var values={};new FormData(form).forEach(function(v,k){if(k!=="nx_hp")values[k]=v});
        post("/api/public/forms/submit",{formId:id,values:values,consent:consent?consent.checked:false,utm:U,referrer:document.referrer,pageUrl:location.href,visitorId:visitor,hp:hp.value,startedAt:started,turnstileToken:tsToken})
          .then(function(r){var sc=r.schedule&&/^https?:\/\//.test(r.schedule.url)?r.schedule:null;if(r.redirect&&!sc&&/^https?:\/\//.test(r.redirect)){location.href=r.redirect;return}form.innerHTML="";form.appendChild(el("p",{style:"font-size:16px"},[r.message||"Recebido!"]));if(sc)form.appendChild(el("a",{href:sc.url,target:"_top",style:"display:inline-block;padding:12px 22px;border-radius:999px;background:"+safeColor(f.theme&&f.theme.accent,"#001F35")+";color:#fff;font-weight:600;text-decoration:none"},[sc.label]))})
          .catch(function(e){msg.textContent=e.message;btn.disabled=false;tsReset()});
      });
      box.innerHTML="";box.appendChild(form);
    }).catch(function(){});
  });
  // ---------- chat flutuante
  // Busca adaptativa (sem realtime público): 3 s com a conversa ativa, 12 s depois de 1 min parada,
  // 30 s com o painel fechado (só para o aviso de nova mensagem) e nada com a aba escondida.
  if(!chat)return;
  fetch(base+"/api/public/webchat?channel="+chat).then(function(r){return r.json()}).then(function(cfg){
    if(!cfg||!cfg.name)return;
    var color=safeColor(cfg.color,"#001F35"), key="nx_chat_"+chat, token=null, last=null, timer=null, activeAt=Date.now(), isOpen=false, pending=null;
    try{token=localStorage.getItem(key)}catch(e){}
    var panel=el("div",{role:"dialog","aria-label":cfg.name,style:"position:fixed;right:20px;bottom:92px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:70vh;background:#fff;border-radius:20px;box-shadow:0 20px 50px rgba(0, 31, 53,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:system-ui,sans-serif"});
    var head=el("div",{style:"background:"+color+";color:#fff;padding:14px 16px;font-weight:600"},[cfg.name]);
    var list=el("div",{"aria-live":"polite",style:"flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f7f8fa"});
    var foot=el("form",{style:"display:flex;gap:8px;padding:10px;border-top:1px solid #e5e9f0"});
    var input=el("input",{placeholder:"Escreva sua mensagem","aria-label":"Mensagem",style:"flex:1;padding:10px 12px;border:1px solid #d5dbe4;border-radius:999px;font:inherit"});
    foot.appendChild(input);foot.appendChild(el("button",{type:"submit",style:"border:0;border-radius:999px;background:"+color+";color:#fff;padding:0 14px;cursor:pointer"},["Enviar"]));
    panel.appendChild(head);panel.appendChild(list);panel.appendChild(foot);
    var fieldCss="padding:9px 12px;border:1px solid #d5dbe4;border-radius:10px;font:inherit;font-size:14px";
    function bubble(m){var mine=m.from==="visitor";list.appendChild(el("div",{style:"max-width:80%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;"+(mine?"align-self:flex-end;background:"+color+";color:#fff":"align-self:flex-start;background:#fff;color:#001f35;border:1px solid #e5e9f0")},[m.body||""]));list.scrollTop=list.scrollHeight}
    bubble({from:"agent",body:cfg.greeting});
    var typingOn=false, typingEl=el("div",{"aria-live":"polite",style:"align-self:flex-start;padding:6px 12px;border-radius:14px;font-size:13px;color:#667085;background:#fff;border:1px solid #e5e9f0;display:none"},["digitando…"]);
    list.appendChild(typingEl);
    function setTyping(on){typingOn=!!on;typingEl.style.display=typingOn?"block":"none";if(typingOn){list.appendChild(typingEl);list.scrollTop=list.scrollHeight}}
    var dot=el("span",{"aria-hidden":"true",style:"position:absolute;top:6px;right:6px;width:12px;height:12px;border-radius:999px;background:#e5484d;border:2px solid #fff;display:none"});
    function delay(){if(document.visibilityState==="hidden")return 0;if(typingOn)return 1500;if(!isOpen)return 30000;return Date.now()-activeAt>60000?12000:3000}
    function schedule(){clearTimeout(timer);var d=delay();if(d&&token)timer=setTimeout(poll,d)}
    function poll(){if(!token)return;post("/api/public/webchat",{action:"poll",token:token,after:last}).then(function(r){var got=false;(r.messages||[]).forEach(function(m){last=m.at;if(m.from!=="visitor"){bubble(m);got=true}});setTyping(r.typing);if(r.typing)activeAt=Date.now();if(got){activeAt=Date.now();if(!isOpen)dot.style.display="block"}}).catch(function(e){if(String(e.message).indexOf("Sessão")>=0){token=null;try{localStorage.removeItem(key)}catch(x){}}}).then(schedule)}
    document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&token)poll();else clearTimeout(timer)});
    function start(name,email){return post("/api/public/webchat",{action:"start",channelId:chat,name:name,email:email,visitorId:visitor,pageUrl:location.href}).then(function(r){token=r.token;try{localStorage.setItem(key,token)}catch(e){}return token})}
    // nome e e-mail num cartão dentro do chat (antes era prompt() do navegador); a mensagem digitada espera
    function askIntro(){return new Promise(function(resolve,reject){
      var nm=el("input",{placeholder:"Seu nome","aria-label":"Seu nome",required:"",style:fieldCss});
      var em=el("input",{type:"email",placeholder:"Seu e-mail (para responder se você sair)","aria-label":"Seu e-mail",style:fieldCss});
      var go=el("button",{type:"submit",style:"padding:10px;border:0;border-radius:999px;background:"+color+";color:#fff;font:inherit;font-weight:600;cursor:pointer"},["Começar conversa"]);
      var card=el("form",{style:"align-self:stretch;display:grid;gap:8px;padding:12px;border-radius:14px;background:#fff;border:1px solid #e5e9f0"},[el("p",{style:"margin:0;font-size:13px;color:#001f35"},["Antes de começar, como podemos te chamar?"]),nm,em,go]);
      card.addEventListener("submit",function(ev){ev.preventDefault();go.disabled=true;start(nm.value.trim(),em.value.trim()).then(function(t){card.remove();resolve(t)}).catch(function(e){go.disabled=false;reject(e)})});
      list.appendChild(card);list.scrollTop=list.scrollHeight;setTimeout(function(){nm.focus()},50);
    })}
    function ensure(){if(token)return Promise.resolve(token);if(pending)return pending;pending=(cfg.ask_email?askIntro():start("","")).then(function(t){pending=null;return t},function(e){pending=null;throw e});return pending}
    foot.addEventListener("submit",function(ev){ev.preventDefault();var t=input.value.trim();if(!t)return;input.value="";activeAt=Date.now();
      ensure().then(function(tk){return post("/api/public/webchat",{action:"send",token:tk,text:t})}).then(function(r){bubble({from:"visitor",body:t});last=r.message.created_at;schedule()}).catch(function(e){input.value=t;bubble({from:"agent",body:"Não deu para enviar: "+e.message})})});
    var btn=el("button",{"aria-label":"Abrir chat","aria-expanded":"false",style:"position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:999px;border:0;background:"+color+";color:#fff;box-shadow:0 10px 30px rgba(0, 31, 53,.3);cursor:pointer;z-index:2147483000;display:grid;place-items:center"},[chatIcon(),dot]);
    btn.addEventListener("click",function(){isOpen=panel.style.display!=="flex";panel.style.display=isOpen?"flex":"none";btn.setAttribute("aria-expanded",String(isOpen));btn.setAttribute("aria-label",isOpen?"Fechar chat":"Abrir chat");if(isOpen){dot.style.display="none";activeAt=Date.now();poll();setTimeout(function(){input.focus()},50)}else schedule()});
    document.body.appendChild(panel);document.body.appendChild(btn);
    if(token)poll();
  }).catch(function(){});
})();`;

export const Route = createFileRoute("/api/public/widget.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(WIDGET, {
          status: 200,
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "public, max-age=300",
            "access-control-allow-origin": "*",
          },
        }),
    },
  },
});
