// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


import {
	executeShellCommand, tshell,
	spawn,
	request,
} from './ext2.ts'

import ExprHelper, { resolveExpr } from './expr.ts';
import { PanelName } from './const.ts';

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
		try {
			await extEntry(context, opts)
		} catch (e) {
			error(e)
			console.error(e.stack)
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {
	for (let k in GlobalObject) {
		let obj = GlobalObject[k]
		if (obj && obj.dispose) {
			obj.dispose()
			GlobalObject[k] = null
		}
	}

}



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

function evalBool(helper: CommandUtil, exprs: string) {
	if (exprs == '' || exprs === true) {
		return true
	}
	let newExpr = resolveExpr(helper.exprHelper, exprs, {}, true)
	let fn = compileCode(`return ${newExpr}`, true, false)
	try {
		return fn({})
	} catch (e) {
		error(`invalid when expr ${exprs} `, e.toString())
		return false
	}
}

function toString(w) {
	return JSON.stringify(w)
}

function error(...s) {
	return vscode.window.showErrorMessage(s.join(','))
}

function isDollarExpr(s: string) {
	if (s && typeof s == 'string') {
		return s.includes('${') && s.includes('}')
	}
	return false
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
	if (value.length > 0) {
		const titleMap = new Map<string, number>()
		for (let i in value) {
			if (value[i] && value[i].title && value[i].command) {
				// has repeated title
				let title = value[i].title
				if (titleMap.has(title)) {
					// continue
					value[i].title = value[i].title + ` (${titleMap.get(value[i].title)})`
				}
				// has condition 
				if (value[i].when != null) {
					if (typeof value[i].when != 'string' || !evalBool(exprHelper, value[i].when)) {
						continue
					}
				}
				cmds.push({
					when: value[i].when,
					command: [[].concat(value[i].command).join('\n')],
					title: value[i].title,
					params: value[i].params,
				})
				titleMap.set(title, Number(titleMap.get(title) || 0) + 1)
				titles.push(value[i].title)
			}
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
			param.current = {
				'type': 'custom'
			}
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
	let selectedTitle = await exprHelper.showSelectBox(titles, null, '#mainEntry')
	if (!selectedTitle) {
		return param
	}
	let t = cmds.filter(e => e.title == selectedTitle)
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

const GlobalObject = {
	panel: null
}

class CommandUtil {
	private context: vscode.ExtensionContext
	public exprHelper = new ExprHelper();
	// private static outputChannel: vscode.OutputChannel;
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
	},
	private getOutputChannel() {
		let panel = GlobalObject.panel
		if (!panel) {
			let cfg = getcfg()
			let name = cfg.get('custom-kit.panelName') || cfg.get('custom-kit.terminal.title') || PanelName
			panel = vscode.window.createOutputChannel(name)

			GlobalObject.panel = panel
			panel.show()

		}
		return panel
	},
	public outputClear() {
		let panel = this.getOutputChannel()
		panel?.clear()
	}
	public escapeColor(cmd: string) {
		if (!cmd) {
			return ''
		}
		if (typeof cmd == 'object') {
			if (cmd.toString) {
				cmd = cmd.toString()
			}
		}
		if (!cmd.replace) {
			return cmd
		}
		return cmd.replace(
			/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
	}
	public output(msg: string, nextline: boolean, show = true, escape = true) {
		if (escape && msg) {
			// escape ascci 
			msg = this.escapeColor(msg)
		}
		let panel = this.getOutputChannel()
		if (!panel) {
			throw new Error("illegal panel state");
		}
		if (nextline) {
			return panel.appendLine(msg)
		}
		return panel.append(msg)
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
	if (params && params.current && params.current.params) {
		if (typeof params.current.params == 'object') {
			let p0 = params.current.params
			for (let i in p0) {
				let value = p0[i]
				if (value && typeof value == 'string') {
					if (isDollarExpr(value)) {
						p0[i] = resolveExpr(helper.exprHelper, value)
					}
				}
			}
		}
	}
	return {
		ctx: ctx,
		window: vscode.window,
		payload: params,
		current: params?.current,
		params: params?.current?.params,
		toString,
		error,
		escapeColor(...w) {
			return helper.escapeColor(...w)
		},
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
			// return w.replace(/^["'](.+(?=["']$))["']$/, '$1');
			return '"' + w + '"'
		},
		unquote(str) {
			return str.replace(/^"(.*)"$/, '$1');
		},
		output(msg: string, nextline: boolean, show = true, escape = true) {
			return helper.output(msg, nextline, show, escape)
		},
		paste(...all) {
			const editor = vscode.window.activeTextEditor;
			const selection = editor.selection;
			if (all == null || all.length == 0) {
				vscode.commands.executeCommand('editor.action.clipboardPasteAction')
				return
			}
			editor.edit((editBuilder) => {
				editBuilder.replace(selection, all.join('\n'));
			});
		},
		async request(...w) {
			let res = await request(...w)
			return await res.text()
		},
		fetch(...w) {
			return request(...w)
		}

	}

}


function validSafe(src: string) {
	let stk = 0
	for (var i = 0; i < src.length; i++) {
		if (src[i] == '{') {
			stk++
		} else if (src[i] == '}') {
			stk--
		}
		if (stk < 0) {
			return false
		}
	}
	return stk == 0

}

function compileCode(src, noAsync = false, valid = true) {
	if (valid) {
		if (!validSafe(src)) {
			throw new Error(`illegal code ${src}`);
		}
	}
	let fnprefix = noAsync ? '' : `async `
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



