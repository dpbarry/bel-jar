/**
 * The reading page's graph: one IIFE for share.html (js/share.js).
 *
 * ⛔ Nothing of the editor, Persist, the account or Beluga: a link is read by
 * people who may never have opened BelJar, and the page must cost little
 * (tests/test-share-page.mjs holds the size and what the bundle may contain).
 */
import './frame/routes.mjs';
import { start } from './share/share-page.mjs';

start();
