// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "custom-kit" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('custom-kit.helloWorld', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		await extEntry()
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }


function getcfg() {
	// 默认配置
	return vscode.workspace.getConfiguration();
}



interface Cmd {
	when: string
	command: string[]
	title: string

}

async function extEntry() {
	// 获取全局 settings.json 配置
	let cfg = getcfg();
	// 获取特定配置项的值
	const value = cfg.get('custom-kit.commands') || [];

	const extCtx = makeCtx()
	const cmds = []
	const titles = []
	for (let i in value) {
		if (value[i] && value[i].title && value[i].command) {
			cmds.push({
				when: value[i].when,
				command: [].concat(value[i].command),
				title: value[i].title
			})
			titles.push(value[i].title)
		}
	}
	// var b = "vscode.window.showInformationMessage(`Hello World from custom-kit! ${cmds}`);"
	let se = await showSelectBox(titles)
	cmds.filter(e => e.title == se)[0].command.forEach(e => {
		try {
			compileCode(e)(extCtx)
		}catch(e) {
			console.error(e)
		}
		
	})

}

import { executeShellCommand } from './ext2.ts'

function makeCtx() {
	return {
		hello: 'bfak',
		alert: (...w ) => {
			vscode.window.showInformationMessage(w.join(''));
		},
		shell: async (...w ) => {
			return await executeShellCommand(...w)
		}
	}
}


function compileCode(src) {
	let wrapper = `const app_ = async () =>{${src}}\n (async function() { await app_() })();`
	src = 'with (sandbox) {' + wrapper + '}'
	const code = new Function('sandbox', src)

	return function (sandbox) {
		const sandboxProxy = new Proxy(sandbox, { has })
		return code(sandboxProxy)
	}
}

// 相当于检查 获取的变量是否在里面 like: 'in'
function has(target, key) {
	return true
}



async function showSelectBox(box) {
	const options = box || []
	const selectedOption = await vscode.window.showQuickPick(options);

	// if (selectedOption) {
	//   vscode.window.showInformationMessage(`You selected: ${selectedOption}`);
	// }
	return selectedOption
}
