#!/usr/bin/env node
"use strict";
// Symphony CLI entry point — Sections 3, 13.7
Object.defineProperty(exports, "__esModule", { value: true });
const orchestrator_1 = require("./orchestrator");
const server_1 = require("./server");
const logger_1 = require("./logger");
function parseArgs(argv) {
    const args = argv.slice(2);
    let workflowPath;
    let port;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--workflow' || arg === '-w') {
            workflowPath = args[++i];
        }
        else if (arg === '--port' || arg === '-p') {
            port = parseInt(args[++i] ?? '', 10);
        }
        else if (arg?.startsWith('--workflow=')) {
            workflowPath = arg.slice('--workflow='.length);
        }
        else if (arg?.startsWith('--port=')) {
            port = parseInt(arg.slice('--port='.length), 10);
        }
        else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
        else if (!arg?.startsWith('-') && workflowPath === undefined) {
            workflowPath = arg;
        }
    }
    return { workflowPath, port };
}
function printHelp() {
    process.stdout.write(`
symphony — coding-agent orchestration service (spec v1)

Usage:
  symphony [path-to-WORKFLOW.md] [options]

Options:
  --workflow, -w <path>  Path to WORKFLOW.md (default: ./WORKFLOW.md)
  --port, -p <number>    Enable HTTP server on this port (0 = ephemeral)
  --help, -h             Show this help

Environment:
  LINEAR_API_KEY         Linear API key (if not set in WORKFLOW.md front matter)
  SYMPHONY_DEBUG         Enable debug logging

`);
}
async function main() {
    const { workflowPath, port: cliPort } = parseArgs(process.argv);
    const orchestrator = new orchestrator_1.Orchestrator(workflowPath);
    // Determine HTTP server port: CLI --port overrides server.port in config
    let httpPort = cliPort;
    // Start the orchestrator
    try {
        await orchestrator.start();
    }
    catch (e) {
        logger_1.logger.error(`startup_failed err=${String(e)}`);
        process.exit(1);
    }
    // Start HTTP server if port is specified or set in workflow config
    const config = orchestrator.getConfig();
    if (httpPort === undefined && config?.server.port !== null && config?.server.port !== undefined) {
        httpPort = config.server.port;
    }
    if (httpPort !== undefined && !isNaN(httpPort)) {
        try {
            const srv = await (0, server_1.startHttpServer)(orchestrator, httpPort);
            logger_1.logger.info(`http_server_ready address=${srv.address()}`);
        }
        catch (e) {
            logger_1.logger.error(`http_server_failed err=${String(e)}`);
        }
    }
    // Graceful shutdown
    let shuttingDown = false;
    const shutdown = (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        logger_1.logger.info(`shutdown_signal signal=${signal}`);
        orchestrator.stop();
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
        logger_1.logger.error(`uncaught_exception err=${err.message}`);
        shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
        logger_1.logger.error(`unhandled_rejection reason=${String(reason)}`);
    });
}
void main();
//# sourceMappingURL=index.js.map