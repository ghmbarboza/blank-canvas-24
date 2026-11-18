// Amostras do que lojas e sites publicam de verdade (encurtadas), usadas nos testes dos extratores.

export const SHOPIFY_JSON = {
  products: [
    {
      id: 1,
      title: "Sofá Retrátil Oslo 3 lugares",
      handle: "sofa-retratil-oslo",
      body_html:
        "<p>Sofá retrátil e reclinável em <strong>linho</strong>.</p><ul><li>2,30 m</li></ul>",
      product_type: "Sofás",
      variants: [
        { id: 11, price: "3499.90" },
        { id: 12, price: "3899.90" },
      ],
      images: [{ src: "https://cdn.shopify.com/s/files/1/sofa.jpg" }],
    },
    {
      id: 2,
      title: "Mesa de Jantar Lisboa",
      handle: "mesa-lisboa",
      body_html: "",
      product_type: "",
      variants: [{ id: 21, price: "1890.00" }],
      images: [],
    },
    { id: 3, title: " ", handle: "sem-nome", variants: [] },
  ],
};

export const WOO_JSON = [
  {
    id: 10,
    name: "Kit Skincare Noite &amp; Dia",
    permalink: "https://belapele.com.br/produto/kit-skincare/",
    short_description: "<p>Sérum e hidratante.</p>",
    prices: { price: "18990", currency_minor_unit: 2, currency_code: "BRL" },
    images: [{ src: "https://belapele.com.br/wp-content/uploads/kit.jpg" }],
    categories: [{ id: 1, name: "Kits" }],
  },
  {
    id: 11,
    name: "Protetor Solar FPS 60",
    permalink: "https://belapele.com.br/produto/protetor/",
    short_description: "",
    prices: { price: "7990", currency_minor_unit: 2 },
    images: [],
    categories: [],
  },
];

export const VTEX_JSON = [
  {
    productName: "Tênis Corrida Pro",
    description: "Leve e com amortecimento.",
    link: "https://www.lojaesporte.com.br/tenis-corrida-pro/p",
    categories: ["/Calçados/Tênis/"],
    items: [
      {
        images: [{ imageUrl: "https://lojaesporte.vteximg.com.br/arquivos/tenis.jpg" }],
        sellers: [{ commertialOffer: { Price: 399.9, ListPrice: 499.9 } }],
      },
    ],
  },
];

export const HTML_JSONLD_PRODUCT = `<!doctype html><html><head>
<title>Bolo de Cenoura | Doce Maria</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"Organization","name":"Doce Maria Confeitaria","description":"Bolos caseiros por encomenda em Campinas.","telephone":"+55 19 99999-0000"},
 {"@type":"Product","name":"Bolo de Cenoura com Chocolate","description":"Bolo caseiro, serve 12 fatias.","image":["https://docemaria.com.br/img/cenoura.jpg"],
  "category":"Bolos","url":"/bolos/cenoura",
  "offers":{"@type":"Offer","price":"89.90","priceCurrency":"BRL"}}
]}
</script>
<script type="application/ld+json">{ isso não é json }</script>
</head><body><h1>Bolo de Cenoura</h1></body></html>`;

export const HTML_JSONLD_LIST = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemList","name":"Tratamentos","itemListElement":[
 {"@type":"ListItem","position":1,"item":{"@type":"Service","name":"Limpeza de pele profunda","description":"60 minutos.","offers":{"@type":"Offer","price":180}}},
 {"@type":"ListItem","position":2,"item":{"@type":"Service","name":"Peeling de diamante","offers":{"@type":"AggregateOffer","lowPrice":"250.00"}}},
 {"@type":"ListItem","position":3,"item":{"@type":"Service","name":"Avaliação"}}
]}
</script></head><body></body></html>`;

export const HTML_JSONLD_MENU = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Restaurant","name":"Cantina da Nona","openingHours":["Tu-Su 18:00-23:00"],
 "hasMenu":{"@type":"Menu","hasMenuSection":[
  {"@type":"MenuSection","name":"Massas","hasMenuItem":[
    {"@type":"MenuItem","name":"Lasanha à bolonhesa","offers":{"@type":"Offer","price":"62.00"}},
    {"@type":"MenuItem","name":"Nhoque ao sugo","description":"Feito na casa.","offers":{"@type":"Offer","price":"54.00"}}
  ]}
 ]}}
</script></head><body></body></html>`;

export const HTML_OG_PRODUCT = `<html><head>
<title>Cadeira Gamer X | Loja Tech</title>
<meta property="og:type" content="product" />
<meta property="og:title" content="Cadeira Gamer X" />
<meta property="og:description" content="Ergonômica, com apoio lombar." />
<meta property="og:image" content="https://lojatech.com.br/img/cadeira.jpg" />
<meta property="product:price:amount" content="1299.00" />
<meta property="product:price:currency" content="BRL" />
</head><body></body></html>`;

export const HTML_MICRODATA = `<html><head><title>Camiseta Básica</title></head><body>
<div itemscope itemtype="https://schema.org/Product">
  <h1 itemprop="name">Camiseta Básica Algodão</h1>
  <span itemprop="price" content="59.90">R$ 59,90</span>
</div></body></html>`;

export const HTML_INSTITUCIONAL = `<!doctype html><html><head>
<title>Clínica Sorriso | Odontologia em Campinas</title>
<meta name="description" content="Clínica odontológica em Campinas: implantes, clareamento e aparelhos." />
</head><body>
<nav><a href="/">Início</a><a href="/servicos">Serviços</a><a href="/contato">Contato</a>
<a href="https://instagram.com/clinicasorriso">Instagram</a><a href="/blog/dicas">Blog</a></nav>
<main><h1>Clínica Sorriso</h1>
<p>Cuidamos do seu sorriso há 15 anos. Atendemos de segunda a sexta, das 8h às 18h.</p>
<h2>Nossos serviços</h2>
<ul><li>Clareamento dental a laser por R$ 890,00</li><li>Implante dentário unitário</li><li>Aparelho ortodôntico</li></ul>
<p>Garantia de 1 ano em todos os procedimentos. Remarcação gratuita com 24 horas de antecedência.</p>
</main><footer>contato@sorriso.com.br</footer></body></html>`;

/** Site que monta tudo no navegador: o HTML que chega ao servidor é só a casca. */
export const HTML_SPA_SHELL = `<!doctype html><html><head><title>Loja</title>
<script src="/assets/app.9f2c.js" defer></script></head>
<body><div id="root"></div><noscript>Ative o JavaScript para usar este site.</noscript></body></html>`;

export const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://docemaria.com.br/sitemap-posts.xml</loc></sitemap>
  <sitemap><loc><![CDATA[https://docemaria.com.br/sitemap-produtos.xml]]></loc></sitemap>
</sitemapindex>`;

export const SITEMAP_URLS = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://docemaria.com.br/</loc></url>
  <url><loc>https://docemaria.com.br/produto/bolo-de-cenoura</loc></url>
  <url><loc>https://www.docemaria.com.br/produto/bolo-de-fuba?ref=1&amp;x=2</loc></url>
  <url><loc>https://docemaria.com.br/produto/bolo-de-cenoura</loc></url>
  <url><loc>https://docemaria.com.br/blog/receita-de-cobertura</loc></url>
  <url><loc>https://docemaria.com.br/categoria/bolos</loc></url>
  <url><loc>https://outrosite.com.br/produto/intruso</loc></url>
  <url><loc>https://docemaria.com.br/uploads/foto.jpg</loc></url>
</urlset>`;
