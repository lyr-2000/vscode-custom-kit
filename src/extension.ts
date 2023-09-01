// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


import {
	executeShellCommand, tshell,
	spawn,



} from './ext2.ts'

import ExprHelper, { resolveExpr } from './expr.ts';

interface PluginParam {
	title: string
	command: string
	err: any
	result: any
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "custom-kit" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('custom-kit.helloWorld', async (opts: PluginParam = {}) => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		await extEntry(context, opts)
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }



interface Cmd {
	when: string //when is support
	command: string[]
	title: string //command title
	type: string // js,python,bash ,default is js
}

function getcfg() {
	// 默认配置
	return vscode.workspace.getConfiguration();
}

function evalBool(helper :CommandUtil,exprs: string) {
	if(exprs == '' || exprs === true) {
		return true
	}
	let newExpr = resolveExpr(helper.exprHelper,exprs,{},true)
	let fn = compileCode(`return ${newExpr}`,true)
	try {
		return fn({})
	}catch (e) {
		error('invalid when expr ',e.toString())
		return false 
	}
}

function toString(w) {
	return JSON.stringify(w)
}

function error(...s) {
	return vscode.window.showErrorMessage(s.join(','))
}


async function waitPromise(fn) {
	return await fn()

}

async function extEntry(context: vscode.ExtensionContext, param: PluginParam) {
	// 获取全局 settings.json 配置
	let cfg = getcfg();
	// 获取特定配置项的值
	const value = cfg.get('custom-kit.commands') || [];
	const exprHelper = new CommandUtil(context)
	const cmds: Cmd[] = []
	const titles = []
	for (let i in value) {
		if (value[i] && value[i].title && value[i].command) {
			if (value[i].when != null) {
				if (typeof value[i].when != 'string' || !evalBool(exprHelper,value[i].when)) {
					continue
				}
			}
			cmds.push({
				when: value[i].when,
				command: [].concat(value[i].command),
				title: value[i].title
			})
			titles.push(value[i].title)
		}
	}
	if (param.title) {
		// has command
		const all = cmds.filter(e => e.title == param.title)
		if (all && all.length) {
			param.current = all[0]
			const extCtx = makeCtx(context, exprHelper, param)
			let alls = all[0].command
			for (let i = 0; i < alls.length; i++) {
				try {
					let fn = compileCode(alls[i])
					param.result = await waitPromise(() => fn(extCtx))
				} catch (e) {
					error(e.toString())
					console.error(e.stack)
					param.err = e
				}
			}
			return param
		}
		if (param.command && typeof param.command == 'string') {
			// your custom code
			param.current = 'custom'
			const extCtx = makeCtx(context, exprHelper, param)
			try {
				let fn = compileCode(param.command)
				param.result = await waitPromise(() => fn(extCtx))
			} catch (e) {
				error(e.toString())
				console.error(e.stack)
				param.err = e
			}

			return param
		}
	}
	// select an option command to run
	let se = await exprHelper.showSelectBox(titles, null, '#mainEntry')
	let t = cmds.filter(e => e.title == se)
	if (t && t.length) {
		param.current = t[0]
		const extCtx = makeCtx(context, exprHelper, param)
		for (let i = 0; i < t[0].command.length; i++) {
			let cmd = t[0].command[i]
			try {
				let fn = compileCode(cmd)
				param.result = await waitPromise(() => fn(extCtx))
			} catch (e) {
				error(e.toString())
				console.error(e.stack)
				param.err = e
			}
		}

	}
	return param



}



class CommandUtil {
	private context: vscode.ExtensionContext
	public exprHelper = new ExprHelper();
	public constructor(c: any) {
		this.context = c
	}

	public setOrder(id: string, all: string[], selected = []) {
		this.context.workspaceState.update(id || 'df', [].concat(selected).concat(all))
	}
	public getOrder(id: string, keys: string[]) {
		const recent = this.context.workspaceState.get(id || 'df', [] as string[])
		// 根据最近列表排序
		if (recent && recent.length) {
			keys.unshift.apply(keys, recent.filter(key => {
				const idx = keys.indexOf(key);

				// 存在命令
				if (idx > -1) {
					return keys.splice(idx, 1);
				}
			}));
		}

		return keys
	},
	public async showSelectBox(box: string[], conf: any = { placeHolder: 'Type or select option' }, id = 'box') {
		const options = box || []
		// let id = id0;
		if (id == 'box') {
			id += _hashCode(options)
		}

		const newOptions = this.getOrder(id, options)
		const selectedOption = await vscode.window.showQuickPick(newOptions, conf);
		this.setOrder(id, [selectedOption, ...options])
		return selectedOption
	}

}





function _hashCode(...u) {
	if (u == null || u.length == 0) return -1
	var hash = 0, i, chr;
	let s = u.join(',')
	if (s == null || s.length === 0) return hash;
	for (i = 0; i < s.length; i++) {
		chr = s.charCodeAt(i);
		hash = ((hash << 5) - hash) + chr;
		hash |= 0; // Convert to 32bit integer
	}
	return hash;
}

function makeCtx(ctx: any, helper: CommandUtil, params) {
	if (helper == null) {
		vsocde.window.showErrorMessage('invalid helper')
		return
	}
	return {
		ctx: ctx,
		window: vscode.window,
		params,
		toString,
		error,
		alert: (...w) => {
			return vscode.window.showInformationMessage(w.join(''));
		},
		warn: (...w) => {
			return vscode.window.showWarningMessage(w.join(''));
		},
		shellx: (...w) => {
			return spawn(...w)
		},
		shell: async (...w) => {
			return await executeShellCommand(...w)
		},
		tshell,
		expr: (expr: string) => {
			return resolveExpr(helper?.exprHelper, expr,)
		},
		input: helper?.exprHelper.input,
		quickPick: (...w) => {
			let id = w[2] != null ? w[2] : params.current?.title;
			if (id.includes('#')) {
				id = id.replace(/#/g, '')
			}
			return helper.showSelectBox(w[0], w[1], id)
		},
		codeCmd(...w) {
			return vscode.commands.executeCommand(...w)
		},
		selectedText() {
			const editor = vscode.window.activeTextEditor;
			const selection = editor.selection;
			const selectedText = editor.document.getText(selection);
			return selectedText
		},
		copy(text: string) {
			return vscode.env.clipboard.writeText(text);
		},
		quote(w: string) {
			return w.replace(/^["'](.+(?=["']$))["']$/, '$1');
		},
		unquote(str) {
			return str.replace(/^"(.*)"$/, '$1');
		},
		paste(all: string[]) {
			const editor = vscode.window.activeTextEditor;
			const selection = editor.selection;
			// const selectedText = editor.document.getText(selection);
			// Replace the selected text
			if (all == null || all.length == 0) {
				editor.edit(async (editBuilder) => {
					const text = await vscode.env.clipboard.readText();
					editBuilder.replace(selection, text);
				});
				return
			}
			editor.edit((editBuilder) => {
				editBuilder.replace(selection, all.join('\n'));
			});
		},

	}

}



function compileCode(src,noAsync = false) {
	let fnprefix = noAsync? '':`async `
	// let fnprefix = '
	let wrapper = `return (${fnprefix} () => { ${src} }) ()`
	src = `with (sandbox) {  ${wrapper}\n} `
	// vscode.window.showInformationMessage(src)
	const fn = new Function('sandbox', src)
	return function (sandbox) {
		const theProxy = new Proxy(sandbox, {
			has,
			get(target, key, receiver) {
				// 加固，防止逃逸
				if (key === Symbol.unscopables) {
					return undefined;
				}
				return Reflect.get(target, key, receiver);

			},

		})
		return fn(theProxy)
	}
}

// 相当于检查 获取的变量是否在里面 like: 'in'
function has(target, key) {
	return true
}



