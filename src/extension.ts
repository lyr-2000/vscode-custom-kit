// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


// @ts-ignore
import { executeShellCommand, tshell, spawn, request } from './ext2.ts'

// @ts-ignore
import ExprHelper, { resolveExpr } from './expr.ts';
// @ts-ignore
import { PanelName } from './const.ts';

interface PluginParam {
	title: string
	command: string
	params: any
	when: string

	err: any
	result: any
	current: Cmd | Object // current command instance
	isCustom: boolean
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "custom-kit" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const cmd = 'custom-kit.runCommand'
	let disposable = vscode.commands.registerCommand(cmd, async (opts: PluginParam) => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		try {
			// @ts-ignore
			await extEntry(context, opts || {})
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
	params: any
	_cached: boolean
}

function getcfg() {
	// 默认配置
	// https://stackoverflow.com/questions/65192859/for-workspace-getconfiguration-how-do-i-get-a-setting-from-the-multi-root-works
	return vscode.workspace.getConfiguration();
}

function evalBool(helper: CommandUtil, exprs: string | boolean) {
	if (exprs == null || exprs == '') {
		return true
	}
	if (typeof exprs == 'boolean') {
		return exprs
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
interface configs {
	commands: Cmd[]
}

function loadCmd(exprHelper: CommandUtil): configs {
	let cfg1 = vscode.workspace.getConfiguration('custom-kit');
	let cmd2: string[] = cfg1.get('commands') || []
	// let root = vscode.env.appRoot
	let defaultCmd: string[] = cfg1.get('defaultCommands') || []
	// @ts-ignore
	if (!defaultCmd || defaultCmd.length == 0) {
		return loadCmd0(cmd2, exprHelper)
	}
	// vscode.env.
	return loadCmd0(cmd2.concat(defaultCmd), exprHelper)
}
function loadCmd0(value: any[], exprHelper: CommandUtil): configs {
	const cmds: Cmd[] = []
	// @ts-ignore
	if (value.length > 0) {
		// @ts-ignore
		for (let i in value) {
			// @ts-ignore
			if (value[i] && value[i].title && value[i].command) {
				// has repeated title
				let title = value[i].title
				let cmdx = value[i].command || value[i].commands
				//@ts-ignore
				cmds.push({
					when: value[i].when,
					command: [[].concat(cmdx).join('\n')],
					title: value[i].title,
					params: value[i].params,
				})
			}
		}
	}
	return {
		commands: cmds,
	}
}
function filterCommands(inputCmd: Cmd[], exprHelper: CommandUtil): Cmd[] {
	if (!inputCmd || inputCmd.length == 0) {
		return []
	}
	let res: Cmd[] = []
	for (let i = 0; i < inputCmd.length; i++) {
		// has condition 
		if (!inputCmd[i]._cached && inputCmd[i].when != null) {
			if (typeof inputCmd[i].when != 'string' || !evalBool(exprHelper, inputCmd[i].when)) {
				continue
			}
			inputCmd[i]._cached = true
		}
		res.push(inputCmd[i])
	}
	return res

}
async function runCommands(context: vscode.ExtensionContext, inputCmd: Cmd[], exprHelper: CommandUtil, param: PluginParam): Promise<Cmd[]> {
	// filter command then  run
	const res = filterCommands(inputCmd, exprHelper)
	for (let i = 0; i < res.length; i++) {
		let current = res[i]
		param.current = res[i]
		const extCtx = makeCtx(context, exprHelper, param)
		// command array to run
		let alls = [].concat(current.command)
		for (let i = 0; i < alls.length; i++) {
			try {
				let fn = compileCode(alls[i])
				param.result = await fn(extCtx)
			} catch (e) {
				error(e.toString())
				console.error(e.stack)
				param.err = e
			}
		}
	}
	return res

}

async function extEntry(context: vscode.ExtensionContext, pluginParam: PluginParam) {
	// 获取特定配置项的值
	const exprHelper = new CommandUtil(context)
	const res = loadCmd(exprHelper)
	const cmds = res.commands

	// custom command content
	if (pluginParam.title) {
		// match command by title
		const matchedCommand = cmds.filter(e => e.title == pluginParam.title)
		const resToRun = await runCommands(context, matchedCommand, exprHelper, pluginParam)
		if (resToRun ==null || resToRun.length == 0) {
			// @ts-ignore
			if (pluginParam.command && (typeof pluginParam.command == 'string' || pluginParam.command.length > 0)) {
				// your custom code
				pluginParam.isCustom = true
				let newCmd: Cmd = {
					when: pluginParam.when,
					command: [[].concat(pluginParam.command).join('\n')],
					title: pluginParam.title,
					params: pluginParam.params,
				} as Cmd
				let done = await runCommands(context, [newCmd], exprHelper, pluginParam)
				return pluginParam
			}
		}
		return pluginParam
	}
	// select an option command to run
	const filtered: Cmd[] = filterCommands(cmds, exprHelper)
	const namemap = new Set<string>()
	const titles = []
	filtered.forEach(e => {
		if (!namemap.has(e.title)) {
			namemap.add(e.title)
			titles.push(e.title)
		}
	})

	let selectedTitle = await exprHelper.showSelectBox(titles, null, '#mainEntry')
	if (!selectedTitle || selectedTitle.length == 0) {
		return pluginParam
	}

	let t = cmds.filter(e => selectedTitle.includes(e.title))
	if (t && t.length) {
		await runCommands(context, t, exprHelper, pluginParam)
	}
	return pluginParam
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
	}
	public async showSelectBox(box: string[], conf: any = { placeHolder: 'Type or select option' }, id = 'box') {
		const options = box || []
		// let id = id0;
		if (id == 'box') {
			id += _hashCode(options)
		}

		const newOptions = this.getOrder(id, options)
		const selectedOption = await vscode.window.showQuickPick(newOptions, conf);
		if (selectedOption && selectedOption.length) {
			this.setOrder(id, [].concat(selectedOption).concat(options))
		}
		return selectedOption
	}
	private getOutputChannel() {
		let panel = GlobalObject.panel
		if (!panel) {
			let cfg = getcfg()
			let name = cfg.get('custom-kit.panelName') || cfg.get('custom-kit.terminal.title') || PanelName
			panel = vscode.window.createOutputChannel(name as string)
			GlobalObject.panel = panel
			panel.show()
		}
		return panel
	}
	public outputClear() {
		let panel = this.getOutputChannel()
		panel?.clear()
	}
	public escapeColor(cmd: string | object = '') {
		if (!cmd || cmd == null) {
			return ''
		}

		if (typeof cmd == 'object') {
			// @ts-ignore 
			if (cmd && cmd.toString) {
				// @ts-ignore 
				cmd = cmd.toString()
			}
		}
		// @ts-ignore
		if (cmd && !cmd.replace) {
			return cmd
		}
		// @ts-ignore
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
		vscode.window.showErrorMessage('invalid helper')
		return
	}
	// do explain expr
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

		/**
		 * Escapes the color of the text.
		 *
		 * @param {string} text - The text whose color needs to be escaped.
		 * @return {string} The escaped color text.
		 */
		escapeColor(text: string): string {
			// @ts-ignore
			return helper.escapeColor(text)
		},
		/**
		 * Displays an alert message.
		 *
		 * @param {...string} w - The message or messages to display.
		 * @return {Thenable<string | undefined>} A promise that resolves to the user's response.
		 */
		alert: (...w) => {
			// @ts-ignore
			return vscode.window.showInformationMessage(w.join(''));
		},
		/**
		 * Show a warning message in the vscode window.
		 *
		 * @param {...string} w - The warning message to be displayed.
		 * @return {Thenable<string | undefined>} A thenable that resolves to the user's response.
		 */
		warn: (...w) => {
			// @ts-ignore
			return vscode.window.showWarningMessage(w.join(''));
		},
		/**
		 * Executes a shell command.
		 *
		 * @param {string} cmd - The shell command to execute.
		 * @param {string} stdin - The input to pass to the command.
		 * @param {...any} otherOpt - Additional options to pass to the command.
		 * @return {*} - The result of executing the command.
		 */
		shellx: (cmd, stdin: string, ...otherOpt: any) => {
			// @ts-ignore
			return spawn(cmd, stdin, ...otherOpt)
		},
		/**
		 * Executes a shell command.
		 *
		 * @param {...any} w - The arguments to pass to the shell command.
		 * @return {Promise<any>} A promise that resolves to the result of the shell command.
		 */
		shell: async (...w) => {
			// @ts-ignore
			return await executeShellCommand(...w)
		},
		tshell,
		/**
		 * A description of the entire function.
		 *
		 * @param {string} expr - description of parameter
		 * @return {type} description of return value
		 */
		expr: (expr: string) => {
			return resolveExpr(helper?.exprHelper, expr,)
		},
		/**
		 * A description of the entire function.
		 *
		 * @param {string} value - The value to be passed to the input method.
		 * @param {vscode.InputBoxOptions} otherOpt - Optional input box options.
		 * @return {Thenable<string | undefined>} A promise that resolves to a string or undefined.
		 */
		input: (value: string, otherOpt: vscode.InputBoxOptions = {}): Thenable<string | undefined> => {
			return helper?.exprHelper.input(value, otherOpt)
		},
		/**
		 * Generates a quick pick selection box.
		 *
		 * @param {string[]} options - the first parameter
		 * @param {vsocde.QuickPickOptions} config - the second parameter (optional, default: null)
		 * @param {string} it - the third parameter (it use for sort the options item)
		 * @return {type} the return value of the function
		 */
		quickPick: (options: string[], config: vscode.QuickPickOptions = {}, it = null) => {
			let id = it != null ? it : params.current?.title;
			if (id.includes('#')) {
				id = id.replace(/#/g, '')
			}
			return helper.showSelectBox(options, config, id)
		},
		/**
		 * Executes a VS Code command with optional arguments.
		 *
		 * @param {string} c - The name of the command to execute.
		 * @param {...any} w - Optional arguments to pass to the command.
		 * @return {Promise<any>} A promise that resolves to the result of the command execution.
		 */
		codeCmd(c, ...w) {
			return vscode.commands.executeCommand(c, ...w)
		},
		/**
		 * Returns the selected text in the active text editor.
		 *
		 * @return {string} The selected text.
		 */
		selectedText() {
			const editor = vscode.window.activeTextEditor;
			const selection = editor.selection;
			const selectedText = editor.document.getText(selection);
			return selectedText
		},
		/**
		 * Copies the given text to the clipboard.
		 *
		 * @param {string} text - The text to be copied.
		 * @return {Promise<void>} A promise that resolves when the text is successfully copied to the clipboard.
		 */
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
		/**
		 * Clears the output.
		 *
		 * @return {void} 
		 */
		outputClear() {
			return helper.outputClear()
		},
		/**
		 * Output a message.
		 *
		 * @param {string} msg - The message to output.
		 * @param {boolean} nextline - Whether to output a new line after the message. Default is true.
		 * @param {boolean} show - Whether to display the message. Default is true.
		 * @param {boolean} escape - Whether to escape special characters in the message. Default is true.
		 * @return {any} The result of the helper.output function.
		 */
		output(msg: string, nextline = true, show = true, escape = true) {
			return helper.output(msg, nextline, show, escape)
		},
		/**
		 * Paste the given content into the active text editor.
		 *
		 * @param {...string} all - The content to be pasted. Accepts multiple arguments.
		 */
		paste(...all: string[]) {
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
		/**
		 * Executes an asynchronous request to the specified URL.
		 *
		 * @param {string} url - The URL to send the request to.
		 * @param {...any[]} w - Optional additional parameters to pass to the request.
		 * @return {Promise<string>} A promise that resolves with the response body as a string.
		 */
		async request(url: string, ...w: any[]) {
			let res = await request(url, ...w)
			return await res.text()
		},
		/**
		 * Fetches data from the provided URL using the specified HTTP method and additional options.
		 *
		 * @param {string} url - The URL to fetch data from.
		 * @param {...any[]} w - Additional options for the fetch request.
		 * @return {Promise<any>} A promise that resolves to the fetched data.
		 */
		fetch(url, ...w: any[]) {
			return request(url, ...w)
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


/**
 * Compiles the given source code and returns a function that can be executed in a sandbox environment.
 *
 * @param {string} src - The source code to be compiled.
 * @param {boolean} noAsync - Optional parameter to indicate whether the compiled code should be wrapped in an async function. Defaults to false.
 * @param {boolean} valid - Optional parameter to indicate whether the source code is valid. Defaults to true.
 * @throws {Error} - Throws an error if the source code is illegal.
 * @returns {Function} - The compiled function that can be executed in a sandbox environment.
 */
function compileCode(src: string, noAsync = false, valid = true) {
	if (valid) {
		if (!validSafe(src)) {
			throw new Error(`illegal code ${src}, Can't recognize special characters`);
		}
	}
	let fnprefix = noAsync ? '' : `async `
	let wrapper = `return (${fnprefix} () => { ${src} }) ()`
	src = `with (sandbox) {  ${wrapper}\n} `
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



