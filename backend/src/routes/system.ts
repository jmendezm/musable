import { Router } from 'express';
import os from 'os';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

// Get system statistics
router.get('/stats', authenticateToken, requireAdmin, async (req: any, res): Promise<void> => {
  try {
    // Get system uptime in seconds
    const uptimeSeconds = os.uptime();

    // Get CPU usage (average over all CPUs)
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce((acc, cpu) => acc + (cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq), 0);
    const cpuUsage = 100 - (100 * totalIdle / totalTick);

    // Get memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = (usedMem / totalMem) * 100;

    // Get platform info
    const platform = os.platform();
    const nodeVersion = process.version;
    const architecture = os.arch();

    // Get load average (Linux/Unix only)
    const loadAverage = os.loadavg();

    res.json({
      success: true,
      data: {
        uptime: uptimeSeconds,
        cpu: {
          usage: Math.round(cpuUsage * 100) / 100,
          cores: cpus.length,
          loadAverage: loadAverage.map((avg) => avg.toFixed(2))
        },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usage: Math.round(memoryUsage * 100) / 100
        },
        platform,
        architecture,
        nodeVersion,
        hostname: os.hostname()
      }
    });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch system statistics' }
    });
  }
});

export default router;
