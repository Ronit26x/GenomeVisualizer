// ForceLayout.js - D3 force-directed layout wrapper

import { LayoutEngine } from './LayoutEngine.js';

/**
 * ForceLayout wraps D3's force-directed layout.
 * Provides physics-based node positioning.
 */
export class ForceLayout extends LayoutEngine {
  constructor() {
    super('force');

    this.simulation = null;

    // Force strengths
    this.linkStrength = 1;
    this.chargeStrength = -300;
    this.centerStrength = 0.1;
    this.collisionRadius = 30;
  }

  /**
   * Start the force simulation
   */
  start(nodes, edges, width, height) {
    super.start(nodes, edges, width, height);

    // Check if D3 is available
    if (typeof d3 === 'undefined') {
      throw new Error('D3 library is not loaded');
    }

    // Create simulation
    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges)
        .id(d => d.id)
        .strength(this.linkStrength))
      .force('charge', d3.forceManyBody()
        .strength(this.chargeStrength))
      .force('center', d3.forceCenter(width / 2, height / 2)
        .strength(this.centerStrength))
      .force('collision', d3.forceCollide(this.collisionRadius));

    // Set up tick handler
    this.simulation.on('tick', () => {
      if (!this.isPaused) {
        this.updatePositions();
      }
    });

    this.emit('simulationStarted', { nodes, edges });
  }

  /**
   * Stop the simulation
   */
  stop() {
    if (this.simulation) {
      this.simulation.stop();
    }

    super.stop();
  }

  /**
   * Pause the simulation
   */
  pause() {
    super.pause();
  }

  /**
   * Resume the simulation
   */
  resume() {
    super.resume();

    if (this.simulation) {
      this.simulation.restart();
    }
  }

  /**
   * Restart the simulation
   */
  restart() {
    if (this.simulation) {
      this.simulation.alpha(1).restart();
    }

    super.restart();
  }

  /**
   * Perform one simulation tick
   */
  tick() {
    if (this.simulation) {
      this.simulation.tick();
    }
  }

  /**
   * Set force strengths
   */
  setForceStrengths({ link, charge, center, collision }) {
    if (link !== undefined) this.linkStrength = link;
    if (charge !== undefined) this.chargeStrength = charge;
    if (center !== undefined) this.centerStrength = center;
    if (collision !== undefined) this.collisionRadius = collision;

    // Update simulation forces if running
    if (this.simulation) {
      if (link !== undefined) {
        this.simulation.force('link').strength(link);
      }
      if (charge !== undefined) {
        this.simulation.force('charge').strength(charge);
      }
      if (center !== undefined) {
        this.simulation.force('center').strength(center);
      }
      if (collision !== undefined) {
        this.simulation.force('collision').radius(collision);
      }

      this.simulation.alpha(0.3).restart();
    }
  }

  /**
   * Get simulation alpha (animation progress)
   */
  getAlpha() {
    return this.simulation ? this.simulation.alpha() : 0;
  }

  /**
   * Check if simulation is still running
   */
  isSimulationRunning() {
    return this.isRunning && this.getAlpha() > 0.01;
  }

  /**
   * Clean up
   */
  destroy() {
    this.stop();

    if (this.simulation) {
      this.simulation.on('tick', null);
      this.simulation = null;
    }

    super.destroy();
  }
}
