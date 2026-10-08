const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;

const mainContent = document.querySelector('.main-content');
if (mainContent) {
  const children = Array.from(mainContent.children);
  const items = children.map(c => ({
    tagName: c.tagName,
    id: c.id,
    className: c.className,
    charCount: c.outerHTML ? c.outerHTML.length : 0
  }));
  console.log(JSON.stringify(items, null, 2));
} else {
  console.log("No main content found");
}
