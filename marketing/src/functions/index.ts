/**
 * Google Cloud Functions Entry Points
 * HTTP functions for all 15 marketing swarm agents + gateway
 *
 * Each function lazily initializes only what it needs to minimize cold start.
 */

import type { HttpFunction } from '@google-cloud/functions-framework';
import type { AgentId, TaskPriority } from '../types/index.js';

// ============================================================================
// Helpers
// ============================================================================

function setCors(res: any): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function handleOptions(req: any, res: any): boolean {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(204).send('');
    return true;
  }
  return false;
}

// Cached swarm coordinator
let swarmPromise: Promise<import('../swarm/swarm-coordinator.js').SwarmCoordinator> | null = null;

function getSwarm() {
  if (!swarmPromise) {
    swarmPromise = (async () => {
      const { getSwarmCoordinator } = await import('../swarm/swarm-coordinator.js');
      const swarm = getSwarmCoordinator({
        autoRecovery: true,
        healthCheckInterval: 0, // disable periodic checks in serverless
      });
      await swarm.start();
      return swarm;
    })();
  }
  return swarmPromise;
}

/**
 * Create an HTTP handler for a specific agent
 */
function createAgentHandler(agentId: AgentId): HttpFunction {
  return async (req, res) => {
    if (handleOptions(req, res)) return;
    setCors(res);

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use POST.' });
      return;
    }

    try {
      const coordinator = await getSwarm();
      const { type, payload, priority, metadata } = req.body || {};

      if (!type) {
        res.status(400).json({ error: 'Missing required field: type' });
        return;
      }

      const task = await coordinator.submitTask(
        type,
        payload || {},
        {
          priority: (priority as TaskPriority) || 'medium',
          targetAgent: agentId,
          metadata: metadata || {},
        }
      );

      res.status(200).json({
        success: true,
        taskId: task.id,
        agent: agentId,
        status: task.status,
        submittedAt: task.createdAt,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${agentId}] Error:`, msg);
      res.status(500).json({ success: false, error: msg, agent: agentId });
    }
  };
}

// ============================================================================
// Gateway: route to any agent
// ============================================================================

export const gateway: HttpFunction = async (req, res) => {
  if (handleOptions(req, res)) return;
  setCors(res);

  if (req.method === 'GET') {
    try {
      const coordinator = await getSwarm();
      const status = coordinator.getStatus();
      const metrics = coordinator.getMetrics();
      res.status(200).json({
        status: status.status,
        activeAgents: status.activeAgents,
        totalAgents: status.totalAgents,
        uptime: status.uptime,
        tasksProcessed: status.tasksProcessed,
        metrics: {
          totalSubmitted: metrics.totalTasksSubmitted,
          totalCompleted: metrics.totalTasksCompleted,
          totalFailed: metrics.totalTasksFailed,
          errorRate: metrics.errorRate,
          avgDuration: metrics.averageTaskDuration,
        },
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use GET or POST.' });
    return;
  }

  try {
    const coordinator = await getSwarm();
    const { agent, type, payload, priority, metadata } = req.body || {};

    if (!type) {
      res.status(400).json({ error: 'Missing required field: type' });
      return;
    }

    const task = await coordinator.submitTask(
      type, payload || {},
      { priority: priority || 'medium', targetAgent: agent, metadata: metadata || {} }
    );

    res.status(200).json({
      success: true,
      taskId: task.id,
      agent: agent || 'orchestrator',
      status: task.status,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
};

// ============================================================================
// Health
// ============================================================================

export const health: HttpFunction = async (req, res) => {
  if (handleOptions(req, res)) return;
  setCors(res);

  try {
    const coordinator = await getSwarm();
    const status = coordinator.getStatus();
    const diagnostics = await coordinator.runDiagnostics();
    const agents: Record<string, unknown> = {};
    for (const [id, diag] of diagnostics) agents[id] = diag;

    res.status(status.status === 'running' ? 200 : 503).json({
      status: status.status,
      activeAgents: status.activeAgents,
      totalAgents: status.totalAgents,
      uptime: status.uptime,
      agents,
    });
  } catch (error) {
    res.status(503).json({ status: 'error', error: String(error) });
  }
};

// ============================================================================
// Agent Functions (Tier 1-5)
// ============================================================================

// Tier 1: Core Coordination
export const orchestrator = createAgentHandler('orchestrator');
export const memory = createAgentHandler('memory');
export const quality = createAgentHandler('quality');

// Tier 2: Intelligence Layer
export const simulation = createAgentHandler('simulation');
export const historicalMemory = createAgentHandler('historical-memory');
export const riskDetection = createAgentHandler('risk-detection');
export const attentionArbitrage = createAgentHandler('attention-arbitrage');

// Tier 3: Creative Intelligence
export const creativeGenome = createAgentHandler('creative-genome');
export const fatigueForecaster = createAgentHandler('fatigue-forecaster');
export const mutation = createAgentHandler('mutation');

// Tier 4: Attribution & Causality
export const counterfactual = createAgentHandler('counterfactual');
export const causalGraph = createAgentHandler('causal-graph');
export const incrementality = createAgentHandler('incrementality');

// Tier 5: Operations
export const accountHealth = createAgentHandler('account-health');
export const crossPlatform = createAgentHandler('cross-platform');
