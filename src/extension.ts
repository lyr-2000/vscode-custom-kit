// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


// @ts-ignore
import { executeShellCommand, tshell, spawn, shellx, request } from './ext2.ts'

// @ts-ignore
import ExprHelper, { resolveExpr } from './expr.ts';
// @ts-ignore
import { PanelName } from './const.ts';

interface PluginParam {
	title: string
	command: string
	commands?: string
	params?: any
	when?: string

	err?: any
	result?: any
	current?: Cmd | Object // current command instance
	isCustom?: boolean

	// public toString() {
	// 	return this.title || this.command ||''
	// }
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
			if (typeof opts == 'string') {
				// @ts-ignore
				return await extEntry(context, { title: opts })
			}
			// @ts-ignore
			return await extEntry(context, opts || {})
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
	hidden?: boolean
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
					hidden: value[i].hidden,
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

// const iconv = require('iconv-lite');
var iconv = require('iconv-lite');

// 判断字符串是否为UTF-8编码
function isUTF8(str) {
	return Buffer.from(str, 'utf8').toString('utf8') === str;
}

function isGarbledUTF8(str) {
	try {
		const buffer = Buffer.from(str, 'utf8');
		const decodedString = buffer.toString('utf8');
		return decodedString !== str;
	} catch (error) {
		return true;
	}
}

// 将GBK编码转换为UTF-8编码
function convertToGBK(str) {
	const buffer = Buffer.from(str);
	const utf8String = iconv.decode(buffer, 'gbk');

	return iconv.encode(utf8String, 'utf8');
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
				let emsg = e.toString()
				if (!isGarbledUTF8(emsg)) {
					emsg = convertToGBK(emsg)
				}
				error(emsg)
				console.error(e.stack)
				param.err = e
			}
		}
	}
	return res

}
async function runPluginCustomParam(context: vscode.ExtensionContext, exprHelper: CommandUtil, pluginParam: PluginParam) {
	if (!pluginParam) {
		return
	}
	if (!pluginParam.title) {
		return
	}
	// match command
	pluginParam.command = pluginParam.command || pluginParam.commands
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

async function extEntry(context: vscode.ExtensionContext, pluginParam: PluginParam): Promise<Cmd[] | PluginParam> {

	// 获取特定配置项的值
	const exprHelper = new CommandUtil(context)
	// try custom command 
	if (pluginParam && pluginParam.title && (pluginParam.command || pluginParam.commands)) {
		return await runPluginCustomParam(context, exprHelper, pluginParam)
	}

	const res = loadCmd(exprHelper)
	const cmds = res.commands

	// custom command content
	if (pluginParam && pluginParam.title) {
		// match command by title
		const matchedCommand = cmds.filter(e => e.title == pluginParam.title)
		const resToRun = await runCommands(context, matchedCommand, exprHelper, pluginParam)
		return pluginParam
	}
	// select an option command to run
	const filtered: Cmd[] = filterCommands(cmds, exprHelper)
	const namemap = new Set<string>()
	const titles = []
	filtered.forEach(e => {
		if (!namemap.has(e.title)) {
			if (e && e.hidden && e.hidden === true) {
				return
			}
			namemap.add(e.title)
			titles.push(e.title)
		}
	})

	let selectedTitle: vscode.QuickPickItem = await exprHelper.showSelectBox(titles, null, '#mainEntry')
	if (!selectedTitle) {
		return pluginParam
	}
	// @ts-ignore	
	if (typeof selectedTitle == 'string') {
		// @ts-ignore
		let t = filtered.filter(e => selectedTitle == e.title)
		if (t && t.length) {
			return await runCommands(context, t, exprHelper, pluginParam)
		}
	} else if (selectedTitle.label) {
		// @ts-ignore
		let t = filtered.filter(e => selectedTitle.label == (e.title))
		if (t && t.length) {
			return await runCommands(context, t, exprHelper, pluginParam)
		}
	} else {
		error('invalid state in showSelectBox')
	}

	return pluginParam
}

const GlobalObject = {
	panel: null
}

function debounce(func, wait) {
	let timeout;

	return function () {
		let context = this; // 保存this指向
		let args = arguments; // 拿到event对象

		clearTimeout(timeout)
		timeout = setTimeout(function () {
			func.apply(context, args)
		}, wait);
	}
}

class CommandUtil {
	private context: vscode.ExtensionContext
	public exprHelper = new ExprHelper();
	// private static outputChannel: vscode.OutputChannel;
	public constructor(c: any) {
		this.context = c
	}

	public setOrder(id: string, all: string[] | vscode.QuickPickItem[], selected: string[] | vscode.QuickPickItem[] = []) {
		this.context.workspaceState.update(id || 'df', this.toPickItems([].concat(selected).concat(all)))
	}

	public getOrderItemString(id: string, all: string[]): string[] {
		const recent: vscode.QuickPickItem[] = this.context.workspaceState.get(id || 'df', [] as vscode.QuickPickItem[])
		const nset = new Set<string>();
		for (let i = 0; i < all.length; i++) {
			nset.add(all[i])
		}
		for (let i = 0; i < recent.length; i++) {
			nset.add(recent[i].label)
		}
		let ans: string[] = []
		for (let i = 0; i < recent.length; i++) {
			if (nset.has(recent[i].label)) {
				nset.delete(recent[i].label)
				ans.push(recent[i].label)
			}
		}
		for (let i = 0; i < all.length; i++) {
			const element = all[i];
			if (nset.has(element)) {
				nset.delete(element)
				ans.push(element)
			}
		}
		return ans
	}
	public getOrderItem(id: string, all: vscode.QuickPickItem[]): vscode.QuickPickItem[] {
		const recent: vscode.QuickPickItem[] = this.context.workspaceState.get(id || 'df', [] as vscode.QuickPickItem[])
		const nset = new Set<string>();
		for (let i = 0; i < all.length; i++) {
			nset.add(all[i].label)
		}
		for (let i = 0; i < recent.length; i++) {
			nset.add(recent[i].label)
		}
		let ans: vscode.QuickPickItem[] = []
		for (let i = 0; i < recent.length; i++) {
			if (nset.has(recent[i].label)) {
				nset.delete(recent[i].label)
				ans.push(recent[i])
			}
		}
		for (let i = 0; i < all.length; i++) {
			const element = all[i];
			if (nset.has(element.label)) {
				nset.delete(element.label)
				ans.push(element)
			}
		}
		return ans

	}
	public getOrder(id: string, keys0: vscode.QuickPickItem[]): vscode.QuickPickItem[] {
		if (keys0 == null || keys0.length == 0) {
			return []
		}
		try {
			if (typeof keys0[0] == 'string') {
				// @ts-ignore
				return this.toPickItems(this.getOrderItemString(id, keys0))
			}
			return this.getOrderItem(id, keys0)
		} catch (e) {
			if (id) {
				this.context.workspaceState.update(id, [])
			}
			//@ts-ignore
			return keys0
		}
	}
	public async showSelectBox(box: string[] | vscode.QuickPickItem[], conf: any = { placeHolder: 'Type or select option' }, id = 'box'): Promise<vscode.QuickPickItem> {
		//@ts-ignore
		const options = this.toPickItems(box)
		const newOptions = this.getOrder(id, options)
		const selectedOption = await vscode.window.showQuickPick(newOptions, conf);
		if (selectedOption) {
			this.setOrder(id, [].concat(selectedOption).concat(newOptions))
		}
		if (Array.isArray(selectedOption)) return selectedOption[0]
		return selectedOption
	}
	public toPickItems(all: string[]): vscode.QuickPickItem[] {
		if (!all || all.length == 0) {
			return []
		}
		return all.map(e => {
			if (typeof e == 'object') {
				return e
			}
			return {
				label: e
			}
		})
	}
	public showSuggestInputPromise(box: string[] | vscode.QuickPickItem[], conf: any = { placeHolder: 'Type or select option', default: true }, id = 'box') {
		return new Promise((resolve, reject) => {
			// @ts-ignore
			const options = this.toPickItems(box)
			const newOptions = this.getOrder(id, options)
			const quickPick = vscode.window.createQuickPick()
			quickPick.title = conf.placeHolder || 'Select option'
			quickPick.items = newOptions
			if (newOptions && newOptions.length == 1 && (conf.default||conf.default == null)) {
				quickPick.value = newOptions[0].label
			}

			const _accept = () => {
				let close = false
				return (s: any) => {
					if (!close) {
						close = true
						quickPick.dispose()
						if(s) {
							this.setOrder(id, [].concat({ label: s}).concat(newOptions))
						}
						resolve(s)
					}
				}
			}
			const accept = _accept()

			const userEdit = {
				label: '',
				flag: true,
				ok: true,
				init: true,
			}
			const changeFirstItem = debounce(() => {
				if (quickPick.value && userEdit.label != quickPick.value) {
					if (newOptions.some(e => e.label.startsWith(quickPick.value))) {
						return
					}
					userEdit.label = quickPick.value
					userEdit.init = false
					quickPick.items = [].concat(userEdit).concat(newOptions)
				}
			}, 500)
			quickPick.onDidChangeValue(() => {
				changeFirstItem()
			})
			let pre = null
			quickPick.onDidChangeActive(act => {
				if (act && act.length) {
					let first = act[0]
					if (pre && pre.label != (quickPick.value)) {
						if (pre.ok) {
							pre.ok = false
						}
						pre = null
					}
				}

			})
			quickPick.onDidAccept(() => {
				const selection = quickPick?.selectedItems[0]
				let t = selection.label
				// @ts-ignore
				if (selection.ok && pre && pre.label == selection.label) {
					accept(t)
					return
				} else {
					// @ts-ignore
					if ((selection.ok) && quickPick.selectedItems.length == 1 && quickPick.selectedItems[0]?.label == quickPick.value) {
						accept(t)
						return
					}
					if (pre) {
						pre.ok = false
					}
					pre = selection
					// @ts-ignore
					selection.ok = true
					quickPick.value = selection.label
					quickPick.show()
				}

			})


			quickPick.onDidHide(() => {
				accept(null)
			})
			quickPick.show()
		})

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




function _getStr(w: vscode.QuickPickItem | string): string {
	if (typeof w == 'string') {
		return w
	}
	if (!w) {
		return '0'
	}
	return w.label || w.description
}

function _hashCode(...u) {
	if (u == null || u.length == 0) return -1
	var hash = 0, i, chr;
	// let s = u.join(',')
	var us = []
	for (i = 0; i < u.length; i++) {
		us.push(_getStr(u[i]))
	}
	let s = us.join(',')
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
		process: process,
		JSON: JSON,
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
			return shellx(cmd, stdin, ...otherOpt)
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
		inputx: (options: vscode.QuickPickItem[] | string[] = [], opt: any = { default: true }, it: string) => {
			let id = it != null ? it : params.current?.title;
			if (id.includes('#')) {
				id = id.replace(/#/g, '#0')
			}
			let arr = []
			if (typeof options == 'string') {
				arr = arr.concat(options)
			} else if (options && typeof options == 'object' && !Array.isArray(options)) {
				// @ts-ignore
				for (let i in options) {
					let k = i;
					let v = options[i]
					arr.push({
						label: v,
						detail: k,
					})
				}
			} else {
				arr = options || []
			}
			return helper?.showSuggestInputPromise(arr, opt, id)
		},
		/**
		 * Generates a quick pick selection box.
		 *
		 * @param {string[]} options - the first parameter
		 * @param {vsocde.QuickPickOptions} config - the second parameter (optional, default: null)
		 * @param {string} it - the third parameter (it use for sort the options item)
		 * @return {type} the return value of the function
		 */
		quickPick: (options: vscode.QuickPickItem[] | string[], config: vscode.QuickPickOptions = {}, it = null) => {
			let id = it != null ? it : params.current?.title;
			if (id.includes('#')) {
				id = id.replace(/#/g, '#0')
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



