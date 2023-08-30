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
