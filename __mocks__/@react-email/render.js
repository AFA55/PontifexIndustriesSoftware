/**
 * Jest manual mock for @react-email/render.
 *
 * @react-email/render v2 uses `await import("react-dom/server")` internally,
 * which fails in Jest's CJS transform environment with:
 *   "A dynamic import callback was invoked without --experimental-vm-modules"
 *
 * This mock replaces the async render() with one that uses
 * renderToStaticMarkup (static, synchronous, no dynamic import) and prepends
 * the email DOCTYPE — identical output for HTML string testing.
 */

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

async function render(element, _options) {
  const html = renderToStaticMarkup(element);
  return `${DOCTYPE}${html.replace(/<!DOCTYPE[^>]*>/i, '')}`;
}

function toPlainText(element) {
  return renderToStaticMarkup(element).replace(/<[^>]+>/g, '');
}

module.exports = { render, toPlainText };
