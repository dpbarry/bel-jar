import assert from 'node:assert/strict';
import { applyDialogBodyContent } from '../js/ui/dialog.mjs';

{
  const body = { innerHTML: '', textContent: '', appendChild() {} };
  applyDialogBodyContent(body, { content: '<b>x</b>' });
  assert.equal(body.innerHTML, '');
  assert.equal(body.textContent, '<b>x</b>');
}

{
  const body = { innerHTML: '', textContent: '', appendChild() {} };
  applyDialogBodyContent(body, { htmlContent: '<p class="t">ok</p>' });
  assert.equal(body.innerHTML, '<p class="t">ok</p>');
}

console.log('OK test-dialog-content.mjs');
