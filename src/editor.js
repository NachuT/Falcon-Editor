let monacoEditor = null;
let openTabs = [];
let activeTab = null;

function getTab(filePath) {
  return openTabs.find(t => t.filePath === filePath);
}

function createFileTree(container, folderPath, files, depth = 0, showAll = false) {
 
  files.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  const MAX_ITEMS = 20;
  const shouldCompress = !showAll && files.length > MAX_ITEMS;
  const filesToShow = shouldCompress ? files.slice(0, MAX_ITEMS) : files;

  filesToShow.forEach(f => {
    const li = document.createElement('li');
    li.className = 'py-1 px-2 rounded hover:bg-gray-700 cursor-pointer flex items-center';
    li.title = f.name;
    li.style.maxWidth = '200px';
    li.style.overflow = 'hidden';
    li.style.textOverflow = 'ellipsis';
    li.style.whiteSpace = 'nowrap';
    // Dotfiles/folders: de-emphasize
    if (f.name.startsWith('.')) {
      li.style.opacity = '0.6';
    }
    
    // Make items draggable
    li.draggable = true;
    
    if (f.isDirectory) {
      li.innerHTML = `<span class="mr-1">📁</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:170px;vertical-align:middle;">${f.name}</span>`;
      li.dataset.filePath = folderPath + '/' + f.name;
      li.onclick = async (e) => {
        e.stopPropagation();
        if (li.classList.contains('expanded')) {
          li.classList.remove('expanded');
          const ul = li.querySelector('ul');
          if (ul) ul.remove();
        } else {
          li.classList.add('expanded');
          const subPath = folderPath + '/' + f.name;
          const subFiles = await window.electronAPI.readDir(subPath);
          const ul = document.createElement('ul');
          ul.className = 'ml-4';
          createFileTree(ul, subPath, subFiles, depth + 1);
          li.appendChild(ul);
        }
      };
      // Collapse .git and other dotfolders by default
      if (f.name.startsWith('.')) {
        li.classList.add('collapsed');
      }
    } else {
      const filePath = folderPath + '/' + f.name;
      const tab = openTabs.find(t => t.filePath === filePath);
      const dirtyDot = tab && tab.dirty ? '<span style="color:#ff5c5c;font-size:1.1em;margin-left:0.4em;">●</span>' : '';
      li.innerHTML = `<span class="mr-1">📄</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:140px;vertical-align:middle;">${f.name}</span>${dirtyDot}`;
      li.dataset.filePath = filePath;
      li.onclick = async (e) => {
        e.stopPropagation();
        openFileTab(filePath, f.name);
        highlightSidebarFile(filePath);
      };
    }
    

    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Context Menu] Right-clicked on:', li.dataset.filePath, li);
      if (window.fileManager) {
        window.fileManager.showContextMenu(e, li);
      } else {
        console.error('[Context Menu] File manager not available');
      }
    });
    
    container.appendChild(li);
  });

  if (shouldCompress) {
    const moreLi = document.createElement('li');
    moreLi.className = 'py-1 px-2 rounded hover:bg-gray-700 cursor-pointer flex items-center text-blue-400';
    moreLi.textContent = `Show ${files.length - MAX_ITEMS} more...`;
    moreLi.onclick = () => {
      container.innerHTML = '';
      createFileTree(container, folderPath, files, depth, true);
    };
    container.appendChild(moreLi);
  }
}

function highlightSidebarFile(filePath) {
  document.querySelectorAll('#file-list li').forEach(li => {
    if (li.dataset.filePath === filePath) {
      li.classList.add('selected');
    } else {
      li.classList.remove('selected');
    }
  });
  document.querySelectorAll('#file-list li').forEach(li => {
    if (li.dataset.filePath) {
      const tab = openTabs.find(t => t.filePath === li.dataset.filePath);
      const dotSpan = li.querySelector('span[dirty-dot]');
      if (tab && tab.dirty) {
        if (!dotSpan) {
          const dot = document.createElement('span');
          dot.setAttribute('dirty-dot', '');
          dot.style.color = '#ff5c5c';
          dot.style.fontSize = '1.1em';
          dot.style.marginLeft = '0.4em';
          dot.textContent = '●';
          li.appendChild(dot);
        }
      } else {
        if (dotSpan) dotSpan.remove();
      }
    }
  });
}

function renderTabs() {
  const tabBar = document.getElementById('tab-bar');
  tabBar.innerHTML = '';
  openTabs.forEach(tab => {
    const tabEl = document.createElement('button');
    tabEl.className = 'tab' + (tab.filePath === activeTab ? ' active' : '');
    tabEl.title = tab.fileName;
    const dot = tab.dirty ? '<span style="color:#ff5c5c;font-size:1.2em;margin-left:0.5em;">●</span>' : '';
    tabEl.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:120px;vertical-align:middle;">${tab.fileName}</span>${dot}<span class="close ml-2">&times;</span>`;
    tabEl.onclick = (e) => {
      if (e.target.classList.contains('close')) {
        closeTab(tab.filePath);
      } else {
        setActiveTab(tab.filePath);
      }
    };
    tabBar.appendChild(tabEl);
  });
}

async function openFileTab(filePath, fileName) {
  let tab = openTabs.find(tab => tab.filePath === filePath);
  if (!tab) {
    let language = 'verilog';
    if (fileName.toLowerCase().endsWith('.sv')) language = 'systemverilog';
    else if (fileName.toLowerCase().endsWith('.v')) language = 'verilog';
    else language = 'plaintext';
    const { content } = await window.electronAPI.openFileFromPath(filePath);
    
    const model = monaco.editor.createModel(content, language);
    tab = { 
      filePath, 
      fileName, 
      savedContent: content, 
      dirty: false, 
      language, 
      model,
      listener: null
    };

    tab.listener = model.onDidChangeContent(() => {
      tab.dirty = model.getValue() !== tab.savedContent;
      renderTabs();
      highlightSidebarFile(filePath);
    });

    openTabs.push(tab);
  }
  setActiveTab(filePath);
}

function setActiveTab(filePath) {
  activeTab = filePath;
  renderTabs();
  const tab = openTabs.find(t => t.filePath === filePath);
  if (tab && monacoEditor) {
    monacoEditor.setModel(tab.model);
    monacoEditor.updateOptions({ readOnly: false });
  }
  highlightSidebarFile(filePath);
}

function closeTab(filePath) {
  const idx = openTabs.findIndex(t => t.filePath === filePath);
  if (idx !== -1) {
    const tabToClose = openTabs[idx];
    if (tabToClose.model) tabToClose.model.dispose();
    if (tabToClose.listener) tabToClose.listener.dispose();

    openTabs.splice(idx, 1);
    if (activeTab === filePath) {
      if (openTabs.length > 0) {
        setActiveTab(openTabs[Math.max(0, idx - 1)].filePath);
      } else {
        activeTab = null;
        if (monacoEditor) {
          monacoEditor.setModel(null);
          monacoEditor.setValue('// Start coding Verilog here!\n');
        }
      }
    }
    renderTabs();
  }
}

async function saveActiveFile() {
  if (!activeTab) return;
  const tab = openTabs.find(t => t.filePath === activeTab);
  if (!tab) return;
  const content = tab.model.getValue();
  await window.electronAPI.saveFileDirect(tab.filePath, content);
  tab.savedContent = content;
  tab.dirty = false;
  renderTabs();
  highlightSidebarFile(tab.filePath);
  const tabBar = document.getElementById('tab-bar');
  const tabEls = tabBar.querySelectorAll('.tab');
  tabEls.forEach(el => {
    if (el.title === tab.fileName) {
      el.classList.add('saved');
      setTimeout(() => el.classList.remove('saved'), 800);
    }
  });
}

window.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveActiveFile();
  }
});

window.getActiveFilePath = function() {
  if (!activeTab) return null;
  const tab = openTabs.find(t => t.filePath === activeTab);
  return tab ? tab.filePath : null;
};
window.saveActiveFile = saveActiveFile;

// Global function to refresh file tree
window.refreshFileTree = async function() {
  const folderPath = localStorage.getItem('falcon-selected-folder');
  const fileList = document.getElementById('file-list');
  
  if (folderPath) {
    const files = await window.electronAPI.readDir(folderPath);
    fileList.innerHTML = '';
    createFileTree(fileList, folderPath, files);
  }
};

window.onload = async function() {
  const folderPath = localStorage.getItem('falcon-selected-folder');
  const fileList = document.getElementById('file-list');
  // --- Top Search Bar Elements ---
  const topSearchBar = document.getElementById('top-search-bar');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  let allFilesFlat = [];
  let searchActive = false;

  if (folderPath) {
    const files = await window.electronAPI.readDir(folderPath);
    fileList.innerHTML = '';
    createFileTree(fileList, folderPath, files);
    // Recursively flatten all files for search
    async function flattenFiles(dir, files) {
      let out = [];
      for (const f of files) {
        if (f.isDirectory) {
          const subFiles = await window.electronAPI.readDir(dir + '/' + f.name);
          out = out.concat(await flattenFiles(dir + '/' + f.name, subFiles));
        } else {
          out.push({ filePath: dir + '/' + f.name, fileName: f.name });
        }
      }
      return out;
    }
    allFilesFlat = await flattenFiles(folderPath, files);
  } else {
    fileList.innerHTML = '<li class="text-red-400">No folder selected</li>';
  }



  searchInput && searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchResults.innerHTML = '';
    if (!q) { searchResults.style.display = 'none'; return; }
    let results = [];
    if (q.startsWith('>')) {

      const commands = [
        { label: 'Toggle Terminal', action: () => document.getElementById('toggle-terminal-btn').click() },
        { label: 'New File', action: async () => {
          const folderPath = localStorage.getItem('falcon-selected-folder');
          if (!folderPath) {
            alert('No folder selected. Please select a project folder first.');
            return;
          }
          

          if (window.fileManager) {
            const fileName = await window.fileManager.showModal('New File', 'Enter file name:');
            if (fileName) {
              try {
                const result = await window.electronAPI.createFile(folderPath, fileName);
                if (result.success) {
        
                  window.refreshFileTree();
                  setTimeout(async () => {
                    await openFileTab(result.filePath, fileName);
                  }, 100);
                } else {
                  alert('Create file failed: ' + result.error);
                }
              } catch (error) {
                console.error('Create file error:', error);
                alert('Failed to create file: ' + error.message);
              }
            }
          } else {
            // Fallback to prompt if file manager not available
            const fileName = prompt('Enter file name:');
            if (fileName) {
              try {
                const result = await window.electronAPI.createFile(folderPath, fileName);
                if (result.success) {
                  window.refreshFileTree();
                  setTimeout(async () => {
                    await openFileTab(result.filePath, fileName);
                  }, 100);
                } else {
                  alert('Create file failed: ' + result.error);
                }
              } catch (error) {
                console.error('Create file error:', error);
                alert('Failed to create file: ' + error.message);
              }
            }
          }
        }},
      ];
      results = commands.filter(cmd => cmd.label.toLowerCase().includes(q.slice(1).toLowerCase()));
      results.forEach((cmd, i) => {
        const li = document.createElement('li');
        li.textContent = cmd.label;
        li.className = 'px-2 py-1 rounded hover:bg-gray-700 cursor-pointer';
        li.onclick = () => { cmd.action(); searchResults.style.display = 'none'; searchInput.value = ''; };
        searchResults.appendChild(li);
      });
      searchResults.style.display = results.length ? 'block' : 'none';
      return;
    }
    // File search
    results = allFilesFlat.filter(f => f.fileName.toLowerCase().includes(q.toLowerCase()));
    results.slice(0, 20).forEach((f, i) => {
      const li = document.createElement('li');
      li.textContent = f.fileName + ' — ' + f.filePath;
      li.className = 'px-2 py-1 rounded hover:bg-gray-700 cursor-pointer';
      li.onclick = () => {
        openFileTab(f.filePath, f.fileName);
        searchResults.style.display = 'none';
      };
      searchResults.appendChild(li);
    });
    searchResults.style.display = results.length ? 'block' : 'none';
  });
  // Keyboard navigation (basic)
  searchInput && searchInput.addEventListener('keydown', (e) => {
    const items = Array.from(searchResults.children);
    let idx = items.findIndex(li => li.classList.contains('selected'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx >= 0) items[idx].classList.remove('selected');
      idx = Math.min(idx + 1, items.length - 1);
      if (items[idx]) items[idx].classList.add('selected');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx >= 0) items[idx].classList.remove('selected');
      idx = Math.max(idx - 1, 0);
      if (items[idx]) items[idx].classList.add('selected');
    } else if (e.key === 'Enter' && idx >= 0) {
      e.preventDefault();
      items[idx].click();
    }
  });

  // Only use require() for Monaco
  require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }});
  require(['vs/editor/editor.main'], function (monaco) {
    // Place terminalBuffer at the top of this function
    let terminalBuffer = '';
    // Use global Terminal and FitAddon from UMD bundles
    const Terminal = window.Terminal;
    const FitAddon = window.FitAddon.FitAddon || window.FitAddon;

    if (!monaco.languages.getLanguages().some(lang => lang.id === 'verilog')) {
      monaco.languages.register({ id: 'verilog' });
    }
    if (!monaco.languages.getLanguages().some(lang => lang.id === 'systemverilog')) {
      monaco.languages.register({ id: 'systemverilog' });
    }
    const verilogTokenizer = {
      keywords: [
        'module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg', 'logic', 'always', 'begin', 'end', 'if', 'else', 'case', 'endcase', 'for', 'while', 'repeat', 'forever', 'assign', 'function', 'endfunction', 'task', 'endtask', 'parameter', 'localparam', 'generate', 'endgenerate', 'genvar', 'initial', 'posedge', 'negedge', 'or', 'and', 'not', 'xor', 'nand', 'nor', 'xnor', 'default', 'disable', 'fork', 'join', 'wait', 'return', 'integer', 'real', 'time', 'signed', 'unsigned', 'typedef', 'enum', 'struct', 'union', 'package', 'import', 'export', 'virtual', 'interface', 'modport', 'ref', 'const', 'static', 'automatic', 'string', 'event', 'cell', 'config', 'design', 'library', 'use', 'include', 'define', 'ifdef', 'ifndef', 'endif', 'else', 'elsif', 'undef', 'timescale', 'begin', 'end', 'do', 'while', 'break', 'continue', 'assert', 'cover', 'property', 'sequence', 'endproperty', 'endsequence', 'clocking', 'rand', 'randc', 'constraint', 'solve', 'before', 'inside', 'dist', 'unique', 'priority', 'randcase', 'randsequence', 'expect', 'covergroup', 'endgroup', 'coverpoint', 'cross', 'bins', 'illegal_bins', 'ignore_bins', 'wildcard', 'with', 'matches', 'intersect', 'throughout', 'first_match', 'nexttime', 's_nexttime', 'eventually', 's_eventually', 'until', 'until_with', 'implies', 'iff', 'accept_on', 'reject_on', 'sync_accept_on', 'sync_reject_on', 'restrict', 'let'
      ],
      operators: [ '=', '==', '!=', '<', '<=', '>', '>=', '+', '-', '*', '/', '%', '++', '--', '<<', '>>', '&', '|', '^', '~', '!', '&&', '||', '?', ':', '::', '.', ',', ';', '->', '<-', '#', '@', '$', '::', '**', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=' ],
      symbols: /[=><!~?:&|+\-*\/\^%]+/,
      tokenizer: {
        root: [
          [/[a-zA-Z_][a-zA-Z0-9_]*/, {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier'
            }
          }],
          { include: '@whitespace' },
          [/\d+'[bB][01xzXZ]+/, 'number.binary'],
          [/\d+'[hH][0-9a-fA-FxzXZ]+/, 'number.hex'],
          [/\d+'[oO][0-7xzXZ]+/, 'number.octal'],
          [/\d+'[dD][0-9xzXZ]+/, 'number'],
          [/\d+/, 'number'],
          [/@symbols/, {
            cases: {
              '@operators': 'operator',
              '@default': ''
            }
          }],
          [/[{}\[\]()]/, '@brackets'],
          [/\"([^\"\\]|\\.)*$/, 'string.invalid'],
          [/"/,  { token: 'string.quote', bracket: '@open', next: '@string' } ],
          [/\/\*/,  'comment', '@comment' ],
          [/\/\/.*/, 'comment'],
        ],
        comment: [
          [/[^*/]+/, 'comment' ],
          [/\*\//,    'comment', '@pop'  ],
          [/./,  'comment' ]
        ],
        string: [
          [/[^\\"]+/,  'string'],
          [/\\./,      'string.escape.invalid'],
          [/"/,        { token: 'string.quote', bracket: '@close', next: '@pop' } ]
        ],
        whitespace: [
          [/\s+/, 'white'],
        ],
      }
    };
    monaco.languages.setMonarchTokensProvider('verilog', verilogTokenizer);
    monaco.languages.setMonarchTokensProvider('systemverilog', verilogTokenizer);
    monaco.editor.defineTheme('falcon-verilog-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '7fff7f', fontStyle: 'bold' },
        { token: 'number', foreground: 'ffb86c' },
        { token: 'number.hex', foreground: 'ffb86c' },
        { token: 'number.binary', foreground: 'ffb86c' },
        { token: 'number.octal', foreground: 'ffb86c' },
        { token: 'string', foreground: '7ecfff' },
        { token: 'string.quote', foreground: '7ecfff' },
        { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
        { token: 'operator', foreground: 'f78c6c' },
        { token: 'identifier', foreground: 'd4d4d4' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
        'editorLineNumber.foreground': '#444b55',
        'editorCursor.foreground': '#7fff7f',
        'editor.selectionBackground': '#31363f',
        'editor.inactiveSelectionBackground': '#232a36',
        'editor.lineHighlightBackground': '#232a36',
        'editorIndentGuide.background': '#232a36',
        'editorIndentGuide.activeBackground': '#7fff7f',
      }
    });
    monacoEditor = monaco.editor.create(document.getElementById('editor'), {
      value: '// Start coding Verilog here!\n',
      language: 'verilog',
      theme: 'falcon-verilog-dark',
      fontSize: 16,
      minimap: { enabled: false },
      minimapRenderCharacters: false,
      minimapMaxColumn: 80,
      minimapSide: 'right',
      minimapSize: 'proportional',
      minimapShowSlider: 'always',
      minimapRenderWhitespace: 'none',
      minimapRenderLineHighlight: false
    });
    renderTabs();
    window.addEventListener('resize', () => {
      if (monacoEditor) monacoEditor.layout();
    });
    const editorContainer = document.getElementById('editor');
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        if (monacoEditor) monacoEditor.layout();
      }).observe(editorContainer);
    }

    // Add Verilog syntax check functionality
    const syntaxCheckBtn = document.getElementById('syntax-check-btn');
    const syntaxCheckResult = document.getElementById('syntax-check-result');

    if (syntaxCheckBtn && syntaxCheckResult) {
      syntaxCheckResult.style.whiteSpace = 'pre-wrap';
      syntaxCheckResult.style.wordBreak = 'break-all';
      syntaxCheckResult.style.cursor = 'pointer';

      syntaxCheckBtn.onclick = async () => {
        // Prevent any interference with terminal
        if (term && !term.disposed) {
          term.blur();
        }
        
        if (!activeTab) {
          syntaxCheckResult.textContent = 'No active file selected.';
          syntaxCheckResult.style.color = '#ffcc00'; // A warning-yellow color
          setTimeout(() => { syntaxCheckResult.textContent = ''; }, 3000);
          return;
        }

        try {
          await saveActiveFile();

          const filePath = activeTab;
          syntaxCheckResult.textContent = 'Checking syntax...';
          syntaxCheckResult.style.color = '#d4d4d4'; // A neutral-gray color

          // Run syntax check in a separate context to avoid terminal interference
          const result = await window.electronAPI.verilogSyntaxCheck(filePath);

          if (result.success) {
            syntaxCheckResult.textContent = result.message || 'Syntax OK';
            syntaxCheckResult.style.color = '#7fff7f'; // A success-green color
            setTimeout(() => { syntaxCheckResult.textContent = ''; }, 5000);
          } else {
            syntaxCheckResult.textContent = result.error;
            syntaxCheckResult.style.color = '#ff5c5c'; // A failure-red color
          }
        } catch (error) {
          console.error('[Syntax Check] Error during syntax check:', error);
          syntaxCheckResult.textContent = 'Syntax check failed. Please try again.';
          syntaxCheckResult.style.color = '#ff5c5c';
        } finally {
          // Restore terminal focus if it was active
          const wasTerminalActive = syntaxCheckBtn.dataset.terminalWasActive === 'true';
          if (wasTerminalActive && term && !term.disposed && terminalContainer.style.display === 'block') {
            setTimeout(() => {
              if (term && !term.disposed) {
                term.focus();
                console.log('[Syntax Check] Terminal focus restored after syntax check');
              }
            }, 200);
          }
          // Clear the flag
          delete syntaxCheckBtn.dataset.terminalWasActive;
        }
      };
      
      syntaxCheckResult.onclick = () => {
        syntaxCheckResult.textContent = '';
      };
      
      // Prevent syntax check button from stealing focus from terminal
      syntaxCheckBtn.addEventListener('mousedown', (e) => {
        // Don't prevent default, but ensure terminal focus is preserved
        if (term && !term.disposed && terminalContainer.style.display === 'block') {
          // Store the fact that syntax check was clicked
          syntaxCheckBtn.dataset.terminalWasActive = 'true';
        }
      });
      
      syntaxCheckBtn.addEventListener('click', (e) => {
        // Prevent the click from affecting terminal focus
        e.stopPropagation();
      });
    }

    // Terminal Logic
    const terminalContainer = document.getElementById('terminal-container');
    const terminalEl = document.getElementById('terminal');
    const closeTerminalBtn = document.getElementById('close-terminal-btn');
    const toggleTerminalBtn = document.getElementById('toggle-terminal-btn');
    const clearTerminalBtn = document.getElementById('clear-terminal-btn');
    let term = null;
    let fitAddon = null;
    let terminalInitialized = false;
    let terminalErrorCount = 0;
    const MAX_TERMINAL_ERRORS = 3;

    function initializeTerminal() {
      try {
        console.log('[Terminal] Initializing terminal...');
        
        if (term) {
          console.log('[Terminal] Disposing existing terminal');
          term.dispose();
          term = null;
        }
        
        if (fitAddon) {
          fitAddon = null;
        }
        
        // Create new terminal with robust configuration
        term = new Terminal({
          cursorBlink: true,
          cursorStyle: 'block',
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#7fff7f',
            selection: '#31363f',
            black: '#000000',
            red: '#ff5c5c',
            green: '#7fff7f',
            yellow: '#ffb86c',
            blue: '#7ecfff',
            magenta: '#ff7ecf',
            cyan: '#7ecfff',
            white: '#d4d4d4',
            brightBlack: '#666666',
            brightRed: '#ff5c5c',
            brightGreen: '#7fff7f',
            brightYellow: '#ffb86c',
            brightBlue: '#7ecfff',
            brightMagenta: '#ff7ecf',
            brightCyan: '#7ecfff',
            brightWhite: '#ffffff'
          },
          allowTransparency: true,
          scrollback: 1000,
          tabStopWidth: 4,
          rightClickSelectsWord: true
        });
        
        const FitAddonClass = window.FitAddon.FitAddon || window.FitAddon;
        fitAddon = new FitAddonClass();
        term.loadAddon(fitAddon);
        
        // Open terminal in container
        term.open(terminalEl);
        
        // Fit terminal to container
        fitAddon.fit();
        
        // Set up data handling with error recovery
        term.onData(data => {
          try {
            window.electronAPI.termWrite(data);
          } catch (error) {
            console.error('[Terminal] Error writing to terminal:', error);
            terminalErrorCount++;
            if (terminalErrorCount >= MAX_TERMINAL_ERRORS) {
              console.error('[Terminal] Too many errors, reinitializing...');
              setTimeout(() => initializeTerminal(), 1000);
            }
          }
        });
        
        // Set up terminal data reception with robust error handling
        window.electronAPI.onTermData(data => {
          try {
            if (term && !term.disposed) {
              term.write(data);
              terminalBuffer += data;
              
              // Check for shell prompt (e.g., ends with %  or $ )
              if (/^[^\n]*[\$%] $/m.test(terminalBuffer.split('\n').pop() || '')) {
                refreshFileTree();
              }
              
              // Prevent buffer from growing indefinitely
              if (terminalBuffer.length > 1000) {
                terminalBuffer = terminalBuffer.slice(-1000);
              }
            }
          } catch (error) {
            console.error('[Terminal] Error receiving terminal data:', error);
            terminalErrorCount++;
            if (terminalErrorCount >= MAX_TERMINAL_ERRORS) {
              console.error('[Terminal] Too many errors, reinitializing...');
              setTimeout(() => initializeTerminal(), 1000);
            }
          }
        });
        
        // Handle terminal exit
        window.electronAPI.onTermExit(() => {
          console.log('[Terminal] Terminal process exited');
          if (term && !term.disposed) {
            term.dispose();
          }
          term = null;
          fitAddon = null;
          terminalInitialized = false;
          terminalContainer.style.display = 'none';
          
          // Refresh project file tree after terminal closes
          if (folderPath) {
            window.electronAPI.readDir(folderPath).then(files => {
              fileList.innerHTML = '';
              createFileTree(fileList, folderPath, files);
            }).catch(error => {
              console.error('[Terminal] Error refreshing file tree:', error);
            });
          }
        });
        
        // Spawn terminal process with robust error handling
        try {
          window.electronAPI.termSpawn({
            shell: '/usr/bin/zsh',
            cols: term.cols,
            rows: term.rows,
            cwd: folderPath || process.env.HOME
          }).then(() => {
            console.log('[Terminal] Terminal process spawned successfully');
            terminalInitialized = true;
            terminalErrorCount = 0;
            
            // Write welcome message
            term.writeln('\x1b[36mType commands here. Press the broom icon to clear.\x1b[0m');
            
            // Focus terminal after a short delay
            setTimeout(() => {
              if (term && !term.disposed) {
                term.focus();
                console.log('[Terminal] Terminal focused');
              }
            }, 200);
          }).catch(error => {
            console.error('[Terminal] Error spawning terminal process:', error);
            terminalErrorCount++;
            if (terminalErrorCount < MAX_TERMINAL_ERRORS) {
              setTimeout(() => initializeTerminal(), 1000);
            }
          });
        } catch (error) {
          console.error('[Terminal] Error in termSpawn:', error);
          terminalErrorCount++;
          if (terminalErrorCount < MAX_TERMINAL_ERRORS) {
            setTimeout(() => initializeTerminal(), 1000);
          }
        }
        
      } catch (error) {
        console.error('[Terminal] Error initializing terminal:', error);
        terminalErrorCount++;
        if (terminalErrorCount < MAX_TERMINAL_ERRORS) {
          setTimeout(() => initializeTerminal(), 1000);
        }
      }
    }
    
    function toggleTerminal(visible) {
      console.log('[Terminal] toggleTerminal called with visible:', visible);
      
      if (visible) {
        console.log('[Terminal] Showing terminal');
        terminalContainer.style.display = 'block';
        
        if (!term || !terminalInitialized) {
          initializeTerminal();
        } else {
          // If terminal exists but not focused, focus it
          setTimeout(() => {
            if (term && !term.disposed) {
              term.focus();
              console.log('[Terminal] Terminal focused');
            }
          }, 100);
        }
      } else {
        console.log('[Terminal] Hiding terminal');
        terminalContainer.style.display = 'none';
      }
    }

    if (toggleTerminalBtn) {
      console.log('[Terminal] Toggle button found');
      toggleTerminalBtn.onclick = () => {
        const isVisible = terminalContainer.style.display === 'block';
        console.log('[Terminal] Toggle clicked, current visibility:', isVisible);
        toggleTerminal(!isVisible);
      };
    } else {
      console.log('[Terminal] Toggle button not found');
    }

    if (closeTerminalBtn) {
      closeTerminalBtn.onclick = () => {
        console.log('[Terminal] Close button clicked');
        toggleTerminal(false);
      };
    } else {
      console.log('[Terminal] Close button not found');
    }
    
    if (clearTerminalBtn) {
      clearTerminalBtn.onclick = () => {
        if (term && !term.disposed) {
          try {
            console.log('[Terminal] Clearing terminal...');
            
            // Clear the terminal display
            term.clear();
            
            // Reset the terminal buffer
            terminalBuffer = '';
            
            // Send Ctrl+L to the shell to clear its display
            window.electronAPI.termWrite('\x0c');
            
            // Rewrite the welcome message
            term.writeln('\x1b[36mType commands here. Press the broom icon to clear.\x1b[0m');
            
            // Force a new prompt after a short delay
            setTimeout(() => {
              try {
                window.electronAPI.termWrite('\r\n');
                
                // Ensure terminal is focused after clearing
                setTimeout(() => {
                  if (term && !term.disposed) {
                    term.focus();
                  }
                }, 50);
              } catch (error) {
                console.error('[Terminal] Error forcing new prompt:', error);
              }
            }, 100);
            
          } catch (error) {
            console.error('[Terminal] Error clearing terminal:', error);
            // If clearing fails, try to reinitialize the terminal
            terminalErrorCount++;
            if (terminalErrorCount >= MAX_TERMINAL_ERRORS) {
              console.log('[Terminal] Reinitializing terminal due to clear error...');
              setTimeout(() => initializeTerminal(), 500);
            }
          }
        } else {
          console.log('[Terminal] Terminal not available for clearing, reinitializing...');
          initializeTerminal();
        }
      };
    }
    
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        try {
          if (terminalContainer.style.display === 'block' && fitAddon && term && !term.disposed) {
            fitAddon.fit();
            const { cols, rows } = term;
            window.electronAPI.termResize({ cols, rows });
          }
        } catch (error) {
          console.error('[Terminal] Error in resize observer:', error);
          terminalErrorCount++;
          if (terminalErrorCount >= MAX_TERMINAL_ERRORS) {
            console.log('[Terminal] Reinitializing terminal due to resize error...');
            setTimeout(() => initializeTerminal(), 500);
          }
        }
      }).observe(terminalContainer);
    }
    
    // Add click handler to refocus terminal when clicked
    if (terminalEl) {
      terminalEl.addEventListener('click', () => {
        if (term && !term.disposed) {
          term.focus();
          console.log('[Terminal] Terminal refocused via click');
        }
      });
    }
    
    // Add keyboard shortcut to refocus terminal (Ctrl+`)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        if (terminalContainer.style.display === 'block' && term && !term.disposed) {
          term.focus();
          console.log('[Terminal] Terminal refocused via keyboard shortcut');
        }
      }
    });
    
    const verilogKeywords = [
      'module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg', 'logic', 'always', 'always_comb', 'always_ff', 'always_latch', 'begin', 'end', 'if', 'else', 'case', 'endcase', 'for', 'while', 'repeat', 'forever', 'assign', 'function', 'endfunction', 'task', 'endtask', 'parameter', 'localparam', 'generate', 'endgenerate', 'genvar', 'initial', 'posedge', 'negedge', 'or', 'and', 'not', 'xor', 'nand', 'nor', 'xnor', 'default', 'disable', 'fork', 'join', 'wait', 'return', 'integer', 'real', 'time', 'signed', 'unsigned', 'typedef', 'enum', 'struct', 'union', 'package', 'import', 'export', 'virtual', 'interface', 'modport', 'ref', 'const', 'static', 'automatic', 'string', 'event', 'cell', 'config', 'design', 'library', 'use', 'include', 'define', 'ifdef', 'ifndef', 'endif', 'elsif', 'undef', 'timescale', 'do', 'break', 'continue', 'assert', 'cover', 'property', 'sequence', 'endproperty', 'endsequence', 'clocking', 'rand', 'randc', 'constraint', 'solve', 'before', 'inside', 'dist', 'unique', 'priority', 'randcase', 'randsequence', 'expect', 'covergroup', 'endgroup', 'coverpoint', 'cross', 'bins', 'illegal_bins', 'ignore_bins', 'wildcard', 'with', 'matches', 'intersect', 'throughout', 'first_match', 'nexttime', 's_nexttime', 'eventually', 's_eventually', 'until', 'until_with', 'implies', 'iff', 'accept_on', 'reject_on', 'sync_accept_on', 'sync_reject_on', 'restrict', 'let'
    ];
    function keywordCompletions() {
      return verilogKeywords.map(kw => ({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: kw,
        detail: 'keyword',
      }));
    }
    ['verilog', 'systemverilog'].forEach(lang => {
      monaco.languages.registerCompletionItemProvider(lang, {
        provideCompletionItems: function(model, position) {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };
          return {
            suggestions: keywordCompletions().map(item => ({ ...item, range }))
          };
        },
        triggerCharacters: ['.', ':', ' ', '_']
      });
    });

    // --- Toolchain Banner Logic ---
    const toolchainBanner = document.getElementById('toolchain-banner');
    const toolchainInstructions = document.getElementById('toolchain-instructions');
    const copyToolchainCmd = document.getElementById('copy-toolchain-cmd');
    let toolchainCmd = '';
    function detectOS() {
      const platform = (typeof process !== 'undefined' && process.platform) ? process.platform : navigator.platform;
      if (platform.startsWith('Win') || platform === 'win32') {
        toolchainCmd = 'pacman -Syu\npacman -S mingw-w64-x86_64-yosys mingw-w64-x86_64-icestorm mingw-w64-x86_64-nextpnr-ice40';
        toolchainInstructions.textContent = 'On Windows (MSYS2): Install MSYS2, then run:';
      } else if (platform === 'darwin' || platform.toLowerCase().includes('mac')) {
        toolchainCmd = 'brew install yosys icestorm nextpnr-ice40';
        toolchainInstructions.textContent = 'On macOS: Run this in your terminal:';
      } else {
        toolchainCmd = 'sudo apt install yosys icestorm nextpnr-ice40';
        toolchainInstructions.textContent = 'On Linux: Run this in your terminal:';
      }
    }
    detectOS();
    copyToolchainCmd.onclick = () => {
      navigator.clipboard.writeText(toolchainCmd);
      copyToolchainCmd.textContent = 'Copied!';
      setTimeout(() => { copyToolchainCmd.textContent = 'Copy Command'; }, 1500);
    };

    function refreshFileTree() {
      if (folderPath) {
        window.electronAPI.readDir(folderPath).then(files => {
          fileList.innerHTML = '';
          createFileTree(fileList, folderPath, files);
        });
      }
    }

    // --- Horizontal Minimap Implementation ---
    console.log('[Minimap] Minimap code loaded');
    const minimapContainer = document.getElementById('minimap-container');
    const minimapCanvas = document.getElementById('minimap-canvas');
    console.log('[Minimap] minimapContainer:', minimapContainer);
    console.log('[Minimap] minimapCanvas:', minimapCanvas);
    let minimapDragging = false;
    let minimapDragStartX = 0;
    let minimapScrollStart = 0;
    let minimapSmoothScroll = null;

    // Syntax color mapping for minimap
    const minimapTokenColors = {
      'keyword': '#7fff7f',
      'comment': '#5c6370',
      'string': '#7ecfff',
      'number': '#ffb86c',
      'operator': '#f78c6c',
      'identifier': '#d4d4d4',
      'default': '#444b55',
    };

    function getDominantTokenType(tokens) {
      if (!tokens || tokens.length === 0) return 'default';
      // Count token types
      const counts = {};
      for (const t of tokens) {
        const type = t.type || 'default';
        counts[type] = (counts[type] || 0) + (t.endIndex - (t.startIndex || 0));
      }
      // Return the type with the most characters
      let maxType = 'default', maxCount = 0;
      for (const k in counts) {
        if (counts[k] > maxCount) {
          maxType = k;
          maxCount = counts[k];
        }
      }
      return maxType;
    }

    function renderMinimap() {
      console.log('[Minimap] renderMinimap called');
      if (!monacoEditor) { console.log('[Minimap] No monacoEditor'); return; }
      if (!minimapCanvas) { console.log('[Minimap] No minimapCanvas'); return; }
      const ctx = minimapCanvas.getContext('2d');
      const model = monacoEditor.getModel();
      if (!model) { console.log('[Minimap] No model'); return; }
      const lines = model.getLinesContent();
      const totalLines = lines.length;
      const containerWidth = minimapContainer ? minimapContainer.offsetWidth : 1000;
      minimapCanvas.width = containerWidth;
      const minimapWidth = minimapCanvas.width;
      const minimapHeight = minimapCanvas.height;
      console.log(`[Minimap] minimapWidth: ${minimapWidth}, minimapHeight: ${minimapHeight}, totalLines: ${totalLines}`);
      ctx.clearRect(0, 0, minimapWidth, minimapHeight);
      const sliceWidth = Math.max(1, Math.floor(minimapWidth / Math.max(totalLines, 1)));
      for (let i = 0; i < totalLines; ++i) {
        const x = i * sliceWidth;
        let tokens = [];
        try {
          tokens = monaco.editor.tokenize(lines[i], model.getLanguageId())[0] || [];
        } catch (e) { console.log('[Minimap] Tokenize error:', e); }
        const dominantType = getDominantTokenType(tokens);
        const color = minimapTokenColors[dominantType] || '#888888'; // fallback color
        ctx.fillStyle = color + '55';
        ctx.fillRect(x, 0, sliceWidth, minimapHeight - 1);
        // Log each line's color
        if (i < 10) console.log(`[Minimap] Line ${i}: color=${ctx.fillStyle}, tokens=`, tokens);
      }
      // Draw viewport rectangle
      const editor = monacoEditor;
      const visibleRanges = editor.getVisibleRanges();
      if (visibleRanges.length > 0) {
        const startLine = visibleRanges[0].startLineNumber - 1;
        const endLine = visibleRanges[0].endLineNumber - 1;
        const x1 = startLine * sliceWidth;
        const x2 = (endLine + 1) * sliceWidth;
        ctx.strokeStyle = '#7fff7f';
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, 1, x2 - x1, minimapHeight - 2);
      }
    }

    // Sync minimap on editor changes
    if (monacoEditor) {
      monacoEditor.onDidChangeModelContent(() => { console.log('[Minimap] onDidChangeModelContent'); renderMinimap(); });
      monacoEditor.onDidScrollChange(() => { console.log('[Minimap] onDidScrollChange'); renderMinimap(); });
      monacoEditor.onDidLayoutChange(() => { console.log('[Minimap] onDidLayoutChange'); renderMinimap(); });
      renderMinimap();
    }

    // Smooth scroll helper
    function smoothScrollToLine(editor, targetLine) {
      if (!editor) { console.log('[Minimap] smoothScrollToLine: no editor'); return; }
      const model = editor.getModel();
      if (!model) { console.log('[Minimap] smoothScrollToLine: no model'); return; }
      const lineCount = model.getLineCount();
      const editorHeight = editor.getLayoutInfo().height;
      const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
      const targetScrollTop = Math.max(0, (targetLine - 1) * lineHeight - editorHeight / 2);
      const startScrollTop = editor.getScrollTop();
      const duration = 180;
      const startTime = performance.now();
      if (minimapSmoothScroll) cancelAnimationFrame(minimapSmoothScroll);
      function animateScroll(now) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const scrollTop = startScrollTop + (targetScrollTop - startScrollTop) * t;
        editor.setScrollTop(scrollTop);
        if (t < 1) {
          minimapSmoothScroll = requestAnimationFrame(animateScroll);
        }
      }
      minimapSmoothScroll = requestAnimationFrame(animateScroll);
    }

    // Minimap scroll interaction (horizontal)
    if (minimapCanvas) {
      minimapCanvas.addEventListener('mousedown', (e) => {
        minimapDragging = true;
        minimapDragStartX = e.offsetX;
        const editor = monacoEditor;
        if (!editor) { console.log('[Minimap] mousedown: no editor'); return; }
        const model = editor.getModel();
        if (!model) { console.log('[Minimap] mousedown: no model'); return; }
        const totalLines = model.getLineCount();
        const minimapWidth = minimapCanvas.width;
        const sliceWidth = Math.max(1, Math.floor(minimapWidth / Math.max(totalLines, 1)));
        const clickedLine = Math.floor(e.offsetX / sliceWidth) + 1;
        console.log('[Minimap] mousedown, clickedLine:', clickedLine);
        smoothScrollToLine(editor, clickedLine);
        minimapScrollStart = clickedLine;
      });
      window.addEventListener('mousemove', (e) => {
        if (!minimapDragging) return;
        const rect = minimapCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const editor = monacoEditor;
        if (!editor) { console.log('[Minimap] mousemove: no editor'); return; }
        const model = editor.getModel();
        if (!model) { console.log('[Minimap] mousemove: no model'); return; }
        const totalLines = model.getLineCount();
        const minimapWidth = minimapCanvas.width;
        const sliceWidth = Math.max(1, Math.floor(minimapWidth / Math.max(totalLines, 1)));
        const targetLine = Math.floor(x / sliceWidth) + 1;
        console.log('[Minimap] mousemove, targetLine:', targetLine);
        smoothScrollToLine(editor, targetLine);
      });
      window.addEventListener('mouseup', () => {
        minimapDragging = false;
      });
    } else {
      console.log('[Minimap] minimapCanvas not found for event listeners');
    }
    // Resize minimap canvas on window resize
    function resizeMinimapCanvas() {
      if (!minimapCanvas) { console.log('[Minimap] resizeMinimapCanvas: no minimapCanvas'); return; }
      const containerWidth = minimapContainer ? minimapContainer.offsetWidth : 1000;
      minimapCanvas.width = containerWidth;
      console.log('[Minimap] resizeMinimapCanvas, new width:', minimapCanvas.width);
      renderMinimap();
    }
    window.addEventListener('resize', resizeMinimapCanvas);
    resizeMinimapCanvas();


  });
  

  function removeContentBetweenKeywords(text, startKeyword, endKeyword) {

    const escapedStartKeyword = startKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedEndKeyword = endKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const regex = new RegExp(`(${escapedStartKeyword}).*?(${escapedEndKeyword})`, 's');


    return text.replace(regex, '$1$2');
  }

  const aiSearchInput = document.getElementById('search-input');
  const quickAnswerDisplay = document.getElementById('quick-answer-display');
  const quickAnswerText = document.getElementById('quick-answer-text');
  const closeQuickAnswer = document.getElementById('close-quick-answer');

  console.log('[AI Command] Looking for elements:', { 
    searchInput: !!aiSearchInput, 
    quickAnswerDisplay: !!quickAnswerDisplay,
    quickAnswerText: !!quickAnswerText,
    closeQuickAnswer: !!closeQuickAnswer
  });

  if (aiSearchInput && quickAnswerDisplay && quickAnswerText && closeQuickAnswer) {
    console.log('[AI Command] System initialized');
    
    closeQuickAnswer.addEventListener('click', () => {
      quickAnswerDisplay.style.display = 'none';
    });
    
    aiSearchInput.addEventListener('keypress', async (e) => {
      console.log('[AI Command] Keypress event:', e.key);
      if (e.key === 'Enter') {
        const query = aiSearchInput.value.trim();
        console.log('[AI Command] Query:', query);
        
        if (query.startsWith('&')) {
          e.preventDefault();
          const question = query.substring(1).trim(); 
          
          if (question) {
            console.log('[AI Command] Sending question:', question);
            
          
            aiSearchInput.value = '';
            
   
            quickAnswerText.textContent = 'Thinking...';
            quickAnswerDisplay.style.display = 'block';
            quickAnswerText.style.color = '#ffb86c';

            try {
              const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": "Bearer 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",
                  "HTTP-Referer": "<YOUR_SITE_URL>", // Optional. Site URL for rankings on openrouter.ai.
                  "X-Title": "<YOUR_SITE_NAME>", // Optional. Site title for rankings on openrouter.ai.
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  "model": "tngtech/deepseek-r1t2-chimera:free",
                  "messages": [
                    {
                      "role": "user",
                      "content": `You are falcon an IDE specifically designed to make fpga bistream easier uisng AI. Answer "${question}" in 1 sentence and if that isn't possible say "Sorry, please ask in the larger AI area" verbatim.`
                    }
                  ]
                })
              });

              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }

              const data = await response.json();
              let answer = data.choices?.[0]?.message?.content || 'Sorry, please ask in the larger AI area';

              answer = answer.replace(/<think>.*?<\/think>/gs, '');
              answer = answer.replace(/<think.*?<\/think>/gs, '');
              answer = answer.replace(/think>.*?<\/think>/gs, '');

              console.log('[AI Command] Received answer:', answer);

              quickAnswerText.textContent = answer;
              quickAnswerText.style.color = '#4ecdc4';
            }catch (error) {
              console.error('[AI Command] Error:', error);
              let errorMessage = 'Sorry, please ask in the larger AI area';
           
              errorMessage = errorMessage.replace(/<think>.*?<\/think>/gs, '');
              errorMessage = errorMessage.replace(/<think.*?<\/think>/gs, '');
              errorMessage = errorMessage.replace(/think>.*?<\/think>/gs, '');
              quickAnswerText.textContent = errorMessage;
              quickAnswerText.style.color = '#ff5c5c';
            }
          }
        }
      }
    });
  } else {
    console.log('[AI Command] Elements not found:', { 
      searchInput: !!aiSearchInput, 
      quickAnswerDisplay: !!quickAnswerDisplay,
      quickAnswerText: !!quickAnswerText,
      closeQuickAnswer: !!closeQuickAnswer
    });
  }
  
  const bitstreamBtn = document.getElementById('bitstream-btn');
  if (bitstreamBtn) {
    bitstreamBtn.onclick = () => {
      const folder = localStorage.getItem('falcon-selected-folder') || '';
      window.location = `generation.html${folder ? '?folder=' + encodeURIComponent(folder) : ''}`;
    };
  }
}; 