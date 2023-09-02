import * as vscode from 'vscode';
import variable from './exprs/variable';
import replace from './exprs/replace';

export type VariableScope = keyof typeof variableMap;
export function resolveExpr(obj :ExprHelper,cmd: string,predefined: Record<string,string>={},quote=false) {
    return cmd && replace(cmd,  str => {
        let [variable, args = ''] = str.split(':');

        // 去除空白
        variable = variable.trim();
        args = args.trim();

        // 解析预设变量
        if (predefined[variable]) {
            return predefined[variable];
        }

        // 解析变量
        switch (variable) {
            case 'config':
                return args && obj.config(args) as string;
            case 'env':
                return args && obj.env(args);
            // case 'input':
                // return await obj.input(args) || args;
            // case 'command':
                // return args && await vscode.commands.executeCommand(args) || '';
            default:
                return obj.variable(variable as VariableScope);
        }
    },quote);
}

export const variableMap = {
    file: 1,
    fileBasename: 1,
    fileBasenameNoExtension: 1,
    fileDirname: 1,
    fileExtname: 1,
    lineNumber: 1,
    lineNumbers: 1,
    columnNumber: 1,
    columnNumbers: 1,
    selectedText: 1,
    selectedTextList: 1,
    selectedTextSection: 1,
    selectedPosition: 1,
    selectedPositionList: 1,
    selectedLocation: 1,
    selectedLocationList: 1,
    relativeFile: 1,
    relativeFileNoExtension: 1,
    relativeFileDirname: 1,
    workspaceFolder: 1,
    workspaceFolderBasename: 1,
    homedir: 1,
    tmpdir: 1,
    platform: 1,
};

export default class ExprHelper {
    private $variable = variable()
     /* 获取环境变量 */
     env(scope: string): string {
        return this.$variable.env()[scope.toUpperCase()] || '';
    }

    /* 获取配置 */
    config<T = unknown>(scope: string): T | undefined {
        return this.$variable.config().get(scope);
    }

    /* 获取包配置 */
    package<T = unknown>(scope: string): T | undefined {
        return this.$variable.package()[scope] as T;
    }

    /* 获取变量 */
    variable(scope: VariableScope): string {
        return variableMap[scope] === 1 ? this.$variable[scope]() : '';
    }

    /* 获取命令 */
    command(name: string): string {
        return this.$variable.commands()[name] || name;
    }

    /* 获取命令集 */
    commands(): Record<string, any> {
        return this.$variable.commands();
    }

    /* 获取输入 */
    input(value: string,otherOpt:vscode.InputBoxOptions= {}): Thenable<string | undefined> {
        otherOpt.placeHolder = value && `default: "${value}"`
        return vscode.window.showInputBox(otherOpt);
    }
}