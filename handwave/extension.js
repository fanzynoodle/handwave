// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const { textSpanContainsTextSpan } = require("typescript");
const vscode = require("vscode");
// require Configuration and OpenAIApi from openai-api
const { Configuration, OpenAIApi } = require("openai");

const fs = require("fs");

function showWebview() {
  // Create a webview panel
  const panel = vscode.window.createWebviewPanel(
    "myWebview", // Identifier
    "My Webview", // Title
    vscode.ViewColumn.Three, // Column to show the panel in
    {
      enableScripts: true, // Enable scripts in the webview
      retainContextWhenHidden: true, // Keep the webview alive
    }
  );

  // Set the HTML content for the webview
  panel.webview.html = `<html>
        <body>
            <h1>Hello, world!</h1>
        </body>
    </html>`;
}

async function askAsJson(prompt) {
  const response = await openai.createCompletion({
    prompt,
    ...defaultArgs,
  });
  try {
    return JSON.parse(response.data.choices[0].text);
  } catch (e) {
    console.log("error parsing json");
    console.log(response.data.choices[0].text);
    throw e;
  }
}
async function askAsString(prompt) {
  const response = await openai.createCompletion({
    prompt,
    ...defaultArgs,
  });

  return response.data.choices[0].text;
}

let openai;
const defaultArgs = {
  model: "text-davinci-003",
  temperature: 0.9,
  max_tokens: 3000,
  top_p: 1,
  frequency_penalty: 0.0,
  presence_penalty: 0.6,
  stop: [" Human:", " AI:"],
};

// function to remove excess indentation
function dedentText(text) {
  // split text into array of sentences
  const sentences = text.split("\n");

  // loop through sentences and find the least indented sentence
  let leastIndent = Number.MAX_VALUE;
  for (let sentence of sentences) {
    let indentCount = 0;
    while (sentence[indentCount] === " ") {
      indentCount++;
    }

    if (indentCount < leastIndent) {
      leastIndent = indentCount;
    }
  }

  // loop through sentences and remove extra indentation
  let result = "";
  for (let sentence of sentences) {
    result += sentence.substring(leastIndent) + "\n";
  }

  return result;
}

async function findHashBoundary(editor, originalSelection) {
  // this function finds boundaires of a cell between tripple-hash (###) delimited lines

  const lastLineNumber = editor.document.lineCount;
  let topSelectedLine = editor.document.lineAt(originalSelection.active);

  let nonHeaderLineNumber = topSelectedLine.lineNumber;

  let topOfNewSelectionLineNumber;
  if (topSelectedLine.text.startsWith("###")) {
    // if we start in a cell we go down to find the top of the selection
    while (nonHeaderLineNumber < lastLineNumber) {
      let line = editor.document.lineAt(nonHeaderLineNumber);
      if (!line.text.startsWith("###")) {
        break;
      }
      nonHeaderLineNumber++;
    }

    if (nonHeaderLineNumber == lastLineNumber) {
      vscode.window.showInformationMessage(
        "No cell body found after header." +
          nonHeaderLineNumber +
          " " +
          lastLineNumber +
          typeof nonHeaderLineNumber +
          typeof lastLineNumber
      );
      //return;
    }
    topOfNewSelectionLineNumber = nonHeaderLineNumber;
  } else {
    topOfNewSelectionLineNumber = nonHeaderLineNumber;
    // otherwise we are starting in a cell, lets find the top line
    while (
      topOfNewSelectionLineNumber > 0 &&
      editor.document
        .lineAt(topOfNewSelectionLineNumber - 1)
        .text.startsWith("###") == false
    ) {
      topOfNewSelectionLineNumber--;
    }
  }
  let bottomOfNewSelectionLineNumber = topOfNewSelectionLineNumber;
  // noe ho foen until we find the end
  while (bottomOfNewSelectionLineNumber < lastLineNumber - 1) {
    let line = editor.document.lineAt(bottomOfNewSelectionLineNumber);
    if (line.text.startsWith("###")) {
      bottomOfNewSelectionLineNumber--;
      break;
    }
    bottomOfNewSelectionLineNumber++;
  }

  // and return the bounds we found
  let startPos = new vscode.Position(topOfNewSelectionLineNumber, 0);
  let endPos = new vscode.Position(
    bottomOfNewSelectionLineNumber,
    editor.document.lineAt(bottomOfNewSelectionLineNumber).text.length
  );
  return { startPos, endPos };
}

async function selectBetweenHashes() {
  // go up until you find a line beginning with ### and down until you find a line beginning with ###
  // and jsut select that text
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const { startPos, endPos } = await findHashBoundary(editor, editor.selection);
  let newSelection = new vscode.Selection(startPos, endPos);
  editor.selection = newSelection;
}

async function navigateDownToCellHeader() {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  // loop through lines and halt when we find the sigil
  let currentLineNumber = editor.selection.active.line + 1;
  while (currentLineNumber < editor.document.lineCount) {
    let line = editor.document.lineAt(currentLineNumber);
    if (line.text.startsWith("###")) {
      // change the selection
      let startPos = new vscode.Position(currentLineNumber, 0);
      let endPos = new vscode.Position(
        currentLineNumber,
        line.text.length
      );
      let newSelection = new vscode.Selection(startPos, endPos);
      editor.selection = newSelection;
      break;
    }
    currentLineNumber++;
  }
  // change viewport to match selection
  const { startPos, endPos } = await findHashBoundary(editor, editor.selection);
  const viewportSelection = new vscode.Selection(startPos, endPos);
  editor.revealRange(viewportSelection);

}

async function navigateUpToCellHeader() {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  // loop up through lines and halt when we find the sigil
  let currentLineNumber = editor.selection.active.line - 1;
  while (currentLineNumber > 0) {
    let line = editor.document.lineAt(currentLineNumber);
    if (line.text.startsWith("###")) {
      // change the selection
      let startPos = new vscode.Position(currentLineNumber, 0);
      let endPos = new vscode.Position(
        currentLineNumber,
        line.text.length
      );
      let newSelection = new vscode.Selection(startPos, endPos);
      editor.selection = newSelection;
        
      break;
    }
    currentLineNumber--;
  }
  // change viewport to match selection
  const { startPos, endPos } = await findHashBoundary(editor, editor.selection);
  const viewportSelection = new vscode.Selection(startPos, endPos);
  editor.revealRange(viewportSelection);
}


async function stopTaskProcessing() {
  const text = String.fromCharCode(3);
  let terminal = vscode.window.activeTerminal;
  terminal.sendText(text);
}

async function runCellText() {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const { startPos, endPos } = await findHashBoundary(editor, editor.selection);
  const text = editor.document.getText(new vscode.Range(startPos, endPos));

  // run text in the currently active terminal
  let terminal = vscode.window.activeTerminal;
  if (!terminal) {
    //terminal = vscode.window.createTerminal();
  }
  // show if not visible
  if(!terminal.visible) {
	  //terminal.show();
  }
  
  terminal.sendText(text);
  // restore focus to editor
  //vscode.window.showTextDocument(vscode.window.activeTextEditor.document)
}
async function runCellTextAndNavigateDown() {
  await runCellText();
  await navigateDownToCellHeader();
}

async function troubleshootClipboard() {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  // get from clipboard
  let text = await vscode.env.clipboard.readText();

  const prompt = "Troubleshoot this and provide an answer in plain-text split across multiple lines as prudent and wrapped for a common terminal." + " Human: " + text + "\nAI:";
  
  let apiKey = vscode.workspace.getConfiguration("handwave").get("openAiKey");

  const openAiConfiguration = new Configuration({
    apiKey: apiKey,
  });
  openai = new OpenAIApi(openAiConfiguration);


  let newText = await askAsString(prompt);
  // display in info box
  // isnert a line with the output

  const { startPos, endPos } = await findHashBoundary(editor, editor.selection);
  // navigate to endPos
  editor.selection = new vscode.Selection(endPos, endPos);
  // insert the lines from newText
  const summaryPrompt = "Summarize the following in a few words suitable (no closing quotes please) for a section header beginning with the word Troubleshooting: " + newText;
  const summaryText = await askAsString(summaryPrompt);

  const header = "### "+summaryText.trim();
  editor.edit((editBuilder) => {
  
    editBuilder.insert(endPos, header+"\n"+newText.trim())
  });
  // navigate to endPos
  editor.selection = new vscode.Selection(endPos, endPos);

}
async function replaceSelectedTextBasedOnPrompt(providedPromptSuggestion) {
  // Get the current editor
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const selection = editor.selection;
  let text = editor.document.getText(selection);

  let promptSuggestion;
  if (!providedPromptSuggestion) {
    promptSuggestion = await vscode.window.showInputBox({
      prompt: "prompt suggestion",
      value: "",
    });
  } else {
    promptSuggestion = providedPromptSuggestion;
  }
  const dedentedInput = dedentText(text);
  const prompt = promptSuggestion + " Human: " + dedentedInput + "\nAI:";

  // Get the selected text
  let line = editor.document.lineAt(editor.selection.active);
  let indentationLevel = line.firstNonWhitespaceCharacterIndex;

  // Get the start position of the selected text
  let startPos = selection.start;

  let apiKey = vscode.workspace.getConfiguration("handwave").get("openAiKey");

  const openAiConfiguration = new Configuration({
    apiKey: apiKey,
  });
  openai = new OpenAIApi(openAiConfiguration);


  let newText = await askAsString(prompt);

  let indentedString = newText
    .trim()
    .split("\n")
    .map((line, index) => {
      if (index == 0) {
        return line;
      } else {
        return " ".repeat(indentationLevel) + line;
      }
    })
    .join("\n");
  const replacementValue = indentedString;

  // Insert the new text at the start position of the selected text
  await editor.edit((editBuilder) => {
    editBuilder.replace(selection, replacementValue);
  });

  // get last line of replacementValue
  let lastLine = replacementValue.split("\n").slice(-1)[0];

  let numberOfLines = replacementValue.split("\n").length;
  const beginningOfStartingLine = new vscode.Position(startPos.line, 0);
  const translation = {
    lineDelta: numberOfLines - 1,
    characterDelta: lastLine.length,
  };
  const newEndPos = beginningOfStartingLine.translate(translation);
  let newSelection = new vscode.Selection(startPos, newEndPos);
  editor.selection = newSelection;
}

const webviewPanelSerializer = {
  async deserializeWebviewPanel(webviewPanel, state) {
    // Set the HTML content of the webview
    webviewPanel.webview.html = `
		<html>
		  <body>
			<h1>My View</h1>
			<p>I like cats</p>
		  </body>
		</html>
	  `;
  },
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  vscode.window.registerWebviewPanelSerializer(
    "handwave",
    webviewPanelSerializer
  );

  console.log('Congratulations, your extension "handwave" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "handwave.helloWorld",
    function() {
      // The code you place here will be executed every time your command is executed

      // Display a message box to the user
      vscode.window.showInformationMessage("Hello World from handwave!");
   
    }
  );
  let moreDisposable = vscode.commands.registerCommand(
    "handwave.replaceSelectedTextBasedOnPrompt",
    replaceSelectedTextBasedOnPrompt
  );
  context.subscriptions.push(moreDisposable);

  context.subscriptions.push(disposable);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "handwave.selectBetweenHashes",
      selectBetweenHashes
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("handwave.runCellText", runCellText)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("handwave.stopTaskProcessing", stopTaskProcessing)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("handwave.navigateDownToCellHeader", navigateDownToCellHeader)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("handwave.navigateUpToCellHeader", navigateUpToCellHeader)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("handwave.runCellTextAndNavigateDown", runCellTextAndNavigateDown)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("handwave.troubleshootClipboard", troubleshootClipboard)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("handwave.openConfig", async () => {
      let config = vscode.workspace.getConfiguration("handwave");
      await config.inspect();
    })
  );
}

// This method is called when your extension is deactivated
function deactivate() {}
module.exports = {
  activate,
  deactivate,
};
