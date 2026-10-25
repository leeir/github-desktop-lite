import { IStatsStore } from '../../src/lib/stats/stats-store'

export class TestStatsStore implements IStatsStore {
  public metrics: Partial<Record<string, number>> = {}

  public increment: IStatsStore['increment'] = async (k, n = 1) => {
    this.metrics[k] = (this.metrics[k] || 0) + n
  }
}
