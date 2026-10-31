// src/moved/main.ts: the entry of moved/index.html, the page at the old address (see moved-page.ts).
import { showMoved } from './moved-page';

const root = document.getElementById('root');
if (root) void showMoved(root);
