# VSCode Custom KIT

Run custom shell command defined in vs code configuration and node module package.json

## Features

* Run custom shell command
* Run selected content as shell command
* Run the built -in JS function, which can call VSCode plug -in commands, etc., and complete the combination hot key

## Extension Settings

You can defined shell command in vs code configuration

```json
{
    "custom-kit.panelName":"[cmd]",
    "custom-kit.terminal.title": "[cmd]",
    "custom-kit.commands": [
        {
            "title":"go.format",
            "params": {
                "selected": "${selectedText}" //Use $ {} Find the expression to transform the expression into the corresponding text
            },
            "command": [
                "let res = await shellx('gofmt',params.selected);",
                "paste(res)",

            ]
        },
        {
            "title": "to upper case",
            "command": [
                "paste(selectedText().toUpperCase())"
            ]
        },
        {
            "title": "cht.sh",
            "params": {
                "url": "https://cht.sh/go/net",
                "method": "GET",
            },
            "command": [
                "let req = await request(params.url,params);",
                // "output(req);",
                "codeCmd('workbench.action.closeEditorsInOtherGroups')",
                "codeCmd('workbench.action.newGroupRight')",
                "codeCmd('workbench.action.files.newUntitledFile')",
                "codeCmd('workbench.action.focusRightGroup')",
                "copy(escapeColor(req));",
                "paste()"
            ],
        },
        {
            "title": "output panel result",
            "params": {},
            "command": "let ls = await shellx('ls',null,['-al','--color']);output(ls);",
        },
        {
            "title": "call self",
            "when": "${fileExtname} == '.go' ", //When the file is the end of the .go suffix, the command selection is displayed
            "params": {},
            "command": "codeCmd('custom-kit.helloWorld',{title:'tshell'})",
        },
        {
            "title": "error demo",
            "params": {},
            "command": "return await shellx('ls')",
        },
        {
            "title": "cat stdin",
            "params": {}, // Set the SHELL STDIN
            "command": "let s = selectedText();s = await shellx('cat',s);alert(s);alert(toString(params))",
        },
        {
            "title": "shellx",
            "command": "let s = selectedText();s = await shellx('ls',null,['-al']);alert(s);alert(toString(params))",
        },
        {
            "title": "selectbox",
            "command": "let v = await quickPick(['1','hello'],null,'bbx');alert(v)",
        },
        {
            "title": "demo",
            "command": "alert('aaa');error('nnn');alert(expr('${file}'))",
        },
        {
            "title": "helloworld",
            "command": "let s = await shell('ls');alert(s)",
        },
        {
            "title": "tshell", // open terminal in vscode and run shell
            "command": "tshell('ls');tshel('echo helloworld')"
        }
    ],
}
```

## Key Binding

You can bind custom keys for the command which defined in configuration

```json
{
    "key": "ctrl+alt+1",
    "command": "custom-kit.runCommand",
    "args": {
        "title": "go.format",
    }
}
```

### vim keybinding

```json
    "vim.visualModeKeyBindingsNonRecursive": [
        {
            "before": [
                "g","f"
            ],
            "commands": [
                {
                    "command": "custom-kit.runCommand",
                    "args": {
                        "title": "go.format"
                    }
                }
            ]
        },


```

## Predefined Variable

This interpolation expression can be used in the When expression and Params in the Custom-Kit.commands. With this expression, this expression will be replaced with text with corresponding meaning

* `${file}`: activated file path;
* `${fileBasename}`: activated file basename;
* `${fileBasenameNoExtension}`: activated file basename with no extension;
* `${fileDirname}`: activated file dirname;
* `${fileExtname}`: activated file extension;
* `${lineNumber}`: the first selected line number;
* `${lineNumbers}`: the all selected line number, eg. `41,46,80`;
* `${columnNumber}`: the first selected column number;
* `${columnNumbers}`: the all selected column number, eg. `41,46,80`;
* `${selectedFile}`: the first selected file/folder from the context menu`;
* `${selectedFiles}`: the selected file/folder list from the context menu or use config, eg. `"path/to/file1" "path/to/file2"`;
* `${selectedText}`: the first selected text;
* `${selectedTextList}`: the all selected text list, eg. `sl1 sl2`;
* `${selectedTextSection}`: the all selected text section, eg. `sl1\nsl2`;
* `${selectedPosition}`: the selected position list, eg. `21,6`;
* `${selectedPositionList}`: the all selected position list, eg. `45,6 80,18 82,5`;
* `${selectedLocation}`: the first selected location, eg. `21,6,21,10`;
* `${selectedLocationList}`: the all selected location list, eg. `21,6,21,10 22,6,22,10 23,6,23,10`;
* `${relativeFile}`: activated file relative path;
* `${workspaceFolder}`: activated workspace folder path;
* `${workspaceFolderBasename}`: activated workspace folder basename;
* `${homedir}`: the home directory of the current user;
* `${tmpdir}`: default directory for temporary files;
* `${platform}`: os platform;
* `${env:PATH}`: shell environment variable "PATH";
* `${config:editor.fontSize}`: vscode config variable;

## 内置命令对应关系

| Object name| Type parameter| Analyze  |    function declare |
| :--:| :--: | :--:  |
| window|  object |    vscode.window  |
| payload|  object |  current event payload  |
| current|  object  | current command   |
| params |   object | command params   |
| error| function| ERROR bomb box|
| alert| function| INFO bomb box |
| shell | function| Package of ChildProcess.exec |
| shellx | function| Package of Childprocess.spawn, shellx(cmd: string,stdinText:string, otherParams:any) , Reference <https://nodejs.org/api/child_process.html|>
| tshell | function | Create VSCode Terminal and execute the shell command |
| expr | function| Can analyze ${file} and other expressions into corresponding text|
| input |function | open vscode input box |
| quickPick |function | open vscode quickPickBox |
| codeCmd |function | call vscode commands |
| selectedText |function |  Get the current selected text |
|  copy |function | copy to clipboard |
| output | function | write msg to output panel  |
|  paste | function | replace the selected text, If the parameter is empty, it is equivalent to running the paste command|
| fetch  | function | Return to FETCH Promise directly, not packing  |
| request  | function | For the packaging of node-fetch, return the text of the HTTP request   reference:<https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API/Using_Fetch|>

## code sample

```json
{
    "custom-kit.panelName": "[cmd-panel]",
    "custom-kit.terminal.title": "[cmd]",
    "custom-kit.defaultCommands": [
        {
            "title": "default command",
            "params": {
                "url": "http://ifconfig.me/ip",
                "method": "GET"
            },
            "command": [
                "let req = await request(params.url,params);",
                "outputClear()",
                "output(req)"
            ]
        },
    ],
    "custom-kit.commands": [
        {
            "title": "go.format",
            "params": {
                "selected": "${selectedText}"
            },
            "command": [
                "let res = await shellx('gofmt',params.selected);",
                "paste(res)",
            ]
        },
        {
            "title": "cht.sh",
            "params": {
                "url": "https://cht.sh/go/net",
                "method": "GET",
            },
            "command": [
                "let req = await request(params.url,params);",
                // "output(req);",
                "codeCmd('workbench.action.closeEditorsInOtherGroups')",
                "codeCmd('workbench.action.newGroupRight')",
                "codeCmd('workbench.action.files.newUntitledFile')",
                "codeCmd('workbench.action.focusRightGroup')",
                "copy(escapeColor(req));",
                "paste()"
            ],
        }

}

```


