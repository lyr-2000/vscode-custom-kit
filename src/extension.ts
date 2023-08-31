// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

interface PluginParam {
	cmd: string
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
			cmds.push({
				when: value[i].when,
				command: [].concat(value[i].command),
				title: value[i].title
			})
			titles.push(value[i].title)
		}
	}
	if (param.cmd) {
		// has command
		const all = cmds.filter(e => e.title == param.cmd)
		if (all && all.length) {
			param.current = all
			const extCtx = makeCtx(context, exprHelper,param)
			compileCode(all[0].command)(extCtx)
			return
		}

	}
	let se = await exprHelper.showSelectBox(titles, null, 'mainEntry')
	let t = cmds.filter(e => e.title == se)
	if (t && t.length) {
		param.current = t
		const extCtx = makeCtx(context, exprHelper,param)
		t[0].command.forEach(e => {
			try {
				compileCode(e)(extCtx)
			} catch (e) {
				console.error(e)
			}

		})
	}



}

import {
	executeShellCommand, tshell,
	spawn,



} from './ext2.ts'

import ExprHelper, { resolveExpr } from './expr.ts';


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

function makeCtx(ctx: any, helper: CommandUtil,params) {
	if (helper == null) {
		vsocde.window.showErrorMessage('invalid helper')
		// error(helper.toString())
		return
	}
	return {
		ctx: ctx,
		window: vscode.window,
		params,
		toString(w) {
			return JSON.stringify(w)
		},
		alert: (...w) => {
			return vscode.window.showInformationMessage(w.join(''));
		},
		error: (...w) => {
			return vscode.window.showErrorMessage(w.join(''));
		},
		spawn: (...w) => {
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
		showSelectBox: (...w) => {
			return helper.showSelectBox(...w)
		},
		execCommand(...w) {
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
}


function compileCode(src) {
	// let wrapper = `const app_ = async () =>{${src}}\n (async function() { await app_() })();`
	let wrapper = `(async function(){ ${src} })()`
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



