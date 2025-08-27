(function() {
    var httpsEnabled = window.location.protocol == "https:";
    var args = window.location.search;
    var url = (httpsEnabled ? 'wss://' : 'ws://') + window.location.host + window.location.pathname + 'ws';
    var protocols = ["gotty"];
    var autoReconnect = -1;

    // === 新增: 配置空闲超时时间 (毫秒) ===
    var idleTimeout = 1 * 60 * 1000; // 5分钟
    var idleTimer;

    var resetIdleTimer = function(ws, term) {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(function() {
            console.log("Idle timeout reached, closing session...");
            if (term) {
                term.io.showOverlay("Idle Timeout - Session Closed", null);
                term.uninstallKeyboard();
            }
            ws.close();
        }, idleTimeout);
    };

    var openWs = function() {
        var ws = new WebSocket(url, protocols);

        var term;
        var pingTimer;

        ws.onopen = function(event) {
            ws.send(JSON.stringify({ Arguments: args, AuthToken: gotty_auth_token,}));
            pingTimer = setInterval(sendPing, 30 * 1000, ws);

            hterm.defaultStorage = new lib.Storage.Memory();

            term = new hterm.Terminal();
            term.getPrefs().set("send-encoding", "raw");

            term.onTerminalReady = function() {
                var io = term.io.push();

                io.onVTKeystroke = function(str) {
                    ws.send("0" + str);
                    resetIdleTimer(ws, term); // 有输入 -> 重置空闲计时
                };

                io.sendString = function(str) {
                    ws.send("0" + str);
                    resetIdleTimer(ws, term); // 粘贴文字输入时也重置
                };

                io.onTerminalResize = function(columns, rows) {
                    ws.send("2" + JSON.stringify({ columns: columns, rows: rows }));
                };

                term.installKeyboard();
                resetIdleTimer(ws, term); // 初始化时启动计时
            };

            term.decorate(document.getElementById("terminal"));
        };

        ws.onmessage = function(event) {
            data = event.data.slice(1);
            switch(event.data[0]) {
            case '0':
                term.io.writeUTF8(window.atob(data));
                break;
            case '1':
                // pong
                break;
            case '2':
                term.setWindowTitle(data);
                break;
            case '3':
                preferences = JSON.parse(data);
                Object.keys(preferences).forEach(function(key) {
                    console.log("Setting " + key + ": " +  preferences[key]);
                    term.getPrefs().set(key, preferences[key]);
                });
                break;
            case '4':
                autoReconnect = JSON.parse(data);
                console.log("Enabling reconnect: " + autoReconnect + " seconds")
                break;
            }
        };

        ws.onclose = function(event) {
            if (term) {
                term.uninstallKeyboard();
                term.io.showOverlay("Connection Closed", null);
            }
            clearInterval(pingTimer);
            clearTimeout(idleTimer); // 清理空闲定时器
            if (autoReconnect > 0) {
                setTimeout(openWs, autoReconnect * 1000);
            }
        };
    }

    var sendPing = function(ws) {
        ws.send("1");
    }

    openWs();
})();
