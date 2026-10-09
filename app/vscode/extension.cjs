exports.activate = async context => {
  const vscode = require('vscode');
  const { activate } = await import('./extension.mjs');
  return activate(vscode, context);
};
