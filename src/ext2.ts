import * as vscode from 'vscode';
import * as childProcess from 'child_process';
// import fetch from 'node-fetch'

function checkParam(...w) {
  for (var i = 0; i < w.length; i++) {
    if (w[i] === undefined) {
      throw new Error(`undefined params arg${i}`);
    }
  }
  return true
}

var pathLib = require('path')

const fs = require('fs')
function isPathExists(path) {
  try {
    fs.accessSync(path);
    return true;
  } catch (error) {
    return false;
  }
}
function getRunnableShell(sh: string[]): string | boolean {
  let ans: boolean | string = true
  for (let i = 0; i < sh.length; i++) {
    if (isPathExists(sh[i])) {
      ans = sh[i]
      break
    }
  }
  return ans
}

// @ts-ignore
export async function shellx(cmd, stdin = null, args = [], other = {
  cwd: vscode.workspace.rootPath,
  encoding: 'utf8',
  shell: true,
  env: {
    ...process.env,
  },
  // stdio: 'inherit',
}) {
  checkParam(cmd, stdin, args)
  if (other == null) {
    // @ts-ignore
    other = {}
  }
  //@ts-ignore
  const configuration = vscode.workspace.getConfiguration();
  let shell = configuration.get('custom-kit.shell.path') || true
  const envex = configuration.get('custom-kit.shell.env') || {}
  if(other.env==null) {
    other.env = {}
  }
  // for (let key in process.env) {
  //   other.env[key] = process.env[key];
  // }
  // @ts-ignore
  for (let k in envex) {
    if (k != 'PATH') {
      // @ts-ignore
      other.env[k] = envex[k];
    }
  }
  // @ts-ignore
  if (shell && Array.isArray(shell)) {
    // @ts-ignore
    shell = getRunnableShell(shell)
  }
  // @ts-ignore
  if (shell && typeof shell == 'string') {
    // @ts-ignore
    other.shell = shell
    let dir = pathLib.dirname(shell)
    other.env.PATH = dir + pathLib.delimiter + other.env.PATH
  }

  //@ts-ignore
  if (envex.PATH) {
    // @ts-ignore
    other.env.PATH = [].concat(envex.PATH).join(pathLib.delimiter) + pathLib.delimiter + process.env.PATH;
  }
  // @ts-ignore
  return spawn(cmd, stdin, args, other)

}

// @ts-ignore
export async function spawn(cmd, stdin = null, args = null, other: any = {}) {
  checkParam(cmd, stdin, args)

  return new Promise(function (resolve, reject) {
    //@ts-ignore
    const shProc = childProcess.spawn(cmd, args, other);
    if (stdin && typeof stdin == 'string') {
      //@ts-ignore
      if (shProc.stdin && shProc.stdin.writable) {
        // @ts-ignore
        shProc.stdin.write(stdin);
        // @ts-ignore
        shProc.stdin.end()
      }
    }else if (stdin == null && shProc.stdin && shProc.stdin.writable) {
      shProc.stdin.end()
    }
    var timeout = setTimeout(() => {
      try {
        // @ts-ignore
        // @ts-ignore
        if (shProc.stdin && shProc.stdin.writable) {
          // @ts-ignore
          shProc.stdin.end()
        }
      } catch (e) {
        console.error(e, e.stack)
      } finally {
        if (!shProc.killed) {
          shProc.kill()
        }
      }
    }, 1000 * (other?.timeout || 25)); //timeout  to be killed 
    // @ts-ignore
    shProc?.on('exit', () => {
      clearTimeout(timeout)
    })
    // timeout is 60 seconds 
    let stdoutData = "";
    let stderrData = "";
    // @ts-ignore
    shProc.stderr?.setEncoding('utf8')
    // @ts-ignore
    shProc.stdout?.setEncoding('utf8')
    // @ts-ignore
    shProc.stdout?.on('data', (data) => {
      // Edit thomas.g: stdoutData = Buffer.concat([stdoutData, chunk]);
      stdoutData += data;
    });
    // @ts-ignore
    shProc.stderr?.on('data', (data) => {
      stderrData += data;
    });
    // @ts-ignore
    shProc?.on('close', (code) => {
      if (stderrData) {
        reject(stderrData);
      } else {
        resolve(stdoutData);
      }
    });
    // @ts-ignore
    shProc.on('error', (err) => {
      reject(err);
    });
  })
}

export function executeShellCommand(command: string, opt0 = {}, opt = {
  cwd: vscode.workspace.rootPath,
  encoding: 'utf8',
  env: {
    ...process.env
  }

}): Promise<string> {
  checkParam(command, opt0, opt)
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

function get(k, v) {
  return vscode.workspace.getConfiguration().get(k) || v
}

interface tshellConfig {
  show: boolean
}
export function tshell(text: string, conf: tshellConfig = { show: true }) {
  checkParam(text, conf)
  // const terminal = vscode.window.cra
  const terminals = vscode.window.terminals;
  const k = get('custom-kit.terminal.title', '[cmd]')
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

import fetch from 'node-fetch';



export function request(url: string, ...opt: any[]) {
  checkParam(url, opt)
  return fetch(url, ...opt)
}