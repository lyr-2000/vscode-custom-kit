import * as vscode from 'vscode';
import * as childProcess from 'child_process';


export function executeShellCommand(command: string, opt: any): Promise<string> {
  if (opt == null) {
    opt = {};
  }
  if (!opt.cwd) {
    opt.cwd = vscode.workspace.rootPath
  }
  return new Promise<string>((resolve, reject) => {
    childProcess.exec(command, opt, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function get(k,v) {
  return vscode.workspace.getConfiguration().get(k) || v
}

interface tshellConfig  {
  show: false
}
export function  tshell(text :string,conf: tshellConfig = {show:true}) {
  // const terminal = vscode.window.cra
  const terminals = vscode.window.terminals;
  const k = get('custom-kit.terminal.title','[cmd]')
  // 查找名为"My Terminal"的终端
  let terminal = terminals.find(terminal => terminal.name === k);

  if (!terminal) {
    // 如果找不到，则创建一个名为"My Terminal"的新终端
    terminal = vscode.window.createTerminal(k);
  }
  terminal.sendText(text)
  if (conf.show) {
    terminal.show()
  }
  return terminal
}